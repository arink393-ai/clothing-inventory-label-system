#!/bin/zsh
set -euo pipefail

backup_directory="${1:-}"
if [[ -z "$backup_directory" ]]; then
  echo "用法：npm run backup:verify -- backups/日期時間"
  exit 1
fi

for required in schema.sql data.sql SHA256SUMS; do
  if [[ ! -s "$backup_directory/$required" ]]; then
    echo "備份不完整：缺少 $required 或檔案是空的"
    exit 1
  fi
done

(
  cd "$backup_directory"
  shasum -a 256 -c SHA256SUMS
)

echo "備份檔案與校驗碼均正確：$backup_directory"
