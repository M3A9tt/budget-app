import {parseMoney} from './ledger.js';
import React from 'react';

export default function EntryMoney({amount, unit, onAmount, fee, onFee, autoFocus, showTotal=false,label='Сумма',id='amount',disabled=false}){
 const base=parseMoney(amount), commission=parseMoney(fee||0);
 return <div className="entry-money"><div className="entry-amount">
   <label htmlFor={id}>{label}</label>
   <div><input id={id} name={id==='amount'?'amount':id} disabled={disabled} value={amount} onChange={onAmount} placeholder="0" inputMode="decimal" required autoFocus={autoFocus}/><span>{unit}</span></div></div>
   {onFee&&<label className="entry-money-fee"><span>Комиссия, {unit}</span><input name="fee" aria-label={'Комиссия, '+unit} inputMode="decimal" placeholder="0" value={fee==='0'?'':fee} onChange={onFee}/></label>}
   {showTotal&&onFee&&Number.isFinite(base)&&base>0&&Number.isFinite(commission)&&commission>0&&<p className="mini-small entry-money-total">Итого: {new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(base+commission)} {unit}</p>}
 </div>;
}
