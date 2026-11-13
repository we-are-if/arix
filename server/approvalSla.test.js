import test from 'node:test';import assert from 'node:assert/strict';
import {APPROVAL_SLA_DEFAULTS,approvalSlaLevel,approvalSlaLimits,approvalWaitHours,describeApprovalWait,pendingApprovalItems} from './approvalSla.js';

const hour=3_600_000;
const form=(overrides={})=>({number:'PRF-1',status:'draft',submittedForApproval:true,submittedAt:new Date(Date.UTC(2026,10,13,6,0,0)).toISOString(),submittedBy:'Ekrem',preparedByUserId:'u1',...overrides});
const order=(overrides={})=>({id:'o1',number:'ORD-1',customerName:'Abanos',approvalForm:form(),...overrides});

test('a submitted draft is pending; approved, rejected and unsubmitted forms are not',()=>{
 assert.equal(pendingApprovalItems({orderBoard:[order()]}).length,1);
 assert.equal(pendingApprovalItems({orderBoard:[order({approvalForm:form({status:'approved'})})]}).length,0);
 assert.equal(pendingApprovalItems({orderBoard:[order({approvalForm:form({status:'rejected'})})]}).length,0);
 assert.equal(pendingApprovalItems({orderBoard:[order({approvalForm:form({submittedForApproval:false})})]}).length,0);
 assert.equal(pendingApprovalItems({orderBoard:[order({approvalForm:form({submittedAt:undefined})})]}).length,0);
});

test('test orders and loan returns never escalate',()=>{
 assert.equal(pendingApprovalItems({orderBoard:[order({isTest:true})]}).length,0);
 assert.equal(pendingApprovalItems({orderBoard:[order({isLoanReturn:true})]}).length,0);
});

test('root and export copy of the same document count once',()=>{
 const shared=form({documentType:'proforma',number:'PRF-9'});
 const items=pendingApprovalItems({orderBoard:[{id:'o1',number:'ORD-1',customerName:'Abanos',approvalForm:{...shared,exportDocuments:{proforma:shared}}}]});
 assert.equal(items.length,1);
 assert.equal(items[0].documentLabel,'Proforma');
});

test('export documents escalate separately from the domestic form',()=>{
 const root=form({number:'FRM-1'});
 const exportForm=form({number:'PRF-2',submittedAt:new Date(Date.UTC(2026,10,13,7,0,0)).toISOString()});
 const items=pendingApprovalItems({orderBoard:[{id:'o1',number:'ORD-1',approvalForm:{...root,exportDocuments:{proforma:exportForm}}}]});
 assert.equal(items.length,2);
 assert.deepEqual(items.map((item)=>item.number).sort(),['FRM-1','PRF-2']);
});

test('wait hours and levels follow the thresholds',()=>{
 const submitted=new Date(Date.UTC(2026,10,13,6,0,0)).toISOString();
 const now=Date.UTC(2026,10,13,6,0,0)+5.5*hour;
 assert.equal(Math.round(approvalWaitHours(submitted,now)*10)/10,5.5);
 assert.equal(approvalSlaLevel(1),'ok');
 assert.equal(approvalSlaLevel(4),'warn');
 assert.equal(approvalSlaLevel(23.9),'warn');
 assert.equal(approvalSlaLevel(24),'critical');
 assert.equal(approvalSlaLevel(5.5,{warnHours:6,criticalHours:48}),'ok');
 assert.equal(approvalSlaLevel(0),'ok');
 assert.equal(approvalWaitHours('nonsense',Date.now()),0);
});

test('limits come from the environment and stay ordered',()=>{
 assert.deepEqual(approvalSlaLimits({}),APPROVAL_SLA_DEFAULTS);
 assert.deepEqual(approvalSlaLimits({ARIX_APPROVAL_SLA_WARN_HOURS:'2',ARIX_APPROVAL_SLA_CRITICAL_HOURS:'12'}),{warnHours:2,criticalHours:12});
 assert.deepEqual(approvalSlaLimits({ARIX_APPROVAL_SLA_WARN_HOURS:'30',ARIX_APPROVAL_SLA_CRITICAL_HOURS:'5'}),{warnHours:30,criticalHours:30});
});

test('wait text stays human readable',()=>{
 assert.equal(describeApprovalWait(0.5),'30 dk');
 assert.equal(describeApprovalWait(6.25),'6 sa 15 dk');
 assert.equal(describeApprovalWait(30),'1 gün 6 sa');
});
