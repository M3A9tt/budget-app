import {applyBotAction} from './bot-catalog.js';
import {EMPTY} from '../src/mini-model.js';
import {migrateData,validateStateChange} from '../src/ledger.js';
import {backupBefore,trimBackups,encodeState,readReceipt,requestHash} from './state-persistence.js';
import {RequestError,validateInput} from './request-errors.js';
const allowed=new Set(['tx','deleteTx','transfer','editTransfer','reverseTransfer','confirmPlan','payInstallment','reschedulePlan','paymentReminder','lunchAnswer','notificationMode']);
// A compatible command boundary: no client-supplied financial snapshot or user ID.
export async function financialCommand(env,userId,input,key,readState){
 if(!allowed.has(input.action)||!input.values||typeof input.values!=='object'||Array.isArray(input.values)||!input.args||typeof input.args!=='object'||Array.isArray(input.args)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof key!=='string'||!/^[-\w:]{1,160}$/.test(key))throw new RequestError('Нужна финансовая команда, ревизия и ключ повтора');
 const receipt='command:'+key,hash=await requestHash(input),stored=async()=>{const prior=await readReceipt(env,userId,receipt);if(!prior)return null;if(prior.requestHash!==hash)throw new RequestError('Ключ уже использован для другой команды',409);return prior.result;};
 const prior=await stored();if(prior)return prior;
 const current=await readState(env,userId);if(current.revision!==input.expectedRevision){const winner=await stored();if(winner)return winner;throw new RequestError('Данные изменились. Обнови список',409);}
 const data=validateInput(()=>migrateData(applyBotAction(structuredClone(current.data),input.action,input.args,input.values),EMPTY));validateInput(()=>validateStateChange(current.data,data));
 const encoded=validateInput(()=>encodeState(data),413),result={revision:current.revision+1,data};
 // Receipts store the revision only; replay returns that revision and the current state.
 const rows=await env.DB.batch([backupBefore(env,userId,current.revision),env.DB.prepare('INSERT INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_finance_state WHERE user_id=? AND revision=?)').bind(userId,receipt,hash,JSON.stringify({revision:result.revision}),Date.now(),userId,current.revision),env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)').bind(encoded,new Date().toISOString(),userId,current.revision,userId,receipt),trimBackups(env,userId)]);
 if(rows[2].meta.changes!==1){const winner=await stored();if(winner)return winner;throw new RequestError('Данные изменились. Обнови список',409);}return {revision:result.revision};
}
