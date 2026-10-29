import React from 'react';
import {profileCapacity} from './profile-capacity.js';
import {money} from './mini-model.js';
export default function ImportImpact({before,simulate}){
 let after;try{after=simulate();}catch(e){return <p className="mini-warning">Предпросмотр: {e.message}</p>;}
 const size=profileCapacity(after),count=after.transactions.length-before.transactions.length,moves=after.transfers.length-before.transfers.length;
 return <div className="mini-card"><strong>После импорта</strong><p>Новых операций: {count}, переводов: {moves}. Объём профиля: {Math.ceil(size.bytes/1000)} из 1 500 КБ.</p>{after.accounts.map(a=>{const old=before.accounts.find(x=>x.id===a.id);return old&&old.balance!==a.balance?<p key={a.id}>{a.name}: {money(old.balance,a.currency)} → {money(a.balance,a.currency)}</p>:null;})}{size.warning&&<p className="mini-warning">Профиль близок к пределу. Сохрани независимую копию перед большим импортом.</p>}</div>;
}
