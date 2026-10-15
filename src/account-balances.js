export const isSavingAccount=a=>a?.accType==='savings'||a?.savingsKind==='deposit';
export function accountTotals(data){const result={spendable:0,savings:0};for(const a of data.accounts){const amount=a.balance*(data.rates[a.currency||'RUB']||1);result[isSavingAccount(a)?'savings':'spendable']+=amount;}return result;}
