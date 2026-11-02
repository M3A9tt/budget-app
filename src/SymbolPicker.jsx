import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import Symbol from './Symbol.jsx';
import {ICON_CATALOG} from './icon-catalog.js';
const emojis=['🛒','🍔','🚇','🏠','💊','🎮','🎓','🐈','🎁','☕','💡','📱','✈️','💰','❤️'];
export default function SymbolPicker({value,onChange,disabled=false,label='Значок'}){
 const [query,setQuery]=useState('');
 const rows=ICON_CATALOG.filter(c=>c.name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
 return <details className="symbol-picker"><summary aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault();}}><span className="symbol-picker-preview"><Symbol value={value}/></span><span>{label}<small>{value.emoji?'Эмодзи':ICON_CATALOG.find(c=>c.id===value.icon)?.name||'Выбрать'}</small></span><Icon name="down" size={16}/></summary>
  <input type="search" aria-label="Найти значок" placeholder="Найти значок" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/>
  <div className="symbol-grid" role="group" aria-label="SVG-значки">{rows.map(c=><button key={c.id} type="button" title={c.name} aria-label={'Значок: '+c.name} aria-pressed={!value.emoji&&value.icon===c.id} disabled={disabled} onClick={()=>onChange({icon:c.id,emoji:''})}><Icon name={c.id}/><span>{c.name}</span></button>)}</div>{!rows.length&&<p role="status">Значков не найдено</p>}
  <details className="symbol-emoji-choice"><summary>Эмодзи</summary><div className="emoji-options" role="group" aria-label="Эмодзи">{emojis.map(emoji=><button key={emoji} type="button" aria-label={emoji} aria-pressed={value.emoji===emoji} disabled={disabled} onClick={()=>onChange({icon:value.icon||'other',emoji})}>{emoji}</button>)}</div><label>Свой эмодзи<input aria-label="Свой эмодзи" value={value.emoji||''} maxLength={24} disabled={disabled} onChange={e=>onChange({icon:value.icon||'other',emoji:e.target.value})}/></label><button className="mini-text-button" type="button" disabled={disabled} onClick={()=>onChange({icon:value.icon||'other',emoji:''})}>Убрать эмодзи</button></details>
 </details>;
}
