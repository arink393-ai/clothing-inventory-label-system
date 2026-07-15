# 備份與還原作業

此備份是 Supabase 平台自動備份以外的第二層保護，包含 `public` schema 的結構、營運資料與 `product-images` 商品照片。

## 每週人工備份

先確認此專案已執行 `npx supabase login` 與 `npx supabase link`，再於專案根目錄執行：

```bash
npm run backup
```

備份會建立在 `backups/日期-時間/`。完成後執行畫面提供的檢查命令，並把整個資料夾複製到另一顆硬碟或受保護的雲端空間。`backups/` 已排除於 Git，不會被推送到 GitHub。

資料庫連線若要求密碼，請輸入 Supabase 專案的 Database password；不要把密碼寫入檔案或傳給其他人。

## 驗證備份

```bash
npm run backup:verify -- backups/20260715-180000
```

驗證會檢查必要檔案以及所有檔案的 SHA-256 校驗碼。校驗通過只代表檔案沒有損壞，仍不能取代還原演練。

## 每月還原演練

1. 另外建立一個只用於演練的 Supabase 專案，絕對不要在正式專案測試還原。
2. 先執行 `schema.sql`，再匯入 `data.sql`。
3. 把 `storage/product-images/` 內容上傳至測試專案同名 bucket。
4. 核對商品規格數、總庫存、銷售單數、退貨金額、會員點數與照片數量。
5. 用測試帳號完成登入、結帳及退貨後，記錄演練日期與結果。

## 注意事項

- Supabase 平台資料庫備份不包含 Storage 裡實際的商品照片，因此照片必須分開下載。
- 本工具備份門市營運資料，不等同完整複製 Supabase Auth 帳號與所有平台設定。
- 正式災難復原時，優先使用 Supabase Dashboard 的平台備份；人工備份用於交叉核對或平台備份無法涵蓋的照片。
- 若任何一步失敗，該次資料夾不可標記為成功備份，應修正後重新執行。
