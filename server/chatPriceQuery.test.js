import test from 'node:test';import assert from 'node:assert/strict';
import {chatPriceAnswer,findChatCustomer,matchChatProducts,resolvePriceAnswer} from './chatPriceQuery.js';

const products=[
 {id:1,name:'Soft Touch Premium Beyaz',code:'00233',sku:'ERSA 510',unit:'mt',salePrice:5.96,warehouses:{antrepo:50,depo:18},active:true},
 {id:2,name:'Folyo Satin İnci',code:'11011',sku:'ERSA 011',unit:'mt',salePrice:4.26,warehouses:{antrepo:30,depo:0},active:true},
 {id:3,name:'Soft Touch Mat',code:'00234',sku:'ERSA 511',unit:'mt',salePrice:6.1,warehouses:{depo:4},active:true},
 {id:4,name:'Pasif Ürün',code:'00999',sku:'',unit:'mt',salePrice:1,warehouses:{},active:false},
];
const customers=[{id:10,kind:'customer',name:'ABANOZ'},{id:11,kind:'customer',name:'Global Design'},{id:12,kind:'supplier',name:'Shanghai'}];
const customerPrices=[
 {id:'r1',customerId:10,productId:1,store:'depo',price:4.8},
 {id:'r2',customerId:10,productId:3,store:'depo',price:5.5},
];
const setup=(overrides={})=>({
 products:structuredClone(products),
 counterparties:structuredClone(customers),
 customerPrices:structuredClone(customerPrices),
 stores:[{name:'antrepo'},{name:'depo'}],
 companySettings:{profile:{currencySymbol:'₺'}},
 ...overrides,
});

test('exact code wins over prefix and name matches; inactive products never answer',()=>{
 assert.equal(matchChatProducts(products,'00233').length,1);
 assert.equal(matchChatProducts(products,'00999').length,0);
 assert.deepEqual(matchChatProducts(products,'0023').map((entry)=>entry.product.id).sort(),[1,3]);
});

test('customer names are matched without diacritics and suppliers are ignored',()=>{
 const db=setup();
 assert.equal(findChatCustomer(db,'00233 abanoz')?.id,10);
 assert.equal(findChatCustomer(db,'global design 11011')?.id,11);
 assert.equal(findChatCustomer(db,'shanghai 00233'),null);
 assert.equal(findChatCustomer(db,'00233'),null);
});

test('without a customer the answer is the list price',()=>{
 const db=setup();
 const answer=resolvePriceAnswer(db,'00233');
 assert.match(answer.text,/Liste fiyatı: 5,96/);
 assert.match(answer.text,/Stok: 68/);
 assert.equal(answer.productReference.code,'00233');
 assert.equal(answer.productReference.price,undefined);
});

test('with a customer the answer is that customer price',()=>{
 const db=setup();
 const answer=resolvePriceAnswer(db,'00233 Abanoz');
 assert.match(answer.text,/abanoz fiyatı: 4,8 ₺ \(depo\)/i);
 assert.ok(!/Liste fiyatı: 5,96/.test(answer.text));
 assert.match(answer.text,/Stok: 68/);
});

test('customer without a rule falls back to the list price with a note',()=>{
 const db=setup();
 const answer=resolvePriceAnswer(db,'11011 Global Design');
 assert.match(answer.text,/global design için özel fiyat tanımlı değil/i);
 assert.match(answer.text,/liste fiyatı: 4,26/);
});

test('several matches list each product with the customer price',()=>{
 const db=setup();
 const answer=resolvePriceAnswer(db,'soft touch Abanoz');
 assert.match(answer.text,/2 ürün/);
 assert.match(answer.text,/abanoz fiyatı: 4,8/i);
 assert.match(answer.text,/abanoz fiyatı: 5,5/i);
 assert.equal(answer.productReference ?? null,null);
});

test('missing product, missing term and missing permission explain themselves',()=>{
 const db=setup();
 assert.match(resolvePriceAnswer(db,'yokböyle').text,/bulunamadı/);
 assert.match(resolvePriceAnswer(db,'Abanoz').text,/Ürün kodu veya adı/);
 assert.match(resolvePriceAnswer(db,'00233',{allowed:false}).text,/izniniz/);
});

test('the command posts a system message into the channel',()=>{
 const db=setup();
 const message=chatPriceAnswer(db,'general','00233',true);
 assert.equal(message.senderId,'system');
 assert.equal(message.channelId,'general');
 assert.equal(db.chatMessages.length,1);
});
