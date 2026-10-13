import {useState} from 'react';
import {parseEntry} from './quick-entry.js';
import {putTransaction,undoTransaction} from './ledger.js';
export default function QuickEntry({data,cats,upd,msg}) {
  const [text,setText]=useState(''),[draft,setDraft]=useState(null),[last,setLast]=useState(null),[error,setError]=useState('');
  const preview=e=>{e.preventDefault();try{setDraft(parseEntry(text,data.accounts,cats,new Date().toLocaleDateString('sv-SE')));setError('');}catch(e){setError(e.message);setDraft(null);}};
  const save=()=>{try{let entry;upd(d=>{const next=putTransaction(d,draft);entry=next.history[0];return next;});setLast(entry);setText('');setDraft(null);msg('✓ Записано');}catch(e){setError(e.message);}};
  const undo=()=>{try{upd(d=>undoTransaction(d,last));setLast(null);msg('✓ Отменено');}catch(e){setError(e.message);}};
  const button={border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',background:'var(--accent-dim)',color:'var(--accent)',cursor:'pointer'};
  return <section style={{padding:16,marginBottom:16,border:'1px solid var(--border)',borderRadius:16,background:'var(--s1)'}} aria-label="Записать расход одной строкой">
    <div style={{fontWeight:600,marginBottom:10}}>Записать одной строкой</div>
    <form onSubmit={preview} style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <input value={text} onChange={e=>{setText(e.target.value);setDraft(null);}} placeholder="кофе 180 Сбер · обед 379,50" aria-label="Покупка, сумма и счёт" style={{flex:'1 1 220px',minWidth:0,padding:12,borderRadius:10,border:'1px solid var(--border)',background:'var(--s2)',color:'var(--text)',fontSize:16}}/>
      <button style={button} type="submit">Разобрать</button>
    </form>
    {draft&&<div style={{marginTop:12,lineHeight:1.8}}>
      <div>{draft.type==='lunch'?'Обед':draft.type==='income'?'Доход':'Расход'} · <strong>{draft.amount.toLocaleString('ru-RU')} ₽</strong> · {data.accounts.find(a=>a.id===draft.accountId)?.name||(draft.type==='lunch'?'Оплата компанией':'Без счёта')}</div>
      <label>Категория <select value={draft.cat} disabled={draft.type!=='expense'} onChange={e=>setDraft({...draft,cat:e.target.value})} style={{...button,margin:'0 10px'}}>{draft.type!=='expense'?<option value={draft.cat}>{draft.type==='lunch'?'Обед':'Доход'}</option>:cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button onClick={save} style={button}>Записать</button>
    </div>}
    {last&&!draft&&<button onClick={undo} style={{...button,marginTop:10}}>Отменить последнюю запись</button>}
    {error&&<div role="alert" style={{color:'var(--danger)',marginTop:10}}>{error}</div>}
    <div style={{fontSize:12,color:'var(--muted)',marginTop:10}}>Сначала проверка, затем запись. Название счёта нужно, если их несколько.</div>
  </section>;
}
