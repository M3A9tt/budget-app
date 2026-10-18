import {correctionBelongsToDraft} from './dialog-focus.js';
import {validDate} from '../src/finance-tools.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {parseMoney} from '../src/ledger.js';
export async function ensureHabits(env){await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_day_checks(user_id TEXT NOT NULL,day TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,day,kind))').run();}
export async function dayChecks(env,userId,day){await ensureHabits(env);return(await env.DB.prepare('SELECT * FROM user_day_checks WHERE user_id=? AND day=?').bind(userId,day).all()).results;}
export async function notificationChecks(env,userId,day){await ensureHabits(env);return(await env.DB.prepare("SELECT * FROM user_day_checks WHERE user_id=? AND (day=? OR (kind='expense' AND status='pending'))").bind(userId,day).all()).results;}
export async function setDayCheck(env,userId,day,kind,status,payload={}){await ensureHabits(env);await env.DB.prepare('INSERT INTO user_day_checks(user_id,day,kind,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(user_id,day,kind) DO UPDATE SET status=excluded.status,payload=excluded.payload').bind(userId,day,kind,status,JSON.stringify(payload)).run();}
const reasons={late:'Опоздал',vacation:'Отпуск',unpaid:'Неоплачиваемый отпуск',sick:'Больничный',other:'Другое'};
export async function habitCallback(env,userId,callback,api){
 const value=callback.data||'';if(!value.startsWith('check:')&&!value.startsWith('lunch:'))return false;
 const [prefix,day,action,argument]=value.split(':'),kind=prefix==='check'?'expense':'lunch',state=await api.readState(env,userId),clock=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE);
 if(!validDate(day)||day>clock.date)throw Error('Некорректная дата вопроса.');
 const row=(await dayChecks(env,userId,day)).find(r=>r.kind===kind);
 if(!row)throw Error('Вопрос больше не активен.');
 const payload=JSON.parse(row.payload),send=text=>api.telegram(env,'sendMessage',{chat_id:userId,text});
 const transition=async(status,nextPayload={})=>{const result=await env.DB.prepare("UPDATE user_day_checks SET status=?,payload=? WHERE user_id=? AND day=? AND kind='expense' AND status=? AND payload=?").bind(status,JSON.stringify(nextPayload),userId,day,row.status,row.payload).run();return result.meta.changes===1;};
 const answer=text=>api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text});
 const close=async text=>{try{const rows=callback.message.reply_markup?.inline_keyboard;if(rows?.flat().some(b=>b.callback_data?.startsWith('b:'))){await api.telegram(env,'editMessageReplyMarkup',{chat_id:userId,message_id:callback.message.message_id,reply_markup:{inline_keyboard:rows.map(r=>r.filter(b=>!b.callback_data?.startsWith('check:'+day+':'))).filter(r=>r.length)}});return;}await api.telegram(env,'editMessageText',{chat_id:userId,message_id:callback.message.message_id,text,reply_markup:{inline_keyboard:[]}});}catch{/* Deleted and already edited reminders still accept the persisted answer. */}};
 if(action==='off'){
  await api.mutateState(env,userId,d=>({...d,settings:{...d.settings,[kind==='expense'?'expenseCheckEnabled':'lunchAskEnabled']:false,...(kind==='expense'?{reminders:false}:{})}}));
  await setDayCheck(env,userId,day,kind,'off');await close('Проверки отключены. Включить снова: Ещё → Настройки → Напоминания и сводки.');
 }else if(kind==='expense'){
  if(!['done','none','pending','later'].includes(action))throw Error('Неизвестный ответ');
  if(['done','none','off'].includes(row.status)){
   await close('Учёт за '+day+' завершён ✅');await answer('Этот день уже подтверждён. Повторной записи нет.');return true;
  }
  if(action==='none'&&state.data.transactions.some(t=>t.date===day&&t.type==='expense'&&t.cat!=='lunch')){
   await answer('За этот день уже есть расходы. Проверь их и нажми «Всё записал».');return true;
  }
  if(action==='pending'){
   const token={inputToken:crypto.randomUUID()};
   if(!await transition('editing',token)){await answer('Ответ уже изменился. Используй последнее сообщение.');return true;}
   try{await close('Дописываем расходы за '+day+'. Завершить проверку можно после записи.');await api.openExpense(day);}catch(error){await env.DB.prepare("UPDATE user_day_checks SET status=?,payload=? WHERE user_id=? AND day=? AND kind='expense' AND status='editing' AND payload=?").bind(row.status,row.payload,userId,day,JSON.stringify(token)).run();throw error;}
  }else if(action==='later'){
   if(payload.snoozedMessageId===callback.message.message_id&&payload.nextAt){await answer('Отсрочка уже установлена.');return true;}
   const nextAt=Date.now()+60*60000,when=clockAt(new Date(nextAt),state.data.settings?.timeZone||DEFAULT_ZONE);
   if(!await transition('pending',{nextAt,snoozedMessageId:callback.message.message_id})){await answer('Ответ уже изменился. Используй последнее сообщение.');return true;}
   await close('Расходы за '+day+': напомню '+when.date+' в '+String(when.hour).padStart(2,'0')+':'+String(when.minute).padStart(2,'0')+'.');
  }else{
   if(!await transition(action)){await answer('Ответ уже изменился. Используй последнее сообщение.');return true;}await close('Учёт за '+day+' завершён ✅'+(action==='none'?' Трат не было.':''));
  }
 }else if(['recorded','skipped'].includes(row.status)){await send('Ответ за этот день уже сохранён. Изменить учёт можно через «Обеды» и «История» в меню бота.');}
 else if(action==='company'){
  const state=await api.readState(env,userId);
  if(state.data.transactions.some(t=>t.date===day&&(t.type==='lunch'||t.cat==='lunch'))){await setDayCheck(env,userId,day,kind,'recorded');await send('Обед за этот день уже есть в учёте.');}
  else await askLunchAmount(env,userId,day,{type:'company'},api);
 }else if(action==='own'){
  const {data}=await api.readState(env,userId),accounts=data.accounts.filter(a=>(a.currency||'RUB')==='RUB');
  if(!accounts.length){await send('Сначала добавь рублёвый счёт: Ещё → Счета. Затем нажми «Купил за свои» ещё раз.');}
  else {await setDayCheck(env,userId,day,kind,'account',{choices:accounts.map(a=>a.id)});await api.telegram(env,'sendMessage',{chat_id:userId,text:'С какого счёта оплатил обед? Это будет обычный расход. Для другой валюты выбери «Записать» в меню бота.',reply_markup:{inline_keyboard:accounts.slice(0,30).map((a,i)=>[{text:a.name.slice(0,50),callback_data:'lunch:'+day+':account:'+i}])}});}
 }else if(action==='account'){
  if(row.status!=='account'||!/^\d+$/.test(argument||'')||!payload.choices?.[Number(argument)])throw Error('Выбери счёт заново');
  await askLunchAmount(env,userId,day,{type:'own',accountId:payload.choices[Number(argument)]},api);
 }else if(action==='skip'){
  await api.telegram(env,'sendMessage',{chat_id:userId,text:'Почему не заказал? Причина нужна только для учёта рабочих дней.',reply_markup:{inline_keyboard:Object.entries(reasons).map(([key,label])=>[{text:label,callback_data:'lunch:'+day+':reason:'+key}])}});
 }else if(action==='reason'){
  if(!reasons[argument])throw Error('Неизвестная причина');
  await api.mutateState(env,userId,d=>({...d,lunchAnswers:{...d.lunchAnswers,[day]:{status:'skipped',reason:reasons[argument]}},lunchDayOff:['vacation','unpaid','sick'].includes(argument)?[...new Set([...(d.lunchDayOff||[]),day])]:d.lunchDayOff}));
  await setDayCheck(env,userId,day,kind,'skipped',{reason:argument});await send('Сохранено: '+reasons[argument]+'.'+(['vacation','unpaid','sick'].includes(argument)?' День исключён из обеденного лимита.':' Рабочий день остаётся в лимите.'));
 }else throw Error('Неизвестный ответ');
 await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Принято'});return true;
}
async function askLunchAmount(env,userId,day,payload,api){
 await ensureHabits(env);
 // Only one meal question may own bare amounts at a time, across midnight too.
 await env.DB.prepare("UPDATE user_day_checks SET status='open' WHERE user_id=? AND kind='lunch' AND status='amount'").bind(userId).run();
 const prompt=await api.telegram(env,'sendMessage',{chat_id:userId,text:'Обед за '+day+'. '+(payload.type==='company'?'Сколько стоил обед за счёт компании?':'Сколько потратил на обед?')+' Только сумма в ₽, например 379,50. /cancel — отменить ввод.',reply_markup:{force_reply:true}});
 await setDayCheck(env,userId,day,'lunch','amount',{...payload,promptId:prompt?.message_id});
}
export async function pauseHabitInput(env,userId){
 await ensureHabits(env);await env.DB.prepare("UPDATE user_day_checks SET status='open' WHERE user_id=? AND kind='lunch' AND status='amount'").bind(userId).run();
}
export async function habitAmount(env,userId,message,api){
 await ensureHabits(env);
 const text=(message.text||'').trim();
 const rows=(await env.DB.prepare("SELECT * FROM user_day_checks WHERE user_id=? AND kind='lunch' AND status='amount' ORDER BY day DESC").bind(userId).all()).results;
 const row=rows.find(r=>correctionBelongsToDraft(message,'amount',JSON.parse(r.payload).promptId));
 if(['/cancel','Отмена'].includes(text)&&rows.length){await pauseHabitInput(env,userId);await api.telegram(env,'sendMessage',{chat_id:userId,text:'Ввод обеда отменён. Ничего не записано.'});return true;}
 if(!row)return false;
 const day=row.day;
 if(text.startsWith('/'))return false;
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim())){await api.telegram(env,'sendMessage',{chat_id:userId,text:'Жду только сумму обеда, например 379,50. /cancel — отменить и вернуться к обычным записям.'});return true;}
 const amount=parseMoney(text),payload=JSON.parse(row.payload);if(amount<=0)throw Error('Сумма должна быть больше нуля');
 const id=crypto.randomUUID(),tx={type:payload.type==='company'?'lunch':'expense',cat:payload.type==='company'?'lunch':'food',amount,currency:'RUB',date:day,accountId:payload.accountId,note:payload.type==='company'?'Обед за счёт компании':'Обед за свой счёт',paymentMethod:'unknown',tags:payload.type==='company'?[]:['обед-за-свои'],_lunchCheckDay:day};
 await env.DB.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at WHERE telegram_drafts.consumed=0').bind(id,userId,JSON.stringify(tx),Date.now()+600000).run();
 await api.telegram(env,'sendMessage',{chat_id:userId,text:'Проверь: '+tx.note+' · '+amount+' ₽\n'+(payload.type==='company'?'Личные счета не изменятся.':'Спишется с выбранного счёта.')+'\nНажми «Записать», чтобы подтвердить.',reply_markup:{inline_keyboard:[[{text:'Записать',callback_data:'save:'+id}]]}});return true;
}
