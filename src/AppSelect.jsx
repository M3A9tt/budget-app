import React,{Children,useEffect,useLayoutEffect,useRef,useState} from 'react';
import EntryPicker from './EntryPicker.jsx';

// Keep the native field as the form value and validation source. The existing
// picker supplies the same searchable interaction across all application forms.
export default function AppSelect({children,onChange,value,defaultValue,...props}){
 const field=useRef(null);
 const [current,setCurrent]=useState(value??defaultValue??'');
 const [label,setLabel]=useState(props['aria-label']||'Выбрать');
 const [invalid,setInvalid]=useState(false);
 const rows=Children.toArray(children).filter(child=>React.isValidElement(child)&&child.type==='option').map(child=>{
  const name=Children.toArray(child.props.children).join('');
  return {id:String(child.props.value??name),name,disabled:child.props.disabled};
 });
 const selected=String(value??current);
 useLayoutEffect(()=>{
  const element=field.current;
  if(!element)return;
  setCurrent(element.value);
  const owner=element.labels?.[0]?.cloneNode(true);
  owner?.querySelectorAll('.app-select').forEach(node=>node.remove());
  setLabel(props['aria-label']||owner?.textContent?.trim()||'Выбрать');
 },[children,value,props['aria-label']]);
 useEffect(()=>{
  const form=field.current?.form;
  const reset=()=>queueMicrotask(()=>{setCurrent(field.current?.value??'');setInvalid(false);});
  form?.addEventListener('reset',reset);
  return ()=>form?.removeEventListener('reset',reset);
 },[]);
 function choose(next){
  const element=field.current;
  if(!element)return;
  element.value=next;
  setCurrent(next);
  setInvalid(false);
  onChange?.({target:element,currentTarget:element,type:'change'});
 }
 return <span className="app-select">
  <select {...props} ref={field} tabIndex={-1} aria-hidden="true" value={value} defaultValue={defaultValue} className={(props.className||'')+' app-select-native'} onChange={event=>{setCurrent(event.target.value);setInvalid(false);onChange?.(event);}} onInvalid={event=>{event.preventDefault();setInvalid(true);field.current?.parentElement.querySelector('button')?.focus();}}>{children}</select>
  <EntryPicker label={label} value={rows.find(row=>row.id===selected)?.name||'Выбрать'} options={rows.map(row=>({...row,selected:row.id===selected}))} disabled={props.disabled} onChange={choose}/>
  {invalid&&<small role="alert">Выбери значение</small>}
 </span>;
}
