export const isSavingAccount=a=>a?.accType==='savings'||a?.savingsKind==='deposit';
export function accountTotals(data){const result={spendable:0,savings:0};for(const a of data.accounts){const amount=accountRub(data,a);result[isSavingAccount(a)?'savings':'spendable']+=amount;}return result;}

// Compare purchasing power across currencies without mutating the stored order.
export const accountRub=(data,a)=>a.balance*(data.rates?.[a.currency||'RUB']||1);
export function orderedAccounts(data,accounts=data.accounts){
 return [...accounts].sort((a,b)=>accountRub(data,b)-accountRub(data,a)||a.name.localeCompare(b.name,'ru')||a.id.localeCompare(b.id));
}
