#!/usr/bin/env bash
set -euo pipefail

archive="${1:?release archive is required}"
expected_sha256="${2:-}"
stamp="$(date +%Y%m%d-%H%M%S)"
current="/var/www/order-app"
next="/var/www/order-app.next-${stamp}"
backup="/var/www/order-app.prev-${stamp}"
activated=0

actual_sha256="$(sha256sum "$archive" | awk '{print $1}')"
if [[ -n "$expected_sha256" && "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Release SHA256 mismatch." >&2
  exit 3
fi

rollback() {
  if [[ "$activated" -eq 1 && -d "$backup" ]]; then
    rm -rf "$current"
    mv "$backup" "$current"
    nginx -t >/dev/null && systemctl reload nginx || true
  fi
  rm -rf "$next"
}
trap rollback ERR

mkdir -p "$next"
tar -xzf "$archive" -C "$next"
test -f "$next/index.html"
test -d "$next/assets"
chown -R www-data:www-data "$next"

mv "$current" "$backup"
mv "$next" "$current"
activated=1
nginx -t
systemctl reload nginx
curl -fsS -H 'Host: order.arix.az' http://127.0.0.1/ >/dev/null

trap - ERR
printf 'DEPLOY_STAMP=%s\nRELEASE_SHA256=%s\nROLLBACK_SOURCE=%s\n' "$stamp" "$actual_sha256" "$backup"
