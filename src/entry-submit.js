import {putTransaction} from './ledger.js';
import {createPlanned} from './planned-operations.js';
export const isPlannedEntry=(entry,today)=>entry.timing==='planned'||entry.date>today;
// Direction stays expense/income; timing chooses a future plan or a financial fact.
export function submitEntry(data,entry,today){
 if(isPlannedEntry(entry,today)){
  if(!['expense','income'].includes(entry.type)||data.transactions.some(t=>t.id===entry.id)||['recurringId','installmentPaymentId','debtId','lunchId','installmentRefundId','_lunchCheckDay'].some(k=>entry[k]))throw Error('Существующую оплату нельзя превратить в план. Измени исходный план отдельно.');
  const account=data.accounts.find(a=>a.id===entry.accountId);if(!account)throw Error('Для будущей операции выбери счёт');
  if((entry.currency||'RUB')!==(account.currency||'RUB'))throw Error('Валюта плана должна совпадать с валютой счёта');
  return createPlanned(data,{id:entry.id,name:entry.note|| (entry.type==='income'?'Доход':'Расход'),type:entry.type,amount:entry.amount,frequency:entry.frequency||'once',startDate:entry.date||'',accountId:entry.accountId,cat:entry.cat});
 }
 const {timing,frequency,...fact}=entry;return putTransaction(data,fact);
}
