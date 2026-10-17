import {plannedOccurrences,planType} from './planned-model.js';
import {installmentRemainders,installmentRemaining} from './installment-state.js';
import {debtDues} from './debt-state.js';
// One list for reminders and chat. Facts of payment remove items automatically.
export function duePayments(data,today){
 const index=installmentRemainders(data);
 return [
  ...plannedOccurrences(data,today,today).map(x=>({kind:'plan',id:x.rule.id,period:x.period,date:x.date,name:x.rule.name,amount:x.rule.variable?null:x.rule.amount,currency:x.rule.currency||'RUB',income:planType(x.rule)==='income'})),
  ...(data.installments||[]).flatMap(p=>p.payments.filter(x=>x.date<=today&&installmentRemaining(data,x,index)>0).map(x=>({kind:'installment',id:x.id,planId:p.id,date:x.date,name:p.name,amount:installmentRemaining(data,x,index),currency:p.currency||'RUB'}))),
  ...debtDues(data).filter(x=>x.date<=today).map(x=>({...x,kind:'debt'}))
 ].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
export function paymentCallback(x){
 const value=x.kind==='plan'?`b:n:p:${x.id}:${x.period}`:`b:n:${x.kind==='installment'?'i':'d'}:${x.id}`;
 // Imported identifiers can be long. Open the current list in that case.
 return !String(x.id).includes(':')&&new TextEncoder().encode(value).length<=64?value:'b:v:due';
}
