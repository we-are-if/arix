#!/usr/bin/env bash
set -euo pipefail

backup_root="/srv/arix/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/$timestamp"

install -d -m 750 -o arix -g arix "$target"

backup_sqlite() {
  local source_path="$1"
  local target_path="$2"
  if [[ ! -f "$source_path" ]]; then
    return 0
  fi
  node --input-type=module -e \
    "import { DatabaseSync, backup } from 'node:sqlite'; const db = new DatabaseSync('$source_path'); await backup(db, '$target_path'); db.close();"
}

backup_sqlite "/opt/arix/server/data/arix.sqlite" "$target/arix.sqlite"
backup_sqlite "/opt/arix/server/data/daily/daily.sqlite" "$target/daily.sqlite"

tar -czf "$target/runtime-files.tgz" \
  --exclude='arix.sqlite' \
  --exclude='arix.sqlite-shm' \
  --exclude='arix.sqlite-wal' \
  --exclude='daily/daily.sqlite' \
  --exclude='daily/daily.sqlite-shm' \
  --exclude='daily/daily.sqlite-wal' \
  -C /opt/arix/server/data .
(
  cd "$target"
  find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
chown -R arix:arix "$target"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf -- {} +
