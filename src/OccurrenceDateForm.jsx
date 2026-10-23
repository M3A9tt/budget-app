import React,{useState,useRef} from 'react';
import {reschedulePlanned} from './planned-operations.js';
export default function OccurrenceDateForm({event,today,mutate,busy,onDone=()=>{},onCancel=()=>{}}){
 const [date,setDate]=useState(event.date<today?today:event.date),[error,setError]=useState(''),saving=useRef(false);
 return <form className="mini-form occurrence-date-form" onSubmit={async e=>{e.preventDefault();if(busy||saving.current)return;saving.current=true;try{setError('');if(await mutate(d=>reschedulePlanned(d,event.sourceId,event.period,date,today),'Дата изменена, остатки не изменились'))onDone(date);}catch(e){setError(e.message);}finally{saving.current=false;}}}>
 <label>Новая дата<input aria-label="Новая дата" type="date" required min={today} value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label><p className="payment-hint">Перенесётся только это событие. Остальной график и записанные операции сохранятся.</p>{error&&<p role="alert">{error}</p>}<div className="payment-form-actions"><button type="button" className="mini-secondary" disabled={busy} onClick={onCancel}>Отмена</button><button className="mini-primary" disabled={busy}>Перенести</button></div></form>;
}
