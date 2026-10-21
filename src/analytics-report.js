import {sumMoney,roundMoney} from './ledger.js';
import {CATEGORIES} from './mini-model.js';
import {analytics,rub} from './analytics.js';
import {moveDate} from './finance-events.js';
export const personalExpense=t=>t.type==='expense'&&t.cat!=='lunch';
export const fixedExpense=t=>!!(t.recurringId||t.installmentPaymentId||t.debtId||(t.tags||[]).includes('постоянный'));
export function matchesInsight(t,f={}){return (!f.type?t.type==='expense'&&t.cat!=='lunch':t.type===f.type&&(f.type!=='expense'||t.cat!=='lunch'))&&(!f.cat||t.cat===f.cat)&&(!f.date||t.date===f.date)&&(!f.from||t.date>=f.from)&&(!f.to||t.date<=f.to)&&(!f.accountId||t.accountId===f.accountId)&&(f.fixed===undefined||fixedExpense(t)===f.fixed);}
export function spendingReport(data,today,range='month'){
 const days=range==='month'?Number(today.slice(-2)):Number(range);if(![7,30].includes(days)&&range!=='month')throw Error('Выбери неделю, 30 дней или текущий месяц');
 const a=analytics(data,today,days),previousTo=moveDate(a.from,-1),previousFrom=moveDate(a.from,-days),current=data.transactions.filter(t=>t.date>=a.from&&t.date<=today),previous=data.transactions.filter(t=>t.date>=previousFrom&&t.date<=previousTo),expenses=current.filter(personalExpense),income=current.filter(t=>t.type==='income'),oldExpenses=previous.filter(personalExpense),oldIncome=previous.filter(t=>t.type==='income');
 const sum=rows=>sumMoney(rows,t=>rub(data,t)),oldCat=new Map();for(const t of oldExpenses)oldCat.set(t.cat,roundMoney((oldCat.get(t.cat)||0)+rub(data,t)));
 const categories=a.cats.map(c=>({...c,previous:oldCat.get(c.id)||0,change:roundMoney(c.value-(oldCat.get(c.id)||0)),count:expenses.filter(t=>t.cat===c.id).length,examples:expenses.filter(t=>t.cat===c.id).sort((x,y)=>rub(data,y)-rub(data,x)).slice(0,2).map(t=>t.note||c.name)}));
 const changes=[...categories,...[...oldCat].filter(([id])=>!categories.some(c=>c.id===id)).map(([id,value])=>({id,name:[...CATEGORIES,...(data.customCats||[])].find(c=>c.id===id)?.name||'Без категории',value:0,previous:value,change:-value}))].filter(c=>Math.abs(c.change)>=.01).sort((x,y)=>Math.abs(y.change)-Math.abs(x.change));
 return {...a,total:sum(expenses),previous:sum(oldExpenses),delta:roundMoney(sum(expenses)-sum(oldExpenses)),range,days,today,previousFrom,previousTo,income:sum(income),previousIncome:sum(oldIncome),net:roundMoney(sum(income)-sum(expenses)),count:expenses.length,incomeCount:income.length,previousCount:oldExpenses.length,recordedDays:new Set(current.filter(t=>personalExpense(t)||t.type==='income').map(t=>t.date)).size,previousRecordedDays:new Set(previous.filter(t=>personalExpense(t)||t.type==='income').map(t=>t.date)).size,categories,changes,largest:[...expenses].sort((x,y)=>rub(data,y)-rub(data,x)).slice(0,3),filter:{from:a.from,to:today}};
}

export const counted=(n,one,few,many)=>`${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;
