import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import {money} from './mini-model.js';
import {paymentDate} from './payment-copy.js';
import {pastLunchAllowanceChange} from './lunch-budget.js';
import {
  deleteLunchPeriod,LUNCH_PERIOD_LABELS,lunchPauseThrough,lunchPeriodsForDay,resumeLunchPeriod,saveLunchPeriod
} from './lunch-schedule.js';

export default function LunchPeriods({data,today,month,mutate,busy}) {
  const [open,setOpen]=useState(false),[editor,setEditor]=useState(null),[error,setError]=useState('');
  const periods=[...(data.lunchPeriods||[])].sort((a,b)=>a.from.localeCompare(b.from));
  const active=lunchPeriodsForDay(data,today);
  const activeUntil=lunchPauseThrough(data,today);
  const visible=periods.filter(period=>period.to>=today||(period.from.slice(0,7)<=month&&period.to.slice(0,7)>=month));
  const edit=period=>{setError('');setEditor(period);};
  async function change(makeNext,id,message) {
    try {
      setError('');
      const delta=pastLunchAllowanceChange(data,makeNext(data),today,id);
      if(delta&&!window.confirm('Начислено по сегодня: '+(delta>0?'+':'−')+money(Math.abs(delta))+'. Применить?'))return;
      if(await mutate(current=>{
        const next=makeNext(current);
        if(pastLunchAllowanceChange(current,next,today,id)!==delta)throw Error('Лимит изменился. Проверь период и повтори.');
        return next;
      },message))setEditor(null);
    } catch(error) {
      setError(error.message);
    }
  }
  return <section className="lunch-periods">
    <button type="button" className="mini-tx lunch-period-trigger" aria-expanded={open} onClick={()=>setOpen(!open)}>
      <span className="mini-tx-icon"><Icon name="calendar" size={18}/></span>
      <span className="mini-tx-center">
        <strong>Периоды без вопросов</strong>
        {activeUntil&&<small>Пауза по {paymentDate(activeUntil)} включительно</small>}
      </span>
      <Icon name={open?'up':'down'} size={17}/>
    </button>
    {open&&<div className="lunch-period-content view-slide">
      {visible.map(period=><div key={period.id} className="lunch-period-row">
        <div><strong>{LUNCH_PERIOD_LABELS[period.mode]}</strong><small>{period.from} — {period.to}</small></div>
        <div className="lunch-period-actions">
          <button type="button" className="mini-text-button" disabled={busy} onClick={()=>edit(period)}>Изменить</button>
          {active.some(row=>row.id===period.id)&&<button type="button" className="mini-text-button" disabled={busy} onClick={()=>
            change(d=>resumeLunchPeriod(d,period.id,today),period.id,'Период завершён')}>Завершить сегодня</button>}
          <button type="button" className="mini-text-button lunch-period-delete" disabled={busy} onClick={()=>{
            if(window.confirm('Удалить этот период?'))change(d=>deleteLunchPeriod(d,period.id),period.id,'Период удалён');
          }}>Удалить</button>
        </div>
      </div>)}
      {editor?<form className="mini-form lunch-period-form" onSubmit={event=>{
        event.preventDefault();
        const id=editor.id||crypto.randomUUID();
        change(d=>saveLunchPeriod(d,editor,id),id,'Период сохранён');
      }}>
        <div className="entry-timing" role="group" aria-label="Вид периода">
          {Object.entries(LUNCH_PERIOD_LABELS).map(([mode,label])=><button type="button" key={mode} aria-pressed={editor.mode===mode} onClick={()=>setEditor({...editor,mode})}>{label}</button>)}
        </div>
        <div className="mini-two">{[['from','Начало'],['to','Конец']].map(([key,label])=><label key={key}>{label}<input type="date" min={key==='to'&&editor.from?editor.from:'2000-01-01'} max="2100-12-31" required value={editor[key]} onChange={event=>setEditor({...editor,[key]:event.target.value})}/></label>)}</div>
        <small>{editor.mode==='absence'?'Обеденный лимит за эти дни не начисляется.':'Обеденный лимит начисляется по графику.'}</small>
        <div className="lunch-period-actions">
          <button type="submit" className="mini-primary" disabled={busy}>Сохранить период</button>
          <button type="button" className="mini-text-button" onClick={()=>edit(null)}>Отмена</button>
        </div>
      </form>:<button type="button" className="mini-text-button" disabled={busy} onClick={()=>edit({mode:'absence',from:today,to:''})}><Icon name="plus" size={16}/>Добавить период</button>}
      {error&&<p className="mini-warning" role="alert">{error}</p>}
    </div>}
  </section>;
}
