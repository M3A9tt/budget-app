import {classifyIncomingMessage} from '../src/input-intent.js';
import {correctionBelongsToDraft} from './dialog-focus.js';
import {lunchOrders,parseLunchOrder,recognitionCorrection} from '../src/lunch-recognition.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {lunchDayRatio,companyLunch,lunchCalendarVerified} from '../src/lunch-budget.js';
import {money} from '../src/mini-model.js';
import {queueCorrection,parserRules} from './lunch-learning.js';
const ready=new WeakSet();
async function ensure(env){if(ready.has(env.DB))return;await env.DB.prepare('CREATE TABLE IF NOT EXISTS lunch_chat_drafts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,field TEXT NOT NULL DEFAULT \'\',expires_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0)').run();ready.add(env.DB);}
async function draft(env,userId,id){await ensure(env);const row=await env.DB.prepare('SELECT * FROM lunch_chat_drafts WHERE id=? AND user_id=?').bind(id,userId).first();if(!row||row.expires_at<Date.now())throw Error('Карточка устарела. Перешли заказ заново.');if(['saving','choosing'].includes(row.status)&&row.lease_until<Date.now()){const fallback=row.status==='saving'?'open':'choose',expired=row.status;const recovered=await env.DB.prepare("UPDATE lunch_chat_drafts SET status=?,lease_until=0 WHERE id=? AND user_id=? AND status=? AND lease_until<?").bind(fallback,id,userId,expired,Date.now()).run();if(recovered.meta.changes)row.status=fallback;}return {...row,payload:JSON.parse(row.payload)};}
async function insert(env,userId,payload,status='open'){await ensure(env);const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO lunch_chat_drafts(id,user_id,payload,status,expires_at) VALUES(?,?,?,?,?)').bind(id,userId,JSON.stringify(payload),status,Date.now()+30*60000).run();await env.DB.prepare('DELETE FROM lunch_chat_drafts WHERE expires_at<?').bind(Date.now()-86400000).run();return id;}
async function card(env,userId,id,payload,api){const {data}=await api.readState(env,userId),tx=payload.tx,today=clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date,limit=(data.settings.lunchDaily??400)*lunchDayRatio(data,tx.date),previous=data.transactions.filter(t=>companyLunch(t)&&t.date===tx.date).reduce((n,t)=>n+(t.amountRub??t.amount),0),difference=tx.amount===null?null:Math.round((limit-previous-tx.amount)*100)/100;
 const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10),dateLabel=tx.date===today?'Сегодня':tx.date===yesterday?'Вчера':tx.date;
 const text=[`🍽 Обед · ${tx.amount===null?'уточнить сумму':money(tx.amount)}`,dateLabel,`Блюда:\n${tx.note||'Не указаны'}`,difference===null?null:`${difference>=0?'🟢 Профицит':'🔴 Дефицит'} дня после записи: ${money(Math.abs(difference))}`,previous?`Уже записано за день: ${money(previous)}`:null,tx.date>today?'Дата в будущем — исправь перед записью.':null,!lunchCalendarVerified(data,tx.date)?'⚠️ Календарь года ещё не проверен: лимит предварительный.':null,...(payload.parsed.warning||[]),'Оплачивает компания. Сохраним только после подтверждения.'].filter(x=>x!==null).join('\n');
 const rows=[];if(tx.amount!==null&&tx.date<=today)rows.push([{text:'✅ Всё верно',callback_data:'lc:save:'+id}]);rows.push([{text:'✏️ Исправить',callback_data:'lc:edit:'+id},{text:'✖️ Отмена',callback_data:'lc:cancel:'+id}]);await api.telegram(env,'sendMessage',{chat_id:userId,text,reply_markup:{inline_keyboard:rows}});
}
async function openOrder(env,userId,order,date,api){const parsed=parseLunchOrder(order.body,date,await parserRules(env)),payload={parsed,tx:{type:'lunch',cat:'lunch',amount:parsed.amount,currency:'RUB',date:parsed.date,note:parsed.note,paymentMethod:'unknown'},corrected:false};const id=await insert(env,userId,payload);await card(env,userId,id,payload,api);}
export async function lunchChatMessage(env,userId,message,api){
 await ensure(env);const text=(message.text||message.caption||'').trim();if(!text)return false;
 const active=await env.DB.prepare("SELECT * FROM lunch_chat_drafts WHERE user_id=? AND status='editing' AND expires_at>? ORDER BY rowid DESC LIMIT 1").bind(userId,Date.now()).first();
 if(active&&correctionBelongsToDraft(message,active.field,JSON.parse(active.payload).promptId)){const value=recognitionCorrection(active.field,text),payload=JSON.parse(active.payload);payload.tx[active.field]=value;payload.corrected=true;const claimed=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded' WHERE id=? AND user_id=? AND status='editing'").bind(active.id,userId).run();if(!claimed.meta.changes)throw Error('Эта правка уже обработана');const id=await insert(env,userId,payload);await card(env,userId,id,payload,api);return true;}
 if(['/cancel','Отмена'].includes(text)&&active){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='cancelled' WHERE id=? AND user_id=? AND status='editing'").bind(active.id,userId).run();await api.telegram(env,'sendMessage',{chat_id:userId,text:'Обед отменён. Ничего не записано.'});return true;}
 if(text.startsWith('/'))return false;
 const forwarded=!!(message.forward_origin||message.forward_date),orders=lunchOrders(text);
 // Only forwarded messages and clearly identified employee orders enter the company parser.
 if(!forwarded&&!orders.some(o=>o.employeeId&&o.body))return false;
 const {data}=await api.readState(env,userId);
 if(classifyIncomingMessage({message,orders,accounts:data.accounts}).route!=='company-order')return false;
 const stamp=message.forward_origin?.date||message.forward_date,date=clockAt(stamp?new Date(stamp*1000):new Date(),data.settings?.timeZone||DEFAULT_ZONE).date;
 if(data.settings.modules?.lunch===false&&!/обед\s+(?:компании|от работодателя)/iu.test(text))return false;
 if(active)await pauseLunchEdit(env,userId);
 if(orders.length>1){const selected=data.settings.lunchEmployeeId&&orders.filter(o=>o.employeeId===data.settings.lunchEmployeeId);if(selected?.length===1){await openOrder(env,userId,selected[0],date,api);return true;}if(orders.length>40)throw Error('Перешли свой заказ отдельно: в списке больше 40 заказов');const id=await insert(env,userId,{orders,date},'choose');await api.telegram(env,'sendMessage',{chat_id:userId,text:'В пересылке несколько заказов. Какой записать тебе?',reply_markup:{inline_keyboard:orders.map((o,i)=>[{text:(o.name+' · №'+o.employeeId).slice(0,60),callback_data:'lc:pick:'+id+':'+i}])}});return true;}
 await openOrder(env,userId,orders[0],date,api);return true;
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
  try {await openOrder(env,userId,payload.orders[Number(argument)],payload.date,api);
   await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded',lease_until=0 WHERE id=? AND user_id=? AND status='choosing'").bind(id,userId).run();
  }catch(e){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='choose',lease_until=0 WHERE id=? AND user_id=? AND status='choosing'").bind(id,userId).run();throw e;}
  try{await api.telegram(env,'editMessageReplyMarkup',{chat_id:userId,message_id:callback.message.message_id,reply_markup:{inline_keyboard:[]}});}catch{}
  await answer('Заказ выбран');return true;
 }
 if(row.status==='saved'){await answer('Уже записано');return true;}
 if(!['open','editing'].includes(row.status))throw Error('Эта карточка отменена или заменена. Используй последнюю.');
 if(action==='cancel'){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('open','editing')").bind(id,userId).run();await answer('Отменено');await api.telegram(env,'editMessageText',{chat_id:userId,message_id:callback.message.message_id,text:'Обед отменён. Ничего не записано.',reply_markup:{inline_keyboard:[]}});return true;}
 if(action==='edit'){await answer('Выбери поле');await api.telegram(env,'sendMessage',{chat_id:userId,text:'Что исправить в обеде?',reply_markup:{inline_keyboard:[['amount','Сумму'],['note','Блюда'],['date','Дату']].map(([field,label])=>[{text:label,callback_data:'lc:field:'+id+':'+field}])}});return true;}
 if(action==='field'){if(!['amount','note','date'].includes(argument))throw Error('Неизвестное поле');await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded' WHERE user_id=? AND status='editing' AND id<>?").bind(userId,id).run();await env.DB.prepare("UPDATE lunch_chat_drafts SET status='editing',field=? WHERE id=? AND user_id=? AND status IN ('open','editing')").bind(argument,id,userId).run();await answer('Жду правку');const prompt=await api.telegram(env,'sendMessage',{chat_id:userId,text:{amount:'Напиши правильную сумму, например 340 или 340,50.',note:'Напиши правильные названия блюд.',date:'Напиши дату: 2026-10-14 или 14.10.2026.'}[argument]+' /cancel — отменить.',reply_markup:{force_reply:true}});if(prompt?.message_id)await env.DB.prepare("UPDATE lunch_chat_drafts SET payload=? WHERE id=? AND user_id=? AND status='editing' AND field=?").bind(JSON.stringify({...payload,promptId:prompt.message_id}),id,userId,argument).run();return true;}
 if(action!=='save'||row.status!=='open')throw Error('Сначала заверши правку и подтверди новую карточку');
 const now=Date.now(),claim=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='saving',lease_until=? WHERE id=? AND user_id=? AND status='open'").bind(now+60000,id,userId).run();if(!claim.meta.changes)throw Error('Обед уже обрабатывается');
 try{const state=await api.readState(env,userId),today=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE).date,tx=payload.tx;if(tx.date>today)throw Error('Будущий обед пока не записываем. Исправь дату.');if(!tx.amount)throw Error('Сначала укажи стоимость');
 // Idempotency belongs to the user command, not to its amount or memo.
  // Two genuinely separate orders may have the same date, price and dishes.
  const key='lunch-chat:'+id;
 await api.writeTransaction(env,userId,tx,key);await api.setDayCheck(env,userId,tx.date,'lunch','recorded');await env.DB.prepare("UPDATE lunch_chat_drafts SET status='saved',lease_until=0 WHERE id=? AND user_id=? AND status='saving'").bind(id,userId).run();
 try{await queueCorrection(env,userId,id,payload.parsed,{amount:tx.amount,note:tx.note},state.data.settings.lunchLearningEnabled!==false);}catch{/* Financial saving succeeds independently of optional training. */}
 await answer('Записано');await api.telegram(env,'editMessageText',{chat_id:userId,message_id:callback.message.message_id,text:'Обед записан ✅\n'+tx.note+'\n'+money(tx.amount)+' · '+tx.date,reply_markup:{inline_keyboard:[]}});
 }catch(e){await env.DB.prepare("UPDATE lunch_chat_drafts SET status='open',lease_until=0 WHERE id=? AND user_id=? AND status='saving'").bind(id,userId).run();throw e;}return true;
}

export async function pruneLunchChat(env){await ensure(env);await env.DB.prepare('DELETE FROM lunch_chat_drafts WHERE expires_at<?').bind(Date.now()).run();}

export async function pauseLunchEdit(env,userId){
 await ensure(env);
 const result=await env.DB.prepare("UPDATE lunch_chat_drafts SET status='superseded' WHERE user_id=? AND status='editing' AND expires_at>?").bind(userId,Date.now()).run();
 return result.meta.changes>0;
}
