import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {parseMoney} from '../src/ledger.js';
export async function ensureHabits(env){await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_day_checks(user_id TEXT NOT NULL,day TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,day,kind))').run();}
export async function dayChecks(env,userId,day){await ensureHabits(env);return(await env.DB.prepare('SELECT * FROM user_day_checks WHERE user_id=? AND day=?').bind(userId,day).all()).results;}
export async function setDayCheck(env,userId,day,kind,status,payload={}){await ensureHabits(env);await env.DB.prepare('INSERT INTO user_day_checks(user_id,day,kind,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(user_id,day,kind) DO UPDATE SET status=excluded.status,payload=excluded.payload').bind(userId,day,kind,status,JSON.stringify(payload)).run();}
const reasons={late:'Опоздал',vacation:'Отпуск',unpaid:'Неоплачиваемый отпуск',sick:'Больничный',other:'Другое'};
export async function habitCallback(env,userId,callback,api){
 const value=callback.data||'';if(!value.startsWith('check:')&&!value.startsWith('lunch:'))return false;
 const [prefix,day,action,argument]=value.split(':'),kind=prefix==='check'?'expense':'lunch',state=await api.readState(env,userId),clock=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE);
 if(day!==clock.date)throw Error('Этот вопрос за прошлый день. Открой приложение для записи задним числом.');
 const row=(await dayChecks(env,userId,day)).find(r=>r.kind===kind);
 if(!row)throw Error('Вопрос больше не активен.');
 const payload=JSON.parse(row.payload),send=text=>api.telegram(env,'sendMessage',{chat_id:userId,text});
 if(action==='off'){
  await api.mutateState(env,userId,d=>({...d,settings:{...d.settings,[kind==='expense'?'expenseCheckEnabled':'lunchAskEnabled']:false,...(kind==='expense'?{reminders:false}:{})}}));
  await setDayCheck(env,userId,day,kind,'off');await send('Отключено. Включить снова можно в мини-аппе: Настройки → Твой ритм.');
 }else if(kind==='expense'){
  if(!['done','none','pending','later'].includes(action))throw Error('Неизвестный ответ');
  if(['done','none'].includes(row.status)){await send('Этот день уже подтверждён. Повторов больше не будет.');}
  else {await setDayCheck(env,userId,day,kind,action==='later'?'pending':action,action==='later'?{nextMinute:clock.minutes+60}:{});await send(action==='done'?'Принято ✅ Сегодня больше не спрашиваю.':action==='none'?'Без трат — тоже ответ ✅ Сегодня больше не спрашиваю.':action==='later'?(clock.minutes+60<=1439?'Хорошо, спрошу через час.':'Уже поздно, сегодня больше не буду спрашивать.'):'Дозапиши расходы в мини-аппе или сообщением боту. Проверю в следующее выбранное время.');}
 }else if(['recorded','skipped'].includes(row.status)){await send('Ответ за этот день уже сохранён. Изменить учёт можно в мини-аппе.');}
 else if(action==='company'){
  const state=await api.readState(env,userId);
  if(state.data.transactions.some(t=>t.date===day&&(t.type==='lunch'||t.cat==='lunch'))){await setDayCheck(env,userId,day,kind,'recorded');await send('Обед за этот день уже есть в учёте.');}
  else {await setDayCheck(env,userId,day,kind,'amount',{type:'company'});await api.telegram(env,'sendMessage',{chat_id:userId,text:'Сколько стоил обед за счёт компании? Только сумма в ₽, например 379,50. /cancel — отменить ввод.',reply_markup:{force_reply:true}});}
 }else if(action==='own'){
  const {data}=await api.readState(env,userId),accounts=data.accounts.filter(a=>(a.currency||'RUB')==='RUB');
  if(!accounts.length){await send('Сначала добавь рублёвый счёт в мини-аппе. Затем нажми «Купил за свои» ещё раз.');}
  else {await setDayCheck(env,userId,day,kind,'account',{choices:accounts.map(a=>a.id)});await api.telegram(env,'sendMessage',{chat_id:userId,text:'С какого счёта оплатил обед? Это будет обычный расход. Если платил не в рублях — внеси через мини-аппу.',reply_markup:{inline_keyboard:accounts.slice(0,30).map((a,i)=>[{text:a.name.slice(0,50),callback_data:'lunch:'+day+':account:'+i}])}});}
 }else if(action==='account'){
  if(row.status!=='account'||!/^\d+$/.test(argument||'')||!payload.choices?.[Number(argument)])throw Error('Выбери счёт заново');
  await setDayCheck(env,userId,day,kind,'amount',{type:'own',accountId:payload.choices[Number(argument)]});await api.telegram(env,'sendMessage',{chat_id:userId,text:'Сколько потратил на обед? Только сумма в ₽. /cancel — отменить ввод.',reply_markup:{force_reply:true}});
 }else if(action==='skip'){
  await api.telegram(env,'sendMessage',{chat_id:userId,text:'Почему не заказал? Причина нужна только для учёта рабочих дней.',reply_markup:{inline_keyboard:Object.entries(reasons).map(([key,label])=>[{text:label,callback_data:'lunch:'+day+':reason:'+key}])}});
 }else if(action==='reason'){
  if(!reasons[argument])throw Error('Неизвестная причина');
  await api.mutateState(env,userId,d=>({...d,lunchAnswers:{...d.lunchAnswers,[day]:{status:'skipped',reason:reasons[argument]}},lunchDayOff:['vacation','unpaid','sick'].includes(argument)?[...new Set([...(d.lunchDayOff||[]),day])]:d.lunchDayOff}));
  await setDayCheck(env,userId,day,kind,'skipped',{reason:argument});await send('Сохранено: '+reasons[argument]+'.'+(['vacation','unpaid','sick'].includes(argument)?' День исключён из обеденного лимита.':' Рабочий день остаётся в лимите.'));
 }else throw Error('Неизвестный ответ');
 await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Принято'});return true;
}
export async function habitAmount(env,userId,text,api){
 const state=await api.readState(env,userId),day=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE).date,row=(await dayChecks(env,userId,day)).find(r=>r.kind==='lunch'&&r.status==='amount');
 if(!row)return false;
 if(text==='/cancel'){await setDayCheck(env,userId,day,'lunch','open');await api.telegram(env,'sendMessage',{chat_id:userId,text:'Ввод обеда отменён. Ничего не записано.'});return true;}
 if(text.startsWith('/'))return false;
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim())){await api.telegram(env,'sendMessage',{chat_id:userId,text:'Жду только сумму обеда, например 379,50. /cancel — отменить и вернуться к обычным записям.'});return true;}
 const amount=parseMoney(text),payload=JSON.parse(row.payload);if(amount<=0)throw Error('Сумма должна быть больше нуля');
 const id=crypto.randomUUID(),tx={type:payload.type==='company'?'lunch':'expense',cat:payload.type==='company'?'lunch':'food',amount,currency:'RUB',date:day,accountId:payload.accountId,note:payload.type==='company'?'Обед за счёт компании':'Обед за свой счёт',paymentMethod:'unknown',tags:[],_lunchCheckDay:day};
 await env.DB.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at WHERE telegram_drafts.consumed=0').bind(id,userId,JSON.stringify(tx),Date.now()+600000).run();
 await api.telegram(env,'sendMessage',{chat_id:userId,text:'Проверь: '+tx.note+' · '+amount+' ₽\n'+(payload.type==='company'?'Личные счета не изменятся.':'Спишется с выбранного счёта.')+'\nНажми «Записать», чтобы подтвердить.',reply_markup:{inline_keyboard:[[{text:'Записать',callback_data:'save:'+id}]]}});return true;
}
