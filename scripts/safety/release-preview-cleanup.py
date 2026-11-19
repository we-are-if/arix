import pathlib,subprocess,sqlite3,json,hashlib,shutil,time,sys
stage=pathlib.Path(sys.argv[1]).resolve()
assert str(stage).startswith('/root/preview-cleanup.')
server=pathlib.Path('/opt/arix/server')
files=['index.js','database.js','dailyImages.js','dailyPreviewRetention.js']
for name,digest in json.loads((stage/'baseline.json').read_text()).items():
 assert hashlib.sha256((server/name).read_bytes()).hexdigest()==digest,'Production changed: '+name
def backup_db(source,target):
 a=sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True);b=sqlite3.connect(target);a.backup(b);b.close();a.close()
def migrate(path,apply=False):
 args=['node',str(stage/'migrate.mjs'),str(path)]
 if apply:args.append('--apply')
 return json.loads(subprocess.check_output(args,text=True))
live=server/'data/daily/daily.sqlite'
backup_db(live,stage/'test.sqlite')
dry=migrate(stage/'test.sqlite');test=migrate(stage/'test.sqlite',True)
assert dry['nonPreviewFingerprint']==test['nonPreviewFingerprint']
(stage/'test-report.json').write_text(json.dumps(test))
print('Isolated copy verified:',json.dumps(test),flush=True)
backup=stage/'backup';backup.mkdir()
for name in files:
 if (server/name).exists():shutil.copy2(server/name,backup/name)
subprocess.run(['systemctl','stop','arix-api'],check=True)
try:
 backup_db(live,backup/'daily.sqlite')
 for name in files:shutil.copy2(stage/name,server/name)
 subprocess.run(['node','--check',str(server/'index.js')],check=True)
 report=migrate(live,True)
 (stage/'live-report.json').write_text(json.dumps(report,indent=2))
 # Retire the derived image cache reversibly. Originals are in the private backup.
 for suffix in ['', '-wal','-shm']:
  image=server/'data/daily'/('azartmembran.attachments.sqlite'+suffix)
  if image.exists():shutil.move(str(image),str(backup/image.name))
 subprocess.run(['systemctl','start','arix-api'],check=True)
 for attempt in range(60):
  result=subprocess.run(['curl','-fsS','http://127.0.0.1:8787/api/health'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  if result.returncode==0:break
  time.sleep(.5)
 else:raise RuntimeError('API health failed')
 print('Released. Financial invariants verified:',json.dumps(report),flush=True)
except Exception:
 subprocess.run(['systemctl','stop','arix-api'],check=False)
 for name in files:
  if (backup/name).exists():shutil.copy2(backup/name,server/name)
 # No new traffic is accepted before health succeeds; restore via SQLite backup.
 if (backup/'daily.sqlite').exists():
  a=sqlite3.connect(backup/'daily.sqlite');b=sqlite3.connect(live);a.backup(b);b.close();a.close()
 for image in backup.glob('azartmembran.attachments.sqlite*'):shutil.move(str(image),str(server/'data/daily'/image.name))
 subprocess.run(['systemctl','start','arix-api'],check=False)
 raise
