import Link from "next/link";
import { Checkout, type CheckoutMember, type CheckoutProduct } from "@/components/checkout";
import { PageHead } from "@/components/page-head";
import { createClient } from "@/lib/supabase/server";

const money = (n: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
const payment: Record<string, string> = { cash: "現金", card: "信用卡", transfer: "銀行轉帳", line_transfer: "LINE 轉帳" };

export default async function Sales({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id").eq("user_id", user!.id).eq("active", true).single();
  const [{ data: variants }, { data: sales }, { data: customers }, { data: store }] = await Promise.all([
    supabase.from("product_variants").select("id,sku,barcode,color,size,price,active,products!inner(name,active),inventory_balances(quantity)").eq("store_id", member!.store_id).eq("active", true).order("sku"),
    supabase.from("sales").select("id,document_no,completed_at,total,payment_method,points_earned,points_redeemed,customers(name),sale_items(quantity)").eq("store_id", member!.store_id).eq("status", "completed").order("completed_at", { ascending: false }).limit(30),
    supabase.from("customers").select("id,name,phone,points").eq("store_id", member!.store_id).order("name"),
    supabase.from("stores").select("points_spend_amount,point_value,points_enabled").eq("id", member!.store_id).single(),
  ]);
  const products: CheckoutProduct[] = (variants || []).map((variant) => { const product = Array.isArray(variant.products) ? variant.products[0] : variant.products; const balance = Array.isArray(variant.inventory_balances) ? variant.inventory_balances[0] : variant.inventory_balances; return { id: variant.id, sku: variant.sku, barcode: variant.barcode || "", name: product?.name || "商品", variant: [variant.color, variant.size].filter(Boolean).join(" / "), price: Number(variant.price), stock: Number(balance?.quantity || 0), productActive: product?.active !== false }; }).filter((product) => product.stock > 0 && product.productActive).map((product) => ({ id: product.id, sku: product.sku, barcode: product.barcode, name: product.name, variant: product.variant, price: product.price, stock: product.stock }));
  const checkoutMembers: CheckoutMember[] = (customers || []).map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone || "", points: customer.points }));
  return <>{message && <div className="notice page-notice" role="status">{message}</div>}<PageHead title="銷售結帳" description="完成後自動扣除庫存、累積會員點數並可列印銷貨單"><Checkout products={products} members={checkoutMembers} points={{ enabled: store?.points_enabled !== false, spendAmount: Number(store?.points_spend_amount || 100), pointValue: Number(store?.point_value || 1) }}/></PageHead><section className="panel"><div className="panel-head"><div><h3>最近完成的銷售單</h3><p>顯示最近 30 筆雲端交易</p></div></div><div className="table-wrap"><table><thead><tr><th>銷售單號</th><th>時間</th><th>會員</th><th className="num">件數</th><th className="num">實收金額</th><th>點數</th><th>付款</th><th>操作</th></tr></thead><tbody>{!sales?.length ? <tr><td colSpan={8} className="empty">尚未完成銷售單，按「開始新結帳」建立第一筆交易。</td></tr> : sales.map((sale) => { const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers; return <tr key={sale.id}><td className="code">{sale.document_no}</td><td>{sale.completed_at ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(sale.completed_at)) : "—"}</td><td>{customer?.name || "一般客人"}</td><td className="num">{sale.sale_items?.reduce((n, item) => n + item.quantity, 0) || 0}</td><td className="num">{money(Number(sale.total))}</td><td>{sale.points_redeemed > 0 ? `折 ${sale.points_redeemed}` : ""}{sale.points_redeemed > 0 && sale.points_earned > 0 ? "／" : ""}{sale.points_earned > 0 ? `得 ${sale.points_earned}` : "—"}</td><td>{payment[sale.payment_method] || sale.payment_method}</td><td><div className="row-buttons"><Link className="btn sm" href={`/sales/${sale.id}/receipt`}>列印銷貨單</Link><Link className="btn sm" href={`/returns?sale=${encodeURIComponent(sale.document_no)}`}>辦理退貨</Link></div></td></tr>; })}</tbody></table></div></section></>;
}
