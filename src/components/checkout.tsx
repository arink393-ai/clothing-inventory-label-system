"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { completeCheckout } from "@/app/(dashboard)/sales/actions";
import { BarcodeScanner } from "@/components/barcode-scanner";

export type CheckoutProduct = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  variant: string;
  price: number;
  stock: number;
};
export type CheckoutMember = { id: string; name: string; phone: string; points: number };

const money = (value: number) =>
  new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);

function scanFeedback(success: boolean) {
  try {
    navigator.vibrate?.(success ? 60 : [120, 60, 120]);
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = success ? 880 : 220;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (success ? 0.09 : 0.2));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (success ? 0.09 : 0.2));
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  } catch {
    // 某些瀏覽器會阻擋音效；掃碼本身仍可正常使用。
  }
}

function CheckoutSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn primary checkout-submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? "結帳處理中，請勿關閉…" : "確認並完成結帳"}
  </button>;
}

export function Checkout({
  products,
  members,
  points,
  role,
  approval,
}: {
  products: CheckoutProduct[];
  members: CheckoutMember[];
  points: { enabled: boolean; spendAmount: number; pointValue: number };
  role: string;
  approval: { discountThresholdPercent: number; pinConfigured: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState(0);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanMessage, setScanMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [redeem, setRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const barcodeRef = useRef<HTMLInputElement>(null);

  const cart = useMemo(
    () => products.filter((product) => (quantities[product.id] || 0) > 0).map((product) => ({ ...product, quantity: quantities[product.id] })),
    [products, quantities],
  );
  const subtotal = cart.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const selectedMember = members.find((member) => member.id === customerId);
  const maxRedeemByTotal = points.pointValue > 0 ? Math.floor(Math.max(0, subtotal - discount) / points.pointValue) : 0;
  const maxRedeem = points.enabled && selectedMember ? Math.min(selectedMember.points, maxRedeemByTotal) : 0;
  const actualRedeem = Math.min(redeem, maxRedeem);
  const pointsDiscount = actualRedeem * points.pointValue;
  const total = Math.max(0, subtotal - discount - pointsDiscount);
  const discountPercent = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  const approvalRequired = discountPercent > approval.discountThresholdPercent;
  const earned = points.enabled && selectedMember ? Math.floor(total / points.spendAmount) : 0;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = products.filter((product) =>
    `${product.name} ${product.sku} ${product.barcode} ${product.variant}`.toLowerCase().includes(normalizedQuery),
  );

  function setQty(id: string, value: number, stock: number) {
    setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(stock, Number.isFinite(value) ? value : 0)) }));
  }

  const scan = useCallback((rawValue: string) => {
    const code = rawValue.trim();
    if (!code) {
      setScanMessage({ kind: "error", text: "請掃描條碼或輸入條碼後按 Enter。" });
      scanFeedback(false);
      return;
    }
    const normalized = code.toLowerCase();
    const product = products.find((item) => item.barcode.toLowerCase() === normalized || item.sku.toLowerCase() === normalized);
    if (!product) {
      setScanMessage({ kind: "error", text: `找不到條碼 ${code}，請先到商品管理建立商品。` });
      setBarcode("");
      scanFeedback(false);
      setTimeout(() => barcodeRef.current?.focus(), 0);
      return;
    }
    setQuantities((current) => {
      const currentQuantity = current[product.id] || 0;
      if (currentQuantity >= product.stock) {
        setScanMessage({ kind: "error", text: `${product.name} 已達目前庫存 ${product.stock} 件，無法再加入。` });
        scanFeedback(false);
        return current;
      }
      const nextQuantity = currentQuantity + 1;
      setScanMessage({ kind: "success", text: `已加入 ${product.name}，購物車共 ${nextQuantity} 件。` });
      scanFeedback(true);
      return { ...current, [product.id]: nextQuantity };
    });
    setBarcode("");
    setTimeout(() => barcodeRef.current?.focus(), 0);
  }, [products]);

  function openCheckout() {
    setRequestId(crypto.randomUUID());
    setOpen(true);
    setTimeout(() => barcodeRef.current?.focus(), 0);
  }

  function close() {
    setOpen(false);
    setRequestId("");
    setQuantities({});
    setDiscount(0);
    setQuery("");
    setBarcode("");
    setScanMessage(null);
    setCustomerId("");
    setRedeem(0);
    setPaymentMethod("cash");
  }

  return <>
    <button className="btn primary" onClick={openCheckout}>＋ 開始新結帳</button>
    {open && <div className="modal-backdrop"><section className="modal-card checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="panel-head"><div><h3 id="checkout-title">銷售結帳</h3><p>掃描商品後立即加入購物車；送出時會在同一筆交易扣除庫存與會員點數。</p></div><button className="btn" type="button" onClick={close}>關閉</button></div>
      {products.length === 0 ? <div className="empty">目前沒有可販售且有庫存的商品，請先到「商品管理」建立商品。</div> : <form action={completeCheckout}>
        <div className="checkout-scan-panel">
          <div className="field"><label htmlFor="checkoutBarcode">USB 掃碼器／手動輸入條碼</label><div className="input-with-button"><input ref={barcodeRef} id="checkoutBarcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scan(barcode); } }} autoComplete="off" inputMode="numeric" placeholder="掃描後會自動送出 Enter"/><button className="btn" type="button" onClick={() => scan(barcode)}>加入</button></div></div>
          <BarcodeScanner onDetected={scan}/>
        </div>
        {scanMessage && <div className={`checkout-scan-message ${scanMessage.kind}`} role={scanMessage.kind === "error" ? "alert" : "status"}>{scanMessage.text}</div>}
        <div className="checkout-grid"><div><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋商品、條碼、SKU 或規格…"/><div className="product-picker">{filtered.length === 0 ? <div className="empty">找不到符合的商品</div> : filtered.map((product) => <div className="picker-row" key={product.id}><div><b>{product.name}</b><small>{product.variant || "基本規格"}・{product.sku}・{product.barcode || "無條碼"}・庫存 {product.stock}</small></div><div className="quantity-control"><button type="button" aria-label={`減少 ${product.name}`} onClick={() => setQty(product.id, (quantities[product.id] || 0) - 1, product.stock)}>−</button><input aria-label={`${product.name}數量`} type="number" min="0" max={product.stock} value={quantities[product.id] || 0} onChange={(event) => setQty(product.id, event.target.valueAsNumber, product.stock)}/><button type="button" aria-label={`增加 ${product.name}`} onClick={() => setQty(product.id, (quantities[product.id] || 0) + 1, product.stock)}>＋</button></div></div>)}</div></div>
          <aside className="cart-summary"><h4>本次購物車</h4>{cart.length === 0 ? <p className="hint">尚未選擇商品</p> : cart.map((product) => <div className="cart-line" key={product.id}><span>{product.name} × {product.quantity}</span><b>{money(product.price * product.quantity)}</b></div>)}
            <div className="field"><label htmlFor="customerId">會員（選填）</label><select id="customerId" name="customerId" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setRedeem(0); }}><option value="">一般客人／不累積點數</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}・{member.phone || "無電話"}・{member.points} 點</option>)}</select>{members.length === 0 && <small>尚無會員，可先到「會員管理」新增。</small>}</div>
            <div className="field"><label htmlFor="discount">整單折扣</label><input id="discount" name="discount" type="number" min="0" max={subtotal} value={discount} onChange={(event) => { setDiscount(Math.max(0, event.target.valueAsNumber || 0)); setRedeem(0); }}/></div>
            {selectedMember && points.enabled && <div className="field"><label htmlFor="pointsToRedeem">折抵點數（可用 {selectedMember.points} 點）</label><input id="pointsToRedeem" name="pointsToRedeem" type="number" min="0" max={maxRedeem} step="1" value={actualRedeem} onChange={(event) => setRedeem(Math.max(0, Math.min(maxRedeem, event.target.valueAsNumber || 0)))}/><small>本次折抵 {money(pointsDiscount)}；結帳後預計累積 {earned} 點。</small></div>}
            {!selectedMember && <input type="hidden" name="pointsToRedeem" value="0"/>}
            {approvalRequired && <div className="notice approval-notice">本次折扣 {discountPercent.toFixed(1)}%，超過 {approval.discountThresholdPercent}% 核准門檻。{role === "cashier" ? approval.pinConfigured ? "請輸入店長 PIN。" : "尚未設定店長 PIN，請通知店主。" : "將以店主／店長身分自動核准。"}</div>}
            {approvalRequired && role === "cashier" && <div className="field"><label htmlFor="managerPin">店長 PIN</label><input id="managerPin" name="managerPin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} autoComplete="off" required placeholder="4～8 位數字"/></div>}
            {!approvalRequired && <input type="hidden" name="managerPin" value=""/>}
            <div className="field"><label htmlFor="paymentMethod">付款方式</label><select id="paymentMethod" name="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">現金</option><option value="transfer">銀行轉帳</option><option value="line_transfer">LINE 轉帳</option><option value="card">信用卡</option></select></div>
            {(paymentMethod === "transfer" || paymentMethod === "line_transfer") && <div className="transfer-reconcile"><div className="field"><label htmlFor="transferLast4">轉帳帳號末碼</label><input id="transferLast4" name="transferLast4" inputMode="numeric" pattern="[0-9]{3,5}" maxLength={5} placeholder="例如：12345"/></div><div className="field"><label htmlFor="paymentConfirmedBy">確認人</label><input id="paymentConfirmedBy" name="paymentConfirmedBy" maxLength={40} placeholder="例如：王店長"/></div><div className="field"><label htmlFor="paymentNote">交易備註</label><input id="paymentNote" name="paymentNote" maxLength={120} placeholder="例如：LINE Pay 轉帳截圖已確認"/></div><small>帳號末碼、確認人或備註至少填寫一項，方便結班對帳。</small></div>}
            <div className="cart-breakdown"><span>商品小計</span><b>{money(subtotal)}</b>{discount > 0 && <><span>整單折扣</span><b>−{money(discount)}</b></>}{pointsDiscount > 0 && <><span>點數折抵</span><b>−{money(pointsDiscount)}</b></>}</div><div className="cart-total"><span>實收金額</span><b>{money(total)}</b></div>
            <input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="items" value={JSON.stringify(cart.map((product) => ({ variantId: product.id, quantity: product.quantity })))}/>
            <CheckoutSubmitButton disabled={!requestId || cart.length === 0 || discount > subtotal || actualRedeem > maxRedeem || (approvalRequired && role === "cashier" && !approval.pinConfigured)}/>
          </aside></div>
      </form>}
    </section></div>}
  </>;
}
