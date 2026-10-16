// Installment balances share the exact same transactions as the account ledger.
const cents=n=>Math.round(n*100);
export function installmentRemainders(data){
 const balances=new Map(),currencies=new Map();
 for(const plan of data.installments||[])for(const payment of plan.payments){balances.set(payment.id,cents(payment.amount));currencies.set(payment.id,plan.currency||'RUB');}
 for(const t of data.transactions)if(t.installmentPaymentId&&t.type==='expense'&&currencies.get(t.installmentPaymentId)===(t.currency||'RUB'))balances.set(t.installmentPaymentId,balances.get(t.installmentPaymentId)-cents(t.amount));
 return new Map([...balances].map(([id,value])=>[id,Math.max(0,value)/100]));
}
export const installmentRemaining=(data,payment,index)=>((index||installmentRemainders(data)).get(payment.id)??payment.amount);
export const paidInstallment=(data,payment,index)=>installmentRemaining(data,payment,index)===0;
export function validateInstallmentLinks(data){
 const payments=new Map();
 for(const plan of data.installments||[])for(const payment of plan.payments){if(payments.has(payment.id))throw Error('Повторяющийся ID платежа рассрочки');payments.set(payment.id,{plan,payment,paid:0});}
 for(const t of data.transactions.filter(t=>t.installmentPaymentId)){
  const link=payments.get(t.installmentPaymentId);
  if(!link||t.type!=='expense'||t.debtId||t.recurringId||t.cat==='lunch'||!data.accounts.some(a=>a.id===t.accountId)||(t.currency||'RUB')!==link.plan.currency)throw Error('Платёж должен оставаться расходом в валюте связанной рассрочки и со счётом');
  link.paid+=cents(t.amount);
 }
 for(const {payment,paid} of payments.values())if(paid>cents(payment.amount))throw Error('Сумма оплат больше взноса рассрочки. Сначала исправь график или оплату');
 return data;
}
