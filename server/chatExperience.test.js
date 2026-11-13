import test from 'node:test';import assert from 'node:assert/strict';
import {postChatMessage,buildDmChannelId,canAccessChatMedia,getChatAvatar} from './teamChat.js';
import {saveChatProfile,chatProfile,changeChatMessage,chatPreference,chatDetails,updateChatGroup} from './chatExperience.js';
const users=[{id:'a',name:'A',role:'sahib'},{id:'b',name:'B',role:'sales'},{id:'c',name:'C',role:'sales'}];const setup=()=>({authUsers:structuredClone(users)});
test('profile update can change only caller and rejects external avatar URLs',()=>{const db=setup();saveChatProfile(db,users[0],{userId:'b',about:'hello',avatar:''});assert.equal(chatProfile(db,users[0]).about,'hello');assert.equal(chatProfile(db,users[1]).about,'');assert.throws(()=>saveChatProfile(db,users[0],{avatar:'https://example.com/x'}));});
test('edit/delete requires authorship and preserves original message id',()=>{const db=setup();const m=postChatMessage(db,users[0],{channelId:'general',text:'old'});assert.throws(()=>changeChatMessage(db,users[1],{channelId:'general',messageId:m.id,action:'edit',text:'attack'}));const edit=changeChatMessage(db,users[0],{channelId:'general',messageId:m.id,action:'edit',text:'new'});assert.equal(edit.id,m.id);assert.equal(edit.text,'new');assert.ok(edit.editedAt);changeChatMessage(db,users[0],{channelId:'general',messageId:m.id,action:'delete'});assert.ok(edit.deletedAt);assert.equal(edit.text,'Bu mesaj silindi.');});
test('reaction toggles once per person and outsiders cannot react to DM',()=>{const db=setup(),channelId=buildDmChannelId('a','b');const m=postChatMessage(db,users[0],{channelId,text:'hello'});const payload={channelId,messageId:m.id,action:'react',emoji:'👍'};changeChatMessage(db,users[1],payload);assert.equal(db.chatMessages[0].reactions.b,'👍');changeChatMessage(db,users[1],payload);assert.equal(db.chatMessages[0].reactions.b,undefined);assert.throws(()=>changeChatMessage(db,users[2],payload));});
test('forward creates independent message and deduplicates retry',()=>{const db=setup();const m=postChatMessage(db,users[0],{channelId:'general',text:'hello'});const payload={channelId:'general',messageId:m.id,action:'forward',targetChannelId:'warehouse',clientMessageId:'forward-1'};const sent=changeChatMessage(db,users[1],payload);assert.ok(sent.forwarded);assert.notEqual(sent.id,m.id);changeChatMessage(db,users[1],payload);assert.equal(db.chatMessages.length,2);});
test('preferences and group editing enforce caller access',()=>{const db=setup();chatPreference(db,users[0],{channelId:'general',pinned:true});assert.equal(db.chatPreferences.a.general.pinned,true);assert.equal(db.chatPreferences.b,undefined);assert.equal(chatDetails(db,users[1],'general').editable,false);assert.throws(()=>updateChatGroup(db,users[1],{channelId:'general',name:'new'}));updateChatGroup(db,users[0],{channelId:'general',name:'new'});assert.equal(db.chatChannels[0].name,'new');});
test('private documents are accessible only to sender and recipients',()=>{const db=setup(),url='/api/orders/chat/files/file-test.pdf';db.chatUploads={[url]:{ownerId:'a',name:'invoice.pdf',size:123}};postChatMessage(db,users[0],{channelId:buildDmChannelId('a','b'),text:'',fileReference:{url}});assert.equal(canAccessChatMedia(db,users[1],url),true);assert.equal(canAccessChatMedia(db,users[2],url),false);});
test('avatar data url lives outside chatProfiles, is versioned and capped',()=>{
 const db=setup(),avatar='data:image/png;base64,iVBORw0KGgo=';
 const saved=saveChatProfile(db,users[0],{about:'hello',avatar});
 assert.equal(saved.about,'hello');assert.ok(saved.avatarUpdatedAt);
 assert.equal(db.chatProfiles.a.avatar,undefined);assert.equal(db.chatAvatars.a.dataUrl,avatar);
 assert.equal(getChatAvatar(db,'a').mime,'image/png');
 const member=chatDetails(db,users[1],'general').members.find(m=>m.id==='a');
 assert.equal(member.hasAvatar,true);assert.match(member.avatarUrl,/^\/api\/orders\/chat\/avatar\/a\?v=\d+$/);assert.equal('avatar' in member,false);
 saveChatProfile(db,users[0],{avatar:''});assert.equal(db.chatAvatars.a,undefined);assert.equal(chatProfile(db,users[0]).avatarUpdatedAt,null);
 assert.throws(()=>saveChatProfile(db,users[0],{avatar:'data:image/png;base64,'+'A'.repeat(250000)}),{statusCode:413});
});
test('chat details member list is limited to the caller company',()=>{
 const db={authUsers:[{id:'a',name:'A',role:'sahib',companyId:'ersa-folyo'},{id:'b',name:'B',companyId:'other-co'},{id:'c',name:'C',companyId:'ersa-folyo'}]};
 assert.deepEqual(chatDetails(db,db.authUsers[0],'general').members.map(m=>m.id),['a','c']);
});
