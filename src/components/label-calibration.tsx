"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarcodeSvg } from "@/components/barcode-svg";
import { SubmitButton } from "@/components/submit-button";
import { deletePrinterProfile, savePrinterProfile } from "@/app/(dashboard)/products/labels/calibration/actions";

export type PrinterProfile = {
  id: string;
  name: string;
  labelWidthMm: number;
  labelHeightMm: number;
  offsetXMm: number;
  offsetYMm: number;
  scalePercent: number;
};

const blank: PrinterProfile = { id: "", name: "櫃台 B21", labelWidthMm: 50, labelHeightMm: 30, offsetXMm: 0, offsetYMm: 0, scalePercent: 100 };

export function LabelCalibration({ profiles, storeName, canDelete }: { profiles: PrinterProfile[]; storeName: string; canDelete: boolean }) {
  const [profile, setProfile] = useState<PrinterProfile>(profiles[0] || blank);
  const style = useMemo(() => ({
    "--cal-width": `${profile.labelWidthMm}mm`,
    "--cal-height": `${profile.labelHeightMm}mm`,
    "--cal-transform": `translate(${profile.offsetXMm}mm, ${profile.offsetYMm}mm) scale(${profile.scalePercent / 100})`,
  } as React.CSSProperties), [profile]);

  function choose(id: string) {
    setProfile(id ? profiles.find((item) => item.id === id) || blank : blank);
  }

  function update(key: keyof PrinterProfile, value: string) {
    setProfile((current) => ({ ...current, [key]: key === "name" ? value : Number(value) }));
  }

  function printTest() {
    const pageStyle = document.createElement("style");
    pageStyle.textContent = `@page{size:${profile.labelWidthMm}mm ${profile.labelHeightMm}mm;margin:0}`;
    document.head.appendChild(pageStyle);
    document.body.classList.add("printing-calibration");
    const cleanup = () => { document.body.classList.remove("printing-calibration"); pageStyle.remove(); };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  return <div className="calibration-page">
    <div className="page-head print-toolbar"><div><h2>B21 測試標籤與校正</h2><p>每台設備可保存自己的標籤尺寸、偏移量與縮放比例。</p></div><div className="actions"><Link className="btn" href="/products/labels">返回標籤列印</Link><button className="btn primary" type="button" onClick={printTest}>列印測試標籤</button></div></div>
    <div className="calibration-grid">
      <section className="panel print-toolbar">
        <div className="field"><label>已儲存設備</label><select value={profile.id} onChange={(event) => choose(event.target.value)}><option value="">新增一台 B21</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <form action={savePrinterProfile}>
          <input type="hidden" name="id" value={profile.id}/>
          <div className="field"><label>設備名稱</label><input name="name" value={profile.name} onChange={(event) => update("name", event.target.value)} required maxLength={60}/></div>
          <div className="calibration-fields">
            <div className="field"><label>標籤寬度（mm）</label><input name="width" type="number" min="10" max="120" step="0.1" value={profile.labelWidthMm} onChange={(event) => update("labelWidthMm", event.target.value)} required/></div>
            <div className="field"><label>標籤高度（mm）</label><input name="height" type="number" min="10" max="120" step="0.1" value={profile.labelHeightMm} onChange={(event) => update("labelHeightMm", event.target.value)} required/></div>
            <div className="field"><label>左右偏移 X（mm）</label><input name="offsetX" type="number" min="-20" max="20" step="0.1" value={profile.offsetXMm} onChange={(event) => update("offsetXMm", event.target.value)} required/></div>
            <div className="field"><label>上下偏移 Y（mm）</label><input name="offsetY" type="number" min="-20" max="20" step="0.1" value={profile.offsetYMm} onChange={(event) => update("offsetYMm", event.target.value)} required/></div>
            <div className="field"><label>縮放比例（%）</label><input name="scale" type="number" min="50" max="150" step="0.5" value={profile.scalePercent} onChange={(event) => update("scalePercent", event.target.value)} required/></div>
          </div>
          <p className="hint">內容向右偏請減少 X；向下偏請減少 Y。尺寸不合時先確認標籤紙，再小幅調整縮放。</p>
          <div className="form-actions"><SubmitButton pendingLabel="正在儲存校正設定…">{profile.id ? "儲存校正設定" : "建立設備設定"}</SubmitButton></div>
        </form>
        {profile.id && canDelete && <form action={deletePrinterProfile} className="calibration-delete"><input type="hidden" name="id" value={profile.id}/><SubmitButton className="btn danger" pendingLabel="正在刪除…">刪除此設備設定</SubmitButton></form>}
      </section>
      <section className="panel calibration-preview-wrap">
        <div className="panel-head print-toolbar"><div><h3>校正預覽</h3><p>{profile.labelWidthMm} × {profile.labelHeightMm} mm／{profile.scalePercent}%</p></div></div>
        <div className="calibration-stage">
          <article className="calibration-label" style={style}>
            <div className="calibration-label-inner">
              <div className="calibration-crosshair" aria-hidden/>
              <b>{storeName}</b><strong>B21 測試標籤</strong><span>上下左右邊框應完整</span>
              <BarcodeSvg value="B21-TEST-123456" height={32} fontSize={9}/>
            </div>
          </article>
        </div>
        <ol className="calibration-help print-toolbar"><li>先選擇正確標籤紙尺寸，縮放維持 100%。</li><li>列印一張，觀察邊框是否完整且置中。</li><li>再以 0.5～1 mm 小幅調整 X/Y，必要時才調整縮放。</li></ol>
      </section>
    </div>
  </div>;
}
