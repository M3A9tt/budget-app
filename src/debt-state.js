import {clockAt,DEFAULT_ZONE} from './time-settings.js';
// Debt repayments use the same transactions as balances and the history.
// Legacy journal entries remain historical facts and never move money again.
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export const debtTransactionType=d=>d.type==='tome'?'income':'expense';
export function debtPayments(data,debt){return [...(debt.payments||[]).map(p=>({...p,legacy:true})),...data.transactions.filter(t=>t.debtId===debt.id).map(t=>({...t,transactionId:t.id,legacy:false}))];}
export function debtRemaining(debt,data={transactions:[]}){return debt.closed?0:Math.max(0,round(debt.amount-debtPayments(data,debt).reduce((n,p)=>n+p.amount,0)));}
export function debtDues(data){return (data.debts||[]).filter(d=>d.type!=='tome'&&d.dueDate&&debtRemaining(d,data)>0).map(d=>({id:d.id,name:d.person,date:d.dueDate,amount:debtRemaining(d,data),currency:d.currency||'RUB'}));}
export function canLinkDebtTransaction(tx,debt){return !tx.debtId&&!tx.recurringId&&!tx.installmentPaymentId&&tx.cat!=='lunch'&&tx.type===debtTransactionType(debt)&&(tx.currency||'RUB')===(debt.currency||'RUB')&&!!tx.accountId;}
export function validateDebtLinks(data){
 for(const tx of data.transactions.filter(t=>t.debtId)){
  if(tx.date>clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date)throw Error('Возврат записывается после фактической передачи денег');
  const debt=(data.debts||[]).find(d=>d.id===tx.debtId);
  if(!debt||!canLinkDebtTransaction({...tx,debtId:undefined},debt)||!data.accounts.some(a=>a.id===tx.accountId))throw Error('Возврат должен оставаться операцией по связанному долгу, в его валюте и со счётом');
 }
 for(const debt of data.debts||[]){const linked=data.transactions.filter(t=>t.debtId===debt.id);if(linked.length&&(debt.closed||round(debtPayments(data,debt).reduce((n,p)=>n+p.amount,0))>debt.amount))throw Error('Сумма возвратов больше долга или долг закрыт вручную');}
 return data;
}
