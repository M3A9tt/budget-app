import AppSelect from './AppSelect.jsx';
import DebtForm from './DebtForm.jsx';
import {orderedAccounts} from './account-balances.js';
import React,{useState,useEffect,useRef} from 'react';
import {SmoothDetails} from './Motion.jsx';
import {money,todayMoscow} from './mini-model.js';
import {repayDebt,setDebtDueDate} from './debt-actions.js';
import {debtRemaining,debtPayments,canLinkDebtTransaction} from './debt-state.js';
export default function DebtTools({data,mutate,busy,onEdit,showHeading=true}){
 const paymentForm=useRef(null);
 const [selected,setSelected]=useState(''),[mode,setMode]=useState('new'),[creating,setCreating]=useState(false);
 useEffect(()=>{if(selected)paymentForm.current?.scrollIntoView({behavior:'smooth',block:'center'});},[selected]);
 const today=todayMoscow(data.settings.timeZone),debt=data.debts.find(d=>d.id===selected),remaining=debt?debtRemaining(debt,data):0;
 const submit=fn=>async e=>{e.preventDefault();const form=e.currentTarget,v=Object.fromEntries(new FormData(form));if(await fn(v))form.reset();};
 const label=d=>d.type==='tome'?'Мне должны':d.type==='transit'?'Передать дальше':'Я должен';
 const cards=data.debts.map(d=>({...d,remaining:debtRemaining(d,data)}));
 return <>
 <div className="mini-card">{showHeading&&<h3>Долги</h3>}{cards.filter(d=>d.remaining>0).map(d=><div className="debt-linked-card" key={d.id} data-payment-source={d.id} tabIndex={-1}>
 <div className="mini-between"><div><strong>{d.person}</strong><small className="mini-muted">{label(d)}{d.dueDate?' · до '+d.dueDate:''}</small></div><b>{money(d.remaining,d.currency)}</b></div>
 {d.note&&<p className="mini-small mini-muted">{d.note}</p>}
 <button className="mini-secondary" disabled={busy} onClick={()=>{setSelected(d.id);setMode('new');}}>{d.type==='tome'?'Получил возврат':'Отметить возврат'}</button>
 <SmoothDetails className="mini-small"><summary>Срок и возвраты</summary><form className="mini-form" onSubmit={submit(v=>mutate(x=>setDebtDueDate(x,{id:d.id,dueDate:v.dueDate}),'Срок возврата обновлён'))}><label>Срок возврата<input name="dueDate" type="date" defaultValue={d.dueDate||''}/></label><button className="mini-secondary" disabled={busy}>Сохранить срок</button></form>{debtPayments(data,d).map(p=><div className="mini-payment-row" key={p.id}><span>{p.date}<small>{p.legacy?'Старая отметка · остатки не менялись':data.accounts.find(a=>a.id===p.accountId)?.name||'Операция'}</small></span>{p.transactionId&&onEdit?<button className="mini-text-button" onClick={()=>onEdit(data.transactions.find(t=>t.id===p.transactionId))}>{money(p.amount,d.currency)} ↗</button>:<b>{money(p.amount,d.currency)}</b>}</div>)}</SmoothDetails>
 </div>)}{!cards.some(d=>d.remaining>0)&&<p className="mini-muted">Открытых долгов нет.</p>}</div>
 {debt&&remaining>0&&<div className="mini-card mini-form" ref={paymentForm} role="region" aria-label="Возврат долга"><div className="mini-between"><h3>{debt.person} · {money(remaining,debt.currency)}</h3><button className="mini-text-button" onClick={()=>setSelected('')}>Отмена</button></div><div className="mini-tabs"><button className={mode==='new'?'selected':''} onClick={()=>setMode('new')}>Записать возврат</button><button className={mode==='existing'?'selected':''} onClick={()=>setMode('existing')}>Уже в истории</button></div>
 <form className="mini-form" onSubmit={submit(async v=>{const ok=await mutate(d=>repayDebt(d,{id:debt.id,...v}),'Возврат связан с долгом');if(ok)setSelected('');return ok;})}>
 {mode==='new'?<><label>Сумма, {debt.currency}<input name="amount" inputMode="decimal" defaultValue={remaining} required/></label><label>{debt.type==='tome'?'Куда поступили деньги':'Откуда вернул'}<AppSelect name="accountId" required defaultValue=""><option value="">Выбрать…</option>{orderedAccounts(data).filter(a=>(a.currency||'RUB')===(debt.currency||'RUB')).map(a=><option key={a.id} value={a.id}>{a.name} · {money(a.balance,a.currency)}</option>)}</AppSelect></label><label>Дата возврата<input name="date" type="date" defaultValue={today} max={today} required/></label><small className="mini-muted">Изменит остаток счёта и появится в истории.</small></>:<><label>Операция<AppSelect name="transactionId" required defaultValue=""><option value="">Выбрать…</option>{data.transactions.filter(t=>canLinkDebtTransaction(t,debt)&&t.date<=today&&t.amount<=remaining).sort((a,b)=>b.date.localeCompare(a.date)).map(t=><option key={t.id} value={t.id}>{t.date} · {money(t.amount,t.currency)} · {t.note||data.accounts.find(a=>a.id===t.accountId)?.name}</option>)}</AppSelect></label><small className="mini-muted">Свяжет операцию с долгом без повторного списания.</small></>}
 <button className="mini-primary" disabled={busy}>{mode==='new'?'Записать возврат':'Связать с долгом'}</button></form></div>}
 <section className="debt-create"><button type="button" className="mini-secondary" aria-expanded={creating} onClick={()=>setCreating(!creating)}>{creating?'Закрыть форму':'＋ Добавить долг'}</button>{creating&&<DebtForm data={data} mutate={mutate} busy={busy} onDone={()=>setCreating(false)}/>}</section>
 {cards.some(d=>d.remaining===0)&&<SmoothDetails className="mini-card"><summary>Погашенные · {cards.filter(d=>d.remaining===0).length}</summary>{cards.filter(d=>d.remaining===0).map(d=><div className="debt-linked-card" key={d.id}><strong>{d.person} · {label(d)}</strong>{debtPayments(data,d).map(p=>p.transactionId&&onEdit?<button className="payment-linked-row" key={p.id} onClick={()=>onEdit(data.transactions.find(t=>t.id===p.transactionId))}>{p.date} · {money(p.amount,d.currency)} ↗</button>:<p className="mini-small" key={p.id}>{p.date} · {money(p.amount,d.currency)}</p>)}</div>)}</SmoothDetails>}
 </>;
}
