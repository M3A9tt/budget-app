export function allowedUsers(env){return [...new Set([env.TELEGRAM_OWNER_ID,...String(env.TELEGRAM_ALLOWED_IDS||'').split(',')].map(x=>String(x||'').trim()).filter(x=>/^[1-9]\d*$/.test(x)&&Number.isSafeInteger(Number(x))))];}
export const isAllowedUser=(env,id)=>allowedUsers(env).includes(String(id));
const ready=new WeakSet();
export async function ensureInvites(env){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS user_invites(hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,expires_at INTEGER NOT NULL,claimed_user TEXT UNIQUE)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS user_join_links(hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,created_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0)'),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS user_memberships(user_id TEXT NOT NULL,owner_id TEXT NOT NULL,invite_hash TEXT,status TEXT NOT NULL DEFAULT 'active',created_at INTEGER NOT NULL,PRIMARY KEY(user_id,owner_id))")
 ]);ready.add(env.DB);
}
export async function hasAccess(env,id){
 if(isAllowedUser(env,id))return true;
 await ensureInvites(env);const user=String(id),owner=String(env.TELEGRAM_OWNER_ID);
 const membership=await env.DB.prepare('SELECT status FROM user_memberships WHERE user_id=? AND owner_id=?').bind(user,owner).first();
 if(membership)return membership.status==='active';
 return !!await env.DB.prepare('SELECT claimed_user FROM user_invites WHERE claimed_user=? AND owner_id=?').bind(user,owner).first();
}
export async function invitedUsers(env){
 await ensureInvites(env);const owner=String(env.TELEGRAM_OWNER_ID),legacy=(await env.DB.prepare('SELECT claimed_user FROM user_invites WHERE claimed_user IS NOT NULL AND owner_id=?').bind(owner).all()).results,members=(await env.DB.prepare('SELECT user_id,status FROM user_memberships WHERE owner_id=? ORDER BY created_at,user_id').bind(owner).all()).results;
 const users=new Map(legacy.map(r=>[r.claimed_user,{user_id:r.claimed_user,status:'active'}]));for(const r of members)users.set(r.user_id,r);return [...users.values()];
}
export async function allAllowedUsers(env){return [...new Set([...allowedUsers(env),...(await invitedUsers(env)).filter(r=>r.status==='active').map(r=>r.user_id)])];}
export async function acceptInvite(env,hash,id){
 await ensureInvites(env);const owner=String(env.TELEGRAM_OWNER_ID),user=String(id);
 const link=await env.DB.prepare('SELECT hash FROM user_join_links WHERE hash=? AND owner_id=? AND revoked=0').bind(hash,owner).first();
 if(link){
  await env.DB.prepare("INSERT OR IGNORE INTO user_memberships(user_id,owner_id,invite_hash,status,created_at) SELECT ?,?,?,'active',? WHERE EXISTS(SELECT 1 FROM user_join_links WHERE hash=? AND owner_id=? AND revoked=0)").bind(user,owner,hash,Date.now(),hash,owner).run();
  return hasAccess(env,id);
 }
 // Existing single-use links continue to work. Revocation cannot be bypassed by another link.
 const blocked=await env.DB.prepare("SELECT user_id FROM user_memberships WHERE user_id=? AND owner_id=? AND status='revoked'").bind(user,owner).first();if(blocked)return false;
 const row=await env.DB.prepare('SELECT * FROM user_invites WHERE hash=? AND owner_id=?').bind(hash,owner).first();if(!row||row.expires_at<=Date.now()||row.claimed_user&&row.claimed_user!==user)return false;
 if(await hasAccess(env,id))return true;
 const result=await env.DB.prepare('UPDATE user_invites SET claimed_user=? WHERE hash=? AND claimed_user IS NULL AND expires_at>?').bind(user,hash,Date.now()).run();return !!result.meta.changes;
}
export async function setMemberAccess(env,id,enabled){
 await ensureInvites(env);if(!/^[1-9]\d*$/.test(id))throw Error('Неверный пользователь');
 await env.DB.prepare('INSERT INTO user_memberships(user_id,owner_id,status,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,owner_id) DO UPDATE SET status=excluded.status').bind(id,String(env.TELEGRAM_OWNER_ID),enabled?'active':'revoked',Date.now()).run();
}
