import {parseMoney,roundMoney} from './ledger.js';

export const CALENDAR_SOURCE='https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2026/';
// Five-day Russian federal calendar, Decree 1466 (24 September 2025).
const holidays2026=new Set(['01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08','01-09','02-23','03-08','03-09','05-01','05-09','05-11','06-12','11-04','12-31']);
export function lunchCalendar(settings={}){
 const days=settings.lunchWorkDays||[1,2,3,4,5];
 return settings.lunchCalendar||(days.length===5&&[1,2,3,4,5].every(d=>days.includes(d))?'ru-production':'weekly');
}
export function lunchDayRatio(data,date){
 if((data.lunchDayOff||[]).includes(date))return 0;
 const override=data.lunchDayMod?.[date];if(override!==undefined)return override;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay(),mode=lunchCalendar(data.settings);
 if(mode==='ru-production'&&date.startsWith('2026-'))return weekday!==0&&weekday!==6&&!holidays2026.has(date.slice(5))?1:0;
 return (data.settings?.lunchWorkDays||[1,2,3,4,5]).includes(weekday)?1:0;
}
export const companyLunch=t=>t.type==='lunch'||t.cat==='lunch';
export const personalLunch=t=>t.type==='expense'&&!companyLunch(t)&&((t.tags||[]).includes('обед-за-свои')||t._lunchCheckDay||/обед.*(?:сво|доплат)/i.test(t.note||''));
export function lunchBudget(data,month,today){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw Error('Выберите месяц');
 const [year,m]=month.split('-').map(Number),daily=data.settings?.lunchDaily??400;
 const monthRows=data.transactions.filter(t=>t.date.startsWith(month)&&t.date<=today),days=[];
 const rub=t=>t.amountRub??roundMoney(t.amount*(data.rates?.[t.currency||'RUB']||1));
 for(let day=1;day<=new Date(Date.UTC(year,m,0)).getUTCDate();day++){
  const date=month+'-'+String(day).padStart(2,'0'),ratio=lunchDayRatio(data,date),txs=monthRows.filter(t=>t.date===date),company=roundMoney(txs.filter(companyLunch).reduce((n,t)=>n+rub(t),0));
  const own=roundMoney(txs.filter(personalLunch).reduce((n,t)=>n+rub(t),0)),limit=roundMoney(daily*ratio),past=date<=today;
  const confirmed=past&&(txs.some(companyLunch)||data.lunchAnswers?.[date]?.status==='skipped');
  days.push({date,ratio,limit,company,own,past,confirmed,difference:roundMoney(limit-company)});
 }
 const sum=fn=>roundMoney(days.reduce((n,d)=>n+fn(d),0));
 const budget=sum(d=>d.limit),accrued=sum(d=>d.past?d.limit:0),spent=sum(d=>d.company),own=sum(d=>d.own),difference=roundMoney(accrued-spent);
 return {month,daily,days,workDays:sum(d=>d.ratio),budget,accrued,spent,own,difference,surplus:Math.max(0,difference),deficit:Math.max(0,-difference),remaining:roundMoney(budget-spent),future:roundMoney(budget-accrued),confirmedDifference:sum(d=>d.confirmed?d.difference:0),unrecorded:days.filter(d=>d.past&&d.ratio>0&&!d.confirmed).length,calendar:lunchCalendar(data.settings),verified:lunchCalendar(data.settings)!=='ru-production'||year===2026};
}
export function lunchCalculator(items){
 const cents=items.reduce((sum,item)=>{const price=parseMoney(item.price),count=Number(item.count);if(!Number.isFinite(price)||price<0||!Number.isInteger(count)||count<1||count>100||!item.name.trim())throw Error('Укажи название, цену и количество от 1 до 100');return sum+Math.round(price*100)*count;},0);
 if(!Number.isSafeInteger(cents)||cents>1e14)throw Error('Слишком большая сумма');
 return cents/100;
}
