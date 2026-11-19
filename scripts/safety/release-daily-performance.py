import hashlib,json,pathlib,re,shutil,sqlite3,subprocess,sys,time
stage=pathlib.Path(sys.argv[1]).resolve()
assert str(stage).startswith('/root/daily-performance.')
assert (stage/'test-results.json').exists(), 'Isolated API tests must pass first'
server=pathlib.Path('/opt/arix/server');web=pathlib.Path('/var/www/daily-app')
baseline=json.loads((stage/'baseline.json').read_text())
for name,digest in baseline.items():
    assert hashlib.sha256((server/name).read_bytes()).hexdigest()==digest, 'Production changed: '+name
backup=stage/('backup-'+str(int(time.time())));backup.mkdir()
files=['index.js','database.js','dailyNotifications.js','dailyPushOutbox.js','dailySnapshotResponse.js','mutationScheduler.js','dailyImages.js']
for name in files:
    if (server/name).exists():shutil.copy2(server/name,backup/name)
for name in ['daily.sqlite','sparexpert.sqlite']:
    source=sqlite3.connect('file:'+str(server/'data/daily'/name)+'?mode=ro',uri=True)
    dest=sqlite3.connect(backup/name);source.backup(dest);dest.close();source.close()
htmls=[p for p in [web/'index.html',web/'sparexpert/index.html',web/'azart/index.html'] if p.exists()]
transport=('(() => {\n'+(stage/'daily-transport.js').read_text().replace('export function installDailyTransport','function installDailyTransport')+'\ninstallDailyTransport();\n})();\n').encode()
transport_name='daily-transport-'+hashlib.sha256(transport).hexdigest()[:16]+'.js'
html_backups=[]
for i,path in enumerate(htmls):
    old=path.read_text();(backup/f'html-{i}').write_text(old);html_backups.append((path,old))
    old=re.sub(r'<script src="/assets/daily-transport-[a-f0-9]+\.js"></script>\s*','',old)
    # A blocking, small bootstrap installs before either module without changing
    # existing company-entry or workspace asset references used by later releases.
    match=re.search(r'<script type="module"(?: crossorigin)? src="([^"]+)"[^>]*></script>',old)
    assert match, str(path)
    (stage/f'html-next-{i}').write_text(old[:match.start()]+f'<script src="/assets/{transport_name}"></script>\n    '+old[match.start():])
(web/'assets'/transport_name).write_bytes(transport)
def replace(path,data):
    temporary=path.with_name(path.name+'.performance-next');temporary.write_bytes(data);temporary.chmod(0o644);temporary.replace(path)
try:
    for name in files:replace(server/name,(stage/name).read_bytes())
    subprocess.run(['node','--check',str(server/'index.js')],check=True)
    subprocess.run(['systemctl','restart','arix-api'],check=True)
    for attempt in range(60):
        result=subprocess.run(['curl','-fsS','--max-time','2','http://127.0.0.1:8787/api/health'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if result.returncode==0:break
        time.sleep(.5)
    else:raise RuntimeError('API did not become healthy within startup window')
    for i,(path,old) in enumerate(html_backups):replace(path,(stage/f'html-next-{i}').read_bytes())
    print('Released Daily performance update. Backup:',backup)
except Exception:
    for name in files:
        if (backup/name).exists():replace(server/name,(backup/name).read_bytes())
    for path,old in html_backups:replace(path,old.encode())
    subprocess.run(['systemctl','restart','arix-api'],check=False)
    raise
