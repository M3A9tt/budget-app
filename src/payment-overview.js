import {roundMoney,sumMoney} from './ledger.js';
import {budgetWindow,scheduledEvents} from './finance-events.js';
import {paidInstallment,installmentRemaining,installmentRemainders} from './finance-tools.js';
import {debtRemaining} from './debt-state.js';
export {debtRemaining} from './debt-state.js';
export function paymentOverview(data,today){
 const window=budgetWindow(data,today),until=window.until;
 const rub=(amount,currency)=>roundMoney(amount*(data.rates[currency||'RUB']||1));
 const plans=scheduledEvents(data,today,until).filter(e=>e.source==='plan'&&e.type==='expense'&&(!window.exclusive||e.date<until)).map(e=>({rule:data.recurring.find(r=>r.id===e.sourceId),date:e.date,period:e.period,overdue:e.overdue}));
 const installmentIndex=installmentRemainders(data);
 const installments=(data.installments||[]).map(plan=>({...plan,unpaid:plan.payments.filter(p=>!paidInstallment(data,p,installmentIndex))})).filter(p=>p.unpaid.length);
 const debts=(data.debts||[]).map(d=>({...d,remaining:debtRemaining(d,data)})).filter(d=>d.remaining>0);
 const recurring=plans.filter(({rule})=>rule.frequency!=='once');
 const onceRules=data.recurring.filter(r=>r.frequency==='once'),lastOnce=onceRules.map(r=>r.startDate||today).sort().at(-1)||today;
 const oneOff=scheduledEvents({...data,recurring:onceRules,installments:[],debts:[]},today,lastOnce).filter(e=>e.type==='expense').map(e=>({rule:onceRules.find(r=>r.id===e.sourceId),date:e.date,period:e.period,overdue:e.overdue}));
 const total=rows=>sumMoney(rows,({rule})=>rule.variable?0:rub(rule.amount,rule.currency));
 return {until,plans,recurring,oneOff,regularTotal:total(recurring),oneOffTotal:total(oneOff),installments,debts,plannedTotal:total(plans),installmentTotal:sumMoney(installments,p=>sumMoney(p.unpaid,x=>rub(installmentRemaining(data,x,installmentIndex),p.currency))),debtTotal:sumMoney(debts.filter(d=>d.type!=='tome'),d=>rub(d.remaining,d.currency)),receivableTotal:sumMoney(debts.filter(d=>d.type==='tome'),d=>rub(d.remaining,d.currency))};
}
