// Compatibility only: read old prompts/cards and open the current shared form.
// This module never creates financial drafts, receipts or transactions.
import {correctionBelongsToDraft} from './dialog-focus.js';
import {parseMoney} from '../src/ledger.js';
import {readReceipt} from './state-persistence.js';
import {lunchReminderKey} from './lunch-entry.js';
import {ensureHabits,pauseLegacyLunchInput} from './habits.js';
import {pendingForm} from './bot-drafts.js';

const valuesFrom=tx=>Object.fromEntries(['amount','date','currency','accountId','cat','note','paymentMethod','tags'].filter(k=>tx[k]!==undefined).map(k=>[k,tx[k]]));

export async function legacyLunchInput(env,userId,message,api){
 await ensureHabits(env);
 const text=(message.text||'').trim(),rows=(await env.DB.prepare("SELECT * FROM user_day_checks WHERE user_id=? AND kind='lunch' AND status='amount' ORDER BY day DESC").bind(userId).all()).results;
 if(['/cancel','Отмена'].includes(text)&&rows.length){await pauseLegacyLunchInput(env,userId);await api.telegram(env,'sendMessage',{chat_id:userId,text:'Ввод обеда отменён. Ничего не записано.'});return true;}
 const row=rows.find(r=>correctionBelongsToDraft(message,'amount',JSON.parse(r.payload).promptId));
 if(!row)return false;
 const active=await pendingForm(env,userId);if(active&&!active.p.paused&&!message.reply_to_message)return false;
 const amount=parseMoney(text);if(!Number.isFinite(amount)||amount<=0)throw Error('Введите положительную сумму обеда');
 const payload=JSON.parse(row.payload);
 await api.openLunch(row.day,payload.type==='company'?'company':'own',{amount,accountId:payload.accountId},true);
 await env.DB.prepare("UPDATE user_day_checks SET status='open' WHERE user_id=? AND day=? AND kind='lunch' AND status='amount' AND payload=?").bind(userId,row.day,row.payload).run();
 return true;
}

export async function legacySaveCallback(env,userId,callback,api){
 if(!callback.data?.startsWith('save:'))return false;
 const id=callback.data.slice(5),row=await env.DB.prepare('SELECT * FROM telegram_drafts WHERE id=? AND owner=?').bind(id,userId).first();
 if(!row||row.expires_at<Date.now())throw Error('Карточка устарела — отправьте покупку заново');
 const tx=JSON.parse(row.payload);
 const prior=await readReceipt(env,userId,tx._lunchCheckDay?lunchReminderKey(tx._lunchCheckDay):'tg-draft:'+id);
 if(row.consumed||prior){await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:prior?'Уже записано. Повторного списания нет.':'Карточка уже перенесена. Используй последнюю форму.'});return true;}
 const claimed=await env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=? AND owner=? AND consumed=0 AND payload=?').bind(id,userId,row.payload).run();
 if(!claimed.meta.changes){await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Карточка уже обрабатывается.'});return true;}
 try{
  await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Открыл общую форму — проверь запись'});
  if(tx._lunchCheckDay)await api.openLunch(tx._lunchCheckDay,tx.type==='lunch'?'company':'own',valuesFrom(tx),true);
  else if(['lunch','expense','income'].includes(tx.type))await api.openForm('tx',{type:tx.type,prefill:valuesFrom(tx),review:true,returnTo:{name:'history',args:{}}});
  else throw Error('Неизвестная старая карточка');
 }catch(error){await env.DB.prepare('UPDATE telegram_drafts SET consumed=0 WHERE id=? AND owner=? AND payload=?').bind(id,userId,row.payload).run();throw error;}
 return true;
}
