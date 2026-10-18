import {plannedOccurrences,planType} from './planned-model.js';
import {installmentRemaining,installmentRemainders} from './installment-state.js';
import {debtRemaining} from './debt-state.js';
import {accountTotals,isSavingAccount} from './account-balances.js';
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export const moveDate=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
// One unpaid event list for the dashboard, calendar, projection and reminders.
// Native amounts remain available for confirmation; RUB amounts are presentation.
export function scheduledEvents(data,today,end=today){
 const events=[],index=installmentRemainders(data),rate=currency=>data.rates?.[currency||'RUB']||1;
 const add=e=>{if(e.date>end)return;const currency=e.currency||'RUB';events.push({...e,currency,overdue:e.date<today,amountRub:e.amount===null?null:round(e.amount*rate(currency)),spendable:!isSavingAccount(data.accounts.find(a=>a.id===e.accountId))});};
 for(const {rule:r,date,period} of plannedOccurrences(data,today,end))add({id:`plan:${r.id}:${period}`,source:'plan',sourceId:r.id,period,date,name:r.name,type:planType(r),amount:r.variable?null:r.amount,currency:r.currency,accountId:r.accountId,kind:planType(r)==='income'?'Ожидаемый доход':r.frequency==='once'?'Разовый платёж':'Регулярный платёж'});
 for(const p of data.installments||[])for(const x of p.payments){const amount=installmentRemaining(data,x,index);if(amount>0)add({id:'installment:'+x.id,source:'installment',sourceId:p.id,paymentId:x.id,date:x.date,name:p.name,type:'expense',amount,currency:p.currency,accountId:p.accountId,kind:({loan:'Кредит',mortgage:'Ипотека',split:'Сплит'})[p.obligationKind]||'Рассрочка'});}
 for(const d of data.debts||[]){const amount=debtRemaining(d,data);if(d.dueDate&&amount>0)add({id:'debt:'+d.id,source:'debt',sourceId:d.id,date:d.dueDate,name:d.person,type:d.type==='tome'?'income':'expense',amount,currency:d.currency,kind:d.type==='tome'?'Возврат тебе':'Возврат долга'});}
 return events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='expense'?-1:1)-(b.type==='expense'?-1:1)||String(a.name||'').localeCompare(String(b.name||''))||a.id.localeCompare(b.id));
}
export function budgetWindow(data,today){
 const payday=data.settings?.nextIncomeDate,hasPayday=/^\d{4}-\d{2}-\d{2}$/.test(payday||'')&&payday>today;
 return {until:hasPayday?payday:moveDate(today,30),days:hasPayday?Math.round((Date.parse(payday+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000):null,exclusive:hasPayday,horizon:hasPayday?'payday':'30-days'};
}
export function spendingPlan(data,today){
 const window=budgetWindow(data,today),totals=accountTotals(data),events=scheduledEvents(data,today,window.until).filter(e=>e.spendable&&(!window.exclusive||e.date<window.until)),expenses=events.filter(e=>e.type==='expense');
 const obligations=round(expenses.reduce((n,e)=>n+(e.amountRub||0),0));
 return {...window,balance:round(totals.spendable),reserve:round(totals.savings),obligations,free:round(totals.spendable-obligations),unknown:expenses.filter(e=>e.amountRub===null).length,events,obligationItems:expenses.map(e=>({...e,id:e.source==='plan'?e.sourceId+':'+e.date:e.source==='installment'?e.paymentId:e.id,amount:e.amountRub,nativeAmount:e.amount})),plannedExpenses:round(expenses.filter(e=>e.source==='plan').reduce((n,e)=>n+(e.amountRub||0),0))};
}
export function cashTimeline(data,today,days=30,daily=0){
 if(!Number.isInteger(days)||days<0||days>366||!Number.isFinite(daily)||daily<0)throw Error('Выбери от 0 до 366 дней и неотрицательный расход');
 const events=scheduledEvents(data,today,moveDate(today,days)),actualBalance=round(accountTotals(data).spendable),points=[];
 let safe=actualBalance,expected=actualBalance,plannedIncome=0,plannedExpense=0;
 for(let i=0;i<=days;i++){
  const date=moveDate(today,i),rows=events.filter(e=>i===0?e.date<=today:e.date===date),due=round(rows.filter(e=>e.spendable&&e.type==='expense').reduce((n,e)=>n+(e.amountRub||0),0)),income=round(rows.filter(e=>e.spendable&&e.type==='income').reduce((n,e)=>n+(e.amountRub||0),0));
  safe=round(safe-due-(i?daily:0));expected=round(expected-due+income-(i?daily:0));plannedIncome=round(plannedIncome+income);plannedExpense=round(plannedExpense+due);
  points.push({date,balance:safe,expectedBalance:expected,due,income,events:rows,unknown:rows.filter(e=>e.spendable&&e.amountRub===null).length});
 }
 return {today,until:moveDate(today,days),actualBalance,events,points,plannedIncome,plannedExpense,unknown:events.filter(e=>e.spendable&&e.amountRub===null).length,firstNegative:points.find(p=>p.balance<0)?.date,firstExpectedNegative:points.find(p=>p.expectedBalance<0)?.date,minimum:Math.min(actualBalance,...points.map(p=>p.expectedBalance)),endBalance:points.at(-1).expectedBalance};
}
