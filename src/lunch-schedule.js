// One schedule for allowance, day controls and lunch reminders.
export const CALENDAR_SOURCE='https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2026/';
// Five-day Russian federal calendar, Decree 1466 (24 September 2025).
const holidays2026=new Set(['01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08','01-09','02-23','03-08','03-09','05-01','05-09','05-11','06-12','11-04','12-31']);
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date&&date>='2000-01-01'&&date<='2100-12-31';
export function lunchCalendar(settings={}){
 const days=settings.lunchWorkDays||[1,2,3,4,5];
 return settings.lunchCalendar||(days.length===5&&[1,2,3,4,5].every(d=>days.includes(d))?'ru-production':'weekly');
}
export function calendarLunchRatio(data,date){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay(),mode=lunchCalendar(data.settings);
 if(mode==='ru-production'&&date.startsWith('2026-'))return weekday!==0&&weekday!==6&&!holidays2026.has(date.slice(5))?1:0;
 return (data.settings?.lunchWorkDays||[1,2,3,4,5]).includes(weekday)?1:0;
}
export function lunchDayRatio(data,date){
 if((data.lunchDayOff||[]).includes(date))return 0;
 return data.lunchDayMod?.[date]??calendarLunchRatio(data,date);
}
export const lunchCalendarVerified=(data,date)=>lunchCalendar(data.settings)!=='ru-production'||date.startsWith('2026-');
export function setLunchWorkday(data,date,ratio){
 if(!validDate(date))throw Error('Выбери действительную дату рабочего дня');
 if(ratio!=='calendar'&&![0,0.5,1].includes(ratio))throw Error('Выбери полный день, полдня или выходной');
 const off=(data.lunchDayOff||[]).filter(d=>d!==date),mod={...data.lunchDayMod};delete mod[date];
 if(ratio===0)off.push(date);else if(ratio!=='calendar')mod[date]=ratio;
 return {...data,lunchDayOff:off,lunchDayMod:mod};
}
export function lunchReminderDay(data,date){
 if(lunchDayRatio(data,date)<=0)return false;
 // An explicitly scheduled extra shift is eligible even outside the usual
 // reminder weekdays. Ordinary days still honor the user's reminder filter.
 return calendarLunchRatio(data,date)===0||(data.settings?.lunchAskDays||data.settings?.lunchWorkDays||[1,2,3,4,5]).includes(new Date(date+'T12:00:00Z').getUTCDay());
}
export function validateLunchSchedule(data){
 if((data.lunchDayOff||[]).some(d=>!validDate(d)))throw Error('Неверная дата выходного дня');
 if(Object.entries(data.lunchDayMod||{}).some(([date,ratio])=>!validDate(date)||!Number.isFinite(ratio)||ratio<0||ratio>1))throw Error('Неверная дата или доля рабочего дня');
 return data;
}
