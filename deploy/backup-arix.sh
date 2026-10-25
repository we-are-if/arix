#!/usr/bin/env bash
set -euo pipefail

backup_root="/srv/arix/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/$timestamp"

install -d -m 750 -o arix -g arix "$target"
node --input-type=module -e \
  "import { DatabaseSync, backup } from 'node:sqlite'; const db = new DatabaseSync('/opt/arix/server/data/arix.sqlite'); await backup(db, '$target/arix.sqlite'); db.close();"
tar -czf "$target/runtime-files.tgz" \
  --exclude='arix.sqlite' \
  --exclude='arix.sqlite-shm' \
  --exclude='arix.sqlite-wal' \
  -C /opt/arix/server/data .
chown -R arix:arix "$target"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime +13 -exec rm -rf -- {} +
