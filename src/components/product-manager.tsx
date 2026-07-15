"use client";
/* eslint-disable @next/next/no-img-element -- blob URL is a local, temporary camera preview */
import { useCallback, useState } from "react";
import Link from "next/link";
import { BarcodeScanner } from "@/components/barcode-scanner";
import {
  categories,
  categoryCode,
  colors,
  sizes,
  specifications,
} from "@/lib/product-options";
import {
  createProduct,
  toggleProduct,
  updateProduct,
} from "@/app/(dashboard)/products/actions";
import { SubmitButton } from "@/components/submit-button";
export type ProductRow = {
  id: string;
  variantId: string;
  productSku: string;
  variantSku: string;
  barcode: string;
  name: string;
  imageUrl?: string;
  category: string;
  categoryCode: string;
  color: string;
  size: string;
  stock: number;
  price: number;
  cost: number;
  reorderPoint: number;
  active: boolean;
  isConsignment: boolean;
  consignorName: string;
  commissionPercent: number;
};
const money = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
function Select({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select name={name} defaultValue={defaultValue || options[0]}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
function ProductFields({
  row,
  quick = false,
  canManageConsignment,
}: {
  row?: ProductRow;
  quick?: boolean;
  canManageConsignment: boolean;
}) {
  const [barcode, setBarcode] = useState(row?.barcode || "");
  const [category, setCategory] = useState(row?.category || "其他");
  const [customCategory, setCustomCategory] = useState("");
  const [photo, setPhoto] = useState("");
  const [isConsignment, setIsConsignment] = useState(row?.isConsignment || false);
  const detected = useCallback((value: string) => setBarcode(value), []);
  const actualCategory =
    category === "其他" && customCategory.trim()
      ? customCategory.trim()
      : category;
  return (
    <>
      <input type="hidden" name="category" value={actualCategory} />
      <input type="hidden" name="categoryCode" value={categoryCode(category)} />
      <div className={quick ? "quick-grid" : "form-grid"}>
        <div className="field barcode-field">
          <label>商品條碼</label>
          <div className="input-with-button">
            <input
              name="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              autoFocus={quick}
              placeholder="請掃條碼或手動輸入"
            />
            <BarcodeScanner onDetected={detected} />
          </div>
          <small>USB／藍牙掃碼器可直接對著此欄掃描。</small>
        </div>
        <div className="field price-field">
          <label>售價</label>
          <input
            name="price"
            type="number"
            min="0"
            defaultValue={row?.price ?? 0}
          />
          <small>不確定時可先填 0，之後再補定價。</small>
        </div>
        <div className="field">
          <label>商品分類</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map(([name]) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        {category === "其他" && (
          <div className="field">
            <label>自訂分類</label>
            <input
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="例如：禮品、文具"
            />
          </div>
        )}
        <div className="field">
          <label>商品照片</label>
          <input
            name="photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPhoto(URL.createObjectURL(f));
            }}
          />
          {photo && (
            <img className="photo-preview" src={photo} alt="商品預覽" />
          )}
          <small>照片會安全儲存到門市的私人空間；影像 AI 將在下一步接上。</small>
        </div>
        {quick && (
          <>
            <input type="hidden" name="openingStock" value="1" />
            <input type="hidden" name="color" value="未指定" />
            <input type="hidden" name="size" value="未指定" />
            <input type="hidden" name="reorderPoint" value="3" />
            <input type="hidden" name="cost" value="0" />
            <input type="hidden" name="isConsignment" value="false" />
          </>
        )}
        {!quick && (
          <>
            <div className="field">
              <label>商品名稱</label>
              <input
                name="name"
                defaultValue={row?.name}
                placeholder="可留空，系統會自動產生待補資料名稱"
              />
            </div>
            <Select
              name="specification"
              label="款式／規格"
              options={specifications}
            />
            <Select
              name="color"
              label="顏色"
              options={colors}
              defaultValue={row?.color}
            />
            <Select
              name="size"
              label="尺寸"
              options={sizes}
              defaultValue={row?.size}
            />
            <div className="field">
              <label>商品款式 SKU</label>
              <input
                name="productSku"
                defaultValue={row?.productSku}
                placeholder="留空即自動編號"
              />
            </div>
            <div className="field">
              <label>規格 SKU</label>
              <input
                name="variantSku"
                defaultValue={row?.variantSku}
                placeholder="留空即自動編號"
              />
            </div>
            <div className="field">
              <label>低庫存門檻</label>
              <input
                name="reorderPoint"
                type="number"
                min="0"
                defaultValue={row?.reorderPoint ?? 3}
              />
            </div>
            {!row && (
              <div className="field">
                <label>期初庫存</label>
                <input
                  name="openingStock"
                  type="number"
                  min="0"
                  defaultValue="1"
                />
              </div>
            )}
            <details className="cost-details">
              <summary>成本資料（選填／預設隱藏）</summary>
              <div className="field">
                <label>成本</label>
                <input
                  name="cost"
                  type="number"
                  min="0"
                  defaultValue={row?.cost ?? 0}
                />
                <small>不輸入會以 0 儲存；一般商品列表不顯示成本。</small>
              </div>
            </details>
            {canManageConsignment ? <><div className="field consignment-toggle"><label>商品來源</label><select name="isConsignment" value={String(isConsignment)} onChange={(event)=>setIsConsignment(event.target.value==="true")}><option value="false">一般自有商品</option><option value="true">寄賣商品</option></select></div>
            {isConsignment && <><div className="field"><label>寄賣人／寄賣廠商</label><input name="consignorName" defaultValue={row?.consignorName} maxLength={80} required placeholder="例如：陳小姐／ABC 品牌"/></div><div className="field"><label>門市抽成％</label><input name="commissionPercent" type="number" min="0" max="100" step="0.01" defaultValue={row?.commissionPercent ?? 30} required/><small>例如填 30，代表門市保留 30%，寄賣人分得 70%。</small></div></>}</> : <><input type="hidden" name="isConsignment" value={String(row?.isConsignment || false)}/>{row?.isConsignment && <><input type="hidden" name="consignorName" value={row.consignorName}/><input type="hidden" name="commissionPercent" value={row.commissionPercent}/><div className="notice">此商品為寄賣品；寄賣人與抽成比例需由店主或店長修改。</div></>}</>}
          </>
        )}
      </div>
    </>
  );
}
export function ProductManager({
  rows,
  message,
  canManageConsignment,
}: {
  rows: ProductRow[];
  message?: string;
  canManageConsignment: boolean;
}) {
  const [mode, setMode] = useState<"quick" | "full" | null>(null);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  return (
    <>
      {message && (
        <div className="notice page-notice" role="status">
          {message}
        </div>
      )}
      <div className="page-head">
        <div>
          <h2>商品管理</h2>
          <p>快速掃碼建檔，之後再補齊顏色、尺寸與成本。</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/products/labels">
            ▤ 列印商品標籤
          </Link>
          <button className="btn primary" onClick={() => setMode("quick")}>
            ⚡ 快速掃碼入庫
          </button>
          <button className="btn" onClick={() => setMode("full")}>
            ＋ 完整建檔
          </button>
        </div>
      </div>
      {mode && (
        <section className="panel quick-create">
          <div className="panel-head">
            <div>
              <h3>{mode === "quick" ? "快速掃碼入庫" : "完整商品建檔"}</h3>
              <p>
                {mode === "quick"
                  ? "只要掃條碼即可儲存；預設入庫 1 件，其他資料之後再補。"
                  : "建立商品、第一個規格與期初庫存。"}
              </p>
            </div>
            <button className="btn" onClick={() => setMode(null)}>
              關閉
            </button>
          </div>
          <form action={createProduct}>
            <ProductFields quick={mode === "quick"} canManageConsignment={canManageConsignment}/>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setMode(null)}
              >
                取消
              </button>
              <SubmitButton pendingLabel={mode === "quick" ? "建檔並入庫中…" : "商品儲存中…"}>{mode === "quick" ? "立即儲存並入庫 1 件" : "儲存到雲端"}</SubmitButton>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="toolbar">
          <span className="hint">目前共有 {rows.length} 個商品規格</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU / 條碼</th>
                <th>商品</th>
                <th>分類</th>
                <th>規格</th>
                <th className="num">庫存</th>
                <th className="num">售價</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    尚未建立商品。按「快速掃碼入庫」開始。
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.variantId}>
                    <td>
                      <span className="code">{row.variantSku}</span>
                      <br />
                      <small>{row.barcode || "無條碼"}</small>
                    </td>
                    <td>
                      <div className="product-name-cell">{row.imageUrl&&<img src={row.imageUrl} alt=""/>}<b>{row.name}</b></div>
                    </td>
                    <td>{row.category}{row.isConsignment && <><br/><span className="pill">寄賣・抽成 {row.commissionPercent}%</span></>}</td>
                    <td>
                      {[row.color, row.size]
                        .filter((v) => v && v !== "未指定")
                        .join(" / ") || "待補規格"}
                    </td>
                    <td className="num">
                      <span
                        className={
                          row.stock <= row.reorderPoint ? "pill low" : "pill"
                        }
                      >
                        {row.stock}
                      </span>
                    </td>
                    <td className="num">
                      {row.price ? (
                        money(row.price)
                      ) : (
                        <span className="pill low">待定價</span>
                      )}
                    </td>
                    <td>
                      <span className={row.active ? "pill" : "pill low"}>
                        {row.active ? "販售中" : "已停售"}
                      </span>
                    </td>
                    <td>
                      <div className="row-buttons">
                        <button
                          className="btn sm"
                          onClick={() => setEditing(row)}
                        >
                          補資料／編輯
                        </button>
                        <form action={toggleProduct}>
                          <input
                            type="hidden"
                            name="productId"
                            value={row.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={String(!row.active)}
                          />
                          <SubmitButton className={`btn sm ${row.active ? "danger" : ""}`} pendingLabel="更新中…">{row.active ? "停售" : "重新上架"}</SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <div className="modal-backdrop">
          <section className="modal-card" role="dialog" aria-modal="true">
            <div className="panel-head">
              <div>
                <h3>補齊／編輯商品</h3>
                <p>{editing.variantSku}</p>
              </div>
              <button className="btn" onClick={() => setEditing(null)}>
                關閉
              </button>
            </div>
            <form action={updateProduct}>
              <input type="hidden" name="productId" value={editing.id} />
              <input type="hidden" name="variantId" value={editing.variantId} />
              <ProductFields row={editing} canManageConsignment={canManageConsignment}/>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditing(null)}
                >
                  取消
                </button>
                <SubmitButton pendingLabel="商品更新中…">儲存變更</SubmitButton>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
