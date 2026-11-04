import AppSelect from './AppSelect.jsx';
import EntryPicker from './EntryPicker.jsx';
import EntryMoney from './EntryMoney.jsx';
import React,{useState} from 'react';
import SymbolPicker from './SymbolPicker.jsx';
import {EMPTY} from './mini-model.js';
import {accountInput} from './account-input.js';
export default function AccountForm({onSave,busy,regularOnly=false}){
 const [appearance,setAppearance]=useState({icon:'wallet',emoji:''});
 const [kind,setKind]=useState('regular'),[name,setName]=useState(''),[balance,setBalance]=useState(''),[currency,setCurrency]=useState('RUB'),[annualRate,setAnnualRate]=useState(''),[maturityDate,setMaturityDate]=useState(''),[error,setError]=useState(''),[storageKind,setStorageKind]=useState('');
 return <form className="mini-form account-create-form" onSubmit={async e=>{e.preventDefault();try{setError('');if(await onSave(accountInput({name,balance,currency,kind,...appearance,annualRate,maturityDate,storageKind:kind==='deposit'?'bank':storageKind}))){setName('');setBalance('');setAnnualRate('');setMaturityDate('');}}catch(e){setError(e.message);}}}>{!regularOnly&&<label>Тип<AppSelect value={kind} onChange={e=>setKind(e.target.value)}><option value="regular">Обычный счёт</option><option value="savings">Накопительный счёт / копилка</option><option value="deposit">Вклад</option></AppSelect></label>}<label htmlFor="account-name">Название</label><input id="account-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Например, Альфа или наличные" required/>
 {kind!=='deposit'&&<EntryPicker label="Где деньги" value={({'':'Не уточнять',bank:'Банк / карта',cash:'Наличные',other:'Другое'})[storageKind]} options={[['','Не уточнять'],['bank','Банк / карта'],['cash','Наличные'],['other','Другое']].map(([id,name])=>({id,name,selected:id===storageKind}))} onChange={setStorageKind} disabled={busy}/>}
 <EntryMoney id="account-balance" label="Текущий остаток" amount={balance} unit={currency==='RUB'?'₽':currency} onAmount={e=>setBalance(e.target.value)} disabled={busy}/>
 <EntryPicker label="Валюта" value={currency} options={Object.keys(EMPTY.rates).map(c=>({id:c,name:c,selected:c===currency}))} onChange={setCurrency} disabled={busy}/>
 {kind==='deposit'&&<><div className="mini-two"><label>Ставка, % годовых · необязательно<input value={annualRate} onChange={e=>setAnnualRate(e.target.value)} inputMode="decimal" placeholder="Например, 12"/></label><label>Дата окончания · необязательно<input type="date" value={maturityDate} onChange={e=>setMaturityDate(e.target.value)}/></label></div><p className="mini-small mini-muted">Ставка справочная: проценты не прибавляются автоматически. После зачисления запиши их как доход на вклад. Окончание срока не меняет остаток само по себе.</p></>}
 <SymbolPicker value={appearance} onChange={setAppearance} disabled={busy}/>{kind!=='regular'&&<p className="mini-small mini-muted">Эти деньги не входят в свободный остаток для покупок. Если переводишь деньги с уже заведённого счёта, создай новый с нулём и запиши перевод между счетами.</p>}
 {error&&<p role="alert" className="mini-small">{error}</p>}<button className="mini-primary" disabled={busy}>Добавить счёт</button></form>;
}
