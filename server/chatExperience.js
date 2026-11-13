import {assertChatAccess,ensureChatStorage,postChatMessage,canAccessChatMedia,chatError,canChatSeeUser,chatPersonProfile,chatAvatarUrl} from './teamChat.js';
const allowedReactions=new Set(['👍','❤️','😂','😮','😢','🙏']);
export function chatProfile(db,user){ensureChatStorage(db);return {about:'',...chatPersonProfile(db,user.id),...(db.chatProfiles?.[String(user.id)]||{})};}
export function saveChatProfile(db,user,body){
 ensureChatStorage(db);db.chatProfiles??={};db.chatAvatars??={};
 const id=String(user.id),previous=db.chatProfiles[id]||{};
 const current=String(db.chatAvatars[id]?.dataUrl||'');
 // An absent avatar field leaves the stored photo alone; an empty string removes it
 const hasAvatarField=Object.prototype.hasOwnProperty.call(body||{},'avatar');
 const avatar=hasAvatarField?String(body.avatar||''):current;
 if(avatar && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))throw chatError('Fotoğraf geçersiz veya çok büyük.');
 if(avatar.length>250000)throw chatError('Fotoğraf geçersiz veya çok büyük.',413);
 const changed=avatar!==current,now=new Date().toISOString();
 const avatarUpdatedAt=avatar?(changed?now:(previous.avatarUpdatedAt||now)):null;
 if(avatar)db.chatAvatars[id]={dataUrl:avatar,updatedAt:avatarUpdatedAt};else delete db.chatAvatars[id];
 const profile={about:String(body.about||'').trim().slice(0,140),avatarUpdatedAt};
 db.chatProfiles[id]=profile;
 return {...profile,hasAvatar:Boolean(avatar),avatarUrl:avatar?chatAvatarUrl(id,avatarUpdatedAt):null};
}
export function changeChatMessage(db,user,body){
 const channelId=String(body.channelId||'');assertChatAccess(db,user,channelId);
 const message=db.chatMessages.find(m=>m.id===body.messageId && m.channelId===channelId);
 if(!message)throw chatError('Mesaj bulunamadı.',404);
 if(body.action==='forward'){
  if(message.deletedAt)throw chatError('Silinen mesaj iletilemez.');
  const sent=postChatMessage(db,user,{channelId:String(body.targetChannelId||''),text:message.text,fileReference:message.fileReference,imageUrl:message.imageUrl,audioUrl:message.audioUrl,audioDuration:message.audioDuration,orderReference:message.orderReference,productReference:message.productReference,clientMessageId:body.clientMessageId});
  const stored=db.chatMessages.find(m=>m.id===sent.id);stored.forwarded=true;return stored;
 }
 if(body.action==='react'){
  if(message.deletedAt || !allowedReactions.has(body.emoji))throw chatError('Geçersiz tepki.');
  message.reactions??={};const id=String(user.id);
  if(message.reactions[id]===body.emoji)delete message.reactions[id];else message.reactions[id]=body.emoji;
 }else{
  if(String(message.senderId)!==String(user.id))throw chatError('Yalnız kendi mesajınızı değiştirebilirsiniz.',403);
  if(message.deletedAt)throw chatError('Mesaj zaten silinmiş.');
  if(body.action==='edit'){
   const text=String(body.text||'').trim();if(!text || text.length>2000)throw chatError('Mesaj 1–2000 karakter olmalıdır.');
   message.text=text;message.editedAt=new Date().toISOString();
  }else if(body.action==='delete'){
   message.deletedAt=new Date().toISOString();message.text='Bu mesaj silindi.';
   for(const key of ['imageUrl','audioUrl','audioDuration','orderReference','productReference','replyToReference','reactions','fileReference'])delete message[key];
   if(db.chatPins[channelId]===message.id)delete db.chatPins[channelId];
  }else throw chatError('Geçersiz mesaj işlemi.');
 }
 return message;
}
export function chatPreference(db,user,body){
 const id=String(body.channelId||'');assertChatAccess(db,user,id);
 db.chatPreferences??={};db.chatPreferences[String(user.id)]??={};
 const previous=db.chatPreferences[String(user.id)][id]||{};
 const value={...previous};
 for(const key of ['pinned','archived'])if(typeof body[key]==='boolean')value[key]=body[key];
 db.chatPreferences[String(user.id)][id]=value;return value;
}
export function chatDetails(db,user,id){
 assertChatAccess(db,user,id);const channel=id.startsWith('dm:')?null:db.chatChannels.find(c=>c.id===id);
 const ids=channel?(channel.memberIds||db.authUsers.filter(u=>u.active!==false).map(u=>String(u.id))):id.split(':').slice(1);
 return {members:db.authUsers.filter(u=>ids.includes(String(u.id)) && u.active!==false && canChatSeeUser(user,u)).map(u=>({id:String(u.id),name:u.name,role:u.role,...chatPersonProfile(db,u.id)})),description:channel?.description||'',name:channel?.name||'',editable:Boolean(channel && (String(channel.createdById)===String(user.id) || ['sahib','owner'].includes(String(user.role).toLowerCase())))};
}
export function updateChatGroup(db,user,body){
 const id=String(body.channelId||'');const details=chatDetails(db,user,id);if(!details.editable)throw chatError('Grubu yalnız kurucusu veya yönetici düzenleyebilir.',403);
 const channel=db.chatChannels.find(c=>c.id===id);const name=String(body.name||'').trim();if(!name || name.length>50)throw chatError('Grup adı 1–50 karakter olmalı.');
 channel.name=name;channel.description=String(body.description||'').trim().slice(0,150);return channel;
}
