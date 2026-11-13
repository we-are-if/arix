const typing=new Map();
export function touchTyping(channelId,user){let entries=typing.get(channelId);if(!entries){entries=new Map();typing.set(channelId,entries)}entries.set(String(user.id),{id:String(user.id),name:user.name,at:Date.now()});}
export function getTyping(channelId,user){const entries=typing.get(channelId);if(!entries)return [];for(const [id,e] of entries)if(Date.now()-e.at>6000)entries.delete(id);if(!entries.size)typing.delete(channelId);return [...entries.values()].filter(e=>e.id!==String(user.id)).map(({id,name})=>({id,name}));}
