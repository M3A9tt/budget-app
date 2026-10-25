import {companyLunch,personalLunch} from './lunch-records.js';
export {companyLunch,personalLunch} from './lunch-records.js';
import {parseMoney,roundMoney} from './ledger.js';
import {lunchCalendar,lunchDayRatio,calendarLunchRatio,lunchCalendarVerified} from './lunch-schedule.js';
export {CALENDAR_SOURCE,lunchCalendar,lunchDayRatio,lunchCalendarVerified} from './lunch-schedule.js';
export function lunchBudget(data,month,today){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw Error('Выберите месяц');
 const [year,m]=month.split('-').map(Number),daily=data.settings?.lunchDaily??400;
 const monthRows=data.transactions.filter(t=>t.date.startsWith(month)&&t.date<=today),days=[];
 const rub=t=>t.amountRub??roundMoney(t.amount*(data.rates?.[t.currency||'RUB']||1));
 for(let day=1;day<=new Date(Date.UTC(year,m,0)).getUTCDate();day++){
  const date=month+'-'+String(day).padStart(2,'0'),ratio=lunchDayRatio(data,date),txs=monthRows.filter(t=>t.date===date),company=roundMoney(txs.filter(companyLunch).reduce((n,t)=>n+rub(t),0));
  const own=roundMoney(txs.filter(personalLunch).reduce((n,t)=>n+rub(t),0)),limit=roundMoney(daily*ratio),past=date<=today;
  const confirmed=past&&(txs.some(t=>companyLunch(t)||personalLunch(t))||data.lunchAnswers?.[date]?.status==='skipped');
  days.push({date,ratio,calendarRatio:calendarLunchRatio(data,date),limit,company,own,past,confirmed,difference:roundMoney(limit-company)});
 }
 let cumulative=0;
 for(const day of days){day.available=roundMoney(day.limit+cumulative);if(day.past)cumulative=roundMoney(cumulative+day.difference);day.cumulative=cumulative;}
 const sum=fn=>roundMoney(days.reduce((n,d)=>n+fn(d),0));
 const budget=sum(d=>d.limit),accrued=sum(d=>d.past?d.limit:0),spent=sum(d=>d.company),own=sum(d=>d.own),difference=roundMoney(accrued-spent);
 return {month,daily,days,workDays:sum(d=>d.ratio),extraDays:sum(d=>d.calendarRatio===0?d.ratio:0),budget,accrued,spent,own,difference,surplus:Math.max(0,difference),deficit:Math.max(0,-difference),remaining:roundMoney(budget-spent),future:roundMoney(budget-accrued),confirmedDifference:sum(d=>d.confirmed?d.difference:0),unrecorded:days.filter(d=>d.past&&d.ratio>0&&!d.confirmed).length,calendar:lunchCalendar(data.settings),verified:lunchCalendarVerified(data,month)};
}
export function lunchCalculator(items){
 const cents=items.reduce((sum,item)=>{const price=parseMoney(item.price),count=Number(item.count);if(!Number.isFinite(price)||price<0||!Number.isInteger(count)||count<1||count>100||!item.name.trim())throw Error('Укажи название, цену и количество от 1 до 100');return sum+Math.round(price*100)*count;},0);
 if(!Number.isSafeInteger(cents)||cents>1e14)throw Error('Слишком большая сумма');
 return cents/100;
}
