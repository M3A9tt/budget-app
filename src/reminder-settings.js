import {timeMinutes,settingTime,validZone} from './time-settings.js';
export const REMINDER_TEXTS={
 calm:['Пара минут для бюджета: всё за сегодня записано?','Проверь расходы за день — завтра будет проще.','Кофе уже выпит, а бюджет в курсе?'],
 funny:['Бюджет не телепат. Расскажи ему, куда ушли деньги 😏','Деньги ушли по-английски. Запиши, куда именно.','Пять минут учёта сейчас — меньше «куда всё делось?» потом.'],
 rough:['Так, бля, деньги сами себя не посчитают. Всё за день записал?','Хватит делать вид, что кофе был бесплатным. Занеси расходы 😏','Будущий ты охренеет от пустой истории. Выручи его: запиши сегодняшний день.']
};
export function validateReminderSettings(s){
 const int=(key,min,max)=>{if(s[key]!==undefined&&(!Number.isInteger(s[key])||s[key]<min||s[key]>max))throw Error('Проверьте время и число повторов');};
 for(const key of ['reportHour','checkHour','lunchAskHour','plannedReminderHour'])int(key,0,23);
 for(const key of ['report','check','lunchAsk','plannedReminder'])if(s[key+'Time']!==undefined)timeMinutes(s[key+'Time']);
 if(s.timeZone!==undefined&&!validZone(s.timeZone))throw Error('Выберите действующий часовой пояс');
 int('checkEscalationDays',1,7);int('checkRepeats',0,3);int('checkInterval',1,4);
 if(timeMinutes(settingTime(s,'check',20))+Math.max(s.checkRepeats??0,s.checkEscalation?1:0)*(s.checkInterval??1)*60>1439)throw Error('Повторы должны закончиться до полуночи. Выберите более ранний час или меньше повторов.');
 for(const key of ['expenseCheckEnabled','lunchAskEnabled','checkEscalation','plannedReminders'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw Error('Неверный переключатель напоминаний');
 if(s.reminderStyle!==undefined&&!['calm','funny','rough','custom'].includes(s.reminderStyle))throw Error('Выберите стиль текста');
 if(s.reminderText!==undefined&&(typeof s.reminderText!=='string'||s.reminderText.length>500))throw Error('Текст напоминания — до 500 символов');
 if(s.reminderStyle==='custom'&&!s.reminderText?.trim())throw Error('Напишите свой текст напоминания');
 if(s.lunchAskDays!==undefined&&(!Array.isArray(s.lunchAskDays)||!s.lunchAskDays.length||new Set(s.lunchAskDays).size!==s.lunchAskDays.length||s.lunchAskDays.some(x=>!Number.isInteger(x)||x<0||x>6)))throw Error('Выберите дни для вопроса об обеде');
 return s;
}
export function reminderText(s,date,attempt){
 if(s.reminderStyle==='custom'&&s.reminderText?.trim())return s.reminderText.trim().slice(0,500);
 const pool=REMINDER_TEXTS[s.reminderStyle]||REMINDER_TEXTS.funny;
 const seed=Number(date.replaceAll('-',''))+attempt;
 return pool[seed%pool.length];
}
