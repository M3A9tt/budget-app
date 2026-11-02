// A transaction can settle one financial source, never several unrelated ones.
const links=['transferId','debtId','recurringId','installmentPaymentId','installmentRefundId','lunchId'];
export const isFreeTransaction=tx=>!links.some(key=>tx[key])&&tx.type!=='lunch'&&tx.cat!=='lunch';
export function validateTransactionRoles(tx){
 if(links.filter(key=>tx[key]).length>1)throw Error('Операция уже связана с другим источником. Комиссия, долг и план учитываются отдельно');
 if(tx.transferId&&(tx.type!=='expense'||tx.cat==='lunch'||!tx.accountId))throw Error('Комиссия должна оставаться расходом по переводу');
 return tx;
}
export function validateTransferLinks(data){
 for(const tx of data.transactions){validateTransactionRoles(tx);if(!tx.transferId)continue;
  const transfer=data.transfers.find(t=>t.id===tx.transferId);
  if(!transfer||tx.type!=='expense'||tx.accountId!==transfer.from||(tx.currency||'RUB')!==(transfer.currency||'RUB')||tx.amount!==transfer.fee||(tx.balanceEffect||'normal')!==(transfer.balanceEffect||'normal'))throw Error('Комиссия не соответствует переводу');
 }
 for(const t of data.transfers){const fees=data.transactions.filter(tx=>tx.transferId===t.id);
  if(fees.length>1||t.feeTransactionId!==undefined&&(t.fee?fees.length!==1||fees[0].id!==t.feeTransactionId:fees.length!==0||t.feeTransactionId!==''))throw Error('Перевод и комиссия должны изменяться вместе');
 }
 return data;
}
