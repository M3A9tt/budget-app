import {plannedOccurrences,planType} from './planned-model.js';
import {paidInstallment} from './finance-tools.js';
import {debtRemaining} from './debt-state.js';
export {debtRemaining} from './debt-state.js';
export function paymentOverview(data,today){
 const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+30);const until=data.settings.nextIncomeDate>today?data.settings.nextIncomeDate:date.toISOString().slice(0,10);
 const rub=(amount,currency)=>amount*(data.rates[currency||'RUB']||1);
 const plans=plannedOccurrences(data,today,until).filter(({rule})=>planType(rule)==='expense');
 const installments=(data.installments||[]).map(plan=>({...plan,unpaid:plan.payments.filter(p=>!paidInstallment(data,p))})).filter(p=>p.unpaid.length);
 const debts=(data.debts||[]).map(d=>({...d,remaining:debtRemaining(d,data)})).filter(d=>d.remaining>0);
 const recurring=plans.filter(({rule})=>rule.frequency!=='once'),oneOff=plans.filter(({rule})=>rule.frequency==='once');
 const total=rows=>rows.reduce((n,{rule})=>n+(rule.variable?0:rub(rule.amount,rule.currency)),0);
 return {until,plans,recurring,oneOff,regularTotal:total(recurring),oneOffTotal:total(oneOff),installments,debts,plannedTotal:plans.reduce((n,{rule})=>n+(rule.variable?0:rub(rule.amount,rule.currency)),0),installmentTotal:installments.reduce((n,p)=>n+p.unpaid.reduce((s,x)=>s+rub(x.amount,p.currency),0),0),debtTotal:debts.filter(d=>d.type!=='tome').reduce((n,d)=>n+rub(d.remaining,d.currency),0),receivableTotal:debts.filter(d=>d.type==='tome').reduce((n,d)=>n+rub(d.remaining,d.currency),0)};
}
