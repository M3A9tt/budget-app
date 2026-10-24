import {budgetState} from '../src/budget-view.js';
import {spendingReport} from '../src/analytics-report.js';
import {reportMonthEnd} from '../src/report-period.js';
import {dashboard,EMPTY} from '../src/mini-model.js';
import {transactionRub,sumMoney,roundMoney} from '../src/ledger.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
export function periodSummaryData(data,from,to,title){
 const month=from.slice(0,7),range=from===month+'-01'&&to===reportMonthEnd(month)?month:{period:'custom',from,to},r=spendingReport(data,to,range);
 const txs=data.transactions.filter(t=>t.date>=from&&t.date<=to),lunch=sumMoney(txs.filter(t=>t.type==='lunch'||t.cat==='lunch'),t=>transactionRub(data,t)),categories=r.categories.slice(0,3).map(c=>({id:c.id,value:c.value,name:c.name}));
 const planning=dashboard({...EMPTY,...data,settings:{...EMPTY.settings,...data.settings}},clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date);
 return {from,to,title,expense:r.total,income:r.income,lunch,categories,previous:r.previous,previousFrom:r.previousFrom,previousTo:r.previousTo,count:txs.length,expenseCount:r.count,actual:planning.balance,free:planning.free,unknown:planning.unknown,savings:planning.reserve};
}
export function periodSummary(data,from,to,title){
 const r=periodSummaryData(data,from,to,title),fmt=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
 return [title,from===to?from:`${from} — ${to}`,'',`Расходы: ${fmt(r.expense)}`,r.income?`Доходы: ${fmt(r.income)}`:null,r.lunch?`Обеды за счёт компании: ${fmt(r.lunch)}`:null,'',`На обычных счетах: ${fmt(r.actual)}`,`${budgetState({free:r.free,balance:r.actual,unknown:r.unknown}).heading}: ${fmt(Math.abs(r.free))}`,r.savings?`В копилках: ${fmt(r.savings)}`:null,...(r.categories.length?['','Больше всего',...r.categories.map(c=>'• '+c.name+': '+fmt(c.value))]:[]),r.previous?`\nК прошлому периоду: ${r.expense-r.previous>0?'+':''}${fmt(roundMoney(r.expense-r.previous))}`:null,`\nУчтено операций: ${r.count}.`].filter(line=>line!==null).join('\n');
}
