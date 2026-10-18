import {queueCorrection} from './lunch-learning.js';
import {lunchReminderAnswered} from './lunch-entry.js';
import {backupBefore,trimBackups,encodeState,readReceipt} from './state-persistence.js';
import {migrateData,validateStateChange} from '../src/ledger.js';
import {EMPTY} from '../src/mini-model.js';
import {applyBotAction} from './bot-catalog.js';
// Session receipt, state CAS, pre-change backup and consumed marker commit atomically.
export async function commitBotAction(env,userId,id,p,readState){
 const key='bot:'+id;
 const stored=async()=>{const prior=await readReceipt(env,userId,key);return prior?{...prior.result,duplicate:true}:null;};
 const prior=await stored();if(prior)return prior;
 const state=await readState(env,userId);if(state.revision!==p.revision){const completed=await stored();if(completed)return completed;throw Error('Данные изменились. Открой свежий предпросмотр.');}
 const lunchDay=p.op==='tx'&&p.args.lunchCheckDay;
 if(lunchDay){const check=await env.DB.prepare("SELECT status FROM user_day_checks WHERE user_id=? AND day=? AND kind='lunch'").bind(userId,lunchDay).first();if(!check||check.status==='skipped'||lunchReminderAnswered(state.data,lunchDay))throw Error('Ответ об обеде уже сохранён или изменён. Открой «Обеды» и «Историю»');}
 const recognized=p.op==='tx'&&p.args.recognizedLunch;
 if(recognized){const row=await env.DB.prepare("SELECT status,expires_at,lease_until FROM lunch_chat_drafts WHERE id=? AND user_id=?").bind(recognized.sourceId,userId).first();if(row?.status==='saving'&&row.lease_until<Date.now()){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='open',lease_until=0 WHERE id=? AND user_id=? AND status='saving' AND lease_until<?").bind(recognized.sourceId,userId,Date.now()).run();row.status='open';}if(!row||row.status!=='open'||row.expires_at<Date.now())throw Error('Этот распознанный заказ уже закрыт. Используй последнюю форму.');if(p.args.type!=='lunch'||p.values.currency!=='RUB')throw Error('Заказ компании сохраняется рублёвым обедом');}
 const next=migrateData(applyBotAction(structuredClone(state.data),p.op,p.args,p.values),EMPTY),result={revision:state.revision+1,...(p.op!=='undo'&&next.history?.[0]?.id!==state.data.history?.[0]?.id?{historyId:next.history?.[0]?.id}:{})},now=Date.now(),payload=JSON.stringify(p);
 validateStateChange(state.data,next);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const rows=await env.DB.batch([
  backupBefore(env,userId,state.revision),
  env.DB.prepare('INSERT INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_finance_state WHERE user_id=? AND revision=?) AND EXISTS(SELECT 1 FROM telegram_drafts WHERE id=? AND owner=? AND consumed=0 AND expires_at>? AND payload=?)' + (recognized?" AND EXISTS(SELECT 1 FROM lunch_chat_drafts WHERE id=? AND user_id=? AND status='open' AND expires_at>?)":'' )).bind(userId,key,hash,JSON.stringify(result),now,userId,state.revision,id,userId,now,payload,...(recognized?[recognized.sourceId,userId,now]:[])),
  env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)').bind(encodeState(next),new Date().toISOString(),userId,state.revision,userId,key),
  env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)').bind(id,userId,userId,key),
  ...(lunchDay?[
   env.DB.prepare("UPDATE user_day_checks SET status='recorded',payload='{}' WHERE user_id=? AND day=? AND kind='lunch' AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)").bind(userId,lunchDay,userId,key)
  ]:[]),
  ...(recognized?[
   env.DB.prepare("UPDATE lunch_chat_drafts SET status='saved',lease_until=0 WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)").bind(recognized.sourceId,userId,userId,key),
   env.DB.prepare("INSERT INTO user_day_checks(user_id,day,kind,status,payload) SELECT ?,?,'lunch','recorded','{}' WHERE EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?) ON CONFLICT(user_id,day,kind) DO UPDATE SET status='recorded',payload='{}'").bind(userId,p.values.date,userId,key)
  ]:[]),
  trimBackups(env,userId)
 ]);
 if(rows[2].meta.changes!==1){const completed=await stored();if(completed)return completed;throw Error('Карточка изменилась или уже выполнена. Открой раздел заново.');}if(recognized?.parsed)try{await queueCorrection(env,userId,recognized.sourceId,recognized.parsed,{amount:Number(p.values.amount),note:p.values.note},next.settings.lunchLearningEnabled!==false);}catch{/* Optional learning never changes financial success. */}return result;
}
