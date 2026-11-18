// One schedule for allowance, day controls and lunch reminders.
export const CALENDAR_SOURCE='https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2026/';
// Five-day Russian federal calendar, Decree 1466 (24 September 2025).
const holidays2026=new Set(['01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08','01-09','02-23','03-08','03-09','05-01','05-09','05-11','06-12','11-04','12-31']);
export const CALENDAR_VERSIONS={2026:{version:'1466-2025-09-24',source:CALENDAR_SOURCE,holidays:holidays2026,workdays:new Set()},2027:{version:'1187-2026-09-17',source:'https://mintrans.gov.ru/eye/press-center/branch-news/9491',holidays:new Set(['01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08','02-22','02-23','03-08','05-01','05-03','05-09','05-10','06-12','06-14','11-04','11-05','12-31']),workdays:new Set(['02-20'])}};
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date&&date>='2000-01-01'&&date<='2100-12-31';
export const LUNCH_PERIOD_LABELS={absence:'Отпуск / отсутствие',pause:'Пауза вопросов'};

export function lunchPeriodsForDay(data,date) {
 return (data.lunchPeriods||[]).filter(period=>period.from<=date&&period.to>=date);
}

export function lunchQuestionsPaused(data,date) {
 return (data.lunchPeriods||[]).some(period=>period.from<=date&&period.to>=date);
}

export function lunchPauseThrough(data,today) {
 const relevant=(data.lunchPeriods||[]).filter(period=>period.to>=today).sort((a,b)=>a.from.localeCompare(b.from));
 let through;
 for(const period of relevant){
  if(!through&&period.from>today)break;
  if(through){
   const next=new Date(through+'T12:00:00Z');
   next.setUTCDate(next.getUTCDate()+1);
   if(period.from>next.toISOString().slice(0,10))break;
  }
  if(!through||period.to>through)through=period.to;
 }
 return through;
}

export function saveLunchPeriod(data,input,newId) {
 const periods=data.lunchPeriods||[];
 if(input.id&&!periods.some(period=>period.id===input.id))throw Error('Период больше не существует');
 const period={id:input.id||newId||crypto.randomUUID(),mode:input.mode,from:input.from,to:input.to};
 const next={...data,lunchPeriods:input.id?periods.map(row=>row.id===input.id?period:row):[...periods,period]};
 return validateLunchSchedule(next);
}

export function deleteLunchPeriod(data,id) {
 if(!(data.lunchPeriods||[]).some(period=>period.id===id))throw Error('Период больше не существует');
 return {...data,lunchPeriods:data.lunchPeriods.filter(period=>period.id!==id)};
}

export function resumeLunchPeriod(data,id,today) {
 const period=lunchPeriodsForDay(data,today).find(row=>row.id===id);
 if(!period)throw Error('Этот период сейчас не действует');
 if(period.from===today)return deleteLunchPeriod(data,id);
 const yesterday=new Date(today+'T12:00:00Z');
 yesterday.setUTCDate(yesterday.getUTCDate()-1);
 return saveLunchPeriod(data,{...period,to:yesterday.toISOString().slice(0,10)});
}
export function lunchCalendar(settings={}){
 const days=settings.lunchWorkDays||[1,2,3,4,5];
 return settings.lunchCalendar||(days.length===5&&[1,2,3,4,5].every(d=>days.includes(d))?'ru-production':'weekly');
}
export function calendarLunchRatio(data,date){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay(),mode=lunchCalendar(data.settings);
 const year=CALENDAR_VERSIONS[date.slice(0,4)];if(mode==='ru-production'&&year)return year.workdays.has(date.slice(5))||weekday!==0&&weekday!==6&&!year.holidays.has(date.slice(5))?1:0;
 return (data.settings?.lunchWorkDays||[1,2,3,4,5]).includes(weekday)?1:0;
}
export function lunchDayRatio(data,date){
 if((data.lunchDayOff||[]).includes(date))return 0;
 const override=data.lunchDayMod?.[date];
 if(override!==undefined)return override;
 if(lunchPeriodsForDay(data,date).some(period=>period.mode==='absence'))return 0;
 return calendarLunchRatio(data,date);
}
export const lunchCalendarVerified=(data,date)=>lunchCalendar(data.settings)!=='ru-production'||Object.hasOwn(CALENDAR_VERSIONS,date.slice(0,4));
export function setLunchWorkday(data,date,ratio){
 if(!validDate(date))throw Error('Выбери действительную дату рабочего дня');
 if(ratio!=='calendar'&&![0,0.5,1].includes(ratio))throw Error('Выбери полный день, полдня или выходной');
 const off=(data.lunchDayOff||[]).filter(d=>d!==date),mod={...data.lunchDayMod};delete mod[date];
 if(ratio===0)off.push(date);else if(ratio!=='calendar')mod[date]=ratio;
 return {...data,lunchDayOff:off,lunchDayMod:mod};
}
export function lunchReminderDay(data,date){
 if(lunchQuestionsPaused(data,date)||lunchDayRatio(data,date)<=0)return false;
 // An explicitly scheduled extra shift is eligible even outside the usual
 // reminder weekdays. Ordinary days still honor the user's reminder filter.
 return calendarLunchRatio(data,date)===0||(data.settings?.lunchAskDays||data.settings?.lunchWorkDays||[1,2,3,4,5]).includes(new Date(date+'T12:00:00Z').getUTCDay());
}
export function validateLunchSchedule(data){
 if((data.lunchDayOff||[]).some(d=>!validDate(d)))throw Error('Неверная дата выходного дня');
 if(Object.entries(data.lunchDayMod||{}).some(([date,ratio])=>!validDate(date)||!Number.isFinite(ratio)||ratio<0||ratio>1))throw Error('Неверная дата или доля рабочего дня');
 if(data.lunchPeriods!==undefined){
  if(!Array.isArray(data.lunchPeriods))throw Error('Повреждён список периодов без вопросов');
  const ids=new Set();
  for(const period of data.lunchPeriods){
   if(!period||typeof period.id!=='string'||!period.id||period.id.length>80||ids.has(period.id)||
    !Object.hasOwn(LUNCH_PERIOD_LABELS,period.mode)||!validDate(period.from)||!validDate(period.to)||period.from>period.to)
    throw Error('Выбери вид периода и даты начала и конца');
   ids.add(period.id);
  }
 }
 return data;
}
