const buckets=new Map();
export const CHAT_RATE_LIMITS={messages:30,typing:120,uploads:20,other:120};
const WINDOW_MS=60000;
let calls=0;
let sharedHit=null;

// The server hands us the SQLite-backed limiter so limits survive restarts and
// stay correct when more than one process opens the same database.
export function configureChatRateLimit(hit){sharedHit=typeof hit==='function'?hit:null;}

export function chatRateLimit(userId,bucket,now=Date.now()){
 const limit=CHAT_RATE_LIMITS[bucket]||CHAT_RATE_LIMITS.other;
 const key=`${String(userId||'anon')}:${bucket}`;
 if(sharedHit){
  try{return Boolean(sharedHit(key,limit,WINDOW_MS,now));}catch{}
 }
 if(++calls%500===0)for(const [stored,hits] of buckets)if(!hits.length || now-hits.at(-1)>=WINDOW_MS)buckets.delete(stored);
 const hits=(buckets.get(key)||[]).filter((at)=>now-at<WINDOW_MS);
 if(hits.length>=limit){buckets.set(key,hits);return false;}
 hits.push(now);buckets.set(key,hits);return true;
}

export function resetChatRateLimits(){buckets.clear();calls=0;sharedHit=null;}
