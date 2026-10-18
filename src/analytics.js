import {scheduledEvents} from './finance-events.js';
import {CATEGORIES} from './mini-model.js';
export const COLORS=['#91dc75','#9f9bff','#ffbc76','#f78fa7','#6bcedb','#e7ca72','#d9a2f0','#75c9ac','#84b5ff','#a2acbe'];
export const shiftDate=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const rub=(data,t)=>Number.isFinite(t.amountRub)?t.amountRub:t.amount*(data.rates[t.currency||'RUB']||1);
export function analytics(data,today,days=7){
 const from=shiftDate(today,1-days),previousFrom=shiftDate(from,-days),previousTo=shiftDate(from,-1);
 const allCats=[...CATEGORIES,...(data.customCats||[])],known=new Set(allCats.map(c=>c.id)),totals=new Map(),byDay=new Map();
 const months=Array.from({length:4},(_,i)=>{const d=new Date(today.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-3+i);const key=d.toISOString().slice(0,7),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return{key,end:key+'-'+String(Math.min(Number(today.slice(-2)),last)).padStart(2,'0'),value:0,count:0};});
 const byMonth=new Map(months.map(m=>[m.key,m]));let total=0,previous=0,fixed=0;
 for(const t of data.transactions){
  if(t.type!=='expense'||t.cat==='lunch'||t.date>today)continue;
  const value=rub(data,t);if(!known.has(t.cat)){known.add(t.cat);allCats.push({id:t.cat,name:'Без категории'});}
  const month=byMonth.get(t.date.slice(0,7));if(month&&t.date<=month.end){month.value+=value;month.count++;}
  if(t.date>=previousFrom&&t.date<=previousTo)previous+=value;
  if(t.date<from)continue;
  total+=value;if(t.recurringId||t.installmentPaymentId||t.debtId||(t.tags||[]).includes('постоянный'))fixed+=value;
  totals.set(t.cat,(totals.get(t.cat)||0)+value);
  let day=byDay.get(t.date);if(!day){day=new Map();byDay.set(t.date,day);}day.set(t.cat,(day.get(t.cat)||0)+value);
 }
 const cats=allCats.map((c,i)=>({...c,color:COLORS[i%COLORS.length],value:totals.get(c.id)||0}));
 const daily=Array.from({length:days},(_,i)=>{const date=shiftDate(from,i),values=byDay.get(date),parts=values?cats.map(c=>({...c,value:values.get(c.id)||0})).filter(c=>c.value>0):[];return{date,parts,value:parts.reduce((n,c)=>n+c.value,0)};});
 return{from,total,previous,delta:total-previous,daily,cats:cats.filter(c=>c.value>0).sort((a,b)=>b.value-a.value),fixed,flex:total-fixed,months,activeDays:byDay.size};
}
export function upcoming(data,today,horizon=30){return scheduledEvents(data,today,shiftDate(today,horizon)).map(e=>({...e,id:e.source==='plan'?e.sourceId+e.period:e.source==='installment'?e.paymentId:e.id,amount:e.amountRub,kind:e.source==='debt'?'Долг':e.kind}));}
