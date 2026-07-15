"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { completeReturn } from "@/app/(dashboard)/returns/actions";
import { SubmitButton } from "@/components/submit-button";

export type ReturnOrderItem = { id: string; name: string; sku: string; variant: string; quantity: number; returned: number; available: number; unitPrice: number };
export type ReturnOrder = { id: string; documentNo: string; completedAt: string; customer: string; paymentMethod: string; subtotal: number; total: number; alreadyRefunded: number; items: ReturnOrderItem[] };
export type RecentReturn = { id: string; documentNo: string; saleDocument: string; completedAt: string; itemCount: number; unitCount: number; refundAmount: number; refundMethod: string; reason: string; actor: string };

const money = (value: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
const payment: Record<string, string> = { original: "原付款方式", cash: "現金", card: "信用卡", transfer: "銀行轉帳", line_transfer: "LINE 轉帳" };

export function ReturnManager({ order, recent, query, message, lookupError, role, approval }: { order?: ReturnOrder; recent: RecentReturn[]; query: string; message?: string; lookupError?: string; role: string; approval: { returnThresholdAmount: number; pinConfigured: boolean } }) {
  const router = useRouter();
  const [code, setCode] = useState(query);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const lookup = useCallback((value: string) => {
    const documentNo = value.trim();
    if (!documentNo) return;
    router.push(`/returns?sale=${encodeURIComponent(documentNo)}`);
  }, [router]);
  const selected = useMemo(() => order?.items.filter((item) => (quantities[item.id] || 0) > 0) || [], [order, quantities]);
  const ratio = order && order.subtotal > 0 ? order.total / order.subtotal : 0;
  const estimatedRefund = selected.reduce((sum, item) => sum + item.unitPrice * (quantities[item.id] || 0) * ratio, 0);
  const cappedRefund = Math.min(estimatedRefund, Math.max(0, (order?.total || 0) - (order?.alreadyRefunded || 0)));
  const approvalRequired = cappedRefund >= approval.returnThresholdAmount;
  const payload = selected.map((item) => ({ sale_item_id: item.id, quantity: quantities[item.id] }));
  function setQty(item: ReturnOrderItem, value: number) { setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Math.min(item.available, Number.isFinite(value) ? value : 0)) })); }
  return <>
    {message && <div className="notice page-notice" role="status">{message}</div>}
    <div className="page-head"><div><h2>退貨處理</h2><p>掃描銷貨單條碼，選擇單項或部分數量退貨，完成後自動回補庫存。</p></div></div>
    <section className="panel return-lookup"><div className="panel-head"><div><h3>1. 掃描或輸入銷貨單號</h3><p>外接掃碼器掃描後通常會自動送出 Enter。</p></div></div><div className="return-scan-row"><div className="field"><label htmlFor="saleDocument">銷貨單號</label><div className="input-with-button"><input ref={inputRef} id="saleDocument" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); lookup(code); } }} autoFocus placeholder="例如：SO-20260715…"/><button className="btn primary" type="button" onClick={() => lookup(code)}>查詢銷貨單</button></div></div><BarcodeScanner onDetected={(value) => { setCode(value); lookup(value); }}/></div>{lookupError && <div className="notice return-error">{lookupError}</div>}</section>
    {order && <section className="panel return-order"><div className="panel-head"><div><h3>2. 選擇退貨商品</h3><p>銷貨單 {order.documentNo}・{order.completedAt}・{order.customer}</p></div><div className="order-paid"><span>原實收</span><b>{money(order.total)}</b>{order.alreadyRefunded > 0 && <small>已退款 {money(order.alreadyRefunded)}</small>}</div></div><form action={completeReturn}><input type="hidden" name="saleId" value={order.id}/><input type="hidden" name="saleDocument" value={order.documentNo}/><input type="hidden" name="items" value={JSON.stringify(payload)}/><div className="table-wrap return-items"><table><thead><tr><th>商品</th><th className="num">原購買</th><th className="num">已退</th><th className="num">可退</th><th className="num">原單價</th><th className="num">本次退貨數量</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id} className={item.available === 0 ? "returned-line" : ""}><td><b>{item.name}</b><small className="block-muted">{item.variant || "基本規格"}・{item.sku}</small></td><td className="num">{item.quantity}</td><td className="num">{item.returned}</td><td className="num">{item.available}</td><td className="num">{money(item.unitPrice)}</td><td className="num">{item.available > 0 ? <div className="quantity-control return-quantity"><button type="button" onClick={() => setQty(item, (quantities[item.id] || 0) - 1)}>−</button><input aria-label={`${item.name}退貨數量`} type="number" min="0" max={item.available} value={quantities[item.id] || 0} onChange={(event) => setQty(item, event.target.valueAsNumber)}/><button type="button" onClick={() => setQty(item, (quantities[item.id] || 0) + 1)}>＋</button></div> : <span className="pill">已全退</span>}</td></tr>)}</tbody></table></div><div className="return-form-grid"><div className="field"><label htmlFor="refundMethod">退款方式</label><select id="refundMethod" name="refundMethod" defaultValue="original"><option value="original">原付款方式（{payment[order.paymentMethod] || order.paymentMethod}）</option><option value="cash">現金</option><option value="card">信用卡／刷退</option><option value="transfer">銀行／LINE 轉帳</option></select></div><div className="field"><label htmlFor="returnReason">退貨原因</label><select id="returnReason" name="reason" defaultValue="尺寸或版型不合"><option>尺寸或版型不合</option><option>商品瑕疵</option><option>買錯商品</option><option>重複購買</option><option>其他顧客原因</option></select></div>{approvalRequired && <div className="field"><label htmlFor="returnManagerPin">店長核准</label>{role === "cashier" ? <input id="returnManagerPin" name="managerPin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required={approval.pinConfigured} disabled={!approval.pinConfigured} placeholder={approval.pinConfigured ? "輸入店長 PIN" : "尚未設定 PIN"}/> : <div className="notice">將以店主／店長身分核准。</div>}</div>}</div>{approvalRequired && <div className="notice approval-notice">預估退款達 {money(approval.returnThresholdAmount)} 大額退貨門檻，送出時會再次由資料庫檢查。</div>}<div className="return-footer"><div><span>本次選擇 {selected.length} 項／{selected.reduce((sum, item) => sum + (quantities[item.id] || 0), 0)} 件</span><b>預估退款 {money(cappedRefund)}</b><small>依原訂單折扣與點數折抵後的實付比例計算；最終金額由系統交易確認。</small></div><div className="form-actions"><button type="button" className="btn" onClick={() => setQuantities({})} disabled={selected.length === 0}>清除選擇</button><SubmitButton pendingLabel="退貨處理中，請勿重複送出…" disabled={selected.length === 0 || (approvalRequired && role === "cashier" && !approval.pinConfigured)}>確認退貨、退款並回庫</SubmitButton></div></div></form></section>}
    <section className="panel"><div className="panel-head"><div><h3>最近完成的退貨單</h3><p>退款、回庫與處理原因會永久保留紀錄</p></div></div><div className="table-wrap"><table><thead><tr><th>退貨單號</th><th>日期</th><th>原銷貨單</th><th className="num">品項／件數</th><th className="num">退款金額</th><th>退款方式</th><th>原因</th><th>處理人員</th></tr></thead><tbody>{recent.length === 0 ? <tr><td colSpan={8} className="empty">目前還沒有退貨單</td></tr> : recent.map((item) => <tr key={item.id}><td className="code">{item.documentNo}</td><td>{item.completedAt}</td><td className="code">{item.saleDocument}</td><td className="num">{item.itemCount}／{item.unitCount}</td><td className="num">{money(item.refundAmount)}</td><td>{payment[item.refundMethod] || item.refundMethod}</td><td>{item.reason}</td><td>{item.actor}</td></tr>)}</tbody></table></div></section>
  </>;
}
