#!/usr/bin/env bash
set -euo pipefail

current="/var/www/daily-app"

if [[ $# -eq 0 ]]; then
  find /var/www -maxdepth 1 -type d -name 'daily-app.prev-*' -printf '%f\n' | sort -r | head -20
  exit 0
fi

backup_name="$1"
if [[ ! "$backup_name" =~ ^daily-app\.prev-[0-9]{8}-[0-9]{6}$ ]]; then
  echo "Invalid backup name: $backup_name" >&2
  exit 2
fi

source_dir="/var/www/$backup_name"
if [[ ! -d "$source_dir" || ! -f "$source_dir/index.html" ]]; then
  echo "Backup is missing or invalid: $source_dir" >&2
  exit 3
fi

stamp="$(date +%Y%m%d-%H%M%S)"
next="/var/www/daily-app.rollback-next-${stamp}"
safety_backup="/var/www/daily-app.before-rollback-${stamp}"
activated=0

rollback_failed_restore() {
  if [[ "$activated" -eq 1 && -d "$safety_backup" ]]; then
    rm -rf "$current"
    mv "$safety_backup" "$current"
    nginx -t >/dev/null
    systemctl reload nginx
  fi
  rm -rf "$next"
}
trap rollback_failed_restore ERR

cp -a "$source_dir" "$next"
if [[ -e "$current" ]]; then
  mv "$current" "$safety_backup"
fi
mv "$next" "$current"
activated=1

nginx -t
systemctl reload nginx
curl -fsS -H 'Host: daily.arix.az' http://127.0.0.1/ >/dev/null

trap - ERR
printf 'RESTORED_FROM=%s\n' "$source_dir"
printf 'PREVIOUS_LIVE_SAVED_AS=%s\n' "$safety_backup"
