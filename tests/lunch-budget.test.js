import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';
import {putTransaction,deleteTransaction,migrateData} from '../src/ledger.js';
import {lunchBudget,lunchDayRatio,lunchCalculator} from '../src/lunch-budget.js';
import {notificationJobs} from '../server/notifications.js';
const state=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',balance:10000,currency:'RUB'}]});
test('Russian five-day 2026 calendar has 247 working days and exact monthly allowances',()=>{
 const counts=[15,19,21,22,19,21,23,21,22,22,20,22],d=state();
 for(let i=0;i<12;i++){const b=lunchBudget(d,`2026-${String(i+1).padStart(2,'0')}`,'2026-12-31');assert.equal(b.workDays,counts[i]);assert.equal(b.budget,counts[i]*400);}
 assert.equal(counts.reduce((n,x)=>n+x),247);
 for(const date of ['2026-01-09','2026-03-09','2026-05-11','2026-11-04','2026-12-31'])assert.equal(lunchDayRatio(d,date),0);
 assert.equal(lunchDayRatio(d,'2026-11-03'),1);assert.equal(lunchDayRatio(d,'2026-12-30'),1);
});
test('Full-month limit is separate from accrued allowance, recorded savings and future days',()=>{
 let d=state();d=putTransaction(d,{type:'lunch',cat:'lunch',date:'2026-10-01',amount:350});
 const b=lunchBudget(d,'2026-10','2026-10-02');assert.equal(b.budget,8800);assert.equal(b.accrued,800);assert.equal(b.remaining,8450);assert.equal(b.future,8000);assert.equal(b.difference,450);assert.equal(b.confirmedDifference,50);assert.equal(b.unrecorded,1);
 const future=lunchBudget(d,'2026-11','2026-10-14');assert.equal(future.accrued,0);assert.equal(future.surplus,0);assert.equal(future.future,8000);
});
test('Company lunch and its savings never move personal balances; own top-up moves them once',()=>{
 let d=state();d=putTransaction(d,{type:'lunch',cat:'lunch',date:'2026-10-01',amount:390,accountId:'bank'});
 d=putTransaction(d,{type:'expense',cat:'food',date:'2026-10-01',amount:50,accountId:'bank',tags:['обед-за-свои']});
 const ownId=d.transactions.at(-1).id,b=lunchBudget(d,'2026-10','2026-10-01');assert.equal(d.accounts[0].balance,9950);assert.equal(b.spent,390);assert.equal(b.own,50);assert.equal(b.surplus,10);assert.equal(b.confirmedDifference,10);
 d=deleteTransaction(d,ownId);assert.equal(d.accounts[0].balance,10000);assert.equal(lunchBudget(d,'2026-10','2026-10-01').own,0);
 d=deleteTransaction(d,d.transactions[0].id);assert.equal(d.accounts[0].balance,10000);assert.equal(lunchBudget(d,'2026-10','2026-10-01').confirmedDifference,0);
});
test('Multiple orders, deficit, partial days and holiday override reconcile without double accrual',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-04T12:00:00Z')});
 let d=state();for(const amount of [300,250])d=putTransaction(d,{type:'lunch',cat:'lunch',date:'2026-11-03',amount});
 d.lunchDayOff=['2026-11-02'];d.lunchDayMod={'2026-11-03':0.5,'2026-11-04':1};
 const b=lunchBudget(d,'2026-11','2026-11-03');assert.equal(b.budget,7800);assert.equal(b.accrued,200);assert.equal(b.deficit,350);assert.equal(b.confirmedDifference,-350);assert.equal(b.spent,550);
 d.lunchAnswers={'2026-11-04':{status:'skipped',reason:'Не заказал'}};assert.equal(lunchBudget(d,'2026-11','2026-11-04').confirmedDifference,50);
 assert.equal(lunchBudget(migrateData(d,EMPTY),'2026-11','2026-11-04').budget,7800);
});
test('Calendar is bounded and custom weekly schedules retain their own workdays',()=>{
 const d=state();assert.equal(lunchBudget(d,'2027-01','2027-01-01').verified,false);
 d.settings.lunchWorkDays=[0,6];assert.equal(lunchBudget(d,'2026-10','2026-10-14').calendar,'weekly');assert.equal(lunchDayRatio(d,'2026-10-03'),1);assert.equal(lunchDayRatio(d,'2026-10-05'),0);
 assert.throws(()=>lunchBudget(d,'2026-13','2026-10-14'));
});
test('Calculator computes cents and quantities, validates incomplete rows and has no ledger effect',()=>{
 const d=state(),before=structuredClone(d);assert.equal(lunchCalculator([{name:'Суп',price:'129,90',count:'2'},{name:'Хлеб',price:'10.10',count:'1'}]),269.9);assert.deepEqual(d,before);
 for(const item of [{name:'',price:'20',count:1},{name:'Суп',price:'-1',count:1},{name:'Суп',price:'20',count:'1.5'},{name:'Суп',price:'20',count:''}])assert.throws(()=>lunchCalculator([item]));
});
test('Lunch prompts skip production holidays and resume on shortened working days',()=>{
 const d=state();d.settings={...d.settings,lunchAskEnabled:true,dailyReport:false,weeklyReport:false,monthlyReport:false};
 const jobs=date=>notificationJobs(d,new Date(date+'T08:00:00Z')).filter(j=>j.kind==='lunch');
 assert.equal(jobs('2026-11-04').length,0);assert.equal(jobs('2026-11-03').length,1);assert.equal(jobs('2026-12-31').length,0);
});
test('Table available allowance and cumulative balance follow original monthly carry without future accrual',()=>{
 let d=state();d=putTransaction(d,{type:'lunch',cat:'lunch',date:'2026-10-01',amount:350});d=putTransaction(d,{type:'lunch',cat:'lunch',date:'2026-10-02',amount:500});
 const b=lunchBudget(d,'2026-10','2026-10-02'),first=b.days[0],second=b.days[1],next=b.days[4];
 assert.equal(first.available,400);assert.equal(first.cumulative,50);assert.equal(second.available,450);assert.equal(second.cumulative,-50);assert.equal(next.available,350);assert.equal(next.cumulative,-50);assert.equal(b.days.at(-1).cumulative,-50);
});
