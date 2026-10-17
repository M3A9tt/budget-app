import {TEST_MESSAGE_TYPES} from '../src/test-message-types.js';
import {expenseReminder,lunchReminder,paymentReminder} from './notifications.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {duePayments} from '../src/due-payments.js';
import {releaseText} from '../src/release-notes.js';
export function testMessage(data,type,summary,now=new Date(),appUrl){
 if(!TEST_MESSAGE_TYPES.some(([id])=>id===type))throw Error('Неизвестный тип сообщения');
 const today=clockAt(now,data.settings?.timeZone||DEFAULT_ZONE).date,shift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);let body;
 if(type==='expense')body=expenseReminder(data,today);
 if(type==='lunch')body=lunchReminder(today);
 if(type==='planned'){const due=duePayments(data,today);body=paymentReminder(due.length?due:[{kind:'plan',id:'example',period:'once',date:today,name:'Пример платежа · тестовые данные',amount:500,currency:'RUB'}]);}
 if(['day','week','month'].includes(type)){let from=type==='week'?shift(-6):today,to=today;if(type==='month'){const end=new Date(today+'T12:00:00Z');end.setUTCDate(0);to=end.toISOString().slice(0,10);from=to.slice(0,8)+'01';}body={text:summary(data,from,to,{day:'Итог дня',week:'Итог недели',month:'Итог месяца'}[type])};}
 if(type==='release'){body={text:releaseText()};if(appUrl)body.reply_markup={inline_keyboard:[[{text:'Что нового',callback_data:'b:v:updates'}]]};}
 // Keep real templates, but sandbox callback buttons before they reach production handlers.
 if(body.reply_markup)body={...body,reply_markup:{inline_keyboard:body.reply_markup.inline_keyboard.map(row=>row.map(button=>button.callback_data?{...button,callback_data:'test:'+type}:button))}};
 const lines=body.text.split('\n');lines[0]+=' · Тест';body.text=lines.join('\n')+'\n\n🧪 Тестовое сообщение. Кнопки ответа не меняют бюджет и напоминания.';return body;
}
const ready=new WeakSet();
async function ensure(env){if(ready.has(env.DB))return;await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_notification_tests(user_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,id))').run();ready.add(env.DB);}
export async function sendTestMessage(env,userId,data,input,send,summary){
 if(!input||Object.keys(input).some(k=>!['id','type'].includes(k))||!/^[a-f0-9-]{36}$/.test(input.id||'')||!TEST_MESSAGE_TYPES.some(([id])=>id===input.type))throw Error('Неверный тестовый запрос');
 const body=testMessage(data,input.type,summary,new Date(),env.MINI_APP_URL);await ensure(env);const now=Date.now();await env.DB.prepare('DELETE FROM user_notification_tests WHERE created_at<?').bind(now-86400000).run();
 await env.DB.prepare('INSERT OR IGNORE INTO user_notification_tests(user_id,id,kind,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM user_notification_tests WHERE user_id=? AND created_at>?)<12').bind(userId,input.id,input.type,now,userId,now-60000).run();
 const row=await env.DB.prepare('SELECT * FROM user_notification_tests WHERE user_id=? AND id=?').bind(userId,input.id).first();if(!row)throw Error('Слишком много тестов. Повтори через минуту.');if(row.kind!==input.type)throw Error('Ключ уже использован для другого типа');if(row.sent)return {sent:true,duplicate:true};
 const claim=await env.DB.prepare('UPDATE user_notification_tests SET lease_until=? WHERE user_id=? AND id=? AND sent=0 AND lease_until<=?').bind(now+60000,userId,input.id,now).run();if(!claim.meta.changes)throw Error('Этот тест уже отправляется');
 try{await send(env,'sendMessage',{chat_id:String(userId),...body});await env.DB.prepare('UPDATE user_notification_tests SET sent=1,lease_until=0 WHERE user_id=? AND id=?').bind(userId,input.id).run();return {sent:true};}catch(e){await env.DB.prepare('UPDATE user_notification_tests SET lease_until=0 WHERE user_id=? AND id=?').bind(userId,input.id).run();throw e;}
}
