"""Exercise a private, loopback-only server using isolated database copies."""
import concurrent.futures, datetime, hashlib, json, os, pathlib, shutil, sqlite3, subprocess, sys, time, urllib.request, urllib.error, uuid

stage = pathlib.Path(sys.argv[1]).resolve()
assert str(stage).startswith('/root/daily-performance.')
app = stage/'test-app'; server = app/'server'
server.mkdir(parents=True)
for src in pathlib.Path('/opt/arix/server').glob('*.js'): shutil.copy2(src, server/src.name)
for src in pathlib.Path('/opt/arix/server').iterdir():
    if src.is_dir() and src.name not in ['data','node_modules','backups']:
        shutil.copytree(src,server/src.name)
shutil.copytree('/opt/arix/shared', app/'shared')
shutil.copy2('/opt/arix/package.json', app/'package.json')
(app/'node_modules').symlink_to('/opt/arix/node_modules')
for name in ['index.js','database.js','dailyNotifications.js','dailyPushOutbox.js','dailySnapshotResponse.js','mutationScheduler.js','dailyImages.js']:
    shutil.copy2(stage/name, server/name)
index = server/'index.js'
index.write_text(index.read_text().replace('server.listen(PORT, () => {', 'server.listen(PORT, "127.0.0.1", () => {'))
tokens = {}; entries = {}
for company, file in [('azartmembran','daily.sqlite'),('sparexpert','sparexpert.sqlite')]:
    path = server/'data/daily'/file; path.parent.mkdir(parents=True,exist_ok=True)
    source = sqlite3.connect('file:/opt/arix/server/data/daily/'+file+'?mode=ro',uri=True)
    dest = sqlite3.connect(path); source.backup(dest); source.close()
    state = json.loads(dest.execute('select data from app_state where id=1').fetchone()[0])
    token = uuid.uuid4().hex; tokens[company] = token
    state['authUsers'] = [{'id':'performance-test','name':'Isolated test','email':company+'@example.invalid','role':'Sahib','active':True,'companyId':company}]
    state['authSessions'] = [{'id':uuid.uuid4().hex,'userId':'performance-test','userEmail':company+'@example.invalid','companyId':company,'activeCompanyId':company,'tokenHash':hashlib.sha256(token.encode()).hexdigest(),'expiresAt':'2099-01-01T00:00:00Z'}]
    state['pushSubscriptions']=[]; state['notifications']=[]; state['entryChangeRequests']=[]
    state['snapshot']['state']['closes']=[]
    state['snapshot'].setdefault('rules',{}).update(requireEntryEditApproval=True,requireEntryDeleteApproval=True)
    entry = next(e.copy() for e in state['snapshot']['state']['entries'] if e.get('kind')=='income' and not e.get('invoiceId'))
    entry.update(id='performance-'+company,date=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=4))).strftime('%Y-%m-%d'),amount=0.01,note='Isolated performance test')
    for key in ['invoiceId','invoiceNo','linkedInvoiceId']: entry.pop(key,None)
    entries[company]=entry
    dest.execute('update app_state set data=? where id=1',(json.dumps(state),));dest.commit();dest.close()

