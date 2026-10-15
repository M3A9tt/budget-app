import {isSavingAccount} from './account-balances.js';
import {parseMoney,transferMoney} from './ledger.js';
import {accountInput} from './account-input.js';
export const isSavings=isSavingAccount;
export const savingsKind=a=>a?.savingsKind==='deposit'?'deposit':'savings';
export function moveSavings(data,{direction,savingsId,accountId,amount,date}){
 const savings=data.accounts.find(a=>a.id===savingsId),account=data.accounts.find(a=>a.id===accountId),value=parseMoney(amount);
 if(!savings||!isSavings(savings)||!account||isSavings(account))throw Error('Выберите накопления и повседневный счёт');
 if(!['save','withdraw'].includes(direction))throw Error('Выберите действие');
 if(!Number.isFinite(value)||value<=0)throw Error('Введите положительную сумму');
 const source=direction==='save'?account:savings;
 if(value>source.balance)throw Error('На выбранном счёте недостаточно денег');
 return transferMoney(data,{from:source.id,to:direction==='save'?savings.id:account.id,amount:value,date,note:direction==='save'?'Отложено в накопления':'Возврат из накоплений'});
}
export function createSavings(data,{id,name,currency,kind='savings',balance='0',annualRate='',maturityDate='',from='',amount='',date,storageKind=''}){
 if(!id||data.accounts.some(a=>a.id===id))throw Error('Накопления уже существуют');
 if(!['savings','deposit'].includes(kind))throw Error('Выберите накопительный счёт или вклад');
 const account={id,...accountInput({name:name|| (kind==='deposit'?'Вклад':'Накопления'),currency,kind,balance:from?'0':balance,annualRate,maturityDate,storageKind})};
 if(account.balance<0)throw Error('Остаток накоплений не может быть отрицательным');
 const next={...data,accounts:[...data.accounts,account]};
 return from?moveSavings(next,{direction:'save',savingsId:id,accountId:from,amount,date}):next;
}
export function classifySavings(data,{id,kind,annualRate='',maturityDate='',storageKind=''}){
 const old=data.accounts.find(a=>a.id===id);if(!old)throw Error('Счёт не найден');
 if(!['savings','deposit'].includes(kind))throw Error('Выберите тип накоплений');
 const {savingsKind:unused,annualRate:rate,maturityDate:end,...rest}=old;
 const values=accountInput({name:old.name,balance:String(old.balance),currency:old.currency||'RUB',kind,annualRate,maturityDate,storageKind:kind==='deposit'?'bank':storageKind||old.storageKind||''});
 return {...data,accounts:data.accounts.map(a=>a.id===id?{...rest,...values}:a)};
}
