export const DEFAULT_ZONE='Europe/Moscow';
export function validZone(zone){try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return typeof zone==='string'&&zone.length<=80;}catch{return false;}}
export function timeMinutes(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Время должно быть от 00:00 до 23:59');return Number(value.slice(0,2))*60+Number(value.slice(3));}
export const formatTime=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
export const settingTime=(settings,key,hour)=>settings[key+'Time']??formatTime((settings[key+'Hour']??hour)*60);
export function clockAt(now,zone=DEFAULT_ZONE){if(!validZone(zone))throw Error('Неизвестный часовой пояс');const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute),minutes:Number(parts.hour)*60+Number(parts.minute)};}
export function timeInput(value){const digits=value.replace(/[^0-9]/g,'').slice(0,4);return digits.length>=2?digits.slice(0,2)+':'+digits.slice(2):digits;}

// Called synchronously from the user's click. Older WebViews retain their native default action.
export function openTimePicker(input){try{if(typeof input.showPicker==='function'){input.showPicker();return true;}}catch{}return false;}
