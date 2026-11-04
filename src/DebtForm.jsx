import AppSelect from './AppSelect.jsx';
import React,{useRef,useState} from 'react';
import {createDebt} from './debt-actions.js';
export default function DebtForm({data,mutate,busy,initialDate='',initialType='my',onDone=()=>{}}){
 const saving=useRef(false),[id,setId]=useState(()=>crypto.randomUUID()),[error,setError]=useState('');
 return <form className="mini-form" aria-label="Новый долг" onSubmit={async e=>{e.preventDefault();if(saving.current||busy)return;const form=e.currentTarget,values=Object.fromEntries(new FormData(form));saving.current=true;try{setError('');if(await mutate(d=>createDebt(d,{...values,id}),'Долг записан')){form.reset();setId(crypto.randomUUID());onDone(values.dueDate);}}catch(e){setError(e.message);}finally{saving.current=false;}}}>
 <fieldset disabled={busy} className="planned-fields"><label>Кому / кто должен<input name="person" required/></label><label>Направление<AppSelect name="type" defaultValue={initialType}><option value="my">Я должен</option><option value="tome">Мне должны</option><option value="transit">Передать дальше</option></AppSelect></label><label>Сумма долга<input name="amount" inputMode="decimal" required/></label>
 <label>Вернуть до<input name="dueDate" type="date" defaultValue={initialDate}/></label><details className="payment-settings"><summary>Валюта и комментарий</summary><label>Валюта<AppSelect name="currency" defaultValue="RUB">{Object.keys(data.rates).map(c=><option key={c}>{c}</option>)}</AppSelect></label><label>Комментарий<input name="note"/></label></details>
 <small className="mini-muted">Добавь оставшуюся сумму долга. Запись не списывает и не зачисляет деньги.</small>{error&&<p role="alert">{error}</p>}<button className="mini-primary" disabled={busy}>Записать долг</button></fieldset></form>;
}
