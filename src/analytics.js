import {transactionRub,sumMoney,roundMoney} from './ledger.js';
import {fixedExpense,personalExpense} from './expense-groups.js';
import {scheduledEvents} from './finance-events.js';
import {CATEGORIES} from './mini-model.js';
export const COLORS=['#91dc75','#9f9bff','#ffbc76','#f78fa7','#6bcedb','#e7ca72','#d9a2f0','#75c9ac','#84b5ff','#a2acbe'];
export const shiftDate=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const rub=transactionRub;
export function analytics(data,today,days=7,scope={}){
 const to=scope.to||today,from=scope.from||shiftDate(to,1-days),previousFrom=scope.previousFrom||shiftDate(from,-days),previousTo=scope.previousTo||shiftDate(from,-1);
 const catalog=new Map();for(const c of [...CATEGORIES,...(data.customCats||[])])if(!catalog.has(c.id))catalog.set(c.id,c);
 const completeMonth=scope.comparison==='calendar'&&Number(to.slice(-2))===new Date(Date.UTC(Number(to.slice(0,4)),Number(to.slice(5,7)),0)).getUTCDate();
 const allCats=[...catalog.values()],known=new Set(allCats.map(c=>c.id)),totals=new Map(),byDay=new Map();
 const months=Array.from({length:4},(_,i)=>{const d=new Date(to.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-3+i);const key=d.toISOString().slice(0,7),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return{key,end:key+'-'+String(completeMonth?last:Math.min(Number(to.slice(-2)),last)).padStart(2,'0'),value:0,count:0};});
 const byMonth=new Map(months.map(m=>[m.key,m]));let total=0,previous=0,fixed=0;
 for(const t of data.transactions){
  if(!personalExpense(t)||t.date>today||scope.accountId&&t.accountId!==scope.accountId)continue;
  const value=rub(data,t);if(!known.has(t.cat)){known.add(t.cat);allCats.push({id:t.cat,name:'Без категории'});}
  const month=byMonth.get(t.date.slice(0,7));if(month&&t.date<=month.end){month.value=roundMoney(month.value+value);month.count++;}
  if(t.date>=previousFrom&&t.date<=previousTo)previous=roundMoney(previous+value);
  if(t.date<from||t.date>to)continue;
  total=roundMoney(total+value);if(fixedExpense(t))fixed=roundMoney(fixed+value);
  totals.set(t.cat,roundMoney((totals.get(t.cat)||0)+value));
  let day=byDay.get(t.date);if(!day){day=new Map();byDay.set(t.date,day);}day.set(t.cat,roundMoney((day.get(t.cat)||0)+value));
 }
 const cats=allCats.map((c,i)=>({...c,color:COLORS[i%COLORS.length],value:totals.get(c.id)||0}));
 const daily=Array.from({length:days},(_,i)=>{const date=shiftDate(from,i),values=byDay.get(date),parts=values?cats.map(c=>({...c,value:values.get(c.id)||0})).filter(c=>c.value>0):[];return{date,parts,value:sumMoney(parts,c=>c.value)};});
 return{from,to,days,total,previous,delta:roundMoney(total-previous),daily,cats:cats.filter(c=>c.value>0).sort((a,b)=>b.value-a.value),fixed,flex:roundMoney(total-fixed),months,activeDays:byDay.size};
}
export function upcoming(data,today,horizon=30){return scheduledEvents(data,today,shiftDate(today,horizon)).map(e=>({...e,id:e.source==='plan'?e.sourceId+e.period:e.source==='installment'?e.paymentId:e.id,amount:e.amountRub,kind:e.source==='debt'?'Долг':e.kind}));}

export function expenseBuckets(daily){
 const mode=daily.length<=31?'day':daily.length<=183?'week':'month',groups=new Map();
 for(const d of daily){const key=mode==='day'?d.date:mode==='month'?d.date.slice(0,7):shiftDate(d.date,-((new Date(d.date+'T12:00:00Z').getUTCDay()+6)%7));let row=groups.get(key);if(!row){row={date:d.date,to:d.date,value:0,categories:new Map()};groups.set(key,row);}row.to=d.date;row.value=roundMoney(row.value+d.value);for(const p of d.parts){const old=row.categories.get(p.id);row.categories.set(p.id,{...p,value:roundMoney((old?.value||0)+p.value)});}}
 return {mode,rows:[...groups.values()].map(({categories,...d})=>({...d,parts:[...categories.values()]}))};
}
