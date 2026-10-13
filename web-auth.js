const cookieName='__Host-budget_session';
const cookie=(value,age)=>`${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
export const hashToken=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function issueWebCode(env){const code=crypto.randomUUID()+crypto.randomUUID();await env.DB.prepare('INSERT INTO web_codes(hash,expires_at) VALUES(?,?)').bind(await hashToken(code),Date.now()+300000).run();return code;}
export async function webSession(request,env){const value=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!value||value.length>100)return false;return !!await env.DB.prepare('SELECT hash FROM web_sessions WHERE hash=? AND expires_at>?').bind(await hashToken(value),Date.now()).first();}
export async function webAuthRoute(request,env,path){
 const origin=request.headers.get('Origin');if(request.method!=='POST'||origin!==new URL(request.url).origin)return Response.json({error:'Недопустимый запрос'},{status:403});
 if(path.endsWith('/logout')){const value=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(value)await env.DB.prepare('DELETE FROM web_sessions WHERE hash=?').bind(await hashToken(value)).run();return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0),'Cache-Control':'no-store'}});}
 let input;try{input=await request.json();}catch{return Response.json({error:'Неверный запрос'},{status:400});}
 if(typeof input.code!=='string'||input.code.length!==72)return Response.json({error:'Код недействителен'},{status:401});
 const hash=await hashToken(input.code),session=crypto.randomUUID()+crypto.randomUUID(),sessionHash=await hashToken(session),now=Date.now();
 // Batch transaction: at most one session may be issued from a code, even concurrently.
 const result=await env.DB.batch([env.DB.prepare('INSERT INTO web_sessions(hash,expires_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM web_codes WHERE hash=? AND expires_at>?)').bind(sessionHash,now+7*86400000,hash,now),env.DB.prepare('DELETE FROM web_codes WHERE hash=?').bind(hash)]);
 if(!result[0].meta.changes)return Response.json({error:'Код устарел или уже использован. Получите /web у бота'},{status:401});
 return Response.json({ok:true},{headers:{'Set-Cookie':cookie(session,7*86400),'Cache-Control':'no-store'}});
}
