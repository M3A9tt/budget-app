import {parseMoney,putTransaction,roundMoney} from './ledger.js';
import {createPlanned} from './planned-operations.js';
export const isPlannedEntry=(entry,today)=>entry.timing==='planned'||entry.date>today;

// Use the same amount in the confirmation, allocation preview and journal.
export function entryAmounts(entry,today){
 const allowsCommission=entry.type==='expense'&&!entry.id&&!isPlannedEntry(entry,today)&&
  !['recurringId','installmentPaymentId','installmentRefundId','debtId','lunchId'].some(key=>entry[key]);
 const amount=parseMoney(entry.amount),commission=allowsCommission?parseMoney(entry.fee||0):0;
 return {amount,commission,total:roundMoney(amount+commission),allowsCommission};
}

// Direction stays expense/income; timing chooses a future plan or a financial fact.
export function submitEntry(data,entry,today){
 if(isPlannedEntry(entry,today)){
  if(entry.categoryAllocations!==undefined)throw Error('Распределение по категориям доступно после оплаты');
  if(!['expense','income'].includes(entry.type)||data.transactions.some(t=>t.id===entry.id)||['recurringId','installmentPaymentId','debtId','lunchId','installmentRefundId','_lunchCheckDay'].some(k=>entry[k]))throw Error('Существующую оплату нельзя превратить в план. Измени исходный план отдельно.');
  const account=data.accounts.find(a=>a.id===entry.accountId);if(!account)throw Error('Для будущей операции выбери счёт');
  if((entry.currency||'RUB')!==(account.currency||'RUB'))throw Error('Валюта плана должна совпадать с валютой счёта');
  return createPlanned(data,{id:entry.id,name:entry.note|| (entry.type==='income'?'Доход':'Расход'),type:entry.type,amount:entry.amount,frequency:entry.frequency||'once',startDate:entry.date||'',accountId:entry.accountId,cat:entry.cat});
 }
 const {timing,frequency,...fact}=entry;return putTransaction(data,fact);
}
