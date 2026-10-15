import {parseMoney} from './ledger.js';
export function accountInput({name,balance,currency,kind,annualRate='',maturityDate='',storageKind=''}){
 const amount=parseMoney(balance||'0');if(!Number.isFinite(amount))throw Error('Введите корректный остаток');if(!String(name||'').trim())throw Error('Введите название счёта');
 if(!['regular','savings','deposit'].includes(kind))throw Error('Выберите тип счёта');
 const account={name:name.trim(),balance:amount,currency,accType:kind==='deposit'?'savings':kind};
 if(storageKind&&!['bank','cash','other'].includes(storageKind))throw Error('Укажите, где хранятся деньги');
 if(kind==='deposit'&&storageKind&&storageKind!=='bank')throw Error('Вклад хранится в банке');
 if(storageKind)account.storageKind=storageKind;
 if(kind==='deposit'){
  account.savingsKind='deposit';
  if(annualRate!==''){const rate=parseMoney(annualRate);if(!Number.isFinite(rate)||rate<0)throw Error('Ставка не может быть отрицательной');account.annualRate=rate;}
  if(maturityDate){if(!/^\d{4}-\d{2}-\d{2}$/.test(maturityDate)||Number.isNaN(Date.parse(maturityDate))||new Date(maturityDate+'T12:00:00Z').toISOString().slice(0,10)!==maturityDate)throw Error('Проверьте дату окончания');account.maturityDate=maturityDate;}
 }
 return account;
}
