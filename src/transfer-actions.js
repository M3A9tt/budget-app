import {transferMoney,deleteTransaction,roundMoney} from './ledger.js';
// Reverse only explicit links. Legacy commissions require an explicit selection.
export function reverseTransfer(data,id,{revision,legacyFeeId}={}){
 const tx=data.transfers.find(t=>t.id===id);if(!tx)return data;
 if(revision!==undefined&&(tx.revision||1)!==revision)throw Error('Перевод изменён. Открой его заново');
 const fees=data.transactions.filter(t=>t.transferId===id);
 if(tx.fee&&!fees.length){
  const fee=data.transactions.find(t=>t.id===legacyFeeId);
  if(!fee||fee.transferId||fee.type!=='expense'||fee.amount!==tx.fee||fee.accountId!==tx.from||(fee.currency||'RUB')!==(tx.currency||'RUB')||(fee.balanceEffect||'normal')!==(tx.balanceEffect||'normal'))throw Error('У старого перевода комиссия не связана. Выбери её запись явно перед отменой.');
  fees.push(fee);
 }
 let next=data;for(const fee of fees)next=deleteTransaction(next,fee.id);
 if(tx.balanceEffect!=='history-only'){
  if(!next.accounts.some(a=>a.id===tx.from)||!next.accounts.some(a=>a.id===tx.to))throw Error('Для отмены восстанови оба счёта');
  next={...next,accounts:next.accounts.map(a=>a.id===tx.from?{...a,balance:roundMoney(a.balance+tx.amount)}:a.id===tx.to?{...a,balance:roundMoney(a.balance-tx.amount)}:a)};
 }
 return {...next,transfers:next.transfers.filter(t=>t.id!==id),history:[{id:crypto.randomUUID(),ts:Date.now(),type:'reverse_transfer',before:tx,feeRecords:fees},...(next.history||[])].slice(0,200)};
}
export function updateTransfer(data,values){
 const old=data.transfers.find(t=>t.id===values.id);if(!old)throw Error('Перевод больше не существует');
 const next=reverseTransfer(data,old.id,values);
 const result=transferMoney(next,{...old,...values,balanceEffect:old.balanceEffect||'normal'});
 return {...result,transfers:result.transfers.map(t=>t.id===old.id?{...t,revision:(old.revision||1)+1}:t)};
}
