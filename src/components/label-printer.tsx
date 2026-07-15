"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarcodeSvg } from "@/components/barcode-svg";

export type LabelProduct = { id: string; name: string; sku: string; barcode: string; variant: string; price: number };
const money = (n: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

export function LabelPrinter({ products, storeName }: { products: LabelProduct[]; storeName: string }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [size, setSize] = useState("50x30");
  const filtered = products.filter((product) => `${product.name} ${product.sku} ${product.barcode} ${product.variant}`.toLowerCase().includes(query.toLowerCase()));
  const labels = useMemo(() => products.flatMap((product) => selected[product.id] ? Array.from({ length: Math.max(1, copies[product.id] || 1) }, (_, index) => ({ ...product, copy: index })) : []), [products, selected, copies]);
  const [width, height] = size.split("x").map(Number);
  function selectAll(value: boolean) { setSelected(Object.fromEntries(filtered.map((product) => [product.id, value]))); }
  function print() {
    const style = document.createElement("style");
    style.textContent = `@page{size:${width}mm ${height}mm;margin:0}`;
    document.head.appendChild(style);
    document.body.classList.add("printing-labels");
    const cleanup = () => { document.body.classList.remove("printing-labels"); style.remove(); };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  }
  return <div className="label-page"><div className="page-head print-toolbar"><div><h2>商品標籤與條碼列印</h2><p>已針對精臣 B21 準備常用尺寸；列印視窗中請選擇 B21。</p></div><div className="actions"><Link className="btn" href="/products">返回商品管理</Link><Link className="btn" href="/products/labels/calibration">B21 測試與校正</Link><button className="btn primary" onClick={print} disabled={labels.length === 0}>列印 {labels.length} 張標籤</button></div></div>
    <section className="panel print-toolbar"><div className="label-controls"><div className="field"><label>標籤尺寸</label><select value={size} onChange={(event) => setSize(event.target.value)}><option value="50x30">50 × 30 mm（B21 建議先試）</option><option value="40x30">40 × 30 mm</option><option value="30x20">30 × 20 mm</option></select></div><div className="field"><label>搜尋商品</label><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="商品、SKU 或條碼…"/></div></div><div className="row-buttons"><button className="btn sm" onClick={() => selectAll(true)}>選取搜尋結果</button><button className="btn sm" onClick={() => selectAll(false)}>清除搜尋結果</button></div><p className="notice">精臣 B21 可使用約 20–50 mm 寬的標籤。第一次請先列印 1 張測試，並在系統列印視窗把縮放設為 100%。</p><div className="table-wrap"><table><thead><tr><th>選取</th><th>商品</th><th>SKU／條碼</th><th>規格</th><th className="num">售價</th><th className="num">張數</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="empty">沒有可列印條碼的商品；請先替商品建立條碼。</td></tr> : filtered.map((product) => <tr key={product.id}><td><input type="checkbox" checked={Boolean(selected[product.id])} onChange={(event) => setSelected((current) => ({ ...current, [product.id]: event.target.checked }))}/></td><td><b>{product.name}</b></td><td><span className="code">{product.sku}</span><br/><small>{product.barcode}</small></td><td>{product.variant || "基本規格"}</td><td className="num">{money(product.price)}</td><td className="num"><input className="label-copy-input" type="number" min="1" max="99" value={copies[product.id] || 1} onChange={(event) => setCopies((current) => ({ ...current, [product.id]: Math.max(1, Math.min(99, event.target.valueAsNumber || 1)) }))}/></td></tr>)}</tbody></table></div></section>
    <section className="label-preview-section"><div className="print-toolbar panel-head"><div><h3>列印預覽</h3><p>{labels.length ? `${labels.length} 張，尺寸 ${width} × ${height} mm` : "請先選擇商品"}</p></div></div><div className="label-sheet" style={{ "--label-width": `${width}mm`, "--label-height": `${height}mm` } as React.CSSProperties}>{labels.map((label) => <article className={`product-label size-${size}`} key={`${label.id}-${label.copy}`}><div className="label-store">{storeName}</div><div className="label-name">{label.name}</div><div className="label-meta">{label.variant || label.sku}<b>{money(label.price)}</b></div><BarcodeSvg value={label.barcode}/></article>)}</div></section>
  </div>;
}
