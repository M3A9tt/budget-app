import React,{useState} from 'react';
import SymbolPicker from './SymbolPicker.jsx';
import {setAccountAppearance} from './appearance.js';
import {isIcon} from './icon-catalog.js';
export default function AccountAppearance({account,mutate,busy}){
 const [value,setValue]=useState({icon:isIcon(account.icon)?account.icon:'wallet',emoji:account.emoji||''}),[error,setError]=useState('');
 return <details className="account-appearance"><summary>Оформление счёта</summary><SymbolPicker value={value} onChange={setValue} disabled={busy}/>{error&&<p role="alert">{error}</p>}<button className="mini-secondary" type="button" disabled={busy} onClick={async()=>{try{setError('');await mutate(d=>setAccountAppearance(d,account.id,value),'Значок счёта сохранён');}catch(e){setError(e.message);}}}>Сохранить оформление</button></details>;
}
