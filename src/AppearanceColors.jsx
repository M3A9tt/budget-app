import React from 'react';
import {appearanceColors} from './appearance.js';

const palette = [
 ['#a8d6bf','Мятный'], ['#a9c8ed','Голубой'], ['#c8b5ee','Лавандовый'],
 ['#ebbbac','Персиковый'], ['#e6cc8e','Золотой'], ['#e6a8be','Розовый'],
];

export default function AppearanceColors({value,onChange,disabled,label='Цвет'}){
 const colors=appearanceColors(value);
 return <fieldset className="wish-colors">
   <legend>{label} · до трёх</legend>
   {palette.map(([color,name])=>{
     const selected=colors.includes(color);
     return <button key={color} type="button" title={name} aria-label={name} aria-pressed={selected}
       disabled={disabled||(!selected&&colors.length===3)} style={{'--swatch':color}}
       onClick={()=>onChange(selected?colors.filter(c=>c!==color):[...colors,color])}>{selected?'✓':''}</button>;
   })}
 </fieldset>;
}
