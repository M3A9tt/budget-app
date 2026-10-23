import {scheduledEvents,moveDate} from './finance-events.js';

export function shiftMonth(month,offset){
 const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);
}
export function calendarMonth(data,today,month=today.slice(0,7)){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Выбери месяц календаря');
 const first=month+'-01',weekday=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=moveDate(first,-weekday),end=moveDate(start,41),events=scheduledEvents(data,today,end,start),byDate=new Map();
 const bucket=date=>{if(!byDate.has(date))byDate.set(date,{events:[],transactions:[]});return byDate.get(date);};
 for(const e of events)if(e.date>=start)bucket(e.date).events.push(e);
 for(const t of data.transactions)if(t.date>=start&&t.date<=end&&t.date<=today)bucket(t.date).transactions.push(t);
 const days=Array.from({length:42},(_,i)=>{const date=moveDate(start,i),rows=byDate.get(date)||{events:[],transactions:[]};return {date,inMonth:date.startsWith(month),...rows};});
 return {month,start,end,days,overdue:scheduledEvents(data,today,today).filter(e=>e.date<today)};
}
