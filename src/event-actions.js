import {scheduledEvents} from './finance-events.js';
import {preparePlanned} from './planned-operations.js';
import {orderedAccounts,isSavingAccount} from './account-balances.js';
export function prepareEvent(data,event,today,changed=false){
 const current=scheduledEvents(data,today,event.date).find(e=>e.id===event.id);if(!current)throw Error('Платёж уже подтверждён, пропущен или изменён. Обнови календарь.');
 if(current.source==='plan')return preparePlanned(data,current.sourceId,current.period,today,changed);
 const account=orderedAccounts(data).find(a=>a.id===current.accountId)||orderedAccounts(data).find(a=>!isSavingAccount(a)&&(a.currency||'RUB')===current.currency);
 return {type:current.type,cat:current.type==='income'?'income':current.source==='installment'?(data.installments||[]).find(p=>p.id===current.sourceId)?.cat||'other':'other',amount:changed?'':String(current.amount),currency:current.currency,accountId:account?.id||'',date:today,note:current.name,paymentMethod:'unknown',tags:[current.source==='installment'?'рассрочка':'возврат долга'],...(current.source==='installment'?{installmentPaymentId:current.paymentId,installmentDueDate:current.date}:{debtId:current.sourceId})};
}
