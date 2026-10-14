import {plannedOccurrences,planType} from '../src/planned-model.js';
import {reminderText} from '../src/reminder-settings.js';
export function moscowClock(now){return{date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(now),hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(now))};}
export function checkSchedule(data,today){
 const s=data.settings||{},start=s.checkHour??20,interval=s.checkInterval??1;
 let repeats=s.checkRepeats??0;
 const last=data.transactions.filter(t=>t.type==='expense'&&t.cat!=='lunch'&&t.date<=today).map(t=>t.date).sort().at(-1)||s.checkStartedDate||today;
 const idle=Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000);
 if(s.checkEscalation===true&&idle>=(s.checkEscalationDays??3))repeats=Math.max(repeats,1);
 return Array.from({length:Math.min(3,repeats)+1},(_,i)=>start+i*interval).filter(h=>h<=23);
}
export function notificationJobs(data,now,responses=[]){
 const{date:today,hour}=moscowClock(now),s=data.settings||{},reports=[],local=new Date(today+'T12:00:00Z');
 const answered=kind=>responses.find(r=>r.day===today&&r.kind===kind),expense=answered('expense'),lunch=answered('lunch');
 const hours=checkSchedule(data,today),nextHour=expense?.payload?JSON.parse(expense.payload).nextHour:null;
 if(s.expenseCheckEnabled===true&&!['done','none'].includes(expense?.status)&&(!nextHour||hour>=nextHour)&&(hours.includes(hour)||nextHour===hour)){
  reports.push({id:'check:'+today+':'+hour,kind:'expense',day:today,text:reminderText(s,today,hours.indexOf(hour)),reply_markup:{inline_keyboard:[[{text:'Всё записал ✅',callback_data:'check:'+today+':done'},{text:'Сегодня без трат',callback_data:'check:'+today+':none'}],[{text:'Ещё не всё',callback_data:'check:'+today+':pending'},{text:'Через час',callback_data:'check:'+today+':later'}],[{text:'Отключить проверки',callback_data:'check:'+today+':off'}]]}});
 }
 const hasLunch=data.transactions.some(t=>t.date===today&&(t.type==='lunch'||t.cat==='lunch'));
 if(s.lunchAskEnabled===true&&hour===(s.lunchAskHour??11)&&(s.lunchAskDays||[1,2,3,4,5]).includes(local.getUTCDay())&&!(data.lunchDayOff||[]).includes(today)&&!hasLunch&&!lunch?.status){
  reports.push({id:'lunch-ask:'+today,kind:'lunch',day:today,text:'Обед сегодня заказал? 🍽\nЗапишем только после твоего подтверждения.',reply_markup:{inline_keyboard:[[{text:'Заказал · за счёт компании',callback_data:'lunch:'+today+':company'}],[{text:'Купил за свои',callback_data:'lunch:'+today+':own'},{text:'Не заказал',callback_data:'lunch:'+today+':skip'}],[{text:'Отключить вопросы',callback_data:'lunch:'+today+':off'}]]}});
 }
 if(s.plannedReminders===true&&hour===(s.plannedReminderHour??18)){const due=plannedOccurrences(data,today,today);if(due.length)reports.push({id:'planned:'+today,openPayments:true,text:'Есть неподтверждённые планы. Изменилась ли сумма за этот период?\n'+due.slice(0,5).map(i=>(planType(i.rule)==='income'?'Доход: ':'Расход: ')+i.rule.name+' · '+i.date).join('\n')+(due.length>5?'\nЕщё '+(due.length-5)+' в приложении':'')+'\nПроверь сумму и подтверди только фактическую операцию. Настройки → Твой ритм — отключить вопросы о планах.'});}
 if(hour!==(s.reportHour??21))return reports;
 if(s.dailyReport!==false)reports.push({id:'day:'+today,from:today,to:today,title:'Итог дня'});
 if(s.weeklyReport!==false&&local.getUTCDay()===0){const from=new Date(local);from.setUTCDate(from.getUTCDate()-6);reports.push({id:'week:'+today,from:from.toISOString().slice(0,10),to:today,title:'Итог недели'});}
 if(s.monthlyReport!==false&&local.getUTCDate()===1){const end=new Date(local);end.setUTCDate(0);reports.push({id:'month:'+end.toISOString().slice(0,7),from:end.toISOString().slice(0,8)+'01',to:end.toISOString().slice(0,10),title:'Итог месяца'});}
 return reports;
}
