export function allowedUsers(env){
 return [...new Set([env.TELEGRAM_OWNER_ID,...String(env.TELEGRAM_ALLOWED_IDS||'').split(',')].map(x=>String(x||'').trim()).filter(x=>/^[1-9]\d*$/.test(x)&&Number.isSafeInteger(Number(x))))];
}
export const isAllowedUser=(env,id)=>allowedUsers(env).includes(String(id));

// Additive access registry; created by the Worker using its existing D1 binding.
// No financial rows are modified by this migration.
export async function ensureInvites(env){
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_invites(hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,expires_at INTEGER NOT NULL,claimed_user TEXT UNIQUE)').run();
}
export async function hasAccess(env,id){
 if(isAllowedUser(env,id))return true;
 await ensureInvites(env);
 return !!await env.DB.prepare('SELECT claimed_user FROM user_invites WHERE claimed_user=? AND owner_id=?').bind(String(id),String(env.TELEGRAM_OWNER_ID)).first();
}
export async function allAllowedUsers(env){
 await ensureInvites(env);
 const rows=await env.DB.prepare('SELECT claimed_user FROM user_invites WHERE claimed_user IS NOT NULL AND owner_id=?').bind(String(env.TELEGRAM_OWNER_ID)).all();
 return [...new Set([...allowedUsers(env),...rows.results.map(r=>r.claimed_user)])];
}
