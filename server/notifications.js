import {lunchDayStatus} from '../src/lunch-day-state.js';
import {attentionMessage} from './attention-message.js';
import {moveDate} from '../src/finance-events.js';
import {paymentReminderEvents,localReminderInstant} from '../src/payment-reminders.js';
import {duePayments,paymentCallback} from '../src/due-payments.js';
import {money} from '../src/mini-model.js';
import {lunchReminderDay,lunchCalendarVerified} from '../src/lunch-schedule.js';
import {clockAt,settingTime,timeMinutes,DEFAULT_ZONE} from '../src/time-settings.js';
import {moduleEnabled} from '../src/modules.js';
import {reminderText} from '../src/reminder-settings.js';
import {expenseCheckSummary} from '../src/expense-check.js';
export const moscowClock=now=>clockAt(now);
export const expenseCheckStopped=status=>['done','none','off','editing'].includes(status);
export function checkSchedule(data,today){
 const s=data.settings||{},start=timeMinutes(settingTime(s,'check',20))/60,interval=s.checkInterval??1;
 let repeats=s.checkRepeats??0;
 const last=data.transactions.filter(t=>t.type==='expense'&&t.cat!=='lunch'&&t.date<=today).map(t=>t.date).sort().at(-1)||s.checkStartedDate||today;
 const idle=Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000);
 if(s.checkEscalation===true&&idle>=(s.checkEscalationDays??3))repeats=Math.max(repeats,1);
 return Array.from({length:Math.min(3,repeats)+1},(_,i)=>start+i*interval).filter(h=>h*60<=1439);
}
export function notificationJobs(data,now,responses=[],{catchUp=false,lastRun}={}){
 const{date:today,minutes}=clockAt(now,data.settings?.timeZone||DEFAULT_ZONE),s=data.settings||{},reports=[],local=new Date(today+'T12:00:00Z');
 const due=slot=>minutes===slot||(catchUp&&minutes>slot);
 const explicitJobs=paymentReminderEvents(data,now.getTime()).map(e=>({id:'payment-once:'+e.id+':'+e.at,kind:'payment-once',day:today,eventId:e.id,eventDate:e.date,at:e.at,...paymentReminder([{...e,kind:e.source,id:e.source==='installment'?e.paymentId:e.sourceId,planId:e.sourceId,income:e.type==='income'}])}));
 if(['manual','digest'].includes(s.notificationMode)){
  const jobs=[...explicitJobs];
  let missed=false;if(s.notificationMode==='digest'&&catchUp&&Number.isFinite(lastRun))try{const slot=localReminderInstant(data,moveDate(today,-1),settingTime(s,'report',21));missed=lastRun<slot&&now.getTime()-slot<86400000;}catch{/* A nonexistent DST wall time has no previous instant to replay. */}
  if(s.notificationMode==='digest'&&(missed||due(timeMinutes(settingTime(s,'report',21))))){const message=attentionMessage(data,today,responses);if(message.count)jobs.push({id:'digest:'+today,kind:'digest',day:today,...message});}
  return jobs;
 }
 const answered=kind=>responses.find(r=>r.day===today&&r.kind===kind),expense=answered('expense'),lunch=answered('lunch');
 const slots=checkSchedule(data,today).map(h=>Math.round(h*60)),payload=expense?.payload?JSON.parse(expense.payload):{};
 const legacyMinute=payload.nextMinute??(payload.nextHour!==undefined?payload.nextHour*60:null);
 const eligible=(legacyMinute===null?slots:[legacyMinute]).filter(due),slot=eligible.length?Math.max(...eligible):null;
 if(s.expenseCheckEnabled===true){
  if(!expenseCheckStopped(expense?.status)&&!['done','none'].includes(data.dayChecks?.[today])&&!payload.nextAt&&slot!==null){
   const attempt=Math.max(0,slots.indexOf(slot));reports.push({id:'check:'+today+':'+slot,kind:'expense',day:today,attempt,...expenseReminder(data,today,attempt)});
  }
  // A chosen delay is an instant, while the question retains its original day.
  for(const response of responses.filter(r=>r.kind==='expense'&&!expenseCheckStopped(r.status))){
   const {nextAt}=JSON.parse(response.payload||'{}'),lag=now.getTime()-nextAt;
   if(Number.isFinite(nextAt)&&lag>=0&&lag<(catchUp?16:1)*60000){
    reports.push({id:'check:'+response.day+':snooze-'+nextAt,kind:'expense',day:response.day,snoozeAt:nextAt,...expenseReminder(data,response.day)});
   }
  }
 }
 const hasLunch=lunchDayStatus(data,today,responses)!=='unanswered';
 if(moduleEnabled(data,'lunch')&&s.lunchAskEnabled===true&&due(timeMinutes(settingTime(s,'lunchAsk',11)))&&lunchReminderDay(data,today)&&!hasLunch&&!lunch?.status){
  const reminder=lunchReminder(today);if(!lunchCalendarVerified(data,today))reminder.text+='\n⚠️ Календарь года ещё не проверен: рабочий день и лимит предварительные.';reports.push({id:'lunch-ask:'+today,kind:'lunch',day:today,...reminder});
 }
 if(moduleEnabled(data,'plans')&&s.plannedReminders===true&&due(timeMinutes(settingTime(s,'plannedReminder',18)))){const due=duePayments(data,today);if(due.length)reports.push({id:'planned:'+today,openPayments:true,...paymentReminder(due)});}
 if(!due(timeMinutes(settingTime(s,'report',21))))return [...reports,...explicitJobs];
 if(s.dailyReport!==false)reports.push({id:'day:'+today,from:today,to:today,title:'Итог дня'});
 if(s.weeklyReport!==false&&local.getUTCDay()===0){const from=new Date(local);from.setUTCDate(from.getUTCDate()-6);reports.push({id:'week:'+today,from:from.toISOString().slice(0,10),to:today,title:'Итог недели'});}
 if(s.monthlyReport!==false&&local.getUTCDate()===1){const end=new Date(local);end.setUTCDate(0);reports.push({id:'month:'+end.toISOString().slice(0,7),from:end.toISOString().slice(0,8)+'01',to:end.toISOString().slice(0,10),title:'Итог месяца'});}
 return [...reports,...explicitJobs];
}

