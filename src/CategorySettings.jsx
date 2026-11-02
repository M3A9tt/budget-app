import React,{useState} from 'react';
import {saveCustomCategory} from './category-customization.js';
import SymbolPicker from './SymbolPicker.jsx';
import Symbol from './Symbol.jsx';
import {isIcon} from './icon-catalog.js';
export default function CategorySettings({data,mutate,busy}){
 const [id,setId]=useState(''),[name,setName]=useState(''),[appearance,setAppearance]=useState({icon:'tag',emoji:''}),[color,setColor]=useState('#b8dec4'),[error,setError]=useState('');
 const reset=()=>{setId('');setName('');setAppearance({icon:'tag',emoji:''});setColor('#b8dec4');setError('');};
 return <section className="mini-card category-studio"><div className="category-chips">{data.customCats.map(c=><button type="button" key={c.id} disabled={busy} onClick={()=>{setId(c.id);setName(c.name);setAppearance({icon:isIcon(c.icon)?c.icon:'other',emoji:c.emoji||''});setColor(/^#[a-f\d]{6}$/i.test(c.color)?c.color:'#b8dec4');setError('');}}><Symbol value={c} fallback="tag"/> {c.name}<small>Изменить</small></button>)}</div><form className="mini-form" onSubmit={async e=>{e.preventDefault();setError('');try{if(await mutate(d=>saveCustomCategory(d,{name,...appearance,color},id||undefined),'Категория сохранена'))reset();}catch(e){setError(e.message);}}}><label>Название категории<input aria-label="Название категории" value={name} maxLength={60} onChange={e=>setName(e.target.value)} required/></label><SymbolPicker value={appearance} onChange={setAppearance} disabled={busy}/><label>Цвет категории<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><div className="category-preview" style={{borderColor:color}}><Symbol value={appearance}/> {name||'Название категории'}</div>{error&&<p role="alert">{error}</p>}<button className="mini-primary" disabled={busy}>{id?'Сохранить изменения':'Добавить категорию'}</button>{id&&<button type="button" className="mini-text-button" onClick={reset}>Новая категория</button>}</form></section>;
}
