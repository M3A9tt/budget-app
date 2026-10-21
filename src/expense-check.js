import {CATEGORIES,money} from './mini-model.js';
import {sumMoney,transactionRub} from './ledger.js';
import {personalExpense} from './analytics-report.js';

// The reminder and its follow-up view read the same personal expenses as analytics.
export function expenseCheckSummary(data,day,limit=5){
 const expenses=data.transactions.filter(t=>t.date===day&&personalExpense(t));
 const entries=expenses.map((t,index)=>({t,index})).sort((a,b)=>(b.t.createdAt||'').localeCompare(a.t.createdAt||'')||b.index-a.index).slice(0,limit).map(({t})=>t);
 const total=sumMoney(expenses,t=>transactionRub(data,t));
 const clean=(s,max)=>String(s||'').replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069]+/g,' ').trim().slice(0,max);
 const lines=expenses.length?[`Уже записано: ${money(total)} · операций: ${expenses.length}`,...entries.map(t=>{
  const name=clean(t.note,64)||clean([...CATEGORIES,...(data.customCats||[])].find(c=>c.id===t.cat)?.name,64)||'Расход';
  const account=clean(data.accounts?.find(a=>a.id===t.accountId)?.name,28);
  return `• ${name} — ${money(t.amount,t.currency)}${account?' · '+account:''}`;
 }),...(expenses.length>entries.length?[`Ещё ${expenses.length-entries.length} — в записях за день.`]:[])]:['Расходов за этот день пока нет.'];
 return {entries,total,count:expenses.length,lines};
}
