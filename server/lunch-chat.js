import {classifyIncomingMessage} from '../src/input-intent.js';
import {correctionBelongsToDraft} from './dialog-focus.js';
import {lunchOrders,parseLunchOrder,recognitionCorrection} from '../src/lunch-recognition.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {parserRules} from './lunch-learning.js';
const ready=new WeakSet();
async function ensure(env){if(ready.has(env.DB))return;await env.DB.prepare('CREATE TABLE IF NOT EXISTS lunch_chat_drafts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,field TEXT NOT NULL DEFAULT \'\',expires_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0)').run();ready.add(env.DB);}
async function draft(env,userId,id){await ensure(env);const row=await env.DB.prepare('SELECT * FROM lunch_chat_drafts WHERE id=? AND user_id=?').bind(id,userId).first();if(!row||row.expires_at<Date.now())throw Error('Карточка устарела. Перешли заказ заново.');if(['saving','choosing'].includes(row.status)&&row.lease_until<Date.now()){const fallback=row.status==='saving'?'open':'choose',expired=row.status;const recovered=await env.DB.prepare("UPDATE lunch_chat_drafts SET status=?,lease_until=0 WHERE id=? AND user_id=? AND status=? AND lease_until<?").bind(fallback,id,userId,expired,Date.now()).run();if(recovered.meta.changes)row.status=fallback;}return {...row,payload:JSON.parse(row.payload)};}
async function insert(env,userId,payload,status='open',sourceId){await ensure(env);const id=sourceId||crypto.randomUUID();await env.DB.prepare('INSERT OR IGNORE INTO lunch_chat_drafts(id,user_id,payload,status,expires_at) VALUES(?,?,?,?,?)').bind(id,userId,JSON.stringify(payload),status,Date.now()+30*60000).run();await env.DB.prepare('DELETE FROM lunch_chat_drafts WHERE expires_at<?').bind(Date.now()-86400000).run();return id;}
async function openPayload(env,userId,id,payload,api){
 return api.openRecognized(id,payload);
}
async function openOrder(env,userId,order,date,api,sourceId){
 const parsed=parseLunchOrder(order.body,date,await parserRules(env)),payload={parsed,tx:{type:'lunch',cat:'lunch',amount:parsed.amount,currency:'RUB',date:parsed.date,note:parsed.note,paymentMethod:'unknown'}};
 const id=await insert(env,userId,payload,'open',sourceId),row=await draft(env,userId,id);if(row.status==='saved'){await api.telegram(env,'sendMessage',{chat_id:userId,text:'Этот заказ уже записан. Повторной записи нет.'});return;}await openPayload(env,userId,id,row.payload,api);
}
export async function lunchChatMessage(env,userId,message,api){
 await ensure(env);const text=(message.text||message.caption||'').trim();if(!text)return false;
 const active=await env.DB.prepare("SELECT * FROM lunch_chat_drafts WHERE user_id=? AND status='editing' AND expires_at>? ORDER BY rowid DESC LIMIT 1").bind(userId,Date.now()).first();
 if(active&&correctionBelongsToDraft(message,active.field,JSON.parse(active.payload).promptId)){const value=recognitionCorrection(active.field,text),payload=JSON.parse(active.payload);payload.tx[active.field]=value;payload.corrected=true;const claimed=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded' WHERE id=? AND user_id=? AND status='editing'").bind(active.id,userId).run();if(!claimed.meta.changes)throw Error('Эта правка уже обработана');const id=await insert(env,userId,payload,'open',active.id+'-edit'),row=await draft(env,userId,id);if(row.status==='saved'){await api.telegram(env,'sendMessage',{chat_id:userId,text:'Этот заказ уже записан. Повторной записи нет.'});return;}await openPayload(env,userId,id,payload,api);return true;}
 if(['/cancel','Отмена'].includes(text)&&active){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='cancelled' WHERE id=? AND user_id=? AND status='editing'").bind(active.id,userId).run();await api.telegram(env,'sendMessage',{chat_id:userId,text:'Обед отменён. Ничего не записано.'});return true;}
 if(text.startsWith('/'))return false;
 const forwarded=!!(message.forward_origin||message.forward_date),orders=lunchOrders(text);
 // Only forwarded messages and clearly identified employee orders enter the company parser.
 if(!forwarded&&!orders.some(o=>o.employeeId&&o.body))return false;
 const {data}=await api.readState(env,userId);
 if(classifyIncomingMessage({message,orders,accounts:data.accounts}).route!=='company-order')return false;
 const sourceId=Number.isSafeInteger(message.message_id)?'msg-'+userId+'-'+message.message_id:undefined;
 const stamp=message.forward_origin?.date||message.forward_date,date=clockAt(stamp?new Date(stamp*1000):new Date(),data.settings?.timeZone||DEFAULT_ZONE).date;
 if(data.settings.modules?.lunch===false&&!/обед\s+(?:компании|от работодателя)/iu.test(text))return false;
 if(active)await pauseLunchEdit(env,userId);
 if(orders.length>1){const selected=data.settings.lunchEmployeeId&&orders.filter(o=>o.employeeId===data.settings.lunchEmployeeId);if(selected?.length===1){await openOrder(env,userId,selected[0],date,api,sourceId);return true;}if(orders.length>40)throw Error('Перешли свой заказ отдельно: в списке больше 40 заказов');const id=await insert(env,userId,{orders,date},'choose',sourceId);await api.telegram(env,'sendMessage',{chat_id:userId,text:'В пересылке несколько заказов. Какой записать тебе?',reply_markup:{inline_keyboard:orders.map((o,i)=>[{text:(o.name+' · №'+o.employeeId).slice(0,60),callback_data:'lc:pick:'+id+':'+i}])}});return true;}
 await openOrder(env,userId,orders[0],date,api,sourceId);return true;
}
export async function lunchChatCallback(env,userId,callback,api){
 if(!(callback.data||'').startsWith('lc:'))return false;const [,action,id,argument]=callback.data.split(':'),row=await draft(env,userId,id),payload=row.payload;
 const answer=text=>api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text});
 if(action==='pick'){
  if(row.status!=='choose'||!/^\d+$/.test(argument||'')||!payload.orders?.[Number(argument)])throw Error('Выбери заказ заново');
  // The command is claimed before the external Telegram send. Two rapid taps
  // cannot create two independent active confirmations for one choice.
  const claimed=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='choosing',lease_until=? WHERE id=? AND user_id=? AND status='choose'").bind(Date.now()+60000,id,userId).run();
  if(!claimed.meta.changes)throw Error('Заказ уже выбран или обрабатывается');
  try {await openOrder(env,userId,payload.orders[Number(argument)],payload.date,api,id+'-pick-'+argument);
   await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded',lease_until=0 WHERE id=? AND user_id=? AND status='choosing'").bind(id,userId).run();
  }catch(e){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='choose',lease_until=0 WHERE id=? AND user_id=? AND status='choosing'").bind(id,userId).run();throw e;}
  try{await api.telegram(env,'editMessageReplyMarkup',{chat_id:userId,message_id:callback.message.message_id,reply_markup:{inline_keyboard:[]}});}catch{}
  await answer('Заказ выбран');return true;
 }
 if(row.status==='saved'){await answer('Уже записано');return true;}
 if(!['open','editing'].includes(row.status))throw Error('Эта карточка отменена или заменена. Используй последнюю.');
 if(action==='cancel'){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('open','editing')").bind(id,userId).run();await answer('Отменено');await api.telegram(env,'editMessageText',{chat_id:userId,message_id:callback.message.message_id,text:'Обед отменён. Ничего не записано.',reply_markup:{inline_keyboard:[]}});return true;}
 // Existing lc:* cards are compatibility inputs only. They enter the same
 // form as newly recognized orders; this module never saves a transaction.
 if(!['save','edit','field'].includes(action))throw Error('Используй последнюю карточку');
 const prior=await env.DB.prepare('SELECT result FROM user_idempotency WHERE user_id=? AND id=?').bind(userId,'lunch-chat:'+id).first();
 if(prior){await answer('Уже записано');return true;}
 const claim=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='saving',lease_until=? WHERE id=? AND user_id=? AND status IN ('open','editing')").bind(Date.now()+60000,id,userId).run();
 if(!claim.meta.changes){await answer('Карточка уже обрабатывается');return true;}
 try{await openPayload(env,userId,id,payload,api);}
 finally{await env.DB.prepare("UPDATE lunch_chat_drafts SET status='open',lease_until=0 WHERE id=? AND user_id=? AND status='saving'").bind(id,userId).run();}
 await answer('Открыта общая форма. Проверь запись.');return true;
}

export async function pruneLunchChat(env){await ensure(env);await env.DB.prepare('DELETE FROM lunch_chat_drafts WHERE expires_at<?').bind(Date.now()).run();}

export async function pauseLunchEdit(env,userId){
 await ensure(env);
 const result=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded' WHERE user_id=? AND status='editing' AND expires_at>?").bind(userId,Date.now()).run();
 return result.meta.changes>0;
}
