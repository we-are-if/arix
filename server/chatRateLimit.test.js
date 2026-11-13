import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createSQLiteStateStore} from './database.js';
import {CHAT_RATE_LIMITS,chatRateLimit,configureChatRateLimit,resetChatRateLimits} from './chatRateLimit.js';

test('memory fallback allows the bucket limit and then blocks',()=>{
 resetChatRateLimits();
 const now=Date.now(),limit=CHAT_RATE_LIMITS.messages;
 for(let i=0;i<limit;i++)assert.equal(chatRateLimit('user-a','messages',now),true);
 assert.equal(chatRateLimit('user-a','messages',now),false);
 assert.equal(chatRateLimit('user-b','messages',now),true);
 assert.equal(chatRateLimit('user-a','messages',now+61000),true);
 resetChatRateLimits();
});

test('shared sqlite limiter counts across limiter instances and survives a reset',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arix-rate-'));
 const store=createSQLiteStateStore({dataDir:dir,jsonPath:join(dir,'db.json'),sqlitePath:join(dir,'arix.sqlite')});
 try{
  await store.initialize({},(value)=>value);
  configureChatRateLimit((key,limit,windowMs,now)=>store.rateLimitHit(key,limit,windowMs,now));
  const now=Date.now(),limit=CHAT_RATE_LIMITS.uploads;
  for(let i=0;i<limit;i++)assert.equal(chatRateLimit('user-c','uploads',now),true);
  assert.equal(chatRateLimit('user-c','uploads',now),false);
  // A second limiter instance (as another process would have) sees the same counters
  resetChatRateLimits();
  configureChatRateLimit((key,limit,windowMs,now)=>store.rateLimitHit(key,limit,windowMs,now));
  assert.equal(chatRateLimit('user-c','uploads',now),false);
  assert.equal(chatRateLimit('user-d','uploads',now),true);
 }finally{
  resetChatRateLimits();
  store.close();
  await rm(dir,{recursive:true,force:true});
 }
});
