#!/usr/bin/env bash
set -euo pipefail

payload="${1:?payload path is required}"
helper="${2:?migration helper path is required}"
root="/opt/arix"
database="$root/server/data/daily/daily.sqlite"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
release="$root/server/releases/daily-sheet-$stamp"
backup_path="$release/daily.sqlite"
service="arix-api"

install -d -m 750 "$release"
cp "$payload" "$release/payload.json"

restart_service() {
  systemctl start "$service" >/dev/null 2>&1 || true
}
trap restart_service EXIT

systemctl stop "$service"
node "$helper" "$database" "$payload" "$backup_path" | tee "$release/result.json"
systemctl start "$service"

healthy=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" != "1" ]]; then
  systemctl stop "$service" || true
  cp "$backup_path" "$database"
  rm -f -- "$database-wal" "$database-shm"
  systemctl start "$service"
  echo "Daily health check failed; database restored from $backup_path" >&2
  exit 1
fi

trap - EXIT
echo "DAILY_SHEET_SYNC_OK=$release"
