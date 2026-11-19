import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTcmbRateService } from './tcmbRateService.js';
const xml = '<Tarih_Date><Currency CurrencyCode="USD"><Unit>1</Unit><BanknoteSelling>42.50</BanknoteSelling></Currency><Currency CurrencyCode="EUR"><Unit>1</Unit><BanknoteSelling>46.20</BanknoteSelling></Currency></Tarih_Date>';
test('Monday skips weekend; concurrent USD/EUR share XML and repeat reads use cache', async () => {
  const calls=[];
  const service=createTcmbRateService({fetchImpl:async url=>{calls.push(url);return new Response(xml);}});
  const [usd,eur]=await Promise.all([service.get('USD','2026-11-16'),service.get('EUR','2026-11-16'),service.get('USD','2026-11-16')]);
  assert.equal(usd.date,'2026-11-13'); assert.equal(usd.rate,42.5); assert.equal(eur.rate,46.2); assert.equal(calls.length,1);
  await service.get('EUR','2026-11-16'); assert.equal(calls.length,1);
});
test('404 holiday falls back, but temporary errors never silently select an older rate',async()=>{
  let count=0;
  const service=createTcmbRateService({fetchImpl:async()=>++count===1?new Response('',{status:404}):new Response(xml)});
  assert.equal((await service.get('USD','2026-11-13')).date,'2026-11-11');
  await service.get('EUR','2026-11-13');assert.equal(count,2);
  let failures=0;
  const broken=createTcmbRateService({fetchImpl:async()=>{failures++;return new Response('',{status:503});}});
  await assert.rejects(broken.get('USD','2026-11-13'));assert.equal(failures,1);
});
test('successful publications survive restart; corrupt XML and invalid dates are rejected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tcmb-test-'));
  try{
    const file=join(dir,'rates.json');
    const first=createTcmbRateService({cacheFile:file,fetchImpl:async()=>new Response(xml)});
    await first.get('USD','2026-11-16');await first.flush();
    const second=createTcmbRateService({cacheFile:file,fetchImpl:async()=>{throw Error('Network must not be used');}});
    assert.equal((await second.get('EUR','2026-11-16')).rate,46.2);
    const bad=createTcmbRateService({fetchImpl:async()=>new Response('<invalid/>')});
    await assert.rejects(bad.get('USD','2026-11-16'));
    await assert.rejects(bad.get('USD','2026-02-30'));
    assert.equal((await bad.get('TRY','2026-11-16')).rate,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('failed requests are evicted so retry succeeds',async()=>{
 let count=0;const service=createTcmbRateService({fetchImpl:async()=>{if(++count===1)throw Error('offline');return new Response(xml);}});
 await assert.rejects(service.get('USD','2026-11-16'));assert.equal((await service.get('USD','2026-11-16')).rate,42.5);
});
