// 極簡 Service Worker：只用來讓瀏覽器判定「可安裝為 App」。
// 系統需要網路（雲端同步等），刻意不做離線快取，避免更新後看到舊版本。
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { self.clients.claim(); });
self.addEventListener("fetch", (e) => { /* 全部走網路，不攔截、不快取 */ });
