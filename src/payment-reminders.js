import {scheduledEvents,moveDate} from './finance-events.js';
import {clockAt} from './time-settings.js';
export function localReminderInstant(data,date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Выбери дату и время напоминания');
 const desired=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(desired))throw Error('Неверная дата');
 let at=desired;for(let i=0;i<3;i++){const c=clockAt(new Date(at),data.settings.timeZone),shown=Date.parse(c.date+'T'+String(c.hour).padStart(2,'0')+':'+String(c.minute).padStart(2,'0')+':00Z');at+=desired-shown;}
 const c=clockAt(new Date(at),data.settings.timeZone);if(c.date!==date||c.minutes!==Number(time.slice(0,2))*60+Number(time.slice(3)))throw Error('Такого времени нет в выбранном часовом поясе');return at;
}
export function setPaymentReminder(data,eventId,date,time,now=Date.now()){
 const today=clockAt(new Date(now),data.settings.timeZone).date,at=localReminderInstant(data,date,time),scope={...data,recurring:data.recurring.filter(r=>eventId.startsWith('plan:'+r.id+':')),installments:(data.installments||[]).filter(p=>p.payments.some(x=>eventId==='installment:'+x.id)),debts:(data.debts||[]).filter(d=>eventId==='debt:'+d.id)},rule=scope.recurring[0],end=[moveDate(today,['daily','weekly'].includes(rule?.frequency)?30:3660),rule?.frequency==='once'?rule.startDate:''].sort().at(-1),event=scheduledEvents(scope,today,end).find(e=>e.id===eventId);
 if(!event||at<=now)throw Error('Платёж изменился или время напоминания уже прошло');
 return {...data,paymentReminders:{...data.paymentReminders,[eventId]:{at,date:event.date}}};
}
export function paymentReminderEvents(data,now){
 if(!Object.keys(data.paymentReminders||{}).length)return [];
 const reminders=Object.entries(data.paymentReminders),today=clockAt(new Date(now),data.settings.timeZone).date;
 const ids=new Set(reminders.map(([id])=>id)),end=[today,...reminders.map(([,r])=>r.date)].sort().at(-1),scope={...data,recurring:data.recurring.filter(r=>reminders.some(([id])=>id.startsWith('plan:'+r.id+':'))),installments:(data.installments||[]).filter(p=>p.payments.some(x=>ids.has('installment:'+x.id))),debts:(data.debts||[]).filter(d=>ids.has('debt:'+d.id))};
 const events=scheduledEvents(scope,today,end);
 return Object.entries(data.paymentReminders||{}).flatMap(([id,r])=>{const event=events.find(e=>e.id===id&&e.date===r.date);return event&&r.at<=now&&now-r.at<86400000?[{...event,at:r.at}]:[];});
}
