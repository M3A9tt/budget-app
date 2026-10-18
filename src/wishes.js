import {orderedAccounts} from './account-balances.js';
import {parseMoney} from './ledger.js';
export const savingAccount=a=>a?.accType==='savings'||a?.savingsKind==='deposit';
export function validateWishes(data){
 const rows=data.wishes||[];if(!Array.isArray(rows)||rows.length>500)throw Error('Список желаний — до 500 заметок');
 const ids=new Set(),linked=new Set(data.goals.filter(g=>g.accountId).map(g=>g.accountId));
 for(const w of rows){
  if(!w||typeof w!=='object'||typeof w.id!=='string'||!w.id||ids.has(w.id)||typeof w.name!=='string'||!w.name.trim()||w.name.length>120||typeof w.note!=='string'||w.note.length>1000||!['main','secondary'].includes(w.priority)||typeof w.done!=='boolean'||!Number.isFinite(w.target)||w.target<0||w.target>1e12||Math.abs(w.target*100-Math.round(w.target*100))>.001||!Object.hasOwn(data.rates,w.currency)||typeof w.accountId!=='string')throw Error('Проверьте заметку о покупке');
  ids.add(w.id);if(!w.done&&w.accountId){if(linked.has(w.accountId))throw Error('Накопления уже связаны с другой целью');linked.add(w.accountId);}
 }
}
export function saveWish(data,{id,name,note='',priority='main',target='',currency='RUB',accountId='',done=false}){
 const old=(data.wishes||[]).find(w=>w.id===id);if(id&&!old)throw Error('Заметка больше не существует');
 const amount=String(target).trim()===''?0:parseMoney(target),account=accountId?data.accounts.find(a=>a.id===accountId):null;
 if(accountId&&(!account||!savingAccount(account)))throw Error('Выберите накопительный счёт или вклад');
 if(accountId&&amount>0&&currency!==(account.currency||'RUB'))throw Error('Валюта цели должна совпадать с накоплениями');
 const row={id:old?.id||crypto.randomUUID(),name:String(name||'').trim(),note:String(note||'').trim(),priority,target:amount,currency:account?.currency||currency,accountId,done};
 const next={...data,wishes:old?data.wishes.map(w=>w.id===id?row:w):[...(data.wishes||[]),row]};validateWishes(next);return next;
}
export function completeWish(data,id,done){const old=(data.wishes||[]).find(w=>w.id===id);if(!old)throw Error('Заметка больше не существует');return saveWish(data,{...old,done});}
export function savingsPurposes(data){return orderedAccounts(data).filter(savingAccount).map(a=>{const wish=(data.wishes||[]).find(w=>!w.done&&w.accountId===a.id),goal=data.goals.find(g=>g.accountId===a.id);return {...a,purpose:wish?.name||goal?.name||'',target:wish?.target||goal?.target||0};});}
export function availableWishAccounts(data,id=''){return orderedAccounts(data).filter(a=>savingAccount(a)&&!data.goals.some(g=>g.accountId===a.id)&&!(data.wishes||[]).some(w=>w.id!==id&&!w.done&&w.accountId===a.id));}
