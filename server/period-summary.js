import {dashboard,EMPTY,CATEGORIES} from '../src/mini-model.js';
import {transactionRub,sumMoney,roundMoney} from '../src/ledger.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
export function periodSummaryData(data,from,to,title){
 const txs=data.transactions.filter(t=>t.date>=from&&t.date<=to),rub=t=>transactionRub(data,t),personal=t=>t.type==='expense'&&t.cat!=='lunch',sum=rows=>sumMoney(rows,rub);
 const expenses=txs.filter(personal),expense=sum(expenses),income=sum(txs.filter(t=>t.type==='income')),lunch=sum(txs.filter(t=>t.type==='lunch'||t.cat==='lunch')),groups={};for(const t of expenses)groups[t.cat]=roundMoney((groups[t.cat]||0)+rub(t));
 const categories=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,value])=>({id,value,name:[...(data.customCats||[]),...CATEGORIES].find(c=>c.id===id)?.name||'Другое'}));
 const days=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1,shift=date=>new Date(Date.parse(date+'T12:00:00Z')-days*86400000).toISOString().slice(0,10),previous=sum(data.transactions.filter(t=>personal(t)&&t.date>=shift(from)&&t.date<=shift(to)));
 const planning=dashboard({...EMPTY,...data,settings:{...EMPTY.settings,...data.settings}},clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date);
 return {from,to,title,expense,income,lunch,categories,previous,count:txs.length,expenseCount:expenses.length,actual:planning.balance,free:planning.free,savings:planning.reserve};
}
export function periodSummary(data,from,to,title){
 const r=periodSummaryData(data,from,to,title),fmt=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
 return [title,from===to?from:`${from} — ${to}`,'',`Расходы: ${fmt(r.expense)}`,r.income?`Доходы: ${fmt(r.income)}`:null,r.lunch?`Обеды за счёт компании: ${fmt(r.lunch)}`:null,'',`На обычных счетах: ${fmt(r.actual)}`,`Свободно после резерва и платежей: ${fmt(r.free)}`,r.savings?`В копилках: ${fmt(r.savings)}`:null,...(r.categories.length?['','Больше всего',...r.categories.map(c=>'• '+c.name+': '+fmt(c.value))]:[]),r.previous?`\nК прошлому периоду: ${r.expense-r.previous>0?'+':''}${fmt(roundMoney(r.expense-r.previous))}`:null,`\nУчтено операций: ${r.count}.`].filter(line=>line!==null).join('\n');
}
