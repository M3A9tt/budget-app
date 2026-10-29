import {scheduledEvents,moveDate} from './finance-events.js';
import {clockAt} from './time-settings.js';
export function localReminderInstant(data,date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Выбери дату и время напоминания');
 const desired=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(desired))throw Error('Неверная дата');
 let at=desired;for(let i=0;i<3;i++){const c=clockAt(new Date(at),data.settings.timeZone),shown=Date.parse(c.date+'T'+String(c.hour).padStart(2,'0')+':'+String(c.minute).padStart(2,'0')+':00Z');at+=desired-shown;}
 const c=clockAt(new Date(at),data.settings.timeZone);if(c.date!==date||c.minutes!==Number(time.slice(0,2))*60+Number(time.slice(3)))throw Error('Такого времени нет в выбранном часовом поясе');return at;
}
export function setPaymentReminder(data,eventId,date,time,now=Date.now()){
 const today=clockAt(new Date(now),data.settings.timeZone).date,at=localReminderInstant(data,date,time),event=scheduledEvents(data,today,moveDate(today,3660)).find(e=>e.id===eventId);
 if(!event||at<=now)throw Error('Платёж изменился или время напоминания уже прошло');
 return {...data,paymentReminders:{...data.paymentReminders,[eventId]:{at,date:event.date}}};
}
export function paymentReminderEvents(data,now){
 if(!Object.keys(data.paymentReminders||{}).length)return [];
 const today=clockAt(new Date(now),data.settings.timeZone).date,events=scheduledEvents(data,today,moveDate(today,3660));
 return Object.entries(data.paymentReminders||{}).flatMap(([id,r])=>{const event=events.find(e=>e.id===id&&e.date===r.date);return event&&r.at<=now&&now-r.at<86400000?[{...event,at:r.at}]:[];});
}