export function expenseReminder(data,today,attempt=0){const s=data.settings||{},snapshot=expenseCheckSummary(data,today);return {text:'Проверим расходы\nЗа '+today+'\n\n'+snapshot.lines.join('\n')+'\n\n'+reminderText(s,today,Math.max(0,attempt)),reply_markup:{inline_keyboard:[[{text:'Всё записал ✅',callback_data:'check:'+today+':done'},...(!snapshot.count?[{text:'Без трат за этот день',callback_data:'check:'+today+':none'}]:[])],[{text:'Добавить расход',callback_data:'check:'+today+':pending'},{text:'Через час',callback_data:'check:'+today+':later'}],[{text:'Записи за день',callback_data:'check:'+today+':history'}],[{text:'Отключить проверки',callback_data:'check:'+today+':off'}]]}};}
export function lunchReminder(today){return {text:'Обед сегодня?\nЗа компанию или за свои — выбери ниже.',reply_markup:{inline_keyboard:[[{text:'Заказал · за счёт компании',callback_data:'lunch:'+today+':company'}],[{text:'Купил за свои',callback_data:'lunch:'+today+':own'},{text:'Не заказал',callback_data:'lunch:'+today+':skip'}],[{text:'Отключить вопросы',callback_data:'lunch:'+today+':off'}]]}};}


export function paymentReminder(items){return {text:'📅 Платежи на сегодня\n'+items.slice(0,5).map(x=>`${x.income?'＋':'−'} ${x.name} · ${x.amount===null?'уточнить сумму':money(x.amount,x.currency)}${x.date?' · '+x.date:''}`).join('\n')+(items.length>5?'\nЕщё '+(items.length-5)+' в списке':'')+'\nПодтверди, когда деньги действительно переданы.',reply_markup:{inline_keyboard:[...items.slice(0,5).map(x=>[{text:(x.income?'＋ Получил · ':'✓ Оплатил · ')+x.name.slice(0,35),callback_data:paymentCallback(x)}]),[{text:'Все платежи',callback_data:'b:v:due'}]]}};}
