import { MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";

export function PwaInstallGuide() {
  return <section className="panel pwa-panel"><div className="panel-head"><div><h3>安裝門市 App</h3><p>安裝後會以獨立視窗開啟，但仍會即時連接雲端庫存。</p></div><span className="pill"><ShieldCheck aria-hidden/> 僅限員工登入</span></div><div className="pwa-install-grid"><article><Smartphone aria-hidden/><div><b>iPhone／iPad</b><p>請用 Safari 開啟網站，點「分享」後選擇「加入主畫面」。</p></div></article><article><Smartphone aria-hidden/><div><b>Android</b><p>請用 Chrome 開啟網站，點右上角選單，再選「安裝應用程式」。</p></div></article><article><MonitorSmartphone aria-hidden/><div><b>Windows／Mac 門市電腦</b><p>請用 Chrome 開啟網站，點網址列右側的安裝圖示，或從選單選擇「安裝」。</p></div></article></div><div className="notice pwa-note">為避免結帳與盤點使用到過期庫存，本 App 不提供離線修改資料；使用時需要網際網路。</div></section>;
}
