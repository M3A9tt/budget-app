import {CATEGORIES} from './categories.js';
export const CATEGORY_EMOJIS=['','🛒','🍔','🚇','🏠','💊','🎮','🎓','🐈','🎁','☕','💡','📱','✈️','💰','❤️'];
export function categoryEmoji(value=''){
 if(typeof value!=='string')throw Error('Выбери один эмодзи');
 const s=value.trim();if(!s)return '';
 if(s.length>24||[...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(s)].length!==1||!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(s))throw Error('Выбери один эмодзи, без текста');return s;
}
export function saveCustomCategory(data,values,id){
 const name=String(values.name||'').trim(),emoji=categoryEmoji(values.emoji),color=values.color||data.customCats.find(c=>c.id===id)?.color||'#b8dec4';
 if(!name||name.length>60)throw Error('Название категории — от 1 до 60 символов');
 if(!/^#[a-fA-F0-9]{6}$/.test(color))throw Error('Выбери цвет категории');
 if(id&&!data.customCats.some(c=>c.id===id)||CATEGORIES.some(c=>c.id===id))throw Error('Своя категория не найдена');
 const key=id||values.id||crypto.randomUUID();if(!id&&(typeof key!=='string'||!/^[-\w]{1,80}$/.test(key)))throw Error('Неверный ID категории');if(!id&&(data.customCats.some(c=>c.id===key)||CATEGORIES.some(c=>c.id===key)))throw Error('Категория уже существует');
 const old=data.customCats.find(c=>c.id===key);
 const category={...old,id:key,name,emoji,icon:old?.icon||'other',color};
 return {...data,customCats:old?data.customCats.map(c=>c.id===key?category:c):[...data.customCats,category]};
}
