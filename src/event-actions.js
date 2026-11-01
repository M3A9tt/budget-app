import {scheduledEvents} from './finance-events.js';
import {validDate} from './finance-tools.js';
import {setDebtDueDate} from './debt-actions.js';
import {preparePlanned,reschedulePlanned} from './planned-operations.js';
import {orderedAccounts,isSavingAccount} from './account-balances.js';
export function prepareEvent(data,event,today,changed=false){
 const current=scheduledEvents(data,today,event.date).find(e=>e.id===event.id&&e.date===event.date);if(!current)throw Error('Платёж уже подтверждён, пропущен или изменён. Обнови календарь.');
 if(current.source==='plan')return preparePlanned(data,current.sourceId,current.period,today,changed);
 const account=orderedAccounts(data).find(a=>a.id===current.accountId)||orderedAccounts(data).find(a=>!isSavingAccount(a)&&(a.currency||'RUB')===current.currency);
 return {type:current.type,cat:current.type==='income'?'income':current.source==='installment'?(data.installments||[]).find(p=>p.id===current.sourceId)?.cat||'other':'other',amount:changed?'':String(current.amount),currency:current.currency,accountId:account?.id||'',date:today,note:current.name,paymentMethod:'unknown',tags:[current.source==='installment'?'рассрочка':'возврат долга'],...(current.source==='installment'?{installmentPaymentId:current.paymentId,installmentDueDate:current.date}:{debtId:current.sourceId})};
}

// Move the existing financial source, never a second calendar record.
export function rescheduleEvent(data,event,date,today){
 if(!validDate(date)||date<today)throw Error('Выбери сегодняшнюю или будущую дату');
 const current=scheduledEvents(data,today,event.date).find(e=>e.id===event.id&&e.date===event.date);
 if(!current)throw Error('Событие уже выполнено или изменено. Обнови календарь.');
 if(current.source==='plan')return reschedulePlanned(data,current.sourceId,current.period,date,today);
 const paymentReminders={...data.paymentReminders};delete paymentReminders[current.id];
 if(current.source==='debt')return {...setDebtDueDate(data,{id:current.sourceId,dueDate:date}),paymentReminders};
 return {...data,paymentReminders,installments:data.installments.map(p=>p.id===current.sourceId?{...p,payments:p.payments.map(x=>x.id===current.paymentId?{...x,date}:x)}:p)};
}
