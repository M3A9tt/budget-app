import {matchesInsight} from './analytics-report.js';
import {companyLunch} from './lunch-budget.js';
import {sumMoney,transactionRub} from './ledger.js';
import {money} from './mini-model.js';

// This is a read model: transfers retain their own ledger records and balances.
export function activityEntries(data){
 return [...(data.transactions||[]),...(data.transfers||[]).map(t=>({...t,type:'transfer'}))].sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt||'').localeCompare(a.updatedAt||'')||(b.id||'').localeCompare(a.id||''));
}

export function transferDetails(data,entry){
 const accountName=id=>data.accounts.find(a=>a.id===id)?.name||(id?'Удалённый счёт':'Внешнее движение');
 const route=accountName(entry.from)+' → '+accountName(entry.to);
 const description=[!entry.from||!entry.to?'Внешнее движение из старого учёта':'Перевод между своими счетами',entry.note,entry.fee?'Комиссия '+money(entry.fee,entry.currency)+' · учтена в расходах':'',entry.balanceEffect==='history-only'?'Импорт истории · остатки не изменены':''].filter(Boolean).join(' · ');
 return {route,description};
}

export function filterActivity(entries,data,cats,{type='all',date='',search='',chartFilter=null}={}){
 const normalize=value=>value.replace(/\s+/gu,' ').trim().toLocaleLowerCase('ru'),query=normalize(search);
 return entries.filter(t=>{
  if(type!=='all'&&t.type!==type||date&&t.date!==date||chartFilter&&!matchesInsight(t,chartFilter))return false;
  const details=t.type==='transfer'?Object.values(transferDetails(data,t)).join(' '):[cats.find(c=>c.id===t.cat)?.name,t.type==='income'?'Доход':t.type==='lunch'?'Обед компании':'Расход',data.accounts.find(a=>a.id===t.accountId)?.name,{sbp:'СБП',card:'Карта',cash:'Наличные'}[t.paymentMethod]].join(' ');
  return normalize([t.note,t.date,t.amount,money(t.amount,t.currency),details].join(' ')).includes(query);
 });
}

export function activityNetRub(data,entries){
 return sumMoney(entries,t=>t.type==='transfer'||companyLunch(t)?0:(t.type==='expense'?-1:1)*transactionRub(data,t));
}
