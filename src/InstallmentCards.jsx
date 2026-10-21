import React,{useState} from 'react';
import {money,todayMoscow} from './mini-model.js';
import {paidInstallment,installmentRemaining,installmentRemainders} from './finance-tools.js';
import {prepareEvent} from './event-actions.js';
export default function InstallmentCards({data,onPrepare,onEdit,busy}){
 const [error,setError]=useState(''),index=installmentRemainders(data);
 const prepare=p=>{try{setError('');onPrepare(prepareEvent(data,{id:'installment:'+p.id,date:p.date},todayMoscow(data.settings.timeZone)));}catch(e){setError(e.message);}};
 return <>{error&&<p className="mini-warning" role="alert">{error}</p>}{(data.installments||[]).map(plan=>{
 const unpaid=plan.payments.filter(p=>!paidInstallment(data,p,index)),next=unpaid.slice(0,3),remaining=unpaid.reduce((n,p)=>n+installmentRemaining(data,p,index),0),kind=({split:'Сплит',loan:'Кредит',mortgage:'Ипотека',installment:'Рассрочка'})[plan.obligationKind||'installment'];
 const row=p=><div className="installment-payment" key={p.id}><div className="mini-payment-row"><span>{p.date}<small>{money(p.amount,plan.currency)}{!paidInstallment(data,p,index)&&installmentRemaining(data,p,index)<p.amount?` · осталось ${money(installmentRemaining(data,p,index),plan.currency)}`:''}</small></span>{paidInstallment(data,p,index)?<span className="mini-income">Оплачено</span>:<button className="mini-secondary" disabled={busy||!onPrepare} onClick={()=>prepare(p)}>Проверить платёж</button>}</div>{data.transactions.filter(t=>t.installmentPaymentId===p.id).map(t=><button type="button" key={t.id} className="payment-linked-row" disabled={busy||!onEdit} onClick={()=>onEdit(t)}>{t.date} · оплачено {money(t.amount,t.currency)} · открыть запись ↗</button>)}</div>;
 return <article className="mini-card" key={plan.id}><div className="mini-between"><strong>{plan.name}</strong><span className="mini-small mini-muted">{kind}</span></div><p>Осталось <b>{money(remaining,plan.currency)}</b> · {unpaid.length} платежей</p><p className="mini-small mini-muted">Проверь сумму и счёт в общей форме. Списание произойдёт после сохранения.</p>{next.map(row)}{plan.payments.length>next.length&&<details className="obligation-schedule"><summary>Полный график · {plan.payments.length} платежей</summary>{plan.payments.map(row)}</details>}{!unpaid.length&&<p className="mini-income">Погашено</p>}</article>;
 })}</>;
}
