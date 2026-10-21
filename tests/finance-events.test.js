import test from 'node:test';import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {scheduledEvents,spendingPlan,cashTimeline,moveDate} from '../src/finance-events.js';
import {prepareEvent} from '../src/event-actions.js';
import {putTransaction,deleteTransaction,undoTransaction} from '../src/ledger.js';
import {createPlanned,skipPlanned} from '../src/planned-operations.js';
import {duePayments} from '../src/due-payments.js';
import {forecast} from '../src/finance-tools.js';
const today='2026-10-01',base=()=>({...structuredClone(EMPTY),accounts:[{id:'card',name:'Карта',currency:'RUB',balance:1000},{id:'save',name:'Резерв',currency:'RUB',balance:2000,accType:'savings'}],settings:{...EMPTY.settings,nextIncomeDate:'2026-10-08'}});
const plan=(d,type,amount,date,accountId='card')=>createPlanned(d,{name:type==='income'?'Доход':'Платёж',type,amount,frequency:'once',startDate:date,accountId,cat:'housing'});
test('One event list reconciles dashboard, calendar and reminders without paid/savings/income double counting',()=>{
 let d=plan(plan(plan(base(),'expense',200,today),'income',500,moveDate(today,2)),'expense',300,moveDate(today,3),'save');d=plan(d,'expense',100,moveDate(today,7));d.recurring[0].variable=true;
 const before=structuredClone(d),events=scheduledEvents(d,today,'2026-10-08'),summary=dashboard(d,today),flow=cashTimeline(d,today,6);
 assert.equal(events.length,4);assert.equal(events.filter(e=>e.spendable).length,3);assert.equal(summary.unknown,1);assert.equal(summary.free,1000);assert.equal(summary.obligations,0);assert.equal(flow.unknown,1);assert.equal(flow.plannedExpense,0);assert.equal(flow.plannedIncome,500);assert.equal(flow.points.at(-1).balance,summary.free);assert.equal(flow.points.at(-1).expectedBalance,1500);assert.equal(duePayments(d,today)[0].amount,null);assert.deepEqual(d,before);
});
test('Actual confirmation changes the same budget once, removes a pending event and keeps the original period',()=>{
 let d=plan(base(),'expense',200,today),event=scheduledEvents(d,today,today)[0];const before=spendingPlan(d,today),draft=prepareEvent(d,event,today,true);assert.equal(draft.amount,'');
 d=putTransaction(d,{...draft,amount:250,saveRecurringAmount:true});assert.equal(d.accounts[0].balance,750);assert.equal(dashboard(d,today).free,before.free-50);assert.equal(scheduledEvents(d,today,today).length,0);assert.throws(()=>prepareEvent(d,event,today));assert.throws(()=>putTransaction(d,{...draft,amount:250}));
 d=deleteTransaction(d,d.transactions[0].id);assert.equal(scheduledEvents(d,today,today).length,1);d=undoTransaction(d,d.history[0]);assert.equal(scheduledEvents(d,today,today).length,0);assert.equal(d.accounts[0].balance,750);
});
test('Partial installment and debt repayments propagate through the calendar, forecast and remaining payments',()=>{
 let d=base();d.installments=[{id:'split',name:'Сплит',accountId:'card',currency:'RUB',cat:'tech',payments:[{id:'p1',amount:300,date:today}]}];d.debts=[{id:'debt',person:'Друг',type:'my',amount:200,currency:'RUB',dueDate:today,payments:[]}];
 const [split,debt]=['installment','debt'].map(source=>scheduledEvents(d,today,today).find(e=>e.source===source));d=putTransaction(d,{...prepareEvent(d,split,today),amount:100});d=putTransaction(d,{...prepareEvent(d,debt,today),amount:50});
 assert.equal(d.accounts[0].balance,850);assert.equal(dashboard(d,today).obligations,350);assert.equal(dashboard(d,today).free,500);assert.equal(cashTimeline(d,today,0).points[0].balance,500);assert.equal(forecast(d,today,1).overdue,350);assert.equal(scheduledEvents(d,today,today).find(e=>e.source==='installment').amount,200);
});
test('Receivable repayment is only expected income until actually confirmed and never improves conservative free money',()=>{
 let d=base();d.debts=[{id:'owed',person:'Друг',type:'tome',amount:250,currency:'RUB',dueDate:today,payments:[]}];const f=cashTimeline(d,today,0);assert.equal(f.points[0].balance,1000);assert.equal(f.points[0].expectedBalance,1250);assert.equal(dashboard(d,today).free,1000);
 const draft=prepareEvent(d,f.events[0],today);assert.equal(draft.type,'income');d=putTransaction(d,draft);assert.equal(d.accounts[0].balance,1250);assert.equal(scheduledEvents(d,today,today).length,0);
});
test('Timing risk is visible even with a positive final expected balance; skipped periods disappear everywhere',()=>{
 let d=plan(plan(base(),'expense',1200,moveDate(today,1)),'income',1000,moveDate(today,3));let f=cashTimeline(d,today,7);assert.equal(f.firstExpectedNegative,moveDate(today,1));assert.equal(f.minimum,-200);assert.equal(f.endBalance,800);assert.equal(f.firstNegative,moveDate(today,1));
 d=skipPlanned(d,d.recurring[0].id,'once');f=cashTimeline(d,today,7);assert.equal(f.firstExpectedNegative,undefined);assert.equal(f.plannedExpense,0);assert.equal(dashboard(d,today).obligations,0);
});
test('Historical exchange, current plan rates, overdue unknown sums and bounds retain their distinct meaning',()=>{
 let d=plan(base(),'expense',10,today);d.rates.USD=90;d.recurring[0].currency='USD';d.transactions=[{id:'past',type:'expense',cat:'food',date:moveDate(today,-1),amount:10,currency:'USD',amountRub:800}];assert.equal(dashboard(d,today).obligations,900);assert.equal(forecast(d,today,1).daily,26.67);assert.equal(cashTimeline(d,today,0).actualBalance,1000);
 for(const n of [-1,367,1.5])assert.throws(()=>cashTimeline(d,today,n));assert.equal(moveDate('2026-12-31',1),'2027-01-01');
});
test('Savings events remain visible and actionable without being silently charged to daily money',()=>{
 const d=plan(base(),'expense',400,today,'save'),f=cashTimeline(d,today,0);assert.equal(f.events.length,1);assert.equal(f.points[0].events.length,1);assert.equal(f.plannedExpense,0);assert.equal(f.points[0].balance,1000);const draft=prepareEvent(d,f.events[0],today);assert.equal(draft.accountId,'save');const paid=putTransaction(d,draft);assert.equal(paid.accounts[0].balance,1000);assert.equal(paid.accounts[1].balance,1600);assert.equal(cashTimeline(paid,today,0).events.length,0);
});
test('The day before the configured payday matches spendable total exactly, including tomorrow and month boundaries',()=>{
 for(const payday of ['2026-10-02','2026-11-01']){const d=plan(base(),'expense',200,today);d.settings.nextIncomeDate=payday;const days=Math.round((Date.parse(payday+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000)-1;const t=cashTimeline(d,today,days);assert.equal(t.points.at(-1).balance,dashboard(d,today).free);assert.equal(t.until,moveDate(payday,-1));}
});
