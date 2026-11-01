import React,{useMemo,useState} from 'react';
import {scheduledEvents,moveDate} from './finance-events.js';
import {prepareEvent} from './event-actions.js';
import {paymentStatus} from './payment-copy.js';
import {money,todayMoscow} from './mini-model.js';
import RecordedPayment from './RecordedPayment.jsx';
import OccurrenceDateForm from './OccurrenceDateForm.jsx';
import Icon from './mini-icons.jsx';

export default function UpcomingPayments({data,busy,onPrepare,mutate,onSource=()=>{}}){
 const today=todayMoscow(data.settings.timeZone),[limit,setLimit]=useState(6),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[scope,setScope]=useState('all'),[selected,setSelected]=useState(''),[moving,setMoving]=useState('');
 const events=useMemo(()=>scheduledEvents(data,today,moveDate(today,30)),[data,today]);
 const accounts=useMemo(()=>new Map(data.accounts.map(a=>[a.id,a.name])),[data.accounts]);
 const week=moveDate(today,6),matchesScope=(e,id)=>id==='unmarked'?e.date<today:id==='week'?e.date>=today&&e.date<=week:true;
 const terms=query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
 const filtered=events.filter(e=>matchesScope(e,scope)&&terms.every(q=>`${e.name} ${e.date} ${e.kind} ${e.billingPeriod||''} ${accounts.get(e.accountId)||''} ${e.amount??''} ${e.amount===null?'':money(e.amount,e.currency)}`.toLocaleLowerCase('ru').includes(q)));
 const groups=[['past','Без отметки о выполнении',e=>e.date<today],['today','Сегодня',e=>e.date===today],['later','Предстоит',e=>e.date>today]];
 const open=event=>{try{setError('');onPrepare(prepareEvent(data,event,today));}catch(e){setError(e.message);}};
 const reset=()=>{setQuery('');setScope('all');setLimit(6);setSelected('');setMoving('');};
 return <section className="payments-upcoming" aria-label="Ближайшие платежи">
  <div className="mini-between"><h3>На 30 дней и ранее без отметки</h3><span className="mini-small mini-muted">{events.length} событий</span></div>
  <p className="payment-hint">Нажми на строку, чтобы выбрать действие.</p>
  <label className="payment-search"><Icon name="search" size={17}/><input type="search" aria-label="Найти платёж" placeholder="Название, счёт, дата или сумма" value={query} onChange={e=>{setQuery(e.target.value);setLimit(6);setSelected('');}}/></label>
  <div className="payment-list-filters" role="group" aria-label="Срок платежей">{[['all','Все'],['unmarked','Без отметки'],['week','7 дней']].map(([id,name])=><button type="button" key={id} aria-pressed={scope===id} onClick={()=>{setScope(id);setLimit(6);setSelected('');setMoving('');}}>{name}<span>{events.filter(e=>matchesScope(e,id)).length}</span></button>)}</div>
  {error&&<p role="alert" className="mini-warning">{error}</p>}
  {groups.map(([id,title,test])=>{
   const rows=filtered.slice(0,limit).filter(test);if(!rows.length)return null;
   return <section className={'payment-date-group payment-date-'+id} key={id} aria-label={title}><h4>{title}</h4>{rows.map(e=>{
    const expanded=selected===e.id;
    return <article className="payment-event" key={e.id} data-payment-event={e.id}>
     <button type="button" className="upcoming-payment" disabled={busy} aria-expanded={expanded} aria-controls={'payment-actions-'+e.id} onClick={()=>{setSelected(expanded?'':e.id);setMoving('');setError('');}}>
      <span className={'upcoming-payment-icon '+(e.type==='income'?'income':'')}><Icon name={e.source==='installment'?'repeat':e.source==='debt'?'wallet':e.type==='income'?'down':'calendar'} size={20}/></span>
      <span className="upcoming-payment-body"><strong>{e.name}</strong><small>{paymentStatus(e,today)} · {e.kind}</small></span>
      <b className={e.type==='income'?'mini-income':''}>{e.amount===null?'Уточнить':(e.type==='income'?'+':'')+money(e.amount,e.currency)}</b><Icon name={expanded?'up':'down'} size={14}/>
     </button>
     {expanded&&<div className="payment-event-actions" id={'payment-actions-'+e.id}>
      <p className="payment-event-account">{accounts.has(e.accountId)?'Счёт: '+accounts.get(e.accountId):'Счёт выберешь перед записью'}{e.billingPeriod&&e.billingPeriod!=='once'?' · За '+e.billingPeriod:''}</p>
      {e.date<today&&<p className="payment-hint">В приложении нет отметки. Если деньги уже учтены, не записывай их повторно.</p>}
      <button type="button" className="mini-primary" disabled={busy} onClick={()=>open(e)}><Icon name={e.type==='income'?'down':'check'} size={17}/>{e.type==='income'?'Записать поступление':'Записать оплату'}</button>
      <p className="payment-hint">Перед сохранением проверишь сумму, счёт и фактическую дату.</p>
      {e.source==='plan'&&mutate&&<><RecordedPayment data={data} id={e.sourceId} period={e.period} mutate={mutate} busy={busy}/><button type="button" className="mini-text-button" disabled={busy} aria-expanded={moving===e.id} onClick={()=>setMoving(moving===e.id?'':e.id)}>Перенести дату</button>{moving===e.id&&<OccurrenceDateForm key={e.id} event={e} today={today} mutate={mutate} busy={busy} onDone={()=>setMoving('')} onCancel={()=>setMoving('')}/>}</>}
      {e.source!=='plan'&&<button type="button" className="mini-text-button" disabled={busy} onClick={()=>onSource(e)}>{e.source==='installment'?'Все сплиты и кредиты':'Мои долги'}</button>}
     </div>}
    </article>;
   })}</section>;
  })}
  {!filtered.length&&<div className="payments-empty" role="status"><Icon name={events.length?'search':'calendar'} size={25}/><strong>{events.length?'Ничего не найдено':'На ближайший месяц событий нет'}</strong>{query||scope!=='all'?<button type="button" className="mini-text-button" onClick={reset}>Сбросить поиск и фильтр</button>:<p className="payment-hint">Новый платёж можно добавить в «Регулярные», «Разовые» или «Сплиты и кредиты».</p>}</div>}
  {filtered.length>limit&&<button type="button" className="mini-text-button" onClick={()=>setLimit(n=>n+10)}>Ещё платежи · {filtered.length-limit}</button>}
 </section>;
}
