import React,{useMemo} from 'react';
import {accountTotals} from './account-balances.js';
import {sumMoney} from './ledger.js';
import {dashboard,money,todayMoscow} from './mini-model.js';
import {scheduledEvents,moveDate} from './finance-events.js';
import {lunchBudget} from './lunch-budget.js';

export default function HeaderSummary({data,page='overview',section='',draft}){
 const summary=useMemo(()=>{
  const today=todayMoscow(data.settings.timeZone);
  const totals=accountTotals(data);
  const approximate=data.accounts.some(account=>(account.currency||'RUB')!=='RUB');
  const overall={label:approximate?'Всего · ≈':'Всего',value:money(sumMoney([totals.spendable,totals.savings]))};
  if(page==='history'||page==='stats'){
   const report=dashboard(data,today);
   const month=new Date(today+'T12:00:00Z').toLocaleDateString('ru-RU',{month:'long',timeZone:'UTC'});
   return [{label:'Доходы · '+month,value:money(report.income),tone:'income'},{label:'Расходы · '+month,value:money(report.spent),tone:'expense'}];
  }
  if(page==='payments'){
   const events=scheduledEvents(data,today,moveDate(today,30));
   return ['income','expense'].map(type=>{
    const event=events.find(item=>item.type===type);
    const label=type==='income'?'Ожидается':'К оплате';
    if(!event)return {label,value:'Нет в плане',tone:type};
    const date=event.date.slice(8,10)+'.'+event.date.slice(5,7);
    return {label:(event.overdue?'Просрочено · ':date+' · ')+event.name,value:event.amount===null?'Сумма неизвестна':money(event.amount,event.currency),tone:type};
   });
  }
  if(page==='add'){
   const account=data.accounts.find(a=>a.id===(draft?.accountId||draft?.from));
   return account?[{label:account.name,value:money(account.balance,account.currency)}]:[{label:'Запись',value:'Выбери счёт'}];
  }
  if(page==='lunch'){
   const lunch=lunchBudget(data,today.slice(0,7),today);
   return [{label:'Лимит на обеды',value:money(lunch.remaining)},{label:'Потрачено',value:money(lunch.spent)}];
  }
  if(page==='overview'){
   const report=dashboard(data,today);
   return [{label:'Можно потратить',value:money(report.free)},{label:'Отложено',value:money(totals.savings)}];
  }
  if(page==='more'&&['savings','goals'].includes(section)){
   return [{label:'Отложено',value:money(totals.savings)}];
  }
  return [overall,{label:'Отложено',value:money(totals.savings)}];
 },[data,page,section,draft?.accountId,draft?.from]);
 return <div className="header-summary" aria-label="Контекст раздела">
  {summary.map((item,index)=><div key={index} className={index?'header-summary-savings':undefined} data-tone={item.tone}><span title={item.label}>{item.label}</span><strong title={item.value}>{item.value}</strong></div>)}
 </div>;
}
