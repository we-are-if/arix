import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { SPAREXPERT_ACCOUNTS as accounts } from '../../server/dailySparexpertSeed.js';
const s = fs.readFileSync(new URL('../src/DailyWorkspace.tsx', import.meta.url), 'utf8').replaceAll('\r\n','\n');
const slice = (a,b) => {
  const start=s.indexOf(a), end=s.indexOf(b,start+a.length);
  assert(start>=0 && end>start);
  return s.slice(start,end);
};
const ctx={isSparexpert:true,SPAREXPERT_FIRST_DATE:'2026-11-01',SPAREXPERT_NOVEMBER_OPENING:{},state:{entries:[]},shiftDate:(d,n)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10),monthKey:d=>d.slice(0,7),useMemo:f=>f(),normalizeBankKey:b=>b==='Kapital Bank'?'kapital':'other'};
const code=slice('  const balanceAt =','\n  };')+'\n};\n'+slice('const emptyCardActivity =','const seedEntries =')+slice('const investorPaymentCategory =','  return (\n    <div className="investor-summary-card"')+'\nreturn summary;\n}\nglobalThis.api={balanceAt,emptyCardActivity,addSpareCardActivity,InvestorSummaryBlock};';
vm.runInNewContext(ts.transpile(code,{target:ts.ScriptTarget.ES2022}),ctx);
const {balanceAt,emptyCardActivity,addSpareCardActivity,InvestorSummaryBlock}=ctx.api;
const date='2026-11-05';
const op=(kind,amount,accountId,extra={})=>({id:'test-'+kind,date,kind,amount,accountId,...extra});
for (const a of accounts) {
  const b=accounts.find(x=>x.id!==a.id);
  ctx.state.entries=[op('income',123.45,a.id),op('expense',-23.45,a.id),op('transfer',15,a.id,{targetAccountId:b.id})];
  assert.equal(Math.round((balanceAt(a,date)-a.opening)*100),8500,a.id);
  assert.equal(Math.round((balanceAt(b,date)-b.opening)*100),1500,b.id);
  assert.equal(balanceAt(a,date,true),a.opening,a.id);
}
const cards=accounts.filter(x=>x.type==='card');
for (const a of cards) {
  const t=emptyCardActivity();
  for(const [e,side] of [[op('income',100,a.id),'source'],[op('expense',20,a.id),'source'],[op('transfer',10,a.id,{bank:'Kapital Bank',targetBank:'Kapital Bank'}),'source'],[op('transfer',5,a.id,{bank:'Kapital Bank',targetBank:'Unibank'}),'source'],[op('transfer',7,a.id,{targetBank:'Kassa'}),'source'],[op('transfer',3,a.id),'target']]) addSpareCardActivity(t,e,side);
  assert.deepEqual(JSON.parse(JSON.stringify(t)),{income:103,onlinePayment:-20,sameBankTransfer:-10,diffBankTransfer:-5,cashOut:-7});
}
const entries=[op('income',100,'a',{category:'Yatırım',counterparty:'Y. Ceyhun'}),op('expense',30,'a',{category:'Yatırımçıya ödəniş',counterparty:'Y. Ceyhun'}),op('transfer',99,'a',{category:'Yatırım',counterparty:'Y. Ceyhun'})];
const result=month=>InvestorSummaryBlock({entries,month,parties:[]}).find(x=>x.name==='Y. Ceyhun');
assert.equal(result('2026-11').closing-result('2026-11').opening,70);
assert.equal(result('2026-12').opening,result('2026-11').closing);
assert.equal(result('2026-12').movements.length,0);
console.log(accounts.length+' account fixtures, '+cards.length+' card fixtures, investor month rollover passed');
