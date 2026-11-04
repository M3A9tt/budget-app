import {installmentRemaining,installmentRemainders} from './installment-state.js';
import {sumMoney} from './ledger.js';
import {activityEntries} from './activity-history.js';
import {isIcon} from './icon-catalog.js';
import {categoryCatalog} from './categories.js';
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
 {type:'expense',label:'Расход',icon:'down',tone:'out'},
 {type:'income',label:'Доход',icon:'up',tone:'in'},
 {type:'transfer',label:'Перевод',icon:'repeat',tone:'transfer'},
 {type:'lunch',label:'Обед компании',icon:'lunch',tone:'company'}
];
// A marker describes a direction, not a count or a paid/unpaid state.
export function calendarDayMarks(day){const rows=[...(day.events||[]),...(day.transactions||[])];return CALENDAR_MARKS.filter(mark=>rows.some(row=>row.type===mark.type));}

// Use category/source metadata, never guess a purpose from the event name.
export function calendarEventMark(data,row){
 const direction=CALENDAR_MARKS.find(mark=>mark.type===row.type)||CALENDAR_MARKS[0];
 if(row.type==='income')return {...direction,icon:'wallet'};
 if(row.type==='transfer'||row.type==='lunch')return direction;
 const source=row.source==='plan'?(data.recurring||[]).find(rule=>rule.id===row.sourceId):row.source==='installment'?(data.installments||[]).find(plan=>plan.id===row.sourceId):null;
 const category=categoryCatalog(data.customCats).find(cat=>cat.id===(source?.cat||row.cat));
 const icon=category?.id==='subs'?'subscription':isIcon(category?.icon)&&category.icon!=='other'?category.icon:(source?.cat||row.cat)==='home'?'home':source&&['daily','weekly','monthly'].includes(source.frequency)?'refresh':null;
 return {...direction,icon};
}
export function calendarDaySymbols(data,day){
 const rows=[...(day.events||[]),...(day.transactions||[])];
 const first=rows[0],second=rows.find(row=>row.type!==first?.type)||rows[1];
 return {marks:[first,second].filter(Boolean).map(row=>({...calendarEventMark(data,row),key:row.id})),remaining:Math.max(0,rows.length-2)};
}

export function calendarInstallmentInfo(data,event){
 if(event.source!=='installment')return null;
 const plan=(data.installments||[]).find(p=>p.id===event.sourceId);if(!plan)return null;
 const payments=[...plan.payments].sort((a,b)=>a.date.localeCompare(b.date)),index=payments.findIndex(p=>p.id===event.paymentId),remainders=installmentRemainders(data);
 const category=categoryCatalog(data.customCats).find(c=>c.id===plan.cat);
 return {number:index+1,total:payments.length,remaining:sumMoney(payments,p=>installmentRemaining(data,p,remainders)),currency:plan.currency,category};
}
