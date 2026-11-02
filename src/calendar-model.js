import {activityEntries} from './activity-history.js';
import {scheduledEvents,moveDate} from './finance-events.js';

export function shiftMonth(month,offset){
 const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);
}
export function calendarMonth(data,today,month=today.slice(0,7)){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Выбери месяц календаря');
 const first=month+'-01',weekday=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=moveDate(first,-weekday),end=moveDate(start,41),events=scheduledEvents(data,today,end,start),byDate=new Map();
 const bucket=date=>{if(!byDate.has(date))byDate.set(date,{events:[],transactions:[]});return byDate.get(date);};
 for(const e of events)if(e.date>=start)bucket(e.date).events.push(e);
 for(const t of activityEntries(data))if(t.date>=start&&t.date<=end&&t.date<=today)bucket(t.date).transactions.push(t);
 const days=Array.from({length:42},(_,i)=>{const date=moveDate(start,i),rows=byDate.get(date)||{events:[],transactions:[]};return {date,inMonth:date.startsWith(month),...rows};});
 return {month,start,end,days,overdue:scheduledEvents(data,today,today).filter(e=>e.date<today)};
}

export const CALENDAR_MARKS=[
 {type:'expense',label:'Расход',icon:'up',tone:'out'},
 {type:'income',label:'Доход',icon:'down',tone:'in'},
 {type:'transfer',label:'Перевод',icon:'repeat',tone:'transfer'},
 {type:'lunch',label:'Обед компании',icon:'lunch',tone:'company'}
];
// A marker describes a direction, not a count or a paid/unpaid state.
export function calendarDayMarks(day){const rows=[...(day.events||[]),...(day.transactions||[])];return CALENDAR_MARKS.filter(mark=>rows.some(row=>row.type===mark.type));}
