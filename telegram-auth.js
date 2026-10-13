const encoder=new TextEncoder();
const hmac=async(key,message)=>{const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(message)));};
export async function validateTelegramInitData(raw,botToken,ownerId,now=Math.floor(Date.now()/1000)) {
  if(!raw||!botToken||!ownerId||raw.length>12000)return null;
  try {
    const params=new URLSearchParams(raw),seen=new Set();
    for(const [key] of params){if(seen.has(key))return null;seen.add(key);}
    const hash=params.get('hash');if(!/^[a-f0-9]{64}$/i.test(hash||''))return null;
    const auth=Number(params.get('auth_date'));
    if(!Number.isSafeInteger(auth)||auth>now+30||now-auth>3600)return null;
    params.delete('hash');
    const check=[...params.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
    const secret=await hmac(encoder.encode('WebAppData'),botToken),actual=await hmac(secret,check);
    const expected=Uint8Array.from(hash.match(/../g),v=>parseInt(v,16));let difference=0;
    for(let i=0;i<actual.length;i++)difference|=actual[i]^expected[i];if(difference)return null;
    const user=JSON.parse(params.get('user')||'null');
    if(!user||!Number.isSafeInteger(user.id)||String(user.id)!==String(ownerId)||user.is_bot)return null;
    return user;
  }catch{return null;}
}
