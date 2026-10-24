import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {spendingReport,matchesInsight,reportFindings} from '../src/analytics-report.js';
import {reportPeriod} from '../src/report-period.js';
import {expenseBuckets} from '../src/analytics.js';
import {budgetState} from '../src/budget-view.js';
import {periodSummaryData} from '../server/period-summary.js';
import {putTransaction,deleteTransaction,transferMoney,sumMoney} from '../src/ledger.js';
import {botView} from '../server/bot-views.js';
const today='2026-10-24',base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'b',name:'Наличные',balance:500,currency:'RUB'},{id:'s',name:'Резерв',balance:5000,currency:'RUB',accType:'savings'}]});
const tx=(id,date,amount,extra={})=>({id,date,amount,type:'expense',currency:'RUB',cat:'food',accountId:'a',...extra});
test('Calendar comparison uses matching month dates and excludes the late tail of the previous month',()=>{
 const d=base();d.transactions=[tx('now','2026-10-20',200),tx('old','2026-09-20',100),tx('tail','2026-09-30',9000),tx('august-end','2026-08-31',50)];const before=structuredClone(d),r=spendingReport(d,today);
 assert.deepEqual([r.from,r.to,r.previousFrom,r.previousTo],['2026-10-01',today,'2026-09-01','2026-09-24']);assert.equal(r.previous,100);assert.equal(r.delta,100);assert.deepEqual(d,before);
 const p=spendingReport(d,today,'2026-09');assert.deepEqual([p.from,p.to,p.previousFrom,p.previousTo,p.days,p.previousDays],['2026-09-01','2026-09-30','2026-08-01','2026-08-31',30,31]);assert.equal(p.total,9100);assert.equal(p.previous,50);assert.equal(p.months.find(m=>m.key==='2026-08').value,50);
});
test('Month comparison clamps leap February, completed months and year boundaries without shifting the start',()=>{
 for(const [date,input,expected] of [['2028-03-30','month',['2028-02-01','2028-02-29',29]],['2027-03-31','month',['2027-02-01','2027-02-28',28]],['2028-03-01','2028-02',['2028-01-01','2028-01-31',31]],['2027-01-12','month',['2026-12-01','2026-12-12',12]]]){const p=reportPeriod(date,input);assert.deepEqual([p.previousFrom,p.previousTo,p.previousDays],expected);}
 const week=reportPeriod(today,'7');assert.deepEqual([week.from,week.to,week.previousFrom,week.previousTo],['2026-10-18',today,'2026-10-11','2026-10-17']);
});
test('Custom periods have explicit equal-length comparisons and reject invalid or future dates',()=>{
 const p=reportPeriod(today,{period:'custom',from:'2026-09-28',to:'2026-10-03',accountId:'a'});assert.deepEqual([p.days,p.previousFrom,p.previousTo,p.accountId],[6,'2026-09-22','2026-09-27','a']);
 for(const query of [{period:'custom',from:'2026-02-30',to:today},{period:'custom',from:today,to:'2026-10-25'},{period:'custom',from:today,to:'2026-10-20'},{period:'2026-13'},{period:'2026-11'},{period:'month',accountId:3},{period:'custom',from:'2024-01-01',to:'2025-01-01'}])assert.throws(()=>reportPeriod(today,query));
 assert.equal(reportPeriod('2028-12-31',{period:'custom',from:'2028-01-01',to:'2028-12-31'}).days,366);
});
test('Every expense belongs to one group and group/category/history totals reconcile under an account filter',()=>{
 const d=base();d.transactions=[tx('buy',today,10),tx('regular',today,20,{recurringId:'rule'}),tx('split',today,30,{installmentPaymentId:'payment'}),tx('debt',today,40,{debtId:'debt'}),tx('other',today,900,{accountId:'b'}),tx('income',today,100,{type:'income'}),tx('corporate',today,400,{type:'lunch',cat:'lunch'})];
 const r=spendingReport(d,today,{period:'month',accountId:'a'});assert.deepEqual(r.groups.map(g=>[g.id,g.value]),[['purchase',10],['regular',20],['installment',30],['debt',40]]);assert.equal(r.total,100);assert.equal(r.income,100);assert.equal(r.cats.reduce((s,c)=>s+c.value,0),100);
 for(const g of r.groups){const rows=d.transactions.filter(t=>matchesInsight(t,{...r.filter,type:'expense',group:g.id}));assert.equal(sumMoney(rows,t=>t.amount),g.value);assert.equal(rows.length,g.count);}
 assert.equal(spendingReport(d,today,{period:'month',accountId:'missing'}).total,0);const chat=botView(d,'history',{...r.filter,type:'expense',group:'installment'});assert.deepEqual(chat.actions.filter(a=>a.view==='transaction').map(a=>a.args.id),['split']);d.customCats=[{id:'food',name:'Повтор названия'}];assert.equal(spendingReport(d,today,{period:'month',accountId:'a'}).cats.reduce((s,c)=>s+c.value,0),100);
});
test('Findings explain recorded changes and link to exact evidence, including disappeared categories',()=>{
 const d=base();d.transactions=[tx('old','2026-09-10',1000,{cat:'transport'}),tx('large','2026-10-10',80,{note:'Покупка'}),tx('small','2026-10-11',20)];const r=spendingReport(d,today,{period:'month',accountId:'a'}),f=reportFindings(r,d);
 assert.equal(f.length,2);assert.equal(f[0].filter.cat,'transport');assert.equal(f[0].filter.from,'2026-09-01');assert.deepEqual(d.transactions.filter(t=>matchesInsight(t,f[0].filter)).map(t=>t.id),['old']);assert.equal(f[1].filter.transactionId,'large');assert.deepEqual(d.transactions.filter(t=>matchesInsight(t,f[1].filter)).map(t=>t.id),['large']);
 assert.equal(reportFindings(spendingReport({...d,transactions:[d.transactions[0]]},today),d).length,0);
});
test('Day, week and month buckets retain every cent and their clicks cover precisely those records',()=>{
 const d=base();d.transactions=Array.from({length:365},(_,i)=>tx('t'+i,new Date(Date.parse('2025-01-01T12:00:00Z')+i*86400000).toISOString().slice(0,10),i%2?0.2:0.1,{cat:i%3?'food':'transport'}));
 for(const days of [7,40,365]){const from=new Date(Date.parse('2025-12-31T12:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),r=spendingReport(d,today,{period:'custom',from,to:'2025-12-31',accountId:'a'}),b=expenseBuckets(r.daily);assert.ok(b.rows.length<=31);assert.equal(sumMoney(b.rows,x=>x.value),r.total);
  for(const bucket of b.rows){const rows=d.transactions.filter(t=>matchesInsight(t,{...r.filter,type:'expense',from:bucket.date,to:bucket.to}));assert.equal(sumMoney(rows,t=>t.amount),bucket.value);assert.equal(sumMoney(bucket.parts,p=>p.value),bucket.value);}
 }
});
test('Summary pictures and text use the same monthly dates, historical currency values and account-free totals',()=>{
 const d=base();d.transactions=[tx('now','2026-03-10',10,{currency:'USD',amountRub:850}),tx('old','2026-02-10',100),tx('outside','2026-01-30',9000)];
 const r=spendingReport(d,'2026-04-01','2026-03'),summary=periodSummaryData(d,'2026-03-01','2026-03-31','Итог месяца');assert.equal(summary.expense,r.total);assert.equal(summary.previous,r.previous);assert.equal(summary.previousFrom,'2026-02-01');assert.equal(summary.previousTo,'2026-02-28');assert.equal(summary.categories[0].value,850);
});
test('Editing and deleting an operation retargets filtered reports without counting savings transfers as spending',()=>{
 let d=putTransaction(base(),tx('buy','2026-10-20',100));d=transferMoney(d,{from:'a',to:'s',amount:200,fee:5,date:'2026-10-21'});d=putTransaction(d,tx('income','2026-10-22',50,{type:'income',accountId:'b'}));
 assert.equal(spendingReport(d,today,{period:'month',accountId:'a'}).total,105);const before=structuredClone(d);spendingReport(d,today,'month');assert.deepEqual(d,before);
 d=putTransaction(d,{...d.transactions.find(t=>t.id==='buy'),accountId:'b',amount:120});assert.deepEqual(d.accounts.map(a=>a.balance),[795,430,5200]);assert.equal(spendingReport(d,today,{period:'month',accountId:'a'}).total,5);assert.equal(spendingReport(d,today,{period:'month',accountId:'b'}).total,120);assert.equal(spendingReport(d,today).total,125);
 d=deleteTransaction(d,'buy');assert.deepEqual(d.accounts.map(a=>a.balance),[795,550,5200]);assert.equal(spendingReport(d,today).total,5);assert.equal(dashboard(d,today).free,1345);
});
test('Budget shortfalls, unknown payments and actual negative balances have distinct presentation without changing data',()=>{
 for(const [s,heading] of [[{free:-500,balance:1000},'На платежи не хватает'],[{free:-100,balance:-100},'Нехватка по текущему плану'],[{free:500,balance:1000,unknown:1},'Остаток по известным суммам'],[{free:-500,balance:1000,unknown:1},'По известным суммам не хватает'],[{free:0,balance:1000},'Можно потратить']]){const before=structuredClone(s),v=budgetState(s);assert.equal(v.heading,heading);assert.equal(v.amount,Math.abs(s.free));assert.deepEqual(s,before);}
});
