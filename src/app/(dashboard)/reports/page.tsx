import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { ReportExportButton } from "@/components/report-export-button";
import { createClient } from "@/lib/supabase/server";

type Report = {
  summary: { gross_sales: number; refunds: number; net_sales: number; orders: number; returns: number; units: number; return_units: number; average_order: number; previous_net_sales: number; cogs: number | null; gross_profit: number | null; gross_margin: number | null };
  top_products: Array<{ product_id: string; name: string; net_units: number; net_sales: number }>;
  payments: Array<{ method: string; amount: number }>;
  daily: Array<{ day: string; amount: number }>;
  can_view_costs: boolean;
};

const money = (value: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value || 0);
const payment: Record<string, string> = { cash: "現金", card: "信用卡", transfer: "銀行轉帳", line_transfer: "LINE 轉帳" };
const taipeiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
function addDays(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function safeDate(value: string | undefined, fallback: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback; }

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const today = taipeiDate();
  let from = safeDate(params.from, `${today.slice(0, 8)}01`);
  let to = safeDate(params.to, today);
  if (from > to) [from, to] = [to, from];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user!.id).eq("active", true).single();
  if (!member || !["owner", "manager"].includes(member.role)) return <><PageHead title="營運報表" description="營收、毛利、付款與熱門商品分析"/><div className="notice page-notice">只有店主或店長可以查看營運報表。</div></>;
  const { data, error } = await supabase.rpc("get_operations_report", { p_store_id: member.store_id, p_from: `${from}T00:00:00+08:00`, p_to: `${addDays(to, 1)}T00:00:00+08:00` });
  const report = data as Report | null;
  if (error || !report) return <><PageHead title="營運報表" description="營收、毛利、付款與熱門商品分析"/><div className="notice page-notice">報表讀取失敗：{error?.message || "未知錯誤"}</div></>;
  const previous = Number(report.summary.previous_net_sales || 0);
  const change = previous === 0 ? null : ((Number(report.summary.net_sales) - previous) / Math.abs(previous)) * 100;
  const maxDaily = Math.max(1, ...report.daily.map((item) => Math.max(0, Number(item.amount))));
  const maxPayment = Math.max(1, ...report.payments.map((item) => Math.max(0, Number(item.amount))));
  return <>
    <PageHead title="營運報表" description="所有數字均來自真實銷售、退貨與庫存成本紀錄"><ReportExportButton report={report} from={from} to={to}/></PageHead>
    <section className="panel report-filter"><div className="report-presets"><Link className="btn sm" href={`/reports?from=${today}&to=${today}`}>今天</Link><Link className="btn sm" href={`/reports?from=${addDays(today, -6)}&to=${today}`}>近 7 天</Link><Link className="btn sm" href={`/reports?from=${addDays(today, -29)}&to=${today}`}>近 30 天</Link><Link className="btn sm" href={`/reports?from=${today.slice(0, 8)}01&to=${today}`}>本月</Link></div><form className="report-date-form"><div className="field"><label htmlFor="from">開始日期</label><input id="from" name="from" type="date" defaultValue={from}/></div><div className="field"><label htmlFor="to">結束日期</label><input id="to" name="to" type="date" defaultValue={to}/></div><button className="btn primary">套用日期</button></form></section>
    <section className="cards report-cards"><div className="metric"><div className="metric-label">淨營業額</div><div className="metric-value">{money(Number(report.summary.net_sales))}</div><div className="metric-note">銷售 {money(Number(report.summary.gross_sales))} − 退貨 {money(Number(report.summary.refunds))}</div>{change != null && <div className={`report-change ${change < 0 ? "down" : "up"}`}>較前一期 {change >= 0 ? "+" : ""}{change.toFixed(1)}%</div>}</div><div className="metric"><div className="metric-label">訂單／平均客單</div><div className="metric-value">{report.summary.orders} 筆</div><div className="metric-note">平均 {money(Number(report.summary.average_order))}・淨售 {report.summary.units - report.summary.return_units} 件</div></div><div className="metric"><div className="metric-label">銷貨毛利</div><div className="metric-value">{report.can_view_costs ? money(Number(report.summary.gross_profit)) : "僅店主"}</div><div className="metric-note">{report.can_view_costs ? `銷貨成本 ${money(Number(report.summary.cogs))}` : "店長不會看到商品成本與毛利"}</div></div><div className="metric"><div className="metric-label">毛利率</div><div className="metric-value">{report.can_view_costs ? `${Number(report.summary.gross_margin).toFixed(1)}%` : "—"}</div><div className="metric-note">退貨 {report.summary.returns} 筆／{report.summary.return_units} 件</div></div></section>
    <div className="report-grid"><section className="panel"><div className="panel-head"><div><h3>最暢銷商品</h3><p>依扣除退貨後的淨銷售件數排名</p></div></div><div className="table-wrap"><table><thead><tr><th>排名</th><th>商品</th><th className="num">淨銷售件數</th><th className="num">淨銷售額</th></tr></thead><tbody>{report.top_products.length === 0 ? <tr><td colSpan={4} className="empty">此期間尚無銷售資料</td></tr> : report.top_products.map((item, index) => <tr key={item.product_id}><td><span className="rank-badge">{index + 1}</span></td><td><b>{item.name}</b></td><td className="num">{item.net_units}</td><td className="num">{money(Number(item.net_sales))}</td></tr>)}</tbody></table></div></section><section className="panel"><div className="panel-head"><div><h3>付款方式</h3><p>已扣除以各方式辦理的退款</p></div></div><div className="report-bars">{report.payments.length === 0 ? <div className="empty">此期間尚無收款資料</div> : report.payments.map((item) => <div className="report-bar" key={item.method}><div><span>{payment[item.method] || item.method}</span><b>{money(Number(item.amount))}</b></div><i><em style={{ width: `${Math.max(0, Number(item.amount)) / maxPayment * 100}%` }}/></i></div>)}</div></section></div>
    <section className="panel"><div className="panel-head"><div><h3>每日營業趨勢</h3><p>{from} 至 {to} 的淨營業額</p></div></div>{report.daily.length === 0 ? <div className="empty">此期間尚無營業資料</div> : <div className="daily-chart">{report.daily.map((item) => <div className="daily-column" key={item.day} title={`${item.day} ${money(Number(item.amount))}`}><span>{money(Number(item.amount))}</span><i style={{ height: `${Math.max(3, Math.max(0, Number(item.amount)) / maxDaily * 100)}%` }}/><small>{item.day.slice(5)}</small></div>)}</div>}</section>
  </>;
}
