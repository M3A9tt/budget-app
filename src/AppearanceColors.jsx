import React from 'react';
import {appearanceColors,accountBackground} from './appearance.js';

export default function AppearanceColors({value,onChange,disabled,label='Цвет'}){
 const colors=appearanceColors(value);
 const update=(index,color)=>{
  const next=[...colors];
  while(next.length<index)next.push('#8199aa');
  next[index]=color;
  onChange(next);
 };
 return <fieldset className="gradient-editor">
  <legend>{label}</legend>
  <div className="gradient-preview" style={accountBackground(colors)} aria-label="Предпросмотр градиента"/>
  <div className="gradient-stops">{[0,1,2].map(index=><div key={index} className="gradient-stop">
   <label><span>Цвет {index+1}</span><input type="color" aria-label={'Цвет '+(index+1)+' RGB'} value={colors[index]||'#8199aa'} disabled={disabled} onChange={e=>update(index,e.target.value)}/></label>
   <input aria-label={'Цвет '+(index+1)+' HEX'} placeholder="#RRGGBB" defaultValue={colors[index]||''} key={colors[index]||'empty'} maxLength={7} disabled={disabled} onBlur={e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value))update(index,e.target.value);else e.target.value=colors[index]||'';}}/>
   {colors[index]&&<button type="button" aria-label={'Убрать цвет '+(index+1)} disabled={disabled} onClick={()=>onChange(colors.filter((_,i)=>i!==index))}>×</button>}
  </div>)}</div>
 </fieldset>;
}
