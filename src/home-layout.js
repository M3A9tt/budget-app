import {moduleEnabled,MODULES} from './modules.js';
export const HOME_BLOCKS=[
 ['budget','Доступный бюджет','wallet'],['actions','Быстрая запись','plus'],['accounts','Мои счета','wallet'],['savings','Отложено','shield'],['wishes','Цели и покупки','goal','goals'],['month','Итоги месяца','chart'],['spending','Расходы по дням','chart'],['payments','Ближайшие платежи','bell'],['limits','Лимиты категорий','tag','limits'],['forecast','Прогноз остатка','chart','forecast'],['recent','Последние операции','history']
];
export const HOME_PRESETS={simple:['budget','actions','accounts','recent'],everyday:HOME_BLOCKS.filter(([id])=>id!=='forecast').map(([id])=>id),full:HOME_BLOCKS.map(([id])=>id)};
export function homeOrder(data){return data.settings?.homeLayout?.order||HOME_BLOCKS.map(([id])=>id);}
export function homeVisible(data,id){const block=HOME_BLOCKS.find(([key])=>key===id);return !!block&&(!block[3]||moduleEnabled(data,block[3]))&&(id==='actions'||!(data.settings?.homeLayout?.hidden||['forecast']).includes(id));}
export function homeBlocks(data){return homeOrder(data).filter(id=>homeVisible(data,id));}
export function customizeHome(data,{preset,key,move,visible,reset}={}){
 if(reset){const settings={...data.settings};delete settings.homeLayout;return {...data,settings};}
 let order=[...homeOrder(data)],hidden=[...(data.settings?.homeLayout?.hidden||['forecast'])];
 if(preset){if(!HOME_PRESETS[preset])throw Error('Вариант главной не найден');order=[...HOME_PRESETS[preset],...HOME_BLOCKS.map(([id])=>id).filter(id=>!HOME_PRESETS[preset].includes(id))];hidden=HOME_BLOCKS.map(([id])=>id).filter(id=>!HOME_PRESETS[preset].includes(id));}
 else {
  if(!HOME_BLOCKS.some(([id])=>id===key))throw Error('Блок не найден');
  if(move!==undefined){if(![-1,1].includes(move))throw Error('Неверное направление');const i=order.indexOf(key),j=i+move;if(j>=0&&j<order.length)[order[i],order[j]]=[order[j],order[i]];}
  else {if(typeof visible!=='boolean'||key==='actions'&&!visible)throw Error('Быстрая запись всегда доступна');hidden=visible?hidden.filter(id=>id!==key):[...new Set([...hidden,key])];}
 }
 return {...data,settings:{...data.settings,homeLayout:{order,hidden}}};
}
export function validateHome(settings){
 const layout=settings.homeLayout;if(layout===undefined)return;
 const ids=HOME_BLOCKS.map(([id])=>id);
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||Object.keys(layout).some(k=>!['order','hidden'].includes(k))||!Array.isArray(layout.order)||layout.order.length!==ids.length||new Set(layout.order).size!==ids.length||layout.order.some(id=>!ids.includes(id))||!Array.isArray(layout.hidden)||new Set(layout.hidden).size!==layout.hidden.length||layout.hidden.some(id=>!ids.includes(id)||id==='actions'))throw Error('Неверная настройка главной страницы');
}

export function initialProfile(defaults){const data=structuredClone(defaults);data.settings.notificationMode='manual';data.settings.modules=Object.fromEntries(MODULES.map(([id])=>[id,false]));return customizeHome(data,{preset:'simple'});}
