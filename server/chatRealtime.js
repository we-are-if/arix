import {assertChatAccess} from './teamChat.js';
const streams=new Set();
export function openChatStream(req,res,user) {
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
 res.write('retry: 3000\ndata: {"type":"connected"}\n\n');
 const entry={res,user};streams.add(entry);
 const timer=setInterval(()=>{try{res.write(': keepalive\n\n')}catch{cleanup()}},25000);
 const cleanup=()=>{clearInterval(timer);streams.delete(entry)};res.on('close',cleanup);res.on('error',cleanup);
}
export function notifyChatStreams(db,channelId,extra={}) {
 for(const entry of streams){
  const res=entry.res;
  if(!res || res.writableEnded || res.destroyed)continue;
  try{assertChatAccess(db,entry.user,channelId);res.write('data: '+JSON.stringify({type:extra.type||'changed',channelId,...extra})+'\n\n')}catch{}
 }
}
