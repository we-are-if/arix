import test from 'node:test';import assert from 'node:assert/strict';
import {postChatMessage,getChatMessages,markChatRead,toggleChatPin,canAccessChatMedia,buildDmChannelId} from './teamChat.js';
const users=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const setup=()=>({authUsers:structuredClone(users)});
test('nonparticipant cannot read, post, pin, mark read or access private attachments',()=>{
 const db=setup(),id=buildDmChannelId('a','b'),url='/api/orders/chat/images/chat-test.png';
 db.chatUploads={[url]:{ownerId:'a'}};
 const msg=postChatMessage(db,users[0],{channelId:id,text:'private',imageUrl:url});
 for(const action of [()=>getChatMessages(db,users[2],id),()=>postChatMessage(db,users[2],{channelId:id,text:'x'}),()=>toggleChatPin(db,users[2],{channelId:id,messageId:msg.id}),()=>markChatRead(db,users[2],id,msg.id)])assert.throws(action);
 assert.equal(canAccessChatMedia(db,users[2],url),false);assert.equal(canAccessChatMedia(db,users[1],url),true);
 assert.throws(()=>postChatMessage(db,users[2],{channelId:'general',imageUrl:url}));
});
test('retry after lost response produces exactly one message',()=>{
 const db=setup(),payload={channelId:'general',text:'hello',clientMessageId:'request-1'};
 const a=postChatMessage(db,users[0],payload),b=postChatMessage(db,users[0],payload);
 assert.equal(a.id,b.id);assert.equal(db.chatMessages.length,1);assert.equal(b.duplicate,true);
});
test('history cursor preserves messages with equal timestamps; search spans history',()=>{
 const db=setup();for(let i=0;i<75;i++)postChatMessage(db,users[0],{channelId:'general',text:i===0?'SILKA ORD-7':'Message '+i});
 db.chatMessages.forEach(m=>m.createdAt='2026-11-12T10:00:00Z');
 const first=getChatMessages(db,users[1],'general',{limit:60});assert.equal(first.hasMore,true);
 const older=getChatMessages(db,users[1],'general',{limit:60,before:first.messages[0].id});assert.equal(older.messages.length,15);assert.equal(older.hasMore,false);
 assert.equal(getChatMessages(db,users[1],'general',{search:'silka'}).messages.length,1);
});
test('server saved stays sent until the recipient reads; read marks only fetched range',()=>{
 const db=setup();const id=buildDmChannelId('a','b');
 const first=postChatMessage(db,users[0],{channelId:id,text:'one'});first.createdAt='2026-11-12T10:00:00Z';db.chatMessages[0].createdAt=first.createdAt;
 const second=postChatMessage(db,users[0],{channelId:id,text:'two'});db.chatMessages[1].createdAt='2026-11-12T10:00:01Z';
 assert.equal(getChatMessages(db,users[0],id).messages[0].readStatus,'sent');
 markChatRead(db,users[1],id,first.id);const messages=getChatMessages(db,users[0],id).messages;
 assert.equal(messages[0].readStatus,'read');assert.equal(messages[1].readStatus,'sent');
});
test('pin must refer to a message in the same channel',()=>{const db=setup();const m=postChatMessage(db,users[0],{channelId:'general',text:'a'});assert.throws(()=>toggleChatPin(db,users[0],{channelId:'warehouse',messageId:m.id}));});
import {setChatMuted,getChatChannels} from './teamChat.js';
import {openChatStream,notifyChatStreams} from './chatRealtime.js';
import {chatRateLimit,resetChatRateLimits} from './chatRateLimit.js';
import {EventEmitter} from 'node:events';
test('mute preference belongs to user and channel',()=>{const db=setup();setChatMuted(db,users[0],'general',true);assert.equal(getChatChannels(db,users[0]).channels[0].muted,true);assert.equal(getChatChannels(db,users[1]).channels[0].muted,false)});
test('live updates are sent only to participants and connections are cleaned up',()=>{
 const db=setup(),id=buildDmChannelId('a','b');postChatMessage(db,users[0],{channelId:id,text:'hello'});
 const make=()=>{const r=new EventEmitter();r.output='';r.writeHead=()=>{};r.write=s=>{r.output+=s};return r};
 const member=make(),stranger=make();openChatStream({},member,users[1]);openChatStream({},stranger,users[2]);
 try{notifyChatStreams(db,id);assert.ok(member.output.includes('changed'));assert.ok(!stranger.output.includes('changed'));}finally{member.emit('close');stranger.emit('close')}
});
test('access denials carry 403 and validation errors carry 400',()=>{
 const db=setup(),id=buildDmChannelId('a','b');
 assert.throws(()=>getChatMessages(db,users[2],id),{statusCode:403});
 assert.throws(()=>postChatMessage(db,users[2],{channelId:id,text:'x'}),{statusCode:403});
 assert.throws(()=>postChatMessage(db,users[0],{channelId:'general',text:''}),{statusCode:400});
 assert.throws(()=>postChatMessage(db,users[0],{channelId:'general',text:'x'.repeat(2001)}),{statusCode:400});
 assert.throws(()=>getChatMessages(db,users[0],'no-such-channel'),{statusCode:404});
 const other={id:'z',name:'Z',companyId:'other-co'};db.authUsers.push(other);
 assert.throws(()=>getChatMessages(db,other,id),{statusCode:403});
});
test('typing and message events ride the live stream without a refetch',()=>{
 const db=setup(),messages=[];const r=new EventEmitter();r.output='';r.writeHead=()=>{};r.write=s=>{r.output+=s};
 openChatStream({},r,users[1]);
 try{
  notifyChatStreams(db,'general',{type:'typing',typing:[{id:'a',name:'A'}]});
  messages.push({id:'m1',channelId:'general',text:'hi'});
  notifyChatStreams(db,'general',{type:'message',message:messages[0]});
  const frames=r.output.trim().split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  assert.deepEqual(frames[1],{type:'typing',channelId:'general',typing:[{id:'a',name:'A'}]});
  assert.deepEqual(frames[2],{type:'message',channelId:'general',message:messages[0]});
  assert.equal(frames.some(frame=>frame.type==='changed'),false);
 }finally{r.emit('close')}
});
test('rate limiter allows the window limit then blocks',()=>{
 resetChatRateLimits();const start=1_000_000;
 for(let i=0;i<30;i++)assert.equal(chatRateLimit('rl-user','messages',start+i),true);
 assert.equal(chatRateLimit('rl-user','messages',start+100),false);
 assert.equal(chatRateLimit('rl-user','typing',start+100),true);
 assert.equal(chatRateLimit('other-user','messages',start+100),true);
 assert.equal(chatRateLimit('rl-user','messages',start+60001),true);
});
