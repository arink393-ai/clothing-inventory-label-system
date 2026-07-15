"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { receivePurchase } from "@/app/(dashboard)/purchases/actions";
export type PurchaseProduct = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  variant: string;
  stock: number;
};
export type PurchaseRecord = {
  id: string;
  documentNo: string;
  completedAt: string;
  supplier: string;
  lines: number;
  units: number;
  note: string;
};
type CartLine = { quantity: number; unitCost: number };
type ExcelPreview = {
  row: number;
  barcode: string;
  name: string;
  quantity: number;
  unitCost: number;
  status: string;
  valid: boolean;
};
export function PurchaseManager({
  products,
  records,
  message,
}: {
  products: PurchaseProduct[];
  records: PurchaseRecord[];
  message?: string;
}) {
  const [mode, setMode] = useState<"scan" | "excel" | "manual" | null>(null);
  return (
    <>
      {message && (
        <div className="notice page-notice" role="status">
          {message}
        </div>
      )}
      <div className="page-head">
        <div>
          <h2>進貨入庫</h2>
          <p>掃碼、Excel 或手動建立進貨單，完成後立即增加庫存。</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setMode("excel")}>
            ⇩ 匯入 Excel
          </button>
          <button className="btn" onClick={() => setMode("manual")}>
            ＋ 手動入庫
          </button>
          <button className="btn primary" onClick={() => setMode("scan")}>
            ▦ 掃碼入庫
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>最近完成的進貨單</h3>
            <p>顯示最近 50 筆真實入庫紀錄</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>進貨單號</th>
                <th>完成時間</th>
                <th>供應商</th>
                <th className="num">品項</th>
                <th className="num">件數</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    尚未建立進貨單
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id}>
                    <td className="code">{r.documentNo}</td>
                    <td>{r.completedAt}</td>
                    <td>{r.supplier}</td>
                    <td className="num">{r.lines}</td>
                    <td className="num">{r.units}</td>
                    <td>{r.note || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {mode && (
        <ReceiveModal
          mode={mode}
          products={products}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}
function ReceiveModal({
  mode,
  products,
  onClose,
}: {
  mode: "scan" | "excel" | "manual";
  products: PurchaseProduct[];
  onClose: () => void;
}) {
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ExcelPreview[]>([]);
  const [selected, setSelected] = useState(products[0]?.id || "");
  const [manualQty, setManualQty] = useState(1);
  const [manualCost, setManualCost] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lines = useMemo(
    () => products.filter((p) => cart[p.id]),
    [products, cart],
  );
  const scan = useCallback(
    (value: string) => {
      const code = value.trim();
      const item = products.find((p) => p.barcode === code);
      if (!item) {
        setError(`找不到條碼 ${code || "（空白）"}，請先到商品管理建立條碼。`);
        setBarcode("");
        return;
      }
      setCart((c) => ({
        ...c,
        [item.id]: {
          quantity: (c[item.id]?.quantity || 0) + 1,
          unitCost: c[item.id]?.unitCost || 0,
        },
      }));
      setError("");
      setBarcode("");
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [products],
  );
  function addManual() {
    if (!selected) return;
    setCart((c) => ({
      ...c,
      [selected]: {
        quantity: (c[selected]?.quantity || 0) + Math.max(1, manualQty),
        unitCost: Math.max(0, manualCost),
      },
    }));
  }
  async function importExcel(file: File) {
    setError("");
    setPreview([]);
    try {
      const rows = await readSheet(file);
      if (rows.length < 2) throw new Error("Excel 沒有可匯入的明細列");
      const normalize = (v: unknown) =>
        String(v ?? "")
          .trim()
          .toLowerCase()
          .replace(/[\s_\-／/]/g, "");
      const headers = rows[0].map(normalize);
      const index = (aliases: string[]) =>
        headers.findIndex((h) => aliases.map(normalize).includes(h));
      const barcodeIndex = index([
          "條碼",
          "商品條碼",
          "barcode",
          "ean",
          "ean13",
        ]),
        quantityIndex = index(["數量", "件數", "進貨數量", "quantity", "qty"]),
        costIndex = index([
          "成本",
          "進價",
          "單價",
          "unit cost",
          "unitcost",
          "cost",
        ]),
        nameIndex = index(["商品名稱", "品名", "名稱", "product name", "name"]);
      if (barcodeIndex < 0 || quantityIndex < 0)
        throw new Error("找不到必要欄位：請確認第一列包含「條碼」與「數量」");
      const next: ExcelPreview[] = [];
      const nextCart: Record<string, CartLine> = {};
      rows.slice(1).forEach((row, i) => {
        if (row.every((v) => v === null || String(v).trim() === "")) return;
        const code = String(row[barcodeIndex] ?? "")
          .trim()
          .replace(/\.0$/, "");
        const qty = Number(String(row[quantityIndex] ?? "").replace(/,/g, ""));
        const cost =
          costIndex >= 0
            ? Number(String(row[costIndex] ?? 0).replace(/,/g, ""))
            : 0;
        const product = products.find((p) => p.barcode === code);
        let status = "可以匯入";
        if (!code) status = "缺少條碼";
        else if (!Number.isInteger(qty) || qty <= 0)
          status = "數量必須是正整數";
        else if (!Number.isFinite(cost) || cost < 0) status = "成本格式錯誤";
        else if (!product) status = "系統找不到此條碼";
        const valid = status === "可以匯入";
        next.push({
          row: i + 2,
          barcode: code,
          name:
            product?.name ||
            String(nameIndex >= 0 ? row[nameIndex] || "未知商品" : "未知商品"),
          quantity: Number.isFinite(qty) ? qty : 0,
          unitCost: Number.isFinite(cost) ? cost : 0,
          status,
          valid,
        });
        if (valid && product) {
          const current = nextCart[product.id];
          nextCart[product.id] = {
            quantity: (current?.quantity || 0) + qty,
            unitCost: cost || current?.unitCost || 0,
          };
        }
      });
      if (!next.length) throw new Error("Excel 沒有可匯入的資料列");
      setPreview(next);
      setCart(nextCart);
      if (next.some((r) => !r.valid))
        setError(
          `有 ${next.filter((r) => !r.valid).length} 列需要修正，修正 Excel 後請重新選擇檔案。`,
        );
    } catch (e) {
      setCart({});
      setError(e instanceof Error ? e.message : "無法讀取 Excel");
    }
  }
  const invalidExcel = mode === "excel" && preview.some((r) => !r.valid);
  const payload = lines.map((p) => ({
    variant_id: p.id,
    quantity: cart[p.id].quantity,
    unit_cost: cart[p.id].unitCost,
  }));
  const title =
    mode === "scan"
      ? "掃碼進貨入庫"
      : mode === "excel"
        ? "Excel 進貨匯入"
        : "手動進貨入庫";
  return (
    <div className="modal-backdrop">
      <section
        className="modal-card purchase-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="panel-head">
          <div>
            <h3>{title}</h3>
            <p>確認後會建立進貨單並立即增加庫存。</p>
          </div>
          <button className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
        {products.length === 0 ? (
          <div className="empty">
            目前沒有商品，請先到商品管理建立商品與條碼。
          </div>
        ) : (
          <>
            {mode === "scan" && (
              <div className="purchase-entry">
                <div className="field">
                  <label>連續掃描條碼</label>
                  <div className="input-with-button">
                    <input
                      ref={inputRef}
                      autoFocus
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          scan(barcode);
                        }
                      }}
                      placeholder="掃描器通常會自動送出 Enter"
                    />
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => scan(barcode)}
                    >
                      加入
                    </button>
                  </div>
                </div>
                <BarcodeScanner onDetected={scan} />
              </div>
            )}
            {mode === "manual" && (
              <div className="manual-purchase">
                <div className="field">
                  <label>商品規格</label>
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}・{p.variant || "基本規格"}（庫存 {p.stock}）
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>數量</label>
                  <input
                    type="number"
                    min="1"
                    value={manualQty}
                    onChange={(e) =>
                      setManualQty(Math.max(1, e.target.valueAsNumber || 1))
                    }
                  />
                </div>
                <div className="field">
                  <label>本次單位成本（選填）</label>
                  <input
                    type="number"
                    min="0"
                    value={manualCost}
                    onChange={(e) =>
                      setManualCost(Math.max(0, e.target.valueAsNumber || 0))
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={addManual}
                >
                  加入清單
                </button>
              </div>
            )}
            {mode === "excel" && (
              <div className="excel-import">
                <div className="field">
                  <label>選擇廠商 Excel 檔（.xlsx）</label>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importExcel(file);
                    }}
                  />
                  <small>
                    第一列至少需要「條碼」與「數量」；「成本」與「商品名稱」為選填。條碼欄建議在
                    Excel 設為文字格式。
                  </small>
                </div>
                {preview.length > 0 && (
                  <div className="table-wrap excel-preview">
                    <table>
                      <thead>
                        <tr>
                          <th>列</th>
                          <th>條碼</th>
                          <th>商品</th>
                          <th className="num">數量</th>
                          <th className="num">成本</th>
                          <th>狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r) => (
                          <tr
                            key={r.row}
                            className={r.valid ? "" : "invalid-row"}
                          >
                            <td>{r.row}</td>
                            <td className="code">{r.barcode || "—"}</td>
                            <td>{r.name}</td>
                            <td className="num">{r.quantity}</td>
                            <td className="num">{r.unitCost}</td>
                            <td>{r.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {error && <div className="notice purchase-error">{error}</div>}
            <form action={receivePurchase}>
              <PurchaseCart products={products} cart={cart} setCart={setCart} />
              <div className="purchase-meta">
                <div className="field">
                  <label>供應商</label>
                  <input
                    name="supplierName"
                    placeholder="例如：台北服飾批發商"
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label>進貨備註</label>
                  <input
                    name="note"
                    defaultValue={
                      mode === "excel"
                        ? "Excel 匯入"
                        : mode === "scan"
                          ? "掃碼入庫"
                          : "手動入庫"
                    }
                    maxLength={150}
                  />
                </div>
              </div>
              <input
                type="hidden"
                name="items"
                value={JSON.stringify(payload)}
              />
              <div className="purchase-footer">
                <div>
                  <b>{lines.length} 項</b>・共{" "}
                  {lines.reduce((n, p) => n + cart[p.id].quantity, 0)} 件
                </div>
                <div className="form-actions">
                  <button type="button" className="btn" onClick={onClose}>
                    取消
                  </button>
                  <button
                    className="btn primary"
                    disabled={!lines.length || invalidExcel}
                  >
                    確認並完成入庫
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
function PurchaseCart({
  products,
  cart,
  setCart,
}: {
  products: PurchaseProduct[];
  cart: Record<string, CartLine>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, CartLine>>>;
}) {
  const lines = products.filter((p) => cart[p.id]);
  if (!lines.length)
    return <div className="empty purchase-empty">尚未加入進貨商品</div>;
  return (
    <div className="table-wrap purchase-cart">
      <table>
        <thead>
          <tr>
            <th>商品</th>
            <th>條碼</th>
            <th className="num">目前庫存</th>
            <th className="num">進貨數量</th>
            <th className="num">單位成本</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((p) => (
            <tr key={p.id}>
              <td>
                <b>{p.name}</b>
                <small className="block-muted">{p.variant || "基本規格"}</small>
              </td>
              <td className="code">{p.barcode || "—"}</td>
              <td className="num">{p.stock}</td>
              <td className="num">
                <input
                  className="purchase-number"
                  type="number"
                  min="1"
                  value={cart[p.id].quantity}
                  onChange={(e) =>
                    setCart((c) => ({
                      ...c,
                      [p.id]: {
                        ...c[p.id],
                        quantity: Math.max(1, e.target.valueAsNumber || 1),
                      },
                    }))
                  }
                />
              </td>
              <td className="num">
                <input
                  className="purchase-number"
                  type="number"
                  min="0"
                  value={cart[p.id].unitCost}
                  onChange={(e) =>
                    setCart((c) => ({
                      ...c,
                      [p.id]: {
                        ...c[p.id],
                        unitCost: Math.max(0, e.target.valueAsNumber || 0),
                      },
                    }))
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={() =>
                    setCart((c) => {
                      const next = { ...c };
                      delete next[p.id];
                      return next;
                    })
                  }
                >
                  移除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
