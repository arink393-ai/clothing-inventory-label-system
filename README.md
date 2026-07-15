# 幸せ服飾・智慧進銷存

服飾門市使用的響應式雲端 ERP 第一版。介面以繁體中文設計，支援桌機後台、平板收銀與手機盤點。

## 第一版範圍

- 安全帳號與四種角色：店主、店長、收銀員、庫存人員
- 商品、款式、顏色、尺寸、SKU 與條碼
- 不可任意覆寫的庫存異動帳
- 進貨、銷售、退貨與盤點
- 每日營收、毛利、退貨與庫存報表
- PostgreSQL Row Level Security，隔離不同門市資料
- 銷售與扣庫存使用同一個資料庫交易

舊版單檔原型保留於 `legacy/index.html`，只作為功能與資料遷移參考，不應直接用於正式營運。

## 本機啟動

```bash
npm install
cp .env.example .env.local
npm run dev
```

尚未設定 Supabase 時，畫面會使用示範資料，方便先確認響應式設計。

完整設定步驟請閱讀 [docs/SETUP.zh-TW.md](docs/SETUP.zh-TW.md)。

## 備份

執行 `npm run backup` 可備份公開營運資料與商品照片；每週備份及每月還原演練流程請閱讀 [docs/BACKUP.zh-TW.md](docs/BACKUP.zh-TW.md)。
