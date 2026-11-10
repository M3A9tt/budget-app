import {counted} from './analytics-report.js';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {scheduledEvents,moveDate} from './finance-events.js';
import {prepareEvent} from './event-actions.js';
import {paymentDate,paymentStatus} from './payment-copy.js';
import {money,todayMoscow} from './mini-model.js';
import RecordedPayment from './RecordedPayment.jsx';
import OccurrenceDateForm from './OccurrenceDateForm.jsx';
import Icon from './mini-icons.jsx';

const periodLabel=period=>/^\d{4}-\d{2}$/.test(period||'')?new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(period+'-01T12:00Z')):period&&period!=='once'?paymentDate(period):'';

export default function UpcomingPayments({personal=false,data,busy,onPrepare,mutate,onSource=()=>{},listState,onListChange}){
 const today=todayMoscow(data.settings.timeZone),[error,setError]=useState('');
 const [localList,setLocalList]=useState({}),[moving,setMoving]=useState('');
 const {query='',scope='all',limit=6,selected=''}=listState||localList;
 const updateList=onListChange||setLocalList;
 const change=patch=>updateList(previous=>({...previous,...patch}));
 const events=useMemo(()=>scheduledEvents(data,today,moveDate(today,30)),[data,today]);
 const accounts=useMemo(()=>new Map(data.accounts.map(a=>[a.id,a.name])),[data.accounts]);
 const week=moveDate(today,6),matchesScope=(e,id)=>id==='unmarked'?e.date<today:id==='week'?e.date>=today&&e.date<=week:true;
 const terms=query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
 const filtered=events.filter(e=>matchesScope(e,scope)&&terms.every(q=>`${e.name} ${e.date} ${e.kind} ${e.billingPeriod||''} ${accounts.get(e.accountId)||''} ${e.amount??''} ${e.amount===null?'':money(e.amount,e.currency)}`.toLocaleLowerCase('ru').includes(q)));
 const groups=[['past','Без отметки о выполнении',e=>e.date<today],['today','Сегодня',e=>e.date===today],['later','Предстоит',e=>e.date>today]];
 const open=event=>{try{setError('');onPrepare(prepareEvent(data,event,today));}catch(e){setError(e.message);}};
 const searchField=useRef(null),rowButtons=useRef(new Map());
 const restoreRowFocus=id=>globalThis.requestAnimationFrame?.(()=>{(rowButtons.current.get(id)||searchField.current)?.focus({preventScroll:true});});
 const restoredSelection=useRef(selected);
 useEffect(()=>{const id=restoredSelection.current;restoredSelection.current='';if(id)restoreRowFocus(id);},[]);
 const reset=()=>{change({query:'',scope:'all',limit:6,selected:''});setMoving('');searchField.current?.focus();};
 return <section className="payments-upcoming" aria-label="Ближайшие платежи">
  <div className="mini-between"><h3>{personal?'Ближайшие события':'На 30 дней и ранее без отметки'}</h3><span className="mini-small mini-muted">{counted(events.length,'событие','события','событий')}</span></div>
  {!personal&&<p className="payment-hint">Нажми на строку, чтобы выбрать действие.</p>}
  <label className="payment-search"><Icon name="search" size={17}/><input ref={searchField} type="search" aria-label="Найти платёж" placeholder="Название, счёт, дата или сумма" value={query} onChange={e=>{change({query:e.target.value,limit:6,selected:''});setMoving('');}}/></label>
  <div className="payment-list-filters" role="group" aria-label="Срок платежей">{[['all','Все'],['unmarked','Без отметки'],['week','7 дней']].map(([id,name])=><button type="button" key={id} aria-pressed={scope===id} onClick={()=>{change({scope:id,limit:6,selected:''});setMoving('');}}>{name}<span>{events.filter(e=>matchesScope(e,id)).length}</span></button>)}</div>
  {error&&<p role="alert" className="mini-warning">{error}</p>}
  {groups.map(([id,title,test])=>{
   const rows=filtered.slice(0,limit).filter(test);if(!rows.length)return null;
   const renderEvent=e=>{
    const expanded=selected===e.id,controls='payment-actions-'+e.id;
    const toggle=()=>{if(busy)return;change({selected:expanded?'':e.id});setMoving('');setError('');};
    const amount=e.amount===null?'Уточнить':(e.type==='income'?'+':personal?'−':'')+money(e.amount,e.currency);
    const actions=expanded&&<div className="payment-event-actions" id={'payment-actions-'+e.id}>
      <p className="payment-event-account">{accounts.has(e.accountId)?'Счёт: '+accounts.get(e.accountId):'Счёт выберешь перед записью'}{periodLabel(e.billingPeriod)?' · За '+periodLabel(e.billingPeriod):''}</p>
      {e.date<today&&<p className="payment-hint">В приложении нет отметки. Если деньги уже учтены, не записывай их повторно.</p>}
      <button type="button" className="mini-primary" disabled={busy} onClick={()=>open(e)}><Icon name={e.type==='income'?'down':'check'} size={17}/>{e.type==='income'?'Записать поступление':'Записать оплату'}</button>
      <p className="payment-hint">Перед сохранением проверишь сумму, счёт и фактическую дату.</p>
      {e.source==='plan'&&mutate&&<RecordedPayment data={data} id={e.sourceId} period={e.period} mutate={async(fn,message)=>{const ok=await mutate(fn,message);if(ok)restoreRowFocus(e.id);return ok;}} busy={busy}/>}
      {mutate&&<><button type="button" className="mini-text-button" disabled={busy} aria-expanded={moving===e.id} onClick={()=>setMoving(moving===e.id?'':e.id)}>Перенести дату</button>{moving===e.id&&<OccurrenceDateForm key={e.id} event={e} today={today} mutate={mutate} busy={busy} quickDates={personal} onDone={()=>{setMoving('');restoreRowFocus(e.id);}} onCancel={()=>{setMoving('');restoreRowFocus(e.id);}}/>}</>}
      {(personal||e.source!=='plan')&&<button type="button" className="mini-text-button" disabled={busy} onClick={()=>onSource(e)}>{e.source==='plan'?'Открыть план':e.source==='installment'?'Открыть график':'Открыть долг'}</button>}

     </div>;
    if(personal){
     const period=periodLabel(e.billingPeriod),moved=e.originalDate&&e.originalDate!==e.date;
     const dateText=paymentDate(e.date),meta=[period?'За '+period:e.kind,moved?'Перенос с '+paymentDate(e.originalDate):'',e.date<today?'Без отметки':''].filter(Boolean);
     return <tbody className="payment-event-record" key={e.id} data-payment-event={e.id}><tr className="payment-table-event" onClick={click=>{if(!click.target.closest('button'))toggle();}}>
      <td className="payment-table-date"><time dateTime={e.date} aria-label={dateText}><b>{Number(e.date.slice(-2))}</b><span>{dateText.replace(/^\d+\s+/,'')}</span></time></td>
      <td className="payment-table-name"><button type="button" className="upcoming-payment" ref={button=>{if(button)rowButtons.current.set(e.id,button);else rowButtons.current.delete(e.id);}} disabled={busy} aria-label={e.name} aria-describedby={controls+'-meta'} aria-expanded={expanded} aria-controls={expanded?controls:undefined} onClick={toggle}><strong>{e.name}</strong><small id={controls+'-meta'}>{meta.map((label,i)=><span key={i}>{label}</span>)}</small></button></td>
      <td className="desktop-number payment-table-amount"><span><b className={e.type==='income'?'mini-income':undefined}>{amount}</b><Icon name={expanded?'up':'down'} size={14}/></span></td>
     </tr>{expanded&&<tr><td className="payment-table-details" colSpan={3}>{actions}</td></tr>}</tbody>;
    }
    return <article className="payment-event" key={e.id} data-payment-event={e.id}>
     <button type="button" className="upcoming-payment" ref={button=>{if(button)rowButtons.current.set(e.id,button);else rowButtons.current.delete(e.id);}} disabled={busy} aria-expanded={expanded} aria-controls={expanded?controls:undefined} onClick={toggle}>
      <span className={'upcoming-payment-icon '+(e.type==='income'?'income':'')}><Icon name={e.source==='installment'?'repeat':e.source==='debt'?'wallet':e.type==='income'?'down':'calendar'} size={20}/></span>
      <span className="upcoming-payment-body"><strong>{e.name}</strong><small>{paymentStatus(e,today)} · {e.kind}</small></span>
      <b className={e.type==='income'?'mini-income':''}>{amount}</b><Icon name={expanded?'up':'down'} size={14}/>
     </button>{actions}
    </article>;
   };
   return <section className={'payment-date-group payment-date-'+id} key={id} aria-label={title}><h4>{title}</h4>{personal?
    <div className="desktop-table-wrap payment-table-wrap"><table className="desktop-transactions payment-table" aria-label={title}><thead><tr><th scope="col">Дата</th><th scope="col">Событие</th><th scope="col" className="desktop-number">Сумма</th></tr></thead>{rows.map(renderEvent)}</table></div>:rows.map(renderEvent)}</section>;
  })}
  {!filtered.length&&<div className="payments-empty"><Icon name={events.length?'search':'calendar'} size={25}/><strong role="status">{events.length?'Ничего не найдено':'На ближайший месяц событий нет'}</strong>{query||scope!=='all'?<button type="button" className="mini-text-button" onClick={reset}>Сбросить поиск и фильтр</button>:<p className="payment-hint">Новый платёж можно добавить в «Регулярные», «Разовые» или «Сплиты и кредиты».</p>}</div>}
  {filtered.length>limit&&<button type="button" className="mini-text-button" onClick={()=>change({limit:limit+10})}>Ещё платежи · {filtered.length-limit}</button>}
 </section>;
}
