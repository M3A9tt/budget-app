import React from 'react';

export default function EntryMoney({amount, unit, onAmount, fee, onFee, autoFocus, feeDisclosure=false, total,label='Сумма',id='amount',disabled=false}){
 const feeField=onFee&&<label className="entry-money-fee"><span>Комиссия, {unit}</span><input name="fee" aria-label={'Комиссия, '+unit} inputMode="decimal" placeholder="0" value={fee==='0'?'':fee} onChange={onFee}/></label>;
 return <div className="entry-money"><div className="entry-amount">
   <label htmlFor={id}>{label}</label>
   <div><input id={id} name={id==='amount'?'amount':id} disabled={disabled} value={amount} onChange={onAmount} placeholder="0" inputMode="decimal" required autoFocus={autoFocus}/><span>{unit}</span></div></div>
   {feeDisclosure&&feeField?<details className="entry-fee-disclosure"><summary>Комиссия</summary>{feeField}</details>:feeField}
   {total&&<p className="mini-small entry-money-total">Итого с комиссией <strong>{total}</strong></p>}
 </div>;
}
