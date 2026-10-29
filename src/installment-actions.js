import {parseMoney,sumMoney,putTransaction} from './ledger.js';
import {validDate} from './finance-tools.js';
export function changeInstallmentPayment(data,planId,paymentId,{date,remainingAmount}){
 const plan=(data.installments||[]).find(p=>p.id===planId),payment=plan?.payments.find(p=>p.id===paymentId),amount=parseMoney(remainingAmount);
 if(!payment||!validDate(date)||!Number.isFinite(amount)||amount<=0)throw Error('Проверь неоплаченную сумму и дату');
 const paid=sumMoney(data.transactions.filter(t=>t.installmentPaymentId===paymentId),t=>t.amount);
 if(paid>=payment.amount)throw Error('Этот взнос уже оплачен. Изменяй только неоплаченную часть');
 const payments=plan.payments.map(p=>p.id===paymentId?{...p,amount:sumMoney([paid,amount]),date}:p);
 return {...data,installments:data.installments.map(p=>p.id===planId?{...p,payments,total:sumMoney(payments,x=>x.amount)}:p)};
}
export function installmentReturnStatus(data,id,status){
 if(!['none','awaiting','recalculated'].includes(status)||!data.installments.some(p=>p.id===id))throw Error('График или состояние не найдены');
 return {...data,installments:data.installments.map(p=>p.id===id?{...p,returnStatus:status}:p)};
}
export function refundInstallment(data,id,values){
 const plan=data.installments.find(p=>p.id===id);if(!plan)throw Error('График не найден');
 return putTransaction(data,{...values,type:'income',cat:'income',currency:plan.currency,installmentRefundId:id,note:'Возврат: '+plan.name});
}
