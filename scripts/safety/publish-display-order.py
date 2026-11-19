import pathlib,json,hashlib,re,subprocess,shutil,sys,time
s=pathlib.Path(sys.argv[1]);root=pathlib.Path('/var/www/daily-app');assets=root/'assets'
manifest=json.loads((s/'manifest.json').read_text());cfg=pathlib.Path('/etc/nginx/sites-enabled/arix').resolve();old_cfg=cfg.read_text();new_cfg=old_cfg
for item in manifest:
 for key in ['chunk','loader']:
  assert hashlib.sha256((assets/item[key]).read_bytes()).hexdigest()==item[key+'Hash']
 pattern=r'    location = /assets/'+re.escape(item['chunk'])+r' \{[^}]+\}'
 matches=re.findall(pattern,new_cfg);assert len(matches)==1
 new_cfg=new_cfg.replace(matches[0],matches[0]+'\n'+matches[0].replace(item['chunk'],item['chunkNext']))
htmls=[root/'index.html',root/'sparexpert/index.html']
entry=re.search(r'/assets/company-entry-[a-f0-9]+\.js',htmls[0].read_text()).group()
bridge=(root/entry.lstrip('/')).read_text()
for item in manifest:
 old_loader=item.get('previousLoader',item['loader'])
 assert old_loader in bridge
 bridge=bridge.replace(old_loader,item['loaderNext'])
bridge_name='company-entry-'+hashlib.sha256(bridge.encode()).hexdigest()[:16]+'.js'
originals={str(p):p.read_text() for p in htmls};(s/'html-backup.json').write_text(json.dumps(originals));(s/'nginx.before').write_text(old_cfg)
def replace(p,text):
 temp=p.with_name(p.name+'.next');temp.write_text(text);temp.chmod(0o644);temp.replace(p)
try:
 replace(cfg,new_cfg);subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
 for item in manifest:
  for attempt in range(30):
   code=subprocess.check_output(['curl','-s','-o','/dev/null','-w','%{http_code}','-H','Host: daily.arix.az','http://127.0.0.1:5176/assets/'+item['chunkNext']],text=True)
   if code=='401':break
   time.sleep(.2)
  else:raise RuntimeError('Protected route did not activate')
 for item in manifest:
  for key in ['chunkNext','loaderNext']:shutil.copy2(s/item[key],assets/item[key])
  for extra in item.get('extras',[]):shutil.copy2(s/extra,assets/extra)
 (assets/bridge_name).write_text(bridge)
 for p in htmls:
  text=originals[str(p)].replace(entry,'/assets/'+bridge_name)
  for item in manifest:text=text.replace(item.get('previousLoader',item['loader']),item['loaderNext'])
  replace(p,text)
 for item in manifest:
  code=subprocess.check_output(['curl','-s','-o','/dev/null','-w','%{http_code}','-H','Host: daily.arix.az','http://127.0.0.1:5176/assets/'+item['chunkNext']],text=True)
  assert code=='401',code
 print('Both company display orders published; protected chunks return 401; rollback:',s)
except Exception:
 for item in manifest:
  if (assets/item['chunkNext']).exists():shutil.move(str(assets/item['chunkNext']),str(s/(item['chunkNext']+'.withdrawn')))
 for p,text in originals.items():replace(pathlib.Path(p),text)
 replace(cfg,old_cfg);subprocess.run(['systemctl','reload','nginx'],check=False);raise
