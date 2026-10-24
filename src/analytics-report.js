import {sumMoney,roundMoney} from './ledger.js';
import {CATEGORIES,money} from './mini-model.js';
import {analytics,rub} from './analytics.js';
import {reportPeriod} from './report-period.js';
import {personalExpense,fixedExpense,expenseGroup,EXPENSE_GROUPS} from './expense-groups.js';
export {personalExpense,fixedExpense,expenseGroup,EXPENSE_GROUPS} from './expense-groups.js';
export function matchesInsight(t,f={}){return (!f.type?personalExpense(t):t.type===f.type&&(f.type!=='expense'||t.cat!=='lunch'))&&(!f.cat||t.cat===f.cat)&&(!f.date||t.date===f.date)&&(!f.from||t.date>=f.from)&&(!f.to||t.date<=f.to)&&(!f.accountId||t.accountId===f.accountId)&&(!f.group||expenseGroup(t)===f.group)&&(!f.transactionId||t.id===f.transactionId)&&(f.fixed===undefined||fixedExpense(t)===f.fixed);}
export function spendingReport(data,today,range='month'){
 const p=reportPeriod(today,range),a=analytics(data,today,p.days,p),current=data.transactions.filter(t=>t.date>=p.from&&t.date<=p.to&&(!p.accountId||t.accountId===p.accountId)),previous=data.transactions.filter(t=>t.date>=p.previousFrom&&t.date<=p.previousTo&&(!p.accountId||t.accountId===p.accountId)),expenses=current.filter(personalExpense),income=current.filter(t=>t.type==='income'),oldExpenses=previous.filter(personalExpense),oldIncome=previous.filter(t=>t.type==='income');
 const sum=rows=>sumMoney(rows,t=>rub(data,t)),oldCat=new Map();for(const t of oldExpenses)oldCat.set(t.cat,roundMoney((oldCat.get(t.cat)||0)+rub(data,t)));
 const categories=a.cats.map(c=>({...c,previous:oldCat.get(c.id)||0,change:roundMoney(c.value-(oldCat.get(c.id)||0)),count:expenses.filter(t=>t.cat===c.id).length,examples:expenses.filter(t=>t.cat===c.id).sort((x,y)=>rub(data,y)-rub(data,x)).slice(0,2).map(t=>t.note||c.name)}));
 const categoryRows=[...categories,...[...oldCat].filter(([id])=>!categories.some(c=>c.id===id)).map(([id,value])=>({id,name:[...CATEGORIES,...(data.customCats||[])].find(c=>c.id===id)?.name||'Без категории',value:0,previous:value,change:-value,count:0,color:'#8c98ad'}))].sort((x,y)=>y.value-x.value||y.previous-x.previous);
 const changes=categoryRows.filter(c=>Math.abs(c.change)>=.01).sort((x,y)=>Math.abs(y.change)-Math.abs(x.change)),filter={from:p.from,to:p.to,...(p.accountId?{accountId:p.accountId}:{})},previousFilter={...filter,from:p.previousFrom,to:p.previousTo};
 return {...a,...p,total:sum(expenses),previous:sum(oldExpenses),delta:roundMoney(sum(expenses)-sum(oldExpenses)),range,today,income:sum(income),previousIncome:sum(oldIncome),net:roundMoney(sum(income)-sum(expenses)),count:expenses.length,incomeCount:income.length,previousCount:oldExpenses.length,recordedDays:new Set(current.filter(t=>personalExpense(t)||t.type==='income').map(t=>t.date)).size,previousRecordedDays:new Set(previous.filter(t=>personalExpense(t)||t.type==='income').map(t=>t.date)).size,categories,categoryRows,changes,groups:EXPENSE_GROUPS.map(g=>({...g,value:sum(expenses.filter(t=>expenseGroup(t)===g.id)),count:expenses.filter(t=>expenseGroup(t)===g.id).length})),largest:[...expenses].sort((x,y)=>rub(data,y)-rub(data,x)).slice(0,3),filter,previousFilter};
}
export function reportFindings(r,data){
 const findings=[];
 if(r.count&&r.previousCount&&r.delta){const c=r.changes.find(c=>Math.sign(c.change)===Math.sign(r.delta));if(c)findings.push({id:'change',title:`Основной ${r.delta>0?'рост':'спад'} — ${c.name.toLocaleLowerCase('ru')}`,detail:`${money(c.previous)} → ${money(c.value)} · ${c.change>0?'+':'−'}${money(Math.abs(c.change))}`,filter:{...(c.value?r.filter:r.previousFilter),type:'expense',cat:c.id}});}
 const largest=r.largest[0],share=largest&&r.total?Math.round(rub(data,largest)/r.total*100):0;
 if(largest&&r.count>1&&share>=40)findings.push({id:'largest',title:`Одна покупка — ${share}% расходов`,detail:largest.note||r.categories.find(c=>c.id===largest.cat)?.name||'Открыть запись',filter:{...r.filter,type:'expense',transactionId:largest.id}});
 return findings.slice(0,2);
}
export const counted=(n,one,few,many)=>`${n} ${n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many}`;
