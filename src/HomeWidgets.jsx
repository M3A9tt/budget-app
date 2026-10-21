import React from 'react';
import Icon from './mini-icons.jsx';
import {money} from './mini-model.js';
import {savingsPurposes} from './wishes.js';
import {accountTotals} from './account-balances.js';
export function SavingsWidget({data,onOpen,onGoals,offset=0,limit=3}){
 const accounts=savingsPurposes(data).filter(a=>a.balance!==0),total=accountTotals(data).savings;
 return <section className="home-savings-widget"><div className="mini-between"><div className="home-widget-heading"><Icon name="goal"/><h2>Отложено</h2></div><button className="mini-text-button" onClick={onOpen}>Управлять ↗</button></div><strong className="home-savings-total">{money(total)}</strong>{accounts.length?<div className="home-saving-purpose-list">{accounts.slice(offset,offset+limit).map(a=><button key={a.id} onClick={onOpen}><span><b>{a.purpose||a.name}</b><small>{a.purpose?a.name:a.storageKind==='cash'?'Наличный резерв':'Пока без цели'}{a.savingsKind==='deposit'?' · вклад':''}</small></span><span><b>{money(a.balance,a.currency)}</b>{a.target>0&&<small>из {money(a.target,a.currency)}</small>}</span></button>)}</div>:<button className="mini-text-button" onClick={onOpen}>Начать копить ↗</button>}{accounts.length>offset+limit&&<button className="mini-text-button" onClick={onOpen}>Все накопления · {accounts.length}</button>}{accounts.some(a=>!a.purpose)&&<button className="mini-text-button" onClick={onGoals}>На что коплю? Добавить желание ↗</button>}</section>;
}
