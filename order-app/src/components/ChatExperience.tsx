import {useEffect,useState} from 'react';
import './chat-experience.css';
export function ChatInfo({api,channel,user,onClose,onMedia,onUpdated}:{api:any;channel:any;user:any;onClose:()=>void;onMedia:()=>void;onUpdated:()=>void}){
 const [profile,setProfile]=useState<{about:string;avatar:string;avatarUrl?:string}>({about:'',avatar:''});const [details,setDetails]=useState<any>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [avatarDirty,setAvatarDirty]=useState(false);
 useEffect(()=>{api(channel?`/api/orders/chat/details?channelId=${encodeURIComponent(channel.id)}`:'/api/orders/chat/profile').then((raw:any)=>{const d=raw?.data??raw;channel?setDetails(d):setProfile(d);}).catch(()=>setError('Bilgiler yüklenemedi.'));},[channel?.id]);
 const photo=async(file:File)=>{try{const url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;const size=Math.min(image.width,image.height);ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,256,256);URL.revokeObjectURL(url);setProfile(p=>({...p,avatar:canvas.toDataURL('image/jpeg',.85)}));setAvatarDirty(true);}catch{setError('Fotoğraf okunamadı.');}};
 const person=channel?.type==='dm'?details?.members?.find((m:any)=>m.id!==String(user.id)):null;
 return <div className="arix-chat-sheet" role="dialog" aria-modal="true"><header><button onClick={onClose} aria-label="Geri">←</button><h3>{channel?(channel.type==='group'?'Grup bilgisi':'Kişi bilgisi'):'Profilim'}</h3></header><div className="arix-chat-sheet-body">
 <div className="arix-chat-profile-photo">{(channel?(person?.avatarUrl||person?.avatar):(profile.avatarUrl||profile.avatar))?<img src={channel?(person?.avatarUrl||person?.avatar):(profile.avatarUrl||profile.avatar)} alt="Profil"/>:<span>{(channel?.name||user.name).slice(0,2).toUpperCase()}</span>}</div>
 <h2>{channel?.name||user.name}</h2><p>{person?.role||(!channel?user.role:'')}</p>
 {!channel?<><label>Profil fotoğrafı<input type="file" accept="image/*" onChange={e=>{if(e.target.files?.[0])void photo(e.target.files[0]);}}/></label>{(profile.avatar||profile.avatarUrl)&&<button onClick={()=>{setProfile(p=>({...p,avatar:'',avatarUrl:''}));setAvatarDirty(true);}}>Fotoğrafı kaldır</button>}<label>Hakkımda<textarea maxLength={140} value={profile.about} onChange={e=>setProfile(p=>({...p,about:e.target.value}))}/></label><button disabled={busy} className="primary" onClick={async()=>{setBusy(true);try{await api('/api/orders/chat/profile',{method:'POST',body:JSON.stringify({about:profile.about,...(avatarDirty?{avatar:profile.avatar}:{})})});onUpdated();onClose();}catch{setError('Profil kaydedilemedi.');}finally{setBusy(false);}}}>Kaydet</button></>:<><p>{person?.about||details?.description||'Henüz açıklama eklenmemiş.'}</p><button onClick={onMedia}>Medya, ses ve siparişler</button>{channel.type==='group'&&<>{details?.editable&&<><label>Grup adı<input maxLength={50} value={details.name} onChange={e=>setDetails({...details,name:e.target.value})}/></label><label>Açıklama<textarea maxLength={150} value={details.description} onChange={e=>setDetails({...details,description:e.target.value})}/></label><button disabled={busy} onClick={async()=>{setBusy(true);try{await api('/api/orders/chat/details',{method:'POST',body:JSON.stringify({channelId:channel.id,name:details.name,description:details.description})});onUpdated();onClose();}catch(e:any){setError(e.message||'Grup kaydedilemedi.');}finally{setBusy(false);}}}>Grup bilgilerini kaydet</button></>}<p>Bu grup şirket ekibine açıktır.</p><h3>Katılımcılar · {details?.members?.length||0}</h3>{details?.members?.map((m:any)=><div className="arix-chat-member" key={m.id}>{(m.avatarUrl||m.avatar)&&<img src={m.avatarUrl||m.avatar} alt=""/>}<span><b>{m.name}</b><small>{m.role}</small></span></div>)}</>}{['pinned','archived'].map(key=><button key={key} onClick={async()=>{try{await api('/api/orders/chat/preference',{method:'POST',body:JSON.stringify({channelId:channel.id,[key]:!channel[key]})});onUpdated();onClose();}catch{setError('Tercih kaydedilemedi.');}}}>{key==='pinned'?(channel.pinned?'Sabitlemeyi kaldır':'Sohbeti sabitle'):(channel.archived?'Arşivden çıkar':'Sohbeti arşivle')}</button>)}</>}
 {error&&<p role="alert">{error}</p>}</div></div>;
}
function localInputValue(date:Date){
 const pad=(value:number)=>String(value).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ChatTaskSheet({message,contacts,api,onClose,onCreated}:{message:any;contacts:any[];api:any;onClose:()=>void;onCreated:(message:any)=>void}){
 const [assigneeId,setAssigneeId]=useState('');const [title,setTitle]=useState(String(message?.text||'').slice(0,120)||'Görev');
 const [dueAt,setDueAt]=useState(()=>{const date=new Date();date.setHours(date.getHours()+3,0,0,0);return localInputValue(date);});
 const [note,setNote]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const people=(contacts||[]).filter((contact)=>contact?.targetUserId && contact.targetUserId!=='assistant');
 const create=async()=>{
  setBusy(true);
  try{
   const response=await api('/api/orders/chat/tasks',{method:'POST',body:JSON.stringify({channelId:message?.channelId,messageId:message?.id,assigneeId,title,note,dueAt:dueAt?new Date(dueAt).toISOString():'',clientMessageId:crypto.randomUUID()})});
   const data=response?.data??response;onCreated(data?.message||null);onClose();
  }catch(cause:any){setError(cause?.message||'Görev oluşturulamadı.');}
  finally{setBusy(false);}
 };
 return <div className="arix-chat-sheet" role="dialog" aria-modal="true"><header><button onClick={onClose} aria-label="Kapat">×</button><h3>Görev ata</h3></header><div className="arix-chat-sheet-body">
  <blockquote>{message?.text||'Ekli mesaj'}</blockquote>
  <label>Görev<input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></label>
  <label>Kime<select value={assigneeId} onChange={e=>setAssigneeId(e.target.value)}><option value="">Kişi seçin</option>{people.map((contact)=><option key={contact.targetUserId} value={contact.targetUserId}>{contact.name}</option>)}</select></label>
  <label>Son tarih<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
  <label>Not<textarea value={note} maxLength={1000} placeholder="Kısa açıklama (isteğe bağlı)" onChange={e=>setNote(e.target.value)}/></label>
  <button className="primary" disabled={busy||!assigneeId||!title.trim()} onClick={()=>void create()}>Görevi oluştur</button>
  {error&&<p role="alert">{error}</p>}
 </div></div>;
}

export function ChatTasksPanel({api,onClose}:{api:any;onClose:()=>void}){
 const [data,setData]=useState<any>(null);const [error,setError]=useState('');const [busy,setBusy]=useState('');
 const load=async()=>{try{const response=await api('/api/orders/chat/tasks');setData(response?.data??response);}catch{setError('Görevler yüklenemedi.');}};
 useEffect(()=>{void load();},[]);
 const toggle=async(task:any)=>{
  setBusy(task.id);
  try{await api('/api/orders/chat/tasks/status',{method:'POST',body:JSON.stringify({taskId:task.id,status:task.status==='open'?'done':'open'})});await load();}
  catch(cause:any){setError(cause?.message||'Görev güncellenemedi.');}
  finally{setBusy('');}
 };
 const row=(task:any)=><div key={task.id} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid rgba(0,0,0,0.08)'}}>
  <button type="button" disabled={busy===task.id} onClick={()=>void toggle(task)} aria-label={task.status==='open'?'Tamamla':'Yeniden aç'} title={task.status==='open'?'Tamamla':'Yeniden aç'}>{task.status==='open'?'☐':'☑'}</button>
  <div style={{flex:1,minWidth:0}}>
   <b style={{display:'block',textDecoration:task.status==='done'?'line-through':'none'}}>{task.title}</b>
   <small style={{opacity:.7}}>{task.assigneeName}{task.dueAt?` · son ${new Date(task.dueAt).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''}{task.isOverdue?' · gecikti':''}</small>
   {task.note&&<p style={{margin:'2px 0 0',opacity:.8}}>{task.note}</p>}
  </div>
 </div>;
 const mine=data?.mine||[];const created=(data?.created||[]).filter((task:any)=>task.assigneeId!==task.createdById);
 return <div className="arix-chat-sheet" role="dialog" aria-modal="true"><header><button onClick={onClose} aria-label="Kapat">×</button><h3>Görevler</h3></header><div className="arix-chat-sheet-body">
  <p style={{opacity:.75}}>{Number(data?.openCount)||0} açık · {Number(data?.overdueCount)||0} gecikmiş</p>
  <h3>Bana atananlar</h3>
  {mine.length?mine.map(row):<p style={{opacity:.7}}>Bekleyen görev yok.</p>}
  <h3>Benim açtıklarım</h3>
  {created.length?created.map(row):<p style={{opacity:.7}}>Henüz görev vermediniz.</p>}
  {error&&<p role="alert">{error}</p>}
 </div></div>;
}

export function ChatMessageMenu({message,channels,currentUser,api,onClose,onChanged,onReply,onPin,onAssignTask}:{message:any;channels:any[];currentUser:any;api:any;onClose:()=>void;onChanged:(message:any)=>void;onReply:()=>void;onPin?:()=>void;onAssignTask?:()=>void}){
 const [mode,setMode]=useState('menu');const [text,setText]=useState(message.text);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const act=async(action:string,extra:any={})=>{setBusy(true);try{const response=await api('/api/orders/chat/message-action',{method:'POST',body:JSON.stringify({channelId:message.channelId,messageId:message.id,action,...extra})});onChanged(response?.data??response);onClose();}catch(e:any){setError(e?.message||'İşlem tamamlanamadı.');}finally{setBusy(false);}};
 return <div className="arix-chat-sheet" role="dialog" aria-modal="true"><header><button onClick={onClose} aria-label="Kapat">×</button><h3>Mesaj</h3></header><div className="arix-chat-sheet-body"><blockquote>{message.text||'Ekli mesaj'}</blockquote>{mode==='edit'?<><textarea value={text} maxLength={2000} onChange={e=>setText(e.target.value)}/><button disabled={busy||!text.trim()} onClick={()=>act('edit',{text})}>Değişiklikleri kaydet</button></>:mode==='forward'?<><h3>İletilecek sohbet</h3>{channels.filter(c=>c.id!==message.channelId).map(c=><button disabled={busy} key={c.id} onClick={()=>act('forward',{targetChannelId:c.id,clientMessageId:crypto.randomUUID()})}>{c.name}</button>)}</>:mode==='delete'?<><p>Bu mesaj herkesten silinsin mi?</p><button disabled={busy} onClick={()=>act('delete')}>Herkesten sil</button></>:<><div className="arix-chat-reactions">{['👍','❤️','😂','😮','😢','🙏'].map(emoji=><button key={emoji} disabled={busy} onClick={()=>act('react',{emoji})}>{emoji}</button>)}</div><button onClick={()=>{onReply();onClose();}}>Yanıtla</button>{onPin&&<button disabled={busy} onClick={()=>{onPin();onClose();}}>{message.isPinned?'Sabitlemeyi kaldır':'Sabitle'}</button>}{onAssignTask&&<button disabled={busy} onClick={()=>{onAssignTask();onClose();}}>Görev ata</button>}<button onClick={()=>setMode('forward')}>İlet</button><button onClick={()=>{void navigator.clipboard?.writeText(message.text||'').catch(()=>{});onClose();}}>Metni kopyala</button>{String(message.senderId)===String(currentUser.id)&&<><button onClick={()=>setMode('edit')}>Düzenle</button><button onClick={()=>setMode('delete')}>Herkesten sil</button></>}</>}{error&&<p role="alert">{error}</p>}</div></div>;
}
