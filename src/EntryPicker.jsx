import React,{useRef,useState} from 'react';
import Icon from './mini-icons.jsx';
import Symbol from './Symbol.jsx';
export default function EntryPicker({label,value,options,onChange,disabled=false}){
 const dialog=useRef(null),trigger=useRef(null),[query,setQuery]=useState('');
 const close=()=>{dialog.current.close();trigger.current?.focus();};
 const rows=options.filter(o=>(o.name+' '+(o.detail||'')).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
 return <><button ref={trigger} type="button" className="entry-picker-trigger" disabled={disabled} aria-haspopup="dialog" onClick={()=>{setQuery('');dialog.current.showModal();}}><span>{label}</span><strong>{value}</strong><Icon name="down" size={16}/></button><dialog ref={dialog} className="entry-picker" aria-label={label} onCancel={()=>trigger.current?.focus()} onClick={e=>{if(e.target===dialog.current)close();}}><div className="entry-picker-head"><h2>{label}</h2><button type="button" className="mini-text-button" aria-label={'Закрыть: '+label} onClick={close}>Готово</button></div><input type="search" autoFocus aria-label={'Поиск: '+label} placeholder="Найти" value={query} onChange={e=>setQuery(e.target.value)}/><div className="entry-picker-options">{rows.map(o=><button type="button" key={o.id} aria-pressed={o.selected} onClick={()=>{onChange(o.id);close();}}><span className="entry-picker-option">{o.icon&&!o.emoji&&<Symbol value={o} size={19}/>}<span>{o.name}{o.detail&&<small>{o.detail}</small>}</span></span>{o.selected&&<Icon name="check" size={18}/>}</button>)}{!rows.length&&<p role="status">Ничего не найдено</p>}</div></dialog></>;
}
