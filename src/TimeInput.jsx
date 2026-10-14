import React,{useState,useEffect} from 'react';
import {timeInput} from './time-settings.js';
export default function TimeInput({value,onChange,label}){
 const [native,setNative]=useState(false);
 useEffect(()=>{const media=window.matchMedia?.('(pointer: coarse)');if(!media)return;const update=()=>setNative(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return <label>{label}<input type={native?'time':'text'} step={native?'60':undefined} inputMode={native?undefined:'numeric'} maxLength={5} placeholder="ЧЧ:ММ" value={value} onChange={e=>onChange(native?e.target.value:e.target.value.length<value.length&&value.endsWith(':')&&e.target.value===value.slice(0,-1)?value.slice(0,-2):timeInput(e.target.value))} pattern={native?undefined:'([01][0-9]|2[0-3]):[0-5][0-9]'} aria-label={label}/></label>;
}
