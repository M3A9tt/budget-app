import AppSelect from './AppSelect.jsx';
import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import {plannedLinkCandidates,linkPlannedTransaction,skipPlanned} from './planned-operations.js';
import {money} from './mini-model.js';
export default function RecordedPayment({data,id,period,mutate,busy,sheet=false}){
 const [open,setOpen]=useState(false),[mode,setMode]=useState('link'),[selected,setSelected]=useState(''),[error,setError]=useState(''),[query,setQuery]=useState('');
 const rule=data.recurring.find(r=>r.id===id),rows=plannedLinkCandidates(data,id,period),tx=rows.find(t=>t.id===selected);
 const visible=rows.filter(t=>query.trim().toLocaleLowerCase('ru').split(/\s+/).every(q=>`${t.date} ${t.amount} ${String(t.amount).replace('.',',')} ${t.note||''}`.toLocaleLowerCase('ru').includes(q)));
 if(!rule)return null;
 return <div className="recorded-payment"><button type="button" className="mini-text-button" disabled={busy} aria-expanded={open} onClick={()=>{setOpen(!open);setError('');}}>{sheet&&<Icon name="history" size={18}/>}<span>Уже учтено</span>{sheet&&<Icon name="arrow" size={15}/>}</button>{open&&<div className="recorded-payment-panel">
  <strong>{rule.type==='income'?'Поступление уже учтено?':'Платёж уже учтён?'}</strong>
  <p className="mini-small">Счёт: {data.accounts.find(a=>a.id===rule.accountId)?.name||'Не найден'}. Период: {period==='once'?rule.startDate:period}.</p>
  <div className="recorded-payment-modes" role="group" aria-label="Как учтена сумма">{[['link','Есть запись в истории'],['skip','Учтено в остатке / не нужно']].map(([id,label])=><button type="button" key={id} aria-pressed={mode===id} disabled={busy} onClick={()=>{setMode(id);setError('');}}>{label}</button>)}</div>
  {mode==='link'?<>
   <p className="mini-small mini-muted">Свяжи существующую операцию с этим периодом. Ещё одного списания или поступления не будет.</p>
   <label>Найти запись<input type="search" aria-label="Найти запись" value={query} onChange={e=>{setQuery(e.target.value);setSelected('');}} placeholder="Сумма, дата или описание"/></label>
   <label>Уже записанная операция<AppSelect aria-label="Уже записанная операция" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Выбрать из истории…</option>{visible.slice(0,100).map(t=><option value={t.id} key={t.id}>{t.date} · {money(t.amount,t.currency)} · {t.note||'Без описания'}</option>)}</AppSelect></label>
   {rows.length>0&&!visible.length&&<p role="status">По этому запросу записей нет.</p>}{visible.length>100&&<p className="mini-small">Первые 100 записей. Уточни поиск.</p>}
   {!rows.length&&<p className="mini-small mini-muted">Нет свободных записей того же типа, счёта и валюты. Если сумма уже включена в начальный остаток, выбери второй вариант выше.</p>}
   {tx&&<p className="mini-small">Свяжем {money(tx.amount,tx.currency)} от {tx.date}. Сумма плана: {money(rule.amount,rule.currency)}. Эта запись завершит выбранный период; счета и суммы истории сохранятся.</p>}
   <button type="button" className="mini-secondary" disabled={busy||!tx} onClick={async()=>{try{if(await mutate(d=>linkPlannedTransaction(d,id,period,selected),'Запись связана, повторного списания нет'))setOpen(false);}catch(e){setError(e.message);}}}>Связать без списания</button>
  </>:<>
   <p className="mini-small">Пропустим только этот период. Запись об оплате не появится, остатки и будущий график сохранятся.</p>
   <p className="mini-small mini-muted">Подходит, если ты уже указал реальный остаток после оплаты или этот расход больше не нужен. Если платить ещё предстоит — оставь событие в плане.</p>
   <button type="button" className="mini-secondary" disabled={busy} onClick={async()=>{if(!window.confirm('Пропустить только этот период? Новая операция не появится, остатки не изменятся.'))return;try{if(await mutate(d=>skipPlanned(d,id,period),'Период пропущен, остатки сохранены'))setOpen(false);}catch(e){setError(e.message);}}}>Неактуально в этом периоде</button>
  </>}
  {error&&<p role="alert">{error}</p>}
 </div>}</div>;
}
