import {moveDate} from './finance-events.js';
export const validReportDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export const reportMonthEnd=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
export function previousReportMonth(month){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);}
const distance=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)+1;
// The same dates are used by totals, charts, comparisons and history links.
export function reportPeriod(today,input='month'){
 const query=typeof input==='string'||typeof input==='number'?{period:String(input)}:input;
 if(!query||typeof query!=='object'||Array.isArray(query))throw Error('Выбери период отчёта');
 const period=query.period||'month';let from,to,previousFrom,previousTo,comparison;
 if(period==='month'||/^\d{4}-(0[1-9]|1[0-2])$/.test(period)){
  const month=period==='month'?today.slice(0,7):period;if(month>today.slice(0,7))throw Error('Будущий месяц ещё не наступил');
  from=month+'-01';to=month===today.slice(0,7)?today:reportMonthEnd(month);
  const previous=previousReportMonth(month),last=reportMonthEnd(previous);previousFrom=previous+'-01';
  previousTo=to===reportMonthEnd(month)?last:previous+'-'+String(Math.min(Number(to.slice(-2)),Number(last.slice(-2)))).padStart(2,'0');comparison='calendar';
 }else if(['7','30'].includes(period)){to=today;from=moveDate(to,1-Number(period));comparison='previous-period';}
 else if(period==='custom'){from=query.from;to=query.to;comparison='previous-period';}
 else throw Error('Выбери месяц, неделю, 30 дней или свои даты');
 if(!validReportDate(from)||!validReportDate(to)||from>to||to>today)throw Error('Проверь даты: начало не позже конца, конец не позже сегодня');
 const days=distance(from,to);if(days>366)throw Error('Выбери период не длиннее 366 дней');
 previousTo||=moveDate(from,-1);previousFrom||=moveDate(from,-days);
 if(query.accountId!==undefined&&typeof query.accountId!=='string')throw Error('Выбери счёт отчёта');
 return {period,from,to,days,previousFrom,previousTo,previousDays:distance(previousFrom,previousTo),comparison,accountId:query.accountId||''};
}
