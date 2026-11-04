import React,{useState} from 'react';
import {money,todayMoscow} from './mini-model.js';
import {reconcileAccount} from './finance-tools.js';
import {parseMoney} from './ledger.js';
import {orderedAccounts} from './account-balances.js';
import EntryMoney from './EntryMoney.jsx';
import EntryPicker from './EntryPicker.jsx';
import Icon from './mini-icons.jsx';

export default function ReconcileForm({data,accountId,mutate,busy}){
 const [picked,setPicked]=useState(accountId||''),[balance,setBalance]=useState(''),[note,setNote]=useState(''),[error,setError]=useState('');
 const account=data.accounts.find(a=>a.id===picked);
 const amount=parseMoney(balance);
 const difference=account&&balance.trim()&&Number.isFinite(amount)?amount-account.balance:null;
 async function submit(event){
  event.preventDefault();
  try{
   setError('');
   await mutate(d=>reconcileAccount(d,{accountId:picked,balance,note,date:todayMoscow(d.settings.timeZone)}),'Остаток сверен');
  }catch(e){setError(e.message);}
 }
 return <form className="mini-form reconcile-form" onSubmit={submit}>
  <EntryPicker label="Счёт" value={account?.name||'Выбрать счёт'} colors={account?.colors} options={orderedAccounts(data).map(a=>({...a,detail:money(a.balance,a.currency),selected:a.id===picked}))} disabled={busy} onChange={id=>{setPicked(id);setBalance('');}}/>
  <EntryMoney id="balance" label="Фактический остаток" amount={balance} unit={account?.currency==='RUB'?'₽':account?.currency||'₽'} disabled={busy} onAmount={e=>setBalance(e.target.value)}/>
  {account&&<div className="reconcile-comparison"><span>В Бюрджете <b>{money(account.balance,account.currency)}</b></span>{difference!==null&&<span>Изменение <b>{difference>0?'+':''}{money(difference,account.currency)}</b></span>}</div>}
  <label className="reconcile-note"><Icon name="message" size={18}/><input name="note" aria-label="Комментарий" placeholder="Комментарий · необязательно" value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
  {difference!==null&&difference!==0&&<p className="mini-small mini-warning">Остаток счёта изменится на {money(difference,account.currency)}. Покупки и доходы останутся в истории.</p>}
  {error&&<p role="alert">{error}</p>}
  <button className="mini-primary" disabled={busy||!account}>{busy?'Сохраняем…':'Подтвердить остаток'}<Icon name="check" size={18}/></button>
 </form>;
}
