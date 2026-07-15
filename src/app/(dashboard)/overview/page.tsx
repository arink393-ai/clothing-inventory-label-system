import Link from "next/link";
import { AlertTriangle, Boxes, CircleDollarSign, ShoppingBag } from "lucide-react";
import { PageHead } from "@/components/page-head";
import { createClient } from "@/lib/supabase/server";

type VariantRow = {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  reorder_point: number;
  products: { name: string; active: boolean } | { name: string; active: boolean }[];
  inventory_balances: { quantity: number } | { quantity: number }[] | null;
};

type MovementRow = {
  id: string;
  created_at: string;
  movement_type: string;
  reference_type: string;
  quantity: number;
  note: string | null;
  product_variants:
    | { sku: string; color: string | null; size: string | null; products: { name: string } | { name: string }[] }
    | { sku: string; color: string | null; size: string | null; products: { name: string } | { name: string }[] }[];
};

const money = (value: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value || 0);

const taipeiDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  return hour < 11 ? "早安" : hour < 18 ? "午安" : "晚安";
}

function todayLabel() {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

const movementLabel: Record<string, string> = {
  opening: "期初庫存",
  purchase: "進貨",
  sale: "銷售",
  sale_return: "退貨",
  adjustment: "庫存調整",
};

export default async function Overview() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: member }] = await Promise.all([
    user
      ? supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("store_members").select("store_id").eq("user_id", user.id).eq("active", true).single()
      : Promise.resolve({ data: null }),
  ]);

  const displayName = profile?.display_name || user?.user_metadata?.display_name || "店員";
  if (!member) {
    return <div className="notice page-notice">無法讀取門市資料，請重新登入。</div>;
  }

  const today = taipeiDate();
  const from = `${today}T00:00:00+08:00`;
  const to = `${addDays(today, 1)}T00:00:00+08:00`;
  const [salesResult, returnsResult, variantsResult, movementsResult] = await Promise.all([
    supabase.from("sales").select("id,total").eq("store_id", member.store_id).eq("status", "completed").gte("completed_at", from).lt("completed_at", to),
    supabase.from("sale_returns").select("id,refund_amount").eq("store_id", member.store_id).gte("completed_at", from).lt("completed_at", to),
    supabase.from("product_variants").select("id,sku,color,size,reorder_point,products!inner(name,active),inventory_balances(quantity)").eq("store_id", member.store_id).eq("active", true).eq("products.active", true).order("sku"),
    supabase.from("stock_movements").select("id,created_at,movement_type,reference_type,quantity,note,product_variants!inner(sku,color,size,products!inner(name))").eq("store_id", member.store_id).order("created_at", { ascending: false }).limit(8),
  ]);

  const loadError = salesResult.error || returnsResult.error || variantsResult.error || movementsResult.error;
  const grossSales = (salesResult.data || []).reduce((sum, sale) => sum + Number(sale.total), 0);
  const refunds = (returnsResult.data || []).reduce((sum, item) => sum + Number(item.refund_amount), 0);
  const variants = ((variantsResult.data || []) as unknown as VariantRow[]).map((variant) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
    const balance = Array.isArray(variant.inventory_balances) ? variant.inventory_balances[0] : variant.inventory_balances;
    return {
      id: variant.id,
      sku: variant.sku,
      name: product?.name || "商品",
      variant: [variant.color, variant.size].filter(Boolean).join(" / ") || "基本規格",
      stock: Number(balance?.quantity || 0),
      reorderPoint: Number(variant.reorder_point || 0),
    };
  });
  const totalStock = variants.reduce((sum, variant) => sum + variant.stock, 0);
  const lowStockAll = variants.filter((variant) => variant.stock <= variant.reorderPoint).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "zh-Hant"));
  const lowStock = lowStockAll.slice(0, 8);
  const movements = (movementsResult.data || []) as unknown as MovementRow[];

  return <>
    <PageHead title={`${greeting()}，${displayName}`} description={`${todayLabel()}・今天的門市即時營運摘要`}>
      <Link className="btn" href={`/reports?from=${today}&to=${today}`}>查看今日日報</Link>
      <Link className="btn primary" href="/sales">開始結帳</Link>
    </PageHead>
    {loadError && <div className="notice page-notice" role="alert">部分即時資料讀取失敗，請重新整理後再試。</div>}
    <section className="cards">
      <div className="metric"><div className="metric-label">今日淨營業額<CircleDollarSign /></div><div className="metric-value">{money(grossSales - refunds)}</div><div className="metric-note">銷售 {money(grossSales)} − 退款 {money(refunds)}</div></div>
      <div className="metric"><div className="metric-label">今日訂單<ShoppingBag /></div><div className="metric-value">{salesResult.data?.length || 0}</div><div className="metric-note">退貨 {returnsResult.data?.length || 0} 筆</div></div>
      <div className="metric"><div className="metric-label">目前庫存件數<Boxes /></div><div className="metric-value">{totalStock.toLocaleString("zh-TW")}</div><div className="metric-note">{variants.length} 個販售中規格</div></div>
      <div className="metric"><div className="metric-label">待補貨規格<AlertTriangle /></div><div className="metric-value">{lowStockAll.length}</div><div className={`metric-note ${lowStockAll.length ? "warn" : ""}`}>{lowStockAll.length ? "已達或低於安全庫存" : "目前庫存充足"}</div></div>
    </section>
    <div className="grid-2">
      <section className="panel"><div className="panel-head"><div><h3>最近庫存異動</h3><p>來自真實進貨、銷售、退貨與盤點紀錄</p></div><Link className="btn" href="/inventory">查看全部</Link></div><div className="table-wrap"><table><thead><tr><th>時間</th><th>類型</th><th>商品</th><th>來源／備註</th><th className="num">數量</th></tr></thead><tbody>{movements.length === 0 ? <tr><td colSpan={5} className="empty">尚無庫存異動</td></tr> : movements.map((movement) => { const variant = Array.isArray(movement.product_variants) ? movement.product_variants[0] : movement.product_variants; const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products; return <tr key={movement.id}><td>{new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Taipei" }).format(new Date(movement.created_at))}</td><td><span className={`pill ${movement.quantity < 0 ? "low" : ""}`}>{movementLabel[movement.movement_type] || movement.movement_type}</span></td><td>{product?.name || "商品"}<small className="block-muted">{[variant?.color, variant?.size, variant?.sku].filter(Boolean).join(" / ")}</small></td><td>{movement.note || movement.reference_type || "—"}</td><td className={`num movement-qty ${movement.quantity < 0 ? "negative" : "positive"}`}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td></tr>; })}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>補貨提醒</h3><p>目前庫存已達或低於安全數量</p></div><Link className="btn" href="/products">管理商品</Link></div>{lowStock.length === 0 ? <div className="empty">目前沒有需要補貨的商品</div> : lowStock.map((product) => <div key={product.id} className="overview-low-stock"><div><strong>{product.name}</strong><div>{product.variant}・{product.sku}</div></div><div className="num"><b>{product.stock}</b><div>安全 {product.reorderPoint}</div></div></div>)}</section>
    </div>
  </>;
}
