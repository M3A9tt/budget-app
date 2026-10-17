import {parseMoney,putTransaction} from './ledger.js';
import {validDate} from './finance-tools.js';
import {debtRemaining,debtTransactionType,canLinkDebtTransaction} from './debt-state.js';
import {todayMoscow} from './mini-model.js';
export function createDebt(data,{person,type,amount,currency='RUB',note='',dueDate=''}){
 const value=parseMoney(amount);if(!person.trim()||!['my','tome','transit'].includes(type)||!Number.isFinite(value)||value<=0||!data.rates[currency]||dueDate&&!validDate(dueDate))throw Error('Проверьте имя, сумму, валюту и срок возврата');
 return {...data,debts:[...(data.debts||[]),{id:crypto.randomUUID(),person:person.trim(),type,amount:value,currency,note:note.trim(),date:todayMoscow(data.settings.timeZone),dueDate,payments:[],closed:false}]};
}
export function setDebtDueDate(data,{id,dueDate=''}){if(dueDate&&!validDate(dueDate))throw Error('Неверный срок возврата');if(!data.debts.some(d=>d.id===id))throw Error('Долг не найден');return {...data,debts:data.debts.map(d=>d.id===id?{...d,dueDate}:d)};}
export function repayDebt(data,{id,amount,date,accountId,transactionId}){
 const debt=data.debts.find(d=>d.id===id);if(!debt||debtRemaining(debt,data)<=0)throw Error('Долг уже погашен или отсутствует');
 const today=todayMoscow(data.settings.timeZone);
 if(transactionId){const tx=data.transactions.find(t=>t.id===transactionId);if(!tx||!canLinkDebtTransaction(tx,debt)||tx.date>today)throw Error('Выберите подходящую фактическую операцию');return putTransaction(data,{...tx,debtId:id});}
 const value=parseMoney(amount),account=data.accounts.find(a=>a.id===accountId);
 if(!Number.isFinite(value)||value<=0||value>debtRemaining(debt,data))throw Error('Сумма больше остатка долга или некорректна');
 if(!validDate(date)||date>today)throw Error('Возврат записывается после фактической передачи денег');
 if(!account||(account.currency||'RUB')!==(debt.currency||'RUB'))throw Error('Выберите счёт в валюте долга');
 const type=debtTransactionType(debt);
 return putTransaction(data,{debtId:id,type,amount:value,currency:debt.currency||'RUB',accountId,date,cat:type==='income'?'income':'other',note:(type==='income'?'Возврат от ':'Возврат долга: ')+debt.person,tags:['возврат долга'],paymentMethod:account.storageKind==='cash'?'cash':'bank'});
}
