import React from 'react';
import Icon from './mini-icons.jsx';
export default function AccountVisibility({zero,setZero,count}){
 if(!count&&!zero)return null;
 return <div className="account-visibility" role="group" aria-label="Показать счета"><button type="button" aria-pressed={!zero} onClick={()=>setZero(false)}><Icon name="wallet" size={17}/> С деньгами</button><button type="button" aria-pressed={zero} onClick={()=>setZero(true)}><Icon name="archive" size={17}/> Нулевые <span>{count}</span></button></div>;
}
