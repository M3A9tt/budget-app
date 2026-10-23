import React,{useState} from 'react';
import {scheduledEvents,moveDate} from './finance-events.js';
import {prepareEvent} from './event-actions.js';
import {paymentStatus} from './payment-copy.js';
import {money,todayMoscow} from './mini-model.js';
import Icon from './mini-icons.jsx';

export default function UpcomingPayments({data,busy,onPrepare}){
 const today=todayMoscow(data.settings.timeZone),[limit,setLimit]=useState(6),[error,setError]=useState(''),events=scheduledEvents(data,today,moveDate(today,30));
 const open=event=>{try{setError('');onPrepare(prepareEvent(data,event,today));}catch(e){setError(e.message);}};
 return <section className="payments-upcoming" aria-label="Ближайшие платежи"><div className="mini-between"><h3>Ближайшие 30 дней</h3><span className="mini-small mini-muted">{events.length} событий</span></div><p className="payment-hint">Нажми на платёж, чтобы проверить и записать оплату. «Нет отметки» означает, что оплату ещё не подтвердили в приложении.</p>
 {error&&<p role="alert" className="mini-warning">{error}</p>}
 {events.slice(0,limit).map(e=><button className="upcoming-payment" key={e.id} disabled={busy} onClick={()=>open(e)}><span className={'upcoming-payment-icon '+(e.type==='income'?'income':'')}><Icon name={e.source==='installment'?'repeat':e.source==='debt'?'wallet':e.type==='income'?'down':'calendar'} size={20}/></span><span className="upcoming-payment-body"><strong>{e.name}</strong><small>{paymentStatus(e,today)} · {e.kind}</small></span><b className={e.type==='income'?'mini-income':''}>{e.amount===null?'Уточнить':(e.type==='income'?'+':'')+money(e.amount,e.currency)}</b><Icon name="arrow" size={14}/></button>)}
 {!events.length&&<div className="mini-card"><strong>На ближайший месяц платежей нет</strong><p className="payment-hint">Добавь сплит, регулярный платёж или долг в нужном разделе.</p></div>}
 {events.length>limit&&<button className="mini-text-button" onClick={()=>setLimit(n=>n+10)}>Ещё платежи · {events.length-limit}</button>}
 </section>;
}
