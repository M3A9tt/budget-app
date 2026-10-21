import React from 'react';
import Icon from './mini-icons.jsx';
export default function AccountVisibility({zero,setZero,count}){
 if(!count&&!zero)return null;
 return <div className="account-visibility"><button type="button" aria-expanded={zero} onClick={()=>setZero(!zero)}><Icon name="archive" size={16}/>{zero?'Скрыть нулевые':'Показать нулевые'} <span>{count}</span></button></div>;
}
