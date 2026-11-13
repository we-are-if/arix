import test from 'node:test';import assert from 'node:assert/strict';
import {createChatTask,dueTaskReminders,ensureTaskStorage,listChatTasks,setChatTaskStatus,taskSummaryLine} from './chatTasks.js';

const users=[{id:'a',name:'Arif',active:true},{id:'b',name:'Ekrem',active:true},{id:'c',name:'Pasif',active:false}];
const setup=()=>({authUsers:structuredClone(users)});
const hour=3_600_000;

test('a task needs a title and an active assignee',()=>{
 const db=setup();
 assert.throws(()=>createChatTask(db,users[0],{title:'',assigneeId:'b'}));
 assert.throws(()=>createChatTask(db,users[0],{title:'Palet kontrol',assigneeId:'c'}));
 assert.throws(()=>createChatTask(db,users[0],{title:'Palet kontrol',assigneeId:'yok'}));
 const task=createChatTask(db,users[0],{title:'Palet kontrol',assigneeId:'b',dueAt:'2026-11-13T15:30:00.000Z',channelId:'general',messageId:'m1'});
 assert.equal(task.status,'open');
 assert.equal(task.assigneeName,'Ekrem');
 assert.equal(task.createdById,'a');
 assert.equal(db.chatTasks.length,1);
});

test('lists separate what I owe from what I assigned, newest first',()=>{
 const db=setup();
 createChatTask(db,users[0],{title:'Benim işim',assigneeId:'a'});
 createChatTask(db,users[0],{title:'Ekreme iş',assigneeId:'b'});
 const mine=listChatTasks(db,users[0],Date.now());
 assert.deepEqual(mine.mine.map((task)=>task.title),['Benim işim']);
 assert.equal(mine.openCount,1);
 assert.equal(mine.created.length,2);
 const theirs=listChatTasks(db,users[1],Date.now());
 assert.deepEqual(theirs.mine.map((task)=>task.title),['Ekreme iş']);
 assert.equal(theirs.created.length,0);
});

test('overdue tasks are flagged and reminded once',()=>{
 const db=setup(),now=Date.now();
 const task=createChatTask(db,users[0],{title:'Yükleme',assigneeId:'b',dueAt:new Date(now-hour).toISOString()});
 assert.equal(listChatTasks(db,users[1],now).overdueCount,1);
 const due=dueTaskReminders(db,now);
 assert.equal(due.length,1);
 task.remindedAt=new Date(now).toISOString();
 assert.equal(dueTaskReminders(db,now).length,0);
});

test('only the assignee or the creator may change status',()=>{
 const db=setup();
 const task=createChatTask(db,users[0],{title:'Kontrol',assigneeId:'b'});
 assert.throws(()=>setChatTaskStatus(db,{id:'c'},{taskId:task.id,status:'done'}));
 assert.throws(()=>setChatTaskStatus(db,users[1],{taskId:task.id,status:'whatever'}));
 const done=setChatTaskStatus(db,users[1],{taskId:task.id,status:'done'});
 assert.equal(done.status,'done');
 assert.ok(done.doneAt);
 assert.equal(listChatTasks(db,users[1],Date.now()).openCount,0);
 const reopened=setChatTaskStatus(db,users[0],{taskId:task.id,status:'open'});
 assert.equal(reopened.doneAt,null);
});

test('summary line carries the assignee and the due time',()=>{
 const db=setup();
 const task=createChatTask(db,users[0],{title:'Palet',assigneeId:'b',dueAt:'2026-11-13T12:00:00.000Z'});
 assert.match(taskSummaryLine(task),/Palet · Ekrem/);
 assert.match(taskSummaryLine(task),/13\/11/);
});
