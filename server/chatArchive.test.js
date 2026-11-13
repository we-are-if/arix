import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {CHAT_ARCHIVE_DEFAULTS,appendChatArchive,chatArchiveLimits,selectChatArchive} from './chatArchive.js';

const build=(channelId,count,start=0)=>Array.from({length:count},(_,index)=>({id:`${channelId}-${start+index}`,channelId,text:'m',createdAt:new Date(Date.UTC(2026,0,1,0,0,start+index)).toISOString()}));

test('per-channel overflow keeps the newest rows and archives the oldest',()=>{
 const messages=[...build('general',8),...build('warehouse',4)];
 const {archive,keep}=selectChatArchive(messages,{maxPerChannel:5,maxTotal:100});
 assert.deepEqual(archive.map((m)=>m.id),['general-0','general-1','general-2']);
 assert.equal(keep.length,9);
 assert.equal(keep[0].id,'general-3');
});

test('global cap trims across channels after per-channel limits',()=>{
 const messages=[...build('general',5),...build('warehouse',5)];
 const {archive,keep}=selectChatArchive(messages,{maxPerChannel:5,maxTotal:6});
 assert.equal(archive.length,4);
 assert.deepEqual(archive.map((m)=>m.id),['general-0','general-1','warehouse-0','warehouse-1']);
 assert.equal(keep.length,6);
});

test('nothing is archived while inside the limits',()=>{
 const messages=build('general',10);
 const result=selectChatArchive(messages,{maxPerChannel:3000,maxTotal:8000});
 assert.equal(result.archive.length,0);
 assert.equal(result.keep.length,10);
});

test('limits come from the environment when present',()=>{
 assert.deepEqual(chatArchiveLimits({}),CHAT_ARCHIVE_DEFAULTS);
 assert.deepEqual(chatArchiveLimits({ARIX_CHAT_ARCHIVE_PER_CHANNEL:'10',ARIX_CHAT_ARCHIVE_TOTAL:'20'}),{maxPerChannel:10,maxTotal:20});
 assert.deepEqual(chatArchiveLimits({ARIX_CHAT_ARCHIVE_PER_CHANNEL:'nope'}),CHAT_ARCHIVE_DEFAULTS);
});

test('archive rows are appended per channel as jsonl',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arix-chat-archive-'));
 try{
  const messages=[{id:'a',channelId:'general',text:'bir'},{id:'b',channelId:'dm:x:y',text:'iki'},{id:'c',channelId:'general',text:'üç'}];
  assert.equal(await appendChatArchive(dir,messages),3);
  assert.equal(await appendChatArchive(dir,[{id:'d',channelId:'general',text:'dört'}]),1);
  const general=(await readFile(join(dir,'general.jsonl'),'utf8')).trim().split('\n');
  assert.deepEqual(general.map((line)=>JSON.parse(line).id),['a','c','d']);
  const dm=(await readFile(join(dir,'dm_x_y.jsonl'),'utf8')).trim().split('\n');
  assert.equal(dm.length,1);
 }finally{await rm(dir,{recursive:true,force:true})}
});
