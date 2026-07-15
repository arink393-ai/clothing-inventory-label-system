#!/bin/zsh
set -euo pipefail

export TZ=Asia/Taipei
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_root="${1:-backups}"
destination="${backup_root%/}/${timestamp}"

mkdir -p "$destination/storage"

echo "建立資料庫結構備份…"
npx supabase db dump --linked --schema public --file "$destination/schema.sql"

echo "建立營運資料備份…"
npx supabase db dump --linked --schema public --data-only --use-copy --file "$destination/data.sql"

echo "下載商品照片…"
npx supabase storage cp --experimental --linked --recursive ss:///product-images "$destination/storage"

echo "產生完整性校驗碼…"
(
  cd "$destination"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
)

echo "備份完成：$destination"
echo "請將整個資料夾複製到另一顆硬碟或受保護的雲端空間。"
