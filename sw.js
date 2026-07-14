// 極簡 Service Worker：只用來讓瀏覽器判定「可安裝為 App」。
// 這個系統本來就需要網路（雲端同步、AI 拍照辨識等），所以刻意不做離線快取，
// 避免快取到舊版本、造成更新後看到舊畫面的問題。
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  // 全部直接走網路，不攔截、不快取
});
