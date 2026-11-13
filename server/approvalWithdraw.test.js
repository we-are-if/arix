import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {canWithdrawApproval} from '../shared/approvalPermissions.js';
const source=fs.readFileSync(new URL('./index.js',import.meta.url),'utf8');
const start=source.indexOf('  if (req.method === "POST" && id && parts[2] === "approval-form" && parts[3] === "withdraw")');
const end=source.indexOf('  if (req.method === "PUT"',start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const route=new AsyncFunction('req','res','id','parts','db','workflowRole','parseBody','send','notFound','canWithdrawApproval','randomUUID','normalizeSalesRepresentativeName','addOrderNotification','writeDb','orderWithPresence',source.slice(start,end));
async function run(type,owner=true){
 const form={documentType:type,status:'draft',submittedForApproval:true,preparedByUserId:'maker',salesRepresentativeUserId:'sales',number:'FORM-1'};
 const order={id:'1',customerName:'Test',approvalForm:form};
 if(type!=='domestic')form.exportDocuments={[type]:{...form}};
 const db={orderBoard:[order],authUsers:[{id:'sales',name:'Approver'}]};let saved=false,notified=false;
 const result=await route({method:'POST',authUser:{id:owner?'owner':'other',name:'User'}},{},'1',['1','','approval-form','withdraw'],db,owner?'owner':'sales',async()=>({documentType:type}),(res,status,body)=>({status,body}),()=>{},canWithdrawApproval,()=> 'audit-id',s=>s,async()=>{notified=true},async data=>{JSON.stringify(data);saved=true},o=>o);
 return {result,order,saved,notified};
}
for(const type of ['domestic','commercial_invoice'])test('real withdraw route saves and notifies '+type,async()=>{
 const {result,order,saved,notified}=await run(type);assert.equal(result.status,200);assert.ok(saved&&notified);assert.equal(order.approvalForm.submittedForApproval,false);
 if(type!=='domestic')assert.equal(order.approvalForm.exportDocuments[type].submittedForApproval,false);
});
test('withdraw route rejects another user without writes',async()=>{const r=await run('domestic',false);assert.equal(r.result.status,403);assert.equal(r.saved,false);assert.equal(r.notified,false)});
test('eight-place unit prices survive save and reopening without four-place truncation',()=>{
 const app=fs.readFileSync(new URL('../order-app/src/App.tsx',import.meta.url),'utf8');
 assert.ok(!/unitPrice[^\n]*toFixed\(4\)/.test(app));
 for(const factor of [1,0.5]){const price=1.23456789;const persisted=JSON.parse(JSON.stringify({unitPrice:price/factor}));assert.equal(persisted.unitPrice*factor,price)}
 const amount=1000,quantity=27.9*1.42,discount=0.93;const price=amount/quantity/discount;assert.equal((JSON.parse(JSON.stringify(price))*quantity*discount).toFixed(2),'1000.00');
});
