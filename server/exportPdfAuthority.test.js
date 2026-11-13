import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import template from './exportDocumentTemplate.cjs';
import {selectExportDocument,validateExportDocument,createExportPdfAuthority} from './exportPdfAuthority.js';
const line={productName:'Foil',productCode:'ERSA 519',quantity:960,unit:'M2',width:1.42,rollCount:8,unitPrice:3.8,discountRate:0,vatRate:0};
const form={documentType:'commercial_invoice',number:'CIN-1',updatedAt:'v1',date:'2026-11-11',lines:[line],currency:'USD',exchangeRate:1,extraCharge:0,paymentTerms:'',deliveryTerms:'',status:'approved'};
const settings={companyName:'Test',companyLogo:'',companyStamp:''};
const order={number:'ORD-1',approvalForm:form,items:[]};
test('type and saved version required; domestic cannot enter authority',()=>{
 assert.equal(selectExportDocument(order,{documentType:'commercial_invoice',expectedUpdatedAt:'v1'}),form);
 for(const request of [{},{documentType:'domestic'},{documentType:'commercial_invoice',expectedUpdatedAt:'old'},{documentType:'proforma',expectedUpdatedAt:'v1'}])assert.throws(()=>selectExportDocument(order,request));
 assert.throws(()=>validateExportDocument({...form,documentType:'domestic'}));
});
test('commercial amount unchanged; metres and area printed separately',()=>{
 const html=template.exportHtml(order,form,settings);
 assert.ok(html.includes('1,363.2 m²')); assert.ok(html.includes('960 m'));
 assert.ok(Math.abs(template.approvalTotals(form).total-5180.16)<0.00001);
 assert.ok(html.includes('Shipment &amp; customs')); assert.ok(html.includes('Exporter declaration'));
 assert.ok(!html.includes('Proforma &amp; shipment details'));
});
test('stored package kg receives exact intrinsic weight',()=>{
 const glue={...line,manual:true,unit:'BUCKET',quantity:3,rollCount:0,innerUnit:'KG',innerQuantity:15};
 const result=template.computePalletItemWeights([{line,quantity:800},{line:glue,quantity:3}],{grossWeight:930,tareWeight:20});
 assert.equal(result[1].netWeight,45); assert.equal(result[0].netWeight,865);
});
test('invalid packing distribution cannot become an authoritative PDF',()=>{
 const packing={...form,documentType:'packing_list',palletDetails:[{grossWeight:100,tareWeight:20}],palletAllocations:[[{lineIndex:0,quantity:960,rolls:8}]]};
 validateExportDocument(packing);
 assert.throws(()=>validateExportDocument({...packing,palletAllocations:[[{lineIndex:0,quantity:800,rolls:8}]]}));
 assert.throws(()=>validateExportDocument({...packing,palletAllocations:[[{lineIndex:0,quantity:960,rolls:8,netWeight:200}]]}));
});
test('same export shares PDF bytes; changed saved content creates new artifact',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'tmp','arix-export-test-'));let calls=0;
 try{
  const service=createExportPdfAuthority({directory:dir,printSettings:()=>settings,products:()=>[],render:async()=>{calls++;await new Promise(r=>setTimeout(r,20));return Buffer.from('%PDF-test-'+calls)}});
  const [a,b]=await Promise.all([service(order,form,{}),service(order,form,{})]);
  assert.equal(calls,1); assert.deepEqual(a.pdf,b.pdf);
  const c=await service(order,form,{});assert.equal(calls,1);assert.deepEqual(a.pdf,c.pdf);
  const next=await service(order,{...form,updatedAt:'v2',invoiceNumber:'Changed'},{});assert.equal(calls,2);assert.notEqual(a.fingerprint,next.fingerprint);
 }finally{await rm(dir,{recursive:true,force:true})}
});

