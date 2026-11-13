import test from 'node:test';import assert from 'node:assert/strict';import {canWithdrawApproval} from '../shared/approvalPermissions.js';
const form={status:'draft',submittedForApproval:true,preparedBy:'Maker',preparedByUserId:'1'};
test('only maker and owner can withdraw, not approver or another editor',()=>{
 assert.equal(canWithdrawApproval(form,{id:'1',name:'Maker'}),true);
 assert.equal(canWithdrawApproval(form,{id:'2',name:'Approver'}),false);
 assert.equal(canWithdrawApproval(form,{id:'2',name:'Maker'}),false);
 assert.equal(canWithdrawApproval(form,{id:'3'},true),true);
});
test('legacy maker preserved and approved/unsubmitted forms excluded',()=>{
 assert.equal(canWithdrawApproval({...form,preparedByUserId:undefined},{name:'Maker'}),true);
 assert.equal(canWithdrawApproval({...form,status:'approved'},{id:'1'},true),false);
 assert.equal(canWithdrawApproval({...form,submittedForApproval:false},{id:'1'},true),false);
});
