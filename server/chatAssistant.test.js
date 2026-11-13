import test from 'node:test';import assert from 'node:assert/strict';
import {ASSISTANT_HELP,answerAssistant,findAssistantOrder,stripAssistantNoise} from './chatAssistant.js';

const today=new Date().toISOString().slice(0,10);
const products=[
 {id:1,name:'Soft Touch Premium Beyaz',code:'00233',sku:'ERSA 510',unit:'mt',salePrice:5.96,warehouses:{antrepo:50,depo:18},active:true},
 {id:2,name:'Folyo Satin İnci',code:'11011',sku:'ERSA 011',unit:'mt',salePrice:4.26,warehouses:{antrepo:30,depo:0},active:true},
];
const order=(overrides={})=>({id:'o1',number:'ORD-1042',customerName:'ABANOZ',status:'ready',businessDate:today,total:1200,...overrides});
const setup=(overrides={})=>({
 products:structuredClone(products),
 counterparties:[{id:10,kind:'customer',name:'ABANOZ',balance:12500},{id:11,kind:'customer',name:'Global Design',balance:0}],
 customerPrices:[{id:'r1',customerId:10,productId:1,store:'depo',price:4.8}],
 stores:[{name:'antrepo'},{name:'depo'}],
 companySettings:{profile:{currencySymbol:'₺'}},
 orderBoard:[
  order(),
  order({id:'o2',number:'ORD-1039',status:'delivered',businessDate:'2026-11-01'}),
  order({id:'o3',number:'ORD-1040',status:'preparing',businessDate:'2026-11-10'}),
 ],
 ...overrides,
});
const cmds=(db,text,permissions={products:true,orders:true,customers:true})=>answerAssistant(db,{id:'u1',name:'Arif'},text,permissions);

test('empty question and help intent return the command list',()=>{
 const db=setup();
 assert.equal(cmds(db,'').text,ASSISTANT_HELP);
 assert.match(cmds(db,'yardım').text,/00233 stok/);
 assert.match(cmds(db,'ne yapabilirsin?').text,/sipariş durumu/);
});

test('order numbers resolve to the order status with a reference card',()=>{
 const db=setup();
 const answer=cmds(db,'ORD-1042 ne durumda');
 assert.match(answer.text,/ORD-1042 · ABANOZ · Hazır/);
 assert.equal(answer.orderReference.number,'ORD-1042');
 assert.equal(answer.orderReference.status,'Hazır');
 const short=cmds(db,'1042');
 assert.match(short.text,/ORD-1042/);
});

test('price questions use the list price or the customer price',()=>{
 const db=setup();
 assert.match(cmds(db,'00233 fiyat').text,/Liste fiyatı: 5,96/);
 const customer=cmds(db,'Abanoz 00233 fiyat');
 assert.match(customer.text,/abanoz fiyatı: 4,8/i);
 assert.match(customer.text,/Stok: 68/);
});

test('stock questions list warehouse balances',()=>{
 const db=setup();
 const answer=cmds(db,'00233 stok');
 assert.match(answer.text,/Soft Touch Premium Beyaz/);
 assert.match(answer.text,/Stok: 68 mt/);
 assert.match(answer.text,/antrepo: 50/);
 assert.match(answer.text,/depo: 18/);
 assert.match(cmds(db,'yokböyle stok').text,/bulunamadı/);
});

test('pending approvals and overdue deliveries are counted',()=>{
 const db=setup();
 db.orderBoard[0].approvalForm={number:'PRF-1042',status:'draft',submittedForApproval:true,submittedAt:new Date(Date.now()-2*3600000).toISOString(),customerName:'ABANOZ'};
 assert.match(cmds(db,'onay bekleyen').text,/1 form onay bekliyor/);
 assert.match(cmds(db,'onay bekleyen').text,/PRF-1042/);
 assert.match(cmds(db,'geciken sevkiyat').text,/1 sipariş teslim edilmedi/);
 assert.match(cmds(db,'geciken sevkiyat').text,/ORD-1040/);
});

test('customer balance and today summary answer with numbers',()=>{
 const db=setup();
 db.orderBoard[0].approvalForm={number:'PRF-1042',status:'draft',submittedForApproval:true,submittedAt:new Date().toISOString(),customerName:'ABANOZ'};
 assert.match(cmds(db,'Abanoz bakiye').text,/ABANOZ · bakiye: 12\.500 ₺/);
 assert.match(cmds(db,'Abanoz bakiye').text,/ORD-1042/);
 assert.match(cmds(db,'bugün').text,/Bugün 1 sipariş/);
 assert.match(cmds(db,'bugün').text,/Onay bekleyen: 1 form/);
});

test('missing permissions produce a clear refusal instead of data',()=>{
 const db=setup();
 const none={products:false,orders:false,customers:false};
 assert.match(cmds(db,'00233 fiyat',none).text,/ürün görüntüleme izniniz/);
 assert.match(cmds(db,'onay bekleyen',none).text,/sipariş görüntüleme izniniz/);
 assert.match(cmds(db,'Abanoz bakiye',none).text,/cari görüntüleme izniniz/);
});

test('unknown questions fall back to the help text',()=>{
 const db=setup();
 const answer=cmds(db,'hava nasıl');
 assert.match(answer.text,/Bunu anlayamadım/);
 assert.match(answer.text,/00233 stok/);
});

test('noise stripping keeps product and customer words',()=>{
 assert.equal(stripAssistantNoise('00233 fiyat ne kadar?'),'00233');
 assert.equal(stripAssistantNoise('Abanoz 00233 fiyatı'),'Abanoz 00233');
 assert.equal(findAssistantOrder(setup(),'ORD-1042')?.id,'o1');
});
