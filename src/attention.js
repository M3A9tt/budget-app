import {scheduledEvents,moveDate,cashTimeline} from './finance-events.js';
import {moduleEnabled} from './modules.js';
import {lunchReminderDay} from './lunch-schedule.js';
import {lunchDayStatus} from './lunch-day-state.js';
import {profileCapacity} from './profile-capacity.js';
export function attentionItems(data,today,{days=7,responses=[]}={}){
 const items=scheduledEvents(data,today,moveDate(today,days)).map(e=>({...e,kind:'payment',priority:e.date<today?0:e.date===today?1:3}));
 if(moduleEnabled(data,'lunch'))for(let offset=0;offset<7;offset++){
  const date=moveDate(today,-offset);if(lunchReminderDay(data,date)&&lunchDayStatus(data,date,responses)==='unanswered')items.push({id:'lunch:'+date,kind:'lunch',date,name:'Ответить об обеде',priority:2});
 }
 if(data.settings.expenseCheckEnabled===true&&!['done','none','off','editing'].includes(responses.find(r=>r.day===today&&r.kind==='expense')?.status)&&!['done','none'].includes(data.dayChecks?.[today]))items.push({id:'check:'+today,kind:'check',date:today,name:'Проверить расходы за день',priority:2});
 const timeline=cashTimeline(data,today,30);
 if(timeline.firstExpectedNegative)items.push({id:'shortage',kind:'warning',date:timeline.firstExpectedNegative,name:'Возможная нехватка денег с '+timeline.firstExpectedNegative,priority:1});
 if(profileCapacity(data).warning)items.push({id:'capacity',kind:'capacity',date:today,name:'Профиль приближается к пределу 1,5 МБ — сохрани копию',priority:1});
 return items.sort((a,b)=>a.priority-b.priority||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
