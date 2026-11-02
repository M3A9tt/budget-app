import {isIcon} from './icon-catalog.js';

export function categoryEmoji(value=''){
 if(typeof value!=='string')throw Error('Выбери один эмодзи');
 const s=value.trim();if(!s)return '';
 if(s.length>24||[...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(s)].length!==1||!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(s))throw Error('Выбери один эмодзи, без текста');return s;
}
export function iconAppearance(values,old={}){
 const icon=values.icon??old.icon??'other',emoji=categoryEmoji(values.emoji??old.emoji??'');
 if(values.icon!==undefined&&!isIcon(icon))throw Error('Выбери значок из коллекции');
 return {icon,emoji};
}
export function setAccountAppearance(data,id,values){
 const account=data.accounts.find(a=>a.id===id);if(!account)throw Error('Счёт не найден');
 const appearance=iconAppearance(values,account);
 return {...data,accounts:data.accounts.map(a=>a.id===id?{...a,...appearance}:a)};
}
