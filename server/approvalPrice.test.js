import test from 'node:test';import assert from 'node:assert/strict';import {domesticFinalMultiplier} from '../shared/approvalPrice.js';
test('1000 includes VAT and both discounts, never adds VAT on top',()=>{
 for(const vat of [0,1,10,20])for(const discount of [0,10,25])for(const lineDiscount of [0,7]){
 const quantity=27.9*1.42,multiplier=domesticFinalMultiplier(vat,false,discount);
 const price=1000/quantity/(1-lineDiscount/100)/multiplier;
 const saved=JSON.parse(JSON.stringify(price));const net=quantity*saved*(1-lineDiscount/100)*(1-discount/100);
 assert.equal((net+net*vat/100).toFixed(2),'1000.00');
 }
 assert.equal((1000/domesticFinalMultiplier(20,false,0)).toFixed(2),'833.33');
 assert.equal(domesticFinalMultiplier(20,true,0),1);
 assert.equal(domesticFinalMultiplier(20,false,100),0);
});
