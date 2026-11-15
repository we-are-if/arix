import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAssistantRead } from './assistantTools.js';
import { answerAssistantAsync } from './chatAssistant.js';
const db={products:[{code:'ERSA 011',name:'İnci',unit:'mt',warehouses:{depo:12}},{code:'ERSA 012',name:'Gri',unit:'adet',warehouses:{depo:3}},{name:'Eski',active:false}],orderBoard:[]};
test('catalog read separates active records, stocked types and units',()=>{
 const r=executeAssistantRead(db,{action:'catalog_summary'},{products:true});
 assert.equal(r.activeProductTypes,2);assert.equal(r.inactiveProductTypes,1);assert.equal(r.stockedProductTypes,2);
 assert.deepEqual(r.stockTotalsByUnit,{mt:12,adet:3});
});
test('every read denies absent or false permissions and unknown actions',()=>{
 for(const action of ['catalog_summary','product_lookup','order_lookup','customer_lookup','operations_summary']) {
  assert.equal(executeAssistantRead(db,{action},{}).error,'permission_denied');
 }
 assert.equal(executeAssistantRead(db,{action:'delete_products'},{products:true}).error,'unsupported_operation');
});
test('a nonexistent product is not replaced by another ERSA product',()=>{
 assert.deepEqual(executeAssistantRead(db,{action:'product_lookup',query:'ERSA 999'},{products:true}).products,[]);
});
test('AI selects the read, then receives only its authorized result',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async (_url,opts)=>{
  calls++;
  const body=JSON.parse(opts.body);
  if(calls===1)return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'catalog_summary',query:'',reply:''})}})};
  assert.match(body.messages[0].content,/"activeProductTypes":2/);
  return {ok:true,json:async()=>({message:{content:'Katalogda 2 aktif ürün çeşidi var.'}})};
 });
 const r=await answerAssistantAsync(db,{},'Kaç çeşit malımız var?',{products:true});
 assert.match(r.text,/2 aktif/);assert.equal(calls,2);
});
test('model cannot override denied access',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'catalog_summary',query:'',reply:''})}})}});
 assert.match((await answerAssistantAsync(db,{},'Tüm ürünleri göster',{})).text,/yetkiniz/);
 assert.equal(calls,1);
});
