import React,{useState} from 'react';
import {money,todayMoscow} from './mini-model.js';
import {paidInstallment,installmentRemaining,installmentRemainders} from './finance-tools.js';
import {prepareEvent} from './event-actions.js';
import {sumMoney} from './ledger.js';
import {paymentDate} from './payment-copy.js';
export default function InstallmentCards({data,onPrepare,onEdit,busy}){
 const [error,setError]=useState(''),index=installmentRemainders(data);
 const linked=new Map();for(const t of data.transactions){if(!t.installmentPaymentId)continue;const rows=linked.get(t.installmentPaymentId)||[];rows.push(t);linked.set(t.installmentPaymentId,rows);}
 const prepare=p=>{try{setError('');onPrepare(prepareEvent(data,{id:'installment:'+p.id,date:p.date},todayMoscow(data.settings.timeZone)));}catch(e){setError(e.message);}};
 const renderPlan=plan=>{
 const ordered=[...plan.payments].sort((a,b)=>a.date.localeCompare(b.date)),unpaid=ordered.filter(p=>!paidInstallment(data,p,index)),next=unpaid[0],remaining=sumMoney(unpaid,p=>installmentRemaining(data,p,index)),total=sumMoney(plan.payments,p=>p.amount),progress=total?Math.max(0,Math.min(100,(total-remaining)/total*100)):100,kind=({split:'Сплит',loan:'Кредит',mortgage:'Ипотека',installment:'Рассрочка'})[plan.obligationKind||'installment'];
 const row=p=><div className="installment-payment" key={p.id}><div className="mini-payment-row"><span>{paymentDate(p.date)}<small>{money(p.amount,plan.currency)}{!paidInstallment(data,p,index)&&installmentRemaining(data,p,index)<p.amount?` · осталось ${money(installmentRemaining(data,p,index),plan.currency)}`:''}</small></span>{paidInstallment(data,p,index)?<span className="mini-income">Оплачено</span>:<button className="mini-secondary" disabled={busy||!onPrepare} onClick={()=>prepare(p)}>Проверить платёж</button>}</div>{(linked.get(p.id)||[]).map(t=><button type="button" key={t.id} className="payment-linked-row" disabled={busy||!onEdit} onClick={()=>onEdit(t)}>{t.date} · оплачено {money(t.amount,t.currency)} · открыть запись ↗</button>)}</div>;
 return <article className="mini-card installment-card" key={plan.id}><div className="mini-between"><strong className="installment-card-title">{plan.name}</strong><span className="mini-small mini-muted">{kind}</span></div><div className="installment-progress"><span className="mini-small">Осталось <b>{money(remaining,plan.currency)}</b> · платежей: {unpaid.length}</span><div className="mini-progress" role="progressbar" aria-label="Погашено" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:progress+'%'}}/></div></div>{next?<><span className="installment-next-label">Ближайший неоплаченный платёж</span>{row(next)}</>:<p className="mini-income">Погашено</p>}{ordered.length>(next?1:0)&&<details className="obligation-schedule"><summary>{next?'Остальные платежи':'История оплат'} · {ordered.length-(next?1:0)}</summary>{ordered.filter(p=>p.id!==next?.id).map(row)}</details>}</article>;
 };
 const open=(data.installments||[]).filter(p=>p.payments.some(x=>!paidInstallment(data,x,index))),closed=(data.installments||[]).filter(p=>!p.payments.some(x=>!paidInstallment(data,x,index)));
 return <>{error&&<p className="mini-warning" role="alert">{error}</p>}{open.map(renderPlan)}{!open.length&&<p className="payment-hint">Открытых сплитов и кредитов нет.</p>}{closed.length>0&&<details className="mini-card payment-archive"><summary>Выплаченные · {closed.length}</summary>{closed.map(renderPlan)}</details>}</>;
}
