import AppearanceColors from './AppearanceColors.jsx';
import React,{useState} from 'react';
import SymbolPicker from './SymbolPicker.jsx';
import {accountBackground,appearanceColors,setAccountAppearance} from './appearance.js';
import {isIcon} from './icon-catalog.js';
export default function AccountAppearance({account,mutate,busy}){
 const [value,setValue]=useState({icon:isIcon(account.icon)?account.icon:'wallet',emoji:account.emoji||'',colors:appearanceColors(account.colors)}),[error,setError]=useState('');
 return <details className="account-appearance"><summary>Оформление счёта</summary><SymbolPicker value={value} onChange={appearance=>setValue(old=>({...old,...appearance}))} disabled={busy}/><AppearanceColors label="Цвет фона" value={value.colors} onChange={colors=>setValue(old=>({...old,colors}))} disabled={busy}/><div className="account-appearance-preview" style={accountBackground(value.colors)}>{account.name}</div>{error&&<p role="alert">{error}</p>}<button className="mini-secondary" type="button" disabled={busy} onClick={async()=>{try{setError('');await mutate(d=>setAccountAppearance(d,account.id,value),'Оформление счёта сохранено');}catch(e){setError(e.message);}}}>Сохранить оформление</button></details>;
}
