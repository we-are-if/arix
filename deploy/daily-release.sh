#!/usr/bin/env bash
set -euo pipefail

archive="${1:-/tmp/daily-app-dist.tgz}"
expected_sha256="${2:-}"
current="/var/www/daily-app"
stamp="$(date +%Y%m%d-%H%M%S)"
next="/var/www/daily-app.next-${stamp}"
backup="/var/www/daily-app.prev-${stamp}"
activated=0

if [[ ! -f "$archive" ]]; then
  echo "Release archive not found: $archive" >&2
  exit 2
fi

actual_sha256="$(sha256sum "$archive" | awk '{print $1}')"
if [[ -n "$expected_sha256" && "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Release SHA256 mismatch." >&2
  exit 3
fi

rollback() {
  if [[ "$activated" -eq 1 && -d "$backup" ]]; then
    rm -rf "$current"
    mv "$backup" "$current"
    nginx -t >/dev/null
    systemctl reload nginx
  fi
  rm -rf "$next"
}
trap rollback ERR

mkdir -p "$next"
tar -xzf "$archive" -C "$next"
test -f "$next/index.html"
test -d "$next/assets"
chown -R www-data:www-data "$next"

if [[ -e "$current" ]]; then
  mv "$current" "$backup"
fi
mv "$next" "$current"
activated=1

nginx -t
systemctl reload nginx
curl -fsS -H 'Host: daily.arix.az' http://127.0.0.1/ >/dev/null

cat > /var/www/daily-app.release.json <<EOF
{"deployedAt":"$(date -Iseconds)","stamp":"$stamp","sha256":"$actual_sha256","backup":"$backup"}
EOF

trap - ERR
printf 'DEPLOY_STAMP=%s\n' "$stamp"
printf 'RELEASE_SHA256=%s\n' "$actual_sha256"
printf 'ROLLBACK_SOURCE=%s\n' "$backup"
