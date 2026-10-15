import {migrateData} from '../src/ledger.js';
import {EMPTY} from '../src/mini-model.js';
import {applyBotAction} from './bot-catalog.js';
// Session receipt, state CAS, pre-change backup and consumed marker commit atomically.
export async function commitBotAction(env,userId,id,p,readState){
 const key='bot:'+id,prior=await env.DB.prepare('SELECT result FROM user_idempotency WHERE user_id=? AND id=?').bind(userId,key).first();if(prior)return {...JSON.parse(prior.result),duplicate:true};
 const state=await readState(env,userId);if(state.revision!==p.revision)throw Error('Данные изменились. Открой свежий предпросмотр.');
 const next=migrateData(applyBotAction(structuredClone(state.data),p.op,p.args,p.values),EMPTY),result={revision:state.revision+1},now=Date.now(),payload=JSON.stringify(p);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const rows=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO user_state_backups(user_id,revision,data,created_at) SELECT user_id,revision,data,updated_at FROM user_finance_state WHERE user_id=? AND revision=?').bind(userId,state.revision),
  env.DB.prepare('INSERT INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_finance_state WHERE user_id=? AND revision=?) AND EXISTS(SELECT 1 FROM telegram_drafts WHERE id=? AND owner=? AND consumed=0 AND expires_at>? AND payload=?)').bind(userId,key,hash,JSON.stringify(result),now,userId,state.revision,id,userId,now,payload),
  env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)').bind(JSON.stringify(next),new Date().toISOString(),userId,state.revision,userId,key),
  env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)').bind(id,userId,userId,key)
 ]);
 if(rows[2].meta.changes!==1)throw Error('Карточка изменилась или уже выполнена. Открой раздел заново.');return result;
}
