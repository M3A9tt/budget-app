import React,{useState} from 'react';
import {money,todayMoscow} from './mini-model.js';
import {plannedOccurrences,planType,plannedPaid,billingPeriod} from './planned-model.js';
import {createPlanned,preparePlanned,skipPlanned,restorePlanned,updatePlanned,deletePlanned} from './planned-operations.js';
import {SmoothDetails} from './Motion.jsx';
import OccurrenceDateForm from './OccurrenceDateForm.jsx';
import PlannedForm from './PlannedForm.jsx';
import {paymentDate,paymentStatus,paymentPeriod} from './payment-copy.js';
function SkippedPeriods({rule,mutate,busy}){
 const [limit,setLimit]=useState(5),periods=[...(rule.skippedPeriods||[])].sort().reverse();
 if(!periods.length)return null;
 const label=p=>p==='once'?rule.startDate:p;
 return <details className="plan-skipped"><summary>Пропущенные периоды · {periods.length}</summary><p className="mini-small mini-muted">Пропустил случайно? Верни период в график. Остатки изменятся только после подтверждения оплаты. На паузе и до начала нового графика платёж не появится в предстоящих.</p><ul>{periods.slice(0,limit).map(period=><li key={period}><span>{label(period)}</span><button type="button" className="mini-text-button" disabled={busy} aria-label={'Вернуть в план '+label(period)} onClick={()=>mutate(d=>restorePlanned(d,rule.id,period),'Пропуск отменён, остатки не изменены')}>Вернуть в план</button></li>)}</ul>{periods.length>limit&&<button type="button" className="mini-text-button" onClick={()=>setLimit(n=>n+10)}>Ещё периоды</button>}</details>;
}
export default function PlannedOperations({data,mutate,busy,cats,onPrepare,onEdit,defaultFrequency='monthly',defaultDate='',incomeOnly=false}){
 const today=todayMoscow(data.settings.timeZone),end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+93);
 const due=plannedOccurrences(data,today,end.toISOString().slice(0,10)),[asking,setAsking]=useState(null),[editing,setEditing]=useState(null),[moving,setMoving]=useState(null),[createVersion,setCreateVersion]=useState(0),[error,setError]=useState('');
 const prepare=(r,item,changed)=>{try{onPrepare(preparePlanned(data,r.id,item.period,today,changed));setAsking(null);}catch(e){setError(e.message);}};
 const archived=r=>!r.active||r.frequency==='once'&&(plannedPaid(data,r,'once')||(r.skippedPeriods||[]).includes('once'));
 const card=r=>{const item=due.find(x=>x.rule.id===r.id),income=planType(r)==='income',payments=data.transactions.filter(t=>t.recurringId===r.id).sort((a,b)=>b.date.localeCompare(a.date));return <article className="mini-card planned-card" key={r.id}>
 <div className="mini-between"><strong>{r.name}</strong><b className={r.variable?'payment-unknown-amount':''}>{r.variable?(income?'Сумма неизвестна':'Уточнять сумму'):money(r.amount,r.currency)}</b></div>
 {income&&item&&item.remaining!==null&&item.remaining!==r.amount&&<p className="mini-small">Ожидалось {money(r.amount,r.currency)} · ещё ждём {money(item.remaining,r.currency)}</p>}
 <p className="payment-card-meta">{income?'Доход · ':''}{paymentPeriod(r.frequency,r.dueDay||Number((r.startDate||today).slice(-2)))}{!r.active?' · На паузе':item?' · '+paymentStatus(item,today):' · Нет ближайших платежей'}</p>
 {editing===r.id?<PlannedForm incomeOnly={incomeOnly} key={r.id} data={data} cats={cats} busy={busy} initial={r} onCancel={()=>setEditing(null)} save={async v=>{if(await mutate(d=>updatePlanned(d,r.id,v),'План обновлён, записанные оплаты сохранены')){setEditing(null);return true;}return false;}}/>:<>
 {item&&r.active&&(asking?.id===r.id&&asking?.period===item.period?<div className="planned-confirm"><p>{income?'Сколько поступило?':'Сколько списали?'} <small>За дату {paymentDate(item.date)}</small></p><div className="mini-two"><button className="mini-primary" disabled={busy} onClick={()=>prepare(r,item,false)}>{r.variable?'Указать сумму':money(item.remaining??r.amount,r.currency)}</button><button className="mini-secondary" disabled={busy} onClick={()=>prepare(r,item,true)}>Другая сумма</button></div><button className="mini-text-button" onClick={()=>setAsking(null)}>Отмена</button></div>:<button className="mini-secondary" disabled={busy} onClick={()=>setAsking({id:r.id,period:item.period})}>{income?'Отметить поступление':'Отметить оплату'}</button>)}
 {item&&mutate&&<><button type="button" className="mini-text-button income-move" disabled={busy} onClick={()=>setMoving(moving===r.id?null:r.id)}>Перенести дату</button>{moving===r.id&&<OccurrenceDateForm event={{sourceId:r.id,period:item.period,date:item.date}} today={today} mutate={mutate} busy={busy} onCancel={()=>setMoving(null)} onDone={()=>setMoving(null)}/>}</>}
 <details className="payment-settings planned-actions"><summary>Настроить и посмотреть историю</summary>
 <button className="mini-text-button" disabled={busy} onClick={()=>{setAsking(null);setEditing(r.id);}}>Изменить план</button>
 {r.frequency==='monthly'&&<p className="mini-small mini-muted">Период учёта: {item?billingPeriod(r,item.period):'месяц'}. Планируемая оплата: {item?.date||'по графику'}. Перенос меняет только этот платёж. В коротком месяце — последний день.</p>}
 {item&&r.active&&<button className="mini-text-button" disabled={busy} onClick={()=>{if(window.confirm('Пропустить событие за '+paymentDate(item.date)+'? Записи и списания денег не будет.'))mutate(d=>skipPlanned(d,r.id,item.period),'Платёж пропущен');}}>{income?'Пропустить это поступление':'Пропустить этот платёж'}</button>}
 <button className="mini-text-button" disabled={busy} onClick={()=>mutate(d=>({...d,recurring:d.recurring.map(x=>x.id===r.id?{...x,active:!x.active}:x)}),r.active?'План на паузе':'План возобновлён')}>{r.active?'Приостановить':'Возобновить'}</button>
 <SkippedPeriods rule={r} mutate={mutate} busy={busy}/>
 {payments.length>0&&<details className="payment-history"><summary>{income?'Записанные поступления':'Записанные оплаты'} · {payments.length}</summary>{payments.map(t=><button type="button" className="payment-linked-row" key={t.id} disabled={busy||!onEdit} onClick={()=>onEdit(t)}>{paymentDate(t.date)} · {money(t.amount,t.currency)} · открыть запись ↗</button>)}</details>}
 <button className="mini-text-button" disabled={busy} onClick={()=>{if(window.confirm('Удалить план? Записанные оплаты останутся в истории.'))mutate(d=>deletePlanned(d,r.id),'План удалён, оплаты сохранены');}}>Удалить план</button>
 </details></>}
 </article>;};
 const active=data.recurring.filter(r=>!archived(r)).sort((a,b)=>(due.find(x=>x.rule.id===a.id)?.date||'9999').localeCompare(due.find(x=>x.rule.id===b.id)?.date||'9999')),closed=data.recurring.filter(archived);
 return <><p className="payment-hint">{incomeOnly?'Здесь деньги, которые ещё должны прийти. Остаток увеличится только после записи поступления.':'Отмечай оплату, когда деньги уже списались. Перед записью проверишь сумму и счёт.'}</p>
 <SmoothDetails key={createVersion} className="mini-card mini-disclosure"><summary>{incomeOnly?'Добавить ожидаемый доход':defaultFrequency==='once'?'Добавить разовый платёж':'Добавить регулярный платёж'}</summary><PlannedForm incomeOnly={incomeOnly} initial={{frequency:defaultFrequency,type:incomeOnly?'income':'expense',startDate:defaultDate||today}} data={data} cats={cats} busy={busy} save={async v=>{const ok=await mutate(d=>createPlanned(d,v),'План добавлен');if(ok)setCreateVersion(n=>n+1);return ok;}}/></SmoothDetails>
 {error&&<p className="mini-warning" role="alert">{error}</p>}{active.map(card)}{!active.length&&<p className="mini-small mini-muted">Открытых планов пока нет.</p>}
 {closed.length>0&&<details className="mini-card payment-archive"><summary>Завершённые и на паузе · {closed.length}</summary>{closed.map(card)}</details>}
 </>;
}
