import {lunchReminderAnswered} from './lunch-entry.js';
import {validDate} from '../src/finance-tools.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
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
 if(kind==='expense'&&action==='history'){
  await api.showExpenseHistory(day);await answer('Записи за '+day);return true;
 }
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
 }else if(row.status==='skipped'||lunchReminderAnswered(state.data,day)){await answer('Ответ уже сохранён. Изменить его можно в «Обедах» и «Истории».');return true;}
 else if(action==='company'){
  await api.openLunch(day,'company');
 }else if(action==='own'){
  const {data}=await api.readState(env,userId),accounts=data.accounts.filter(a=>(a.currency||'RUB')==='RUB');
  if(!accounts.length){await send('Сначала добавь рублёвый счёт: Ещё → Счета. Затем нажми «Купил за свои» ещё раз.');}
  else await api.openLunch(day,'own');
 }else if(action==='account'){
  if(row.status!=='account'||!/^\d+$/.test(argument||'')||!payload.choices?.[Number(argument)])throw Error('Выбери счёт заново');
  await api.openLunch(day,'own',{accountId:payload.choices[Number(argument)]});
 }else if(action==='skip'){
  await api.telegram(env,'sendMessage',{chat_id:userId,text:'Почему не заказал? Причина нужна только для учёта рабочих дней.',reply_markup:{inline_keyboard:Object.entries(reasons).map(([key,label])=>[{text:label,callback_data:'lunch:'+day+':reason:'+key}])}});
 }else if(action==='reason'){
  if(!reasons[argument])throw Error('Неизвестная причина');
  await api.mutateState(env,userId,d=>({...d,lunchAnswers:{...d.lunchAnswers,[day]:{status:'skipped',reason:reasons[argument]}},lunchDayOff:['vacation','unpaid','sick'].includes(argument)?[...new Set([...(d.lunchDayOff||[]),day])]:d.lunchDayOff}));
  await setDayCheck(env,userId,day,kind,'skipped',{reason:argument});await send('Сохранено: '+reasons[argument]+'.'+(['vacation','unpaid','sick'].includes(argument)?' День исключён из обеденного лимита.':' Рабочий день остаётся в лимите.'));
 }else throw Error('Неизвестный ответ');
 await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Принято'});return true;
}
export async function pauseLegacyLunchInput(env,userId){
 await ensureHabits(env);await env.DB.prepare("UPDATE user_day_checks SET status='open' WHERE user_id=? AND kind='lunch' AND status='amount'").bind(userId).run();
}
