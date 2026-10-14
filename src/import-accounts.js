import {accountInput} from './account-input.js';
const key=value=>String(value).trim().toLocaleLowerCase('ru');
export function resolveImportAccount(data,value){
 if(typeof value!=='string')return null;
 const hits=data.accounts.filter(a=>a.id===value||key(a.name)===key(value));return hits.length===1?hits[0]:null;
}
export function importAccountSources(doc){
 const sources=new Map();
 for(const row of doc?.operations||[])for(const field of row.type==='lunch'?[]:row.type==='transfer'?['from','to']:['account']){
  const value=row[field];if(typeof value!=='string'||!value.trim())continue;
  const k=key(value);if(!sources.has(k))sources.set(k,{key:k,name:value,currencies:new Set()});
  sources.get(k).currencies.add(row.currency);
 }
 return [...sources.values()].map(s=>({...s,currencies:[...s.currencies]}));
}
export function prepareImportAccounts(data,doc,bindings={}){
 let accounts=[...data.accounts];const mapping=new Map();
 for(const source of importAccountSources(doc)){
  const choice=bindings[source.key];
  if(!choice){const found=resolveImportAccount(data,source.name);if(found)mapping.set(source.key,found.id);continue;}
  if(choice.existing){const found=data.accounts.find(a=>a.id===choice.existing);if(!found)throw Error('Выбранный счёт больше не существует');mapping.set(source.key,found.id);continue;}
  if(!choice.create)continue;
  const v=choice.create;if(source.currencies.length!==1||!data.rates[source.currencies[0]])throw Error('Уточните валюту счёта '+source.name);
  if(!v.id||accounts.some(a=>a.id===v.id))throw Error('Повторяющийся счёт в импорте');
  const account={id:v.id,...accountInput({name:v.name||source.name,currency:source.currencies[0],kind:v.kind,balance:v.balance??'0',annualRate:v.annualRate??'',maturityDate:v.maturityDate??''})};
  if(accounts.some(a=>key(a.name)===key(account.name)))throw Error('Счёт с таким названием уже есть: '+account.name);
  if(account.accType==='savings'&&account.balance<0)throw Error('Накопления не могут быть отрицательными');
  accounts.push(account);mapping.set(source.key,account.id);
 }
 const operations=doc.operations.map(row=>{const next={...row};for(const field of row.type==='lunch'?[]:row.type==='transfer'?['from','to']:['account'])if(typeof row[field]==='string'&&mapping.has(key(row[field])))next[field]=mapping.get(key(row[field]));return next;});
 return {data:{...data,accounts},doc:{...doc,operations}};
}
