# 第一版設定與上線指南

## 1. 先在本機確認畫面

需求：Node.js 20.9 以上。執行：

```bash
npm install
npm run dev
```

瀏覽 `http://localhost:3000`。請依序用桌機、瀏覽器手機模式與真實手機檢查商品、庫存、結帳等頁面。

## 2. 建立 Supabase 專案

1. 登入 Supabase，建立一個位於鄰近區域的正式專案。
2. 到 Project Settings → API 複製 Project URL 與 Publishable key。
3. 複製 `.env.example` 為 `.env.local`，填入兩個值。Publishable key 可以放在前端；絕對不要把 service role key 放進 `NEXT_PUBLIC_*`。
4. 執行 `npx supabase login`、`npx supabase link --project-ref <你的 project ref>`，再執行 `npx supabase db push` 套用全部 migration。不可只執行第一個 migration。
5. 部署員工帳號管理函式：`npx supabase functions deploy manage-staff --no-verify-jwt`。函式內仍會驗證登入者 JWT 與店主角色，`--no-verify-jwt` 是為了避免平台閘道與新式 publishable key 不相容。
6. 建立並確認第一位店主帳號後，到 Authentication → Sign In / Providers 關閉「Allow new users to sign up」。日後員工帳號一律由店主在系統設定頁建立。
7. 使用 `/login` 登入並確認商品、庫存、結帳、退貨、報表與員工權限頁均可正常開啟。

## 3. 權限原則

| 角色 | 權限 |
|---|---|
| 店主 owner | 全部功能、帳號與設定 |
| 店長 manager | 商品、庫存、進銷退與報表 |
| 收銀員 cashier | 客戶、銷售與退貨 |
| 庫存人員 stock_clerk | 商品、供應商、進貨與盤點 |

所有資料表都啟用 Row Level Security。前端畫面隱藏按鈕只改善使用體驗；真正的安全限制由資料庫執行。

## 4. 舊資料遷移

舊版資料存於瀏覽器 `fashion_erp_state_v1`。先在舊版按「備份全部資料」，保留 JSON 檔。不要直接把整份 JSON 寫進正式資料庫；需要依序轉換為分類、商品、商品規格、進貨、銷售、退貨與庫存異動。

遷移前後必須核對：

- 商品款式數、規格數與條碼是否唯一
- 每個規格的期初庫存
- 銷售與退貨總額
- 會員點數
- 所有負庫存與不完整交易

## 5. 內部 PWA 上線

1. 將程式碼推送到 GitHub 的新分支。
2. 在 Vercel 匯入 repository。
3. 設定 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
4. 先部署 staging 網址並以測試資料操作。
5. 網址雖然可由網際網路到達，但必須保持關閉公開註冊、員工登入、RLS 與 `noindex`；如需限制只能從門市裝置進入，另加 Cloudflare Access、VPN 或裝置存取層。
6. 確認 HTTPS 後，以實際手機測試相機條碼掃描並加入主畫面。
7. 完成備份還原演練與門市人員測試後才切換正式營運；備份流程請見 [BACKUP.zh-TW.md](BACKUP.zh-TW.md)。

## 6. 上線前驗收

- 兩名收銀員同時結帳不會覆蓋資料
- 同一商品庫存不足時，第二筆交易會被資料庫拒絕
- 收銀員不能修改進貨成本或查看權限設定
- 退貨必須連結原銷售單且不會重複退款
- 手機、平板、桌機均能完成主要流程
- 條碼掃描、標籤及收據印表機均以實際設備驗證
- 每日備份與還原流程已實際演練
