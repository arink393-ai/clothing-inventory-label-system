import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { BarcodeSvg } from "@/components/barcode-svg";
import { createClient } from "@/lib/supabase/server";

const money = (n: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
const payment: Record<string, string> = { cash: "現金", card: "信用卡", transfer: "銀行轉帳", line_transfer: "LINE 轉帳" };

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("store_members").select("store_id,stores(name)").eq("user_id", user!.id).eq("active", true).single();
  const { data: sale } = await supabase.from("sales").select("id,document_no,completed_at,subtotal,discount,total,payment_method,points_earned,points_redeemed,points_discount,customers(name,phone),sale_items(id,quantity,unit_price,product_variants(sku,color,size,products(name)))").eq("id", id).eq("store_id", member!.store_id).eq("status", "completed").maybeSingle();
  if (!sale) notFound();
  const store = Array.isArray(member!.stores) ? member!.stores[0] : member!.stores;
  const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
  return <div className="receipt-page"><div className="page-head print-toolbar"><div><h2>銷貨單</h2><p>可選擇標準 80mm 收據或一般 A4 印表機。</p></div><div className="actions"><Link className="btn" href="/sales">返回銷售結帳</Link><PrintButton format="receipt-80">列印 80mm</PrintButton><PrintButton format="receipt-a4">列印 A4</PrintButton></div></div><article className="print-document receipt-document"><header><h1>{store?.name || "門市"}</h1><p>銷貨單／交易明細</p></header><dl className="receipt-meta"><div><dt>單號</dt><dd>{sale.document_no}</dd></div><div><dt>日期</dt><dd>{sale.completed_at ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(sale.completed_at)) : "—"}</dd></div><div><dt>客人</dt><dd>{customer?.name || "一般客人"}{customer?.phone ? `（${customer.phone}）` : ""}</dd></div><div><dt>付款</dt><dd>{payment[sale.payment_method] || sale.payment_method}</dd></div></dl><div className="receipt-order-barcode"><BarcodeSvg value={sale.document_no} height={34} fontSize={11}/><small>退貨時請出示此銷貨單條碼</small></div><table className="receipt-items"><thead><tr><th>商品</th><th className="num">數量</th><th className="num">單價</th><th className="num">小計</th></tr></thead><tbody>{sale.sale_items.map((item) => { const variant = Array.isArray(item.product_variants) ? item.product_variants[0] : item.product_variants; const product = Array.isArray(variant?.products) ? variant?.products[0] : variant?.products; return <tr key={item.id}><td><b>{product?.name || "商品"}</b><small>{[variant?.color, variant?.size, variant?.sku].filter(Boolean).join(" / ")}</small></td><td className="num">{item.quantity}</td><td className="num">{money(Number(item.unit_price))}</td><td className="num">{money(item.quantity * Number(item.unit_price))}</td></tr>; })}</tbody></table><div className="receipt-totals"><span>商品小計</span><b>{money(Number(sale.subtotal))}</b>{Number(sale.discount) > 0 && <><span>整單折扣</span><b>−{money(Number(sale.discount))}</b></>}{Number(sale.points_discount) > 0 && <><span>點數折抵（{sale.points_redeemed} 點）</span><b>−{money(Number(sale.points_discount))}</b></>}<strong>實收金額</strong><strong>{money(Number(sale.total))}</strong></div>{customer && <div className="receipt-points"><b>本次累積 {sale.points_earned} 點</b><span>感謝您的消費，下次可繼續折抵。</span></div>}<footer>謝謝光臨・此單據由幸せ智慧進銷存產生</footer></article></div>;
}
