// Shared snapshot policy for every write path. Cleanup belongs to the same D1 batch.
export const MAX_STATE_BYTES=1_500_000;
export function encodeState(data){const text=JSON.stringify(data);if(new TextEncoder().encode(text).length>MAX_STATE_BYTES)throw Error('История профиля больше 1,5 МБ. Сохрани экспорт и обратись к владельцу перед дальнейшим импортом');return text;}
export const backupBefore=(env,userId,revision)=>env.DB.prepare('INSERT OR IGNORE INTO user_state_backups(user_id,revision,data,created_at) SELECT user_id,revision,data,updated_at FROM user_finance_state WHERE user_id=? AND revision=?').bind(userId,revision);
export const trimBackups=(env,userId)=>env.DB.prepare('DELETE FROM user_state_backups WHERE user_id=? AND revision NOT IN (SELECT revision FROM user_state_backups WHERE user_id=? ORDER BY revision DESC LIMIT 50)').bind(userId,userId);
export async function requestHash(input){const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sort(input)))))).map(n=>n.toString(16).padStart(2,'0')).join('');}

// Deployment smoke check uses an isolated metadata table, never a financial profile.
export async function checkPersistence(env,releaseId){
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS release_storage_checks(id TEXT PRIMARY KEY,value INTEGER NOT NULL)').run();
 const ids=[releaseId,releaseId+':receipt',releaseId+':invalid'];
 const clear=()=>env.DB.prepare('DELETE FROM release_storage_checks WHERE id IN (?,?,?)').bind(...ids).run();
 await clear();
 try{
  await env.DB.batch([
   env.DB.prepare('INSERT INTO release_storage_checks VALUES(?,0)').bind(ids[0]),
   env.DB.prepare('UPDATE release_storage_checks SET value=1 WHERE id=? AND value=0').bind(ids[0]),
   env.DB.prepare('INSERT INTO release_storage_checks SELECT ?,1 WHERE changes()=1').bind(ids[1]),
   env.DB.prepare('UPDATE release_storage_checks SET value=2 WHERE id=? AND value=0').bind(ids[0]),
   env.DB.prepare('INSERT INTO release_storage_checks SELECT ?,1 WHERE changes()=1').bind(ids[2])
  ]);
  const rows=await env.DB.prepare('SELECT COUNT(*) n FROM release_storage_checks WHERE id IN (?,?,?)').bind(...ids).first();
  if(rows.n!==2)throw Error('Storage receipt smoke check failed');return true;
 }finally{await clear();}
}

// All write paths resolve a lost race through the same durable receipt table.
export async function readReceipt(env,userId,key){
 if(!key)return null;
 const row=await env.DB.prepare('SELECT result,request_hash FROM user_idempotency WHERE user_id=? AND id=?').bind(userId,key).first();
 return row?{requestHash:row.request_hash,result:JSON.parse(row.result)}:null;
}
