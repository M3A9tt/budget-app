import {roundMoney} from './ledger.js';
export const isSavingAccount=a=>a?.accType==='savings'||a?.savingsKind==='deposit';
export function accountTotals(data){const result={spendable:0,savings:0};for(const a of data.accounts){const amount=accountRub(data,a);const key=isSavingAccount(a)?'savings':'spendable';result[key]=roundMoney(result[key]+amount);}return result;}

// Compare purchasing power across currencies without mutating the stored order.
export const accountRub=(data,a)=>roundMoney(a.balance*(data.rates?.[a.currency||'RUB']||1));
export function orderedAccounts(data,accounts=data.accounts){
 return [...accounts].sort((a,b)=>accountRub(data,b)-accountRub(data,a)||String(a.name||'').localeCompare(String(b.name||''),'ru')||String(a.id).localeCompare(String(b.id)));
}
