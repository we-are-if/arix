#!/usr/bin/env bash
set -euo pipefail

archive="${1:-/tmp/daily-api.tgz}"
expected_sha256="${2:-}"
root="/opt/arix"
stamp="$(date +%Y%m%d-%H%M%S)"
next="/tmp/arix-daily-api-next-${stamp}"
backup="${root}/server/releases/daily-api-${stamp}"
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
  local exit_code=$?
  trap - ERR
  if [[ "$activated" -eq 1 ]]; then
    cp "$backup/index.js" "$root/server/index.js"
    if [[ -f "$backup/dailyApprovals.js" ]]; then
      cp "$backup/dailyApprovals.js" "$root/server/dailyApprovals.js"
    else
      rm -f "$root/server/dailyApprovals.js"
    fi
    if [[ -f "$backup/dailyAudit.js" ]]; then
      cp "$backup/dailyAudit.js" "$root/server/dailyAudit.js"
    else
      rm -f "$root/server/dailyAudit.js"
    fi
    if [[ -f "$backup/dailySparexpertSeed.js" ]]; then
      cp "$backup/dailySparexpertSeed.js" "$root/server/dailySparexpertSeed.js"
    else
      rm -f "$root/server/dailySparexpertSeed.js"
    fi
    if [[ -f "$backup/dailyInvoices.js" ]]; then
      cp "$backup/dailyInvoices.js" "$root/server/dailyInvoices.js"
    else
      rm -f "$root/server/dailyInvoices.js"
    fi
    chown arix:arix "$root/server/index.js"
    [[ ! -f "$root/server/dailyApprovals.js" ]] || chown arix:arix "$root/server/dailyApprovals.js"
    [[ ! -f "$root/server/dailyAudit.js" ]] || chown arix:arix "$root/server/dailyAudit.js"
    [[ ! -f "$root/server/dailySparexpertSeed.js" ]] || chown arix:arix "$root/server/dailySparexpertSeed.js"
    [[ ! -f "$root/server/dailyInvoices.js" ]] || chown arix:arix "$root/server/dailyInvoices.js"
    systemctl restart arix-api || true
  fi
  rm -rf "$next"
  exit "$exit_code"
}
trap rollback ERR

mkdir -p "$next" "$backup/data"
tar -xzf "$archive" -C "$next"
test -f "$next/index.js"
test -f "$next/dailyApprovals.js"
test -f "$next/dailyAudit.js"
test -f "$next/dailySparexpertSeed.js"
test -f "$next/dailyInvoices.js"
node --check "$next/index.js"
node --check "$next/dailyApprovals.js"
node --check "$next/dailyAudit.js"
node --check "$next/dailySparexpertSeed.js"
node --check "$next/dailyInvoices.js"

cp "$root/server/index.js" "$backup/index.js"
if [[ -f "$root/server/dailyApprovals.js" ]]; then
  cp "$root/server/dailyApprovals.js" "$backup/dailyApprovals.js"
fi
if [[ -f "$root/server/dailyAudit.js" ]]; then
  cp "$root/server/dailyAudit.js" "$backup/dailyAudit.js"
fi
if [[ -f "$root/server/dailySparexpertSeed.js" ]]; then
  cp "$root/server/dailySparexpertSeed.js" "$backup/dailySparexpertSeed.js"
fi
if [[ -f "$root/server/dailyInvoices.js" ]]; then
  cp "$root/server/dailyInvoices.js" "$backup/dailyInvoices.js"
fi

systemctl stop arix-api
if [[ -f "$root/server/data/daily/daily.sqlite" ]]; then
  cp --reflink=auto "$root/server/data/daily/daily.sqlite" "$backup/data/daily.sqlite"
fi
for sidecar in daily.sqlite-wal daily.sqlite-shm; do
  if [[ -f "$root/server/data/daily/$sidecar" ]]; then
    cp --reflink=auto "$root/server/data/daily/$sidecar" "$backup/data/$sidecar"
  fi
done

install -o arix -g arix -m 0644 "$next/index.js" "$root/server/index.js"
install -o arix -g arix -m 0644 "$next/dailyApprovals.js" "$root/server/dailyApprovals.js"
install -o arix -g arix -m 0644 "$next/dailyAudit.js" "$root/server/dailyAudit.js"
install -o arix -g arix -m 0644 "$next/dailySparexpertSeed.js" "$root/server/dailySparexpertSeed.js"
install -o arix -g arix -m 0644 "$next/dailyInvoices.js" "$root/server/dailyInvoices.js"
activated=1
systemctl start arix-api

healthy=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null \
    && curl -fsS http://127.0.0.1:8787/api/daily-auth/config >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" -ne 1 ]]; then
  echo "AriX API did not become healthy after deployment." >&2
  false
fi

rm -rf "$next"
trap - ERR
printf 'DEPLOY_STAMP=%s\n' "$stamp"
printf 'RELEASE_SHA256=%s\n' "$actual_sha256"
printf 'ROLLBACK_SOURCE=%s\n' "$backup"

