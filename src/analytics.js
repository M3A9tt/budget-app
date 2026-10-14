import {plannedOccurrences,planType} from './planned-model.js';
import {CATEGORIES} from './mini-model.js';
import {paidInstallment} from './finance-tools.js';
export const COLORS=['#91dc75','#9f9bff','#ffbc76','#f78fa7','#6bcedb','#e7ca72','#d9a2f0','#75c9ac','#84b5ff','#a2acbe'];
export const shiftDate=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const rub=(data,t)=>Number.isFinite(t.amountRub)?t.amountRub:t.amount*(data.rates[t.currency||'RUB']||1);
export function analytics(data,today,days=7){
 const from=shiftDate(today,1-days),previousFrom=shiftDate(from,-days),previousTo=shiftDate(from,-1);
 const expenses=data.transactions.filter(t=>t.type==='expense'&&t.cat!=='lunch'&&t.date<=today);
 const rows=expenses.filter(t=>t.date>=from),previous=expenses.filter(t=>t.date>=previousFrom&&t.date<=previousTo).reduce((n,t)=>n+rub(data,t),0);
 const allCats=[...CATEGORIES,...data.customCats];for(const t of expenses)if(!allCats.some(c=>c.id===t.cat))allCats.push({id:t.cat,name:'Без категории'});
 const cats=allCats.map((c,i)=>({...c,color:COLORS[i%COLORS.length],value:rows.filter(t=>t.cat===c.id).reduce((n,t)=>n+rub(data,t),0)}));
 const daily=Array.from({length:days},(_,i)=>{const date=shiftDate(from,i),parts=cats.map(c=>({...c,value:rows.filter(t=>t.date===date&&t.cat===c.id).reduce((n,t)=>n+rub(data,t),0)})).filter(c=>c.value>0);return{date,parts,value:parts.reduce((n,c)=>n+c.value,0)};});
 const total=rows.reduce((n,t)=>n+rub(data,t),0),fixed=rows.filter(t=>t.recurringId||t.installmentPaymentId||(t.tags||[]).includes('постоянный')).reduce((n,t)=>n+rub(data,t),0);
 const months=Array.from({length:4},(_,i)=>{const d=new Date(today.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-3+i);const key=d.toISOString().slice(0,7),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(),end=key+'-'+String(Math.min(Number(today.slice(-2)),last)).padStart(2,'0');const txs=expenses.filter(t=>t.date.startsWith(key)&&t.date<=end);return{key,end,value:txs.reduce((n,t)=>n+rub(data,t),0),count:txs.length};});
 return{from,total,previous,delta:total-previous,daily,cats:cats.filter(c=>c.value>0).sort((a,b)=>b.value-a.value),fixed,flex:total-fixed,months,activeDays:new Set(rows.map(t=>t.date)).size};
}
export function upcoming(data,today,horizon=30){const end=shiftDate(today,horizon),items=[];
 for(const {rule:r,date,period,overdue} of plannedOccurrences(data,today,end))items.push({id:r.id+period,name:r.name,date,amount:r.variable?null:r.amount*(data.rates[r.currency||'RUB']||1),type:planType(r),kind:planType(r)==='income'?'Ожидаемый доход':r.frequency==='once'?'Разовый':'Регулярный',overdue});
 for(const p of data.installments||[])for(const x of p.payments)if(x.date<=end&&!paidInstallment(data,x))items.push({id:x.id,name:p.name,date:x.date,amount:x.amount*(data.rates[p.currency||'RUB']||1),kind:'Рассрочка',overdue:x.date<today});
 return items.sort((a,b)=>a.date.localeCompare(b.date));}