def call(company, method='GET', path='/api/daily', body=None, etag=None):
    headers={'Cookie':'arix_daily_session='+tokens[company],'Content-Type':'application/json'}
    if etag: headers['If-None-Match']=etag
    req=urllib.request.Request('http://127.0.0.1:18789'+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
    start=time.perf_counter()
    try: response=urllib.request.urlopen(req,timeout=30)
    except urllib.error.HTTPError as error: response=error
    raw=response.read()
    return response.status,raw,response.headers,round((time.perf_counter()-start)*1000,1)

env={**os.environ,'API_PORT':'18789','ARIX_VAPID_PUBLIC_KEY':'','ARIX_VAPID_PRIVATE_KEY':'','ARIX_ORDER_ARCHIVE_ROOT':str(app/'empty-archive')}
log=open(stage/'test-server.log','w')
proc=subprocess.Popen(['node','server/index.js'],cwd=app,env=env,stdout=log,stderr=log)
try:
    for _ in range(100):
        if proc.poll() is not None: raise RuntimeError('Test server exited; inspect test-server.log')
        try:
            urllib.request.urlopen('http://127.0.0.1:18789/api/health',timeout=1).read();break
        except Exception:time.sleep(.2)
    metrics={}
    for company in tokens:
        status,raw,headers,ms=call(company);assert status==200,(company,status)
        etag=headers['ETag'];metrics[company]={'initial_ms':ms,'bytes':len(raw)}
        snapshot=json.loads(raw)['data']
        images=[i for i in snapshot.get('invoices',[]) if str(i.get('screenshotDataUrl','')).startswith('/api/daily/image/')]
        if images:
            image=images[0];url=image['screenshotDataUrl']
            status,image_bytes,_,ms=call(company,path=url);assert status==200 and image_bytes
            other='sparexpert' if company=='azartmembran' else 'azartmembran'
            assert call(other,path=url)[0]==404
            # A complete unchanged snapshot with lazy image references must restore
            # the original embedded bytes before lifecycle/audit comparisons.
            status,body,_,_=call(company,'PUT','/api/daily',{'snapshot':snapshot,'baseRevision':json.loads(raw)['revision']})
            assert status==200,(status,body[:200])
            source=sqlite3.connect('file:'+str(server/'data/daily'/('daily.sqlite' if company=='azartmembran' else 'sparexpert.sqlite'))+'?mode=ro',uri=True)
            persisted=json.loads(source.execute('select data from app_state where id=1').fetchone()[0]);source.close()
            original=next(i for i in persisted['snapshot']['invoices'] if i['id']==image['id'])
            assert original['screenshotDataUrl'].startswith('data:image/')
            # PUT can increment revision; obtain the current validator.
            status,raw,headers,_=call(company);etag=headers['ETag']
        status,raw,_,ms=call(company,etag=etag);assert status==304 and not raw
        metrics[company]['unchanged_ms']=ms
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda c:(c,call(c,'POST','/api/daily/entries',{'entry':entries[c]})),tokens))
    for company,(status,raw,_,ms) in results:
        assert status in (200,201),(company,status,raw[:300]);metrics[company]['create_ms']=ms
        status,raw,_,_=call(company,'POST','/api/daily/entries',{'entry':entries[company]});assert status in (200,201)
        status,raw,_,_=call(company);data=json.loads(raw)['data']['state']['entries']
        assert sum(e['id']==entries[company]['id'] for e in data)==1
        assert not any(e['id']==entries[c]['id'] for c in tokens if c!=company for e in data)
        for action in ['update','delete']:
            proposed={**entries[company],'amount':0.02}
            body={'action':action,'entryId':entries[company]['id'],'proposedEntry':proposed,'reason':'Isolated test'}
            status,raw,_,_=call(company,'POST','/api/daily/entry-change-requests',body)
            assert status in (200,201),(company,action,status,raw[:300])
            request=json.loads(raw)['data']
            status,raw,_,ms=call(company,'PATCH','/api/daily/entry-change-requests/'+request['id'],{'action':'approve'})
            assert status==200,(company,action,status,raw[:300])
            metrics[company][action+'_approve_ms']=ms
        status,raw,_,_=call(company);assert not any(e['id']==entries[company]['id'] for e in json.loads(raw)['data']['state']['entries'])
    # Current company/user authorization must run even when another company's ETag is supplied.
    az=call('azartmembran');sp=call('sparexpert',etag=az[2]['ETag']);assert sp[0]==200
    print(json.dumps({'isolated_api_tests':'passed','metrics':metrics}))
    (stage/'test-results.json').write_text(json.dumps(metrics,indent=2))
finally:
    proc.terminate()
    try:proc.wait(timeout=20)
    except subprocess.TimeoutExpired:proc.kill();proc.wait()
    log.close()
