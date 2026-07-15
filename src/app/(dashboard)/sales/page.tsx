import Link from "next/link";
import { Checkout, type CheckoutMember, type CheckoutProduct } from "@/components/checkout";
import { HistoryFilters } from "@/components/history-filters";
import { PageHead } from "@/components/page-head";
import { HISTORY_PAGE_SIZE, parseHistoryParams, type HistorySearchParams } from "@/lib/history-query";
import { createClient } from "@/lib/supabase/server";

const money = (n: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
const payment: Record<string, string> = { cash: "現金", card: "信用卡", transfer: "銀行轉帳", line_transfer: "LINE 轉帳" };
const dateTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));

export default async function Sales({ searchParams }: { searchParams: Promise<HistorySearchParams> }) {
  const raw = await searchParams;
  const filter = parseHistoryParams(raw);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id,role").eq("user_id", user!.id).eq("active", true).single();

  let salesQuery = supabase.from("sales").select("id,document_no,completed_at,total,payment_method,points_earned,points_redeemed,transfer_account_last4,payment_note,payment_confirmed_by,approval_required,customers(name),sale_items(quantity)", { count: "exact" }).eq("store_id", member!.store_id).eq("status", "completed");
  if (filter.safe) salesQuery = salesQuery.or(`document_no.ilike.%${filter.safe}%,payment_note.ilike.%${filter.safe}%,payment_confirmed_by.ilike.%${filter.safe}%`);
  if (filter.start) salesQuery = salesQuery.gte("completed_at", filter.start);
  if (filter.end) salesQuery = salesQuery.lt("completed_at", filter.end);

  const [{ data: variants }, { data: sales, count, error: salesError }, { data: customers }, { data: store }, { data: approvalData }] = await Promise.all([
    supabase.from("product_variants").select("id,sku,barcode,color,size,price,active,products!inner(name,active),inventory_balances(quantity)").eq("store_id", member!.store_id).eq("active", true).order("sku"),
    salesQuery.order("completed_at", { ascending: false }).order("id", { ascending: false }).range(filter.offset, filter.offset + HISTORY_PAGE_SIZE - 1),
    supabase.from("customers").select("id,name,phone,points").eq("store_id", member!.store_id).order("name"),
    supabase.from("stores").select("points_spend_amount,point_value,points_enabled").eq("id", member!.store_id).single(),
    supabase.rpc("get_approval_settings", { p_store_id: member!.store_id }),
  ]);

  const products: CheckoutProduct[] = (variants || []).flatMap((variant) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
    const balance = Array.isArray(variant.inventory_balances) ? variant.inventory_balances[0] : variant.inventory_balances;
    const stock = Number(balance?.quantity || 0);
    if (product?.active === false || stock <= 0) return [];
    return [{ id: variant.id, sku: variant.sku, barcode: variant.barcode || "", name: product?.name || "商品", variant: [variant.color, variant.size].filter(Boolean).join(" / "), price: Number(variant.price), stock }];
  });
  const checkoutMembers: CheckoutMember[] = (customers || []).map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone || "", points: customer.points }));
  const approval = approvalData as { discount_threshold_percent?: number; pin_configured?: boolean } | null;

  return <>
    {raw.message && <div className="notice page-notice" role="status">{raw.message}</div>}
    {salesError && <div className="notice page-notice">銷售紀錄讀取失敗：{salesError.message}</div>}
    <PageHead title="銷售結帳" description="完成後自動扣除庫存、累積會員點數並可列印銷貨單">
      <Checkout products={products} members={checkoutMembers} points={{ enabled: store?.points_enabled !== false, spendAmount: Number(store?.points_spend_amount || 100), pointValue: Number(store?.point_value || 1) }} role={member!.role} approval={{ discountThresholdPercent: Number(approval?.discount_threshold_percent ?? 20), pinConfigured: approval?.pin_configured === true }}/>
    </PageHead>
    <section className="panel"><div className="panel-head"><div><h3>銷售紀錄</h3><p>可依單號、對帳資訊與日期查詢</p></div></div>
      <HistoryFilters basePath="/sales" q={filter.q} from={filter.from} to={filter.to} page={filter.page} pageSize={HISTORY_PAGE_SIZE} total={count || 0} placeholder="搜尋銷售單號、備註或確認人…"/>
      <div className="table-wrap"><table><thead><tr><th>銷售單號</th><th>時間</th><th>會員</th><th className="num">件數</th><th className="num">實收</th><th>點數</th><th>付款／對帳</th><th>操作</th></tr></thead><tbody>{!sales?.length ? <tr><td colSpan={8} className="empty">此範圍沒有銷售紀錄。</td></tr> : sales.map((sale) => {
        const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
        const reconcile = [sale.transfer_account_last4 ? `末碼 ${sale.transfer_account_last4}` : "", sale.payment_confirmed_by ? `確認：${sale.payment_confirmed_by}` : "", sale.payment_note || ""].filter(Boolean).join("・");
        return <tr key={sale.id}><td className="code">{sale.document_no}{sale.approval_required && <><br/><span className="pill low">折扣已核准</span></>}</td><td>{sale.completed_at ? dateTime(sale.completed_at) : "—"}</td><td>{customer?.name || "一般客人"}</td><td className="num">{sale.sale_items?.reduce((n, item) => n + item.quantity, 0) || 0}</td><td className="num">{money(Number(sale.total))}</td><td>{sale.points_redeemed > 0 ? `折 ${sale.points_redeemed}` : ""}{sale.points_redeemed > 0 && sale.points_earned > 0 ? "／" : ""}{sale.points_earned > 0 ? `得 ${sale.points_earned}` : "—"}</td><td>{payment[sale.payment_method] || sale.payment_method}{reconcile && <small className="block-muted">{reconcile}</small>}</td><td><div className="row-buttons"><Link className="btn sm" href={`/sales/${sale.id}/receipt`}>列印銷貨單</Link><Link className="btn sm" href={`/returns?sale=${encodeURIComponent(sale.document_no)}`}>辦理退貨</Link></div></td></tr>;
      })}</tbody></table></div>
    </section>
  </>;
}
