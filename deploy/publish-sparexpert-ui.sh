#!/usr/bin/env bash
set -euo pipefail
stage=${1:?private staging directory required}
expected=${2:?SHA256 required}
root=/var/www/daily-app
cfg=$(readlink -f /etc/nginx/sites-enabled/arix)
archive="$stage/spare-investor-ui.tgz"
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
mkdir "$stage/build"
tar -xzf "$archive" -C "$stage/build"
cp -p "$root/index.html" "$stage/root.before"
cp -p "$root/sparexpert/index.html" "$stage/spare.before"
cp -p "$cfg" "$stage/nginx.before"
python3 - "$root" "$stage" "$cfg" <<'PY'
import hashlib, re, sys
from pathlib import Path
r, s, cfg = map(Path, sys.argv[1:])
home = (s/'root.before').read_text()
old = (s/'spare.before').read_text()
new = (s/'build/index.html').read_text()
entry = re.search(r'/assets/company-entry-[a-f0-9]+\.js', home).group()
bridge = (r/entry.lstrip('/')).read_text()
for pattern in (r'src="(/assets/index-[\w-]+\.js)"', r'href="(/assets/index-[\w-]+\.css)"'):
    a, b = (re.search(pattern, doc).group(1) for doc in (old, new))
    assert bridge.count(a) == 1
    bridge = bridge.replace(a,b)
    old = old.replace(a,b)
entry_next = 'company-entry-'+hashlib.sha256(bridge.encode()).hexdigest()[:16]+'.js'
(s/entry_next).write_text(bridge)
(s/'entry-name').write_text(entry_next)
(s/'root.next').write_text(home.replace(entry, '/assets/'+entry_next))
(s/'spare.next').write_text(old)
chunk, = (s/'build/assets').glob('DailyWorkspace-*.js')
nginx = cfg.read_text()
anchor = '    location = /_spare_ui_auth {'
assert nginx.count(anchor) == 1 and '127.0.0.1:18787/authorize' in nginx
assert f'/assets/{chunk.name}' not in nginx and not (r/'assets'/chunk.name).exists()
block = f'''
    location = /assets/{chunk.name} {{
        auth_request /_spare_ui_auth;
        try_files $uri =404;
        add_header Cache-Control "private, no-store" always;
    }}
'''
(s/'nginx.next').write_text(nginx.replace(anchor,block+'\n'+anchor))
(s/'chunk-name').write_text(chunk.name)
PY
chunk=$(cat "$stage/chunk-name")
entry=$(cat "$stage/entry-name")
replace() { install -m 0644 "$1" "$2.next"; mv -f "$2.next" "$2"; }
rollback() {
  replace "$stage/root.before" "$root/index.html"
  replace "$stage/spare.before" "$root/sparexpert/index.html"
  if test -f "$root/assets/$chunk"; then mv "$root/assets/$chunk" "$stage/rollback-workspace.js"; fi
  cp -p "$stage/nginx.before" "$cfg"
  nginx -t && systemctl reload nginx
}
trap rollback EXIT
cat "$stage/nginx.next" > "$cfg"
nginx -t
systemctl reload nginx
base=http://127.0.0.1:5176
status() { curl -s -o /dev/null -w '%{http_code}' -H 'Host: daily.arix.az' "$base$1"; }
for i in $(seq 1 15); do
  denied=$(status "/assets/$chunk")
  if test "$denied" = 401; then break; fi
  sleep 1
done
test "$denied" = 401
for src in "$stage"/build/assets/* "$stage/$entry"; do
  dst="$root/assets/${src##*/}"
  if test -e "$dst"; then cmp -s "$src" "$dst"; else install -m 0644 "$src" "$dst"; fi
done
replace "$stage/spare.next" "$root/sparexpert/index.html"
replace "$stage/root.next" "$root/index.html"
test "$(status "/assets/$chunk")" = 401
test "$(status /sparexpert/)" = 200
curl -fsS -H 'Host: daily.arix.az' "$base/" | grep -F "$entry"
systemctl is-active arix-api arix-sparexpert-ui-auth
trap - EXIT
printf 'SpareXpert release active. Rollback files: %s\n' "$stage"
