import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard,demoData} from '../src/mini-model.js';
test('Available amount excludes real savings once and known obligations, ignoring the legacy manual reserve',()=>{const data=structuredClone(EMPTY);data.accounts=[{balance:10000,currency:'RUB'},{balance:20000,currency:'RUB',accType:'savings'}];data.settings={...data.settings,reserveRub:2000,nextIncomeDate:'2026-10-20'};data.recurring=[{id:'r',active:true,amount:1000,currency:'RUB',dueDay:15},{id:'variable',active:true,variable:true,dueDay:18}];const result=dashboard(data,'2026-10-13');assert.equal(result.balance,10000);assert.equal(result.free,9000);assert.equal(result.reserve,20000);assert.equal(result.days,7);assert.equal(result.unknown,1);});
test('Paid recurring rule not subtracted again; next month rule still planned',()=>{const data=structuredClone(EMPTY);data.settings.nextIncomeDate='2026-11-20';data.recurring=[{active:true,amount:1000,dueDay:15,lastCreated:'2026-10'}];assert.equal(dashboard(data,'2026-10-13').obligations,1000);});
test('Period totals separate lunches and use historical exchange values',()=>{const data=structuredClone(EMPTY);data.transactions=[{type:'expense',cat:'food',date:'2026-10-12',amount:10,currency:'USD',amountRub:920},{type:'lunch',cat:'lunch',date:'2026-10-12',amount:379,amountRub:379}];data.rates.USD=120;assert.equal(dashboard(data,'2026-10-13').spent,920);});
test('No payday returns no invented daily spending target',()=>assert.equal(dashboard(EMPTY,'2026-10-13').days,null));
test('Demo data does not mutate defaults and is fictional transient state',()=>{const data=demoData('2026-10-13');assert.ok(data.transactions.every(t=>t.id.startsWith('demo-')));assert.equal(EMPTY.accounts.length,0);assert.equal(data.settings.nextIncomeDate,'2026-10-25');});

test('A dated expected income defines the budget horizon while leaving actual balances unchanged',()=>{
 const data=structuredClone(EMPTY);
 data.accounts=[{id:'bank',balance:10000,currency:'RUB'}];
 data.recurring=[
  {id:'rent',name:'Rent',active:true,type:'expense',frequency:'once',startDate:'2026-10-22',amount:2200,currency:'RUB',accountId:'bank'},
  {id:'salary',name:'Salary',active:true,type:'income',budgetAnchor:true,frequency:'once',startDate:'2026-10-24',amount:12000,currency:'RUB',accountId:'bank'},
  {id:'later',name:'Later',active:true,type:'expense',frequency:'once',startDate:'2026-11-20',amount:500,currency:'RUB',accountId:'bank'},
  {id:'unknown',name:'Unknown',active:true,type:'expense',frequency:'once',startDate:'2026-10-23',variable:true,amount:0,currency:'RUB',accountId:'bank'}
 ];
 let result=dashboard(data,'2026-10-17');
 assert.equal(result.budgetUntil,'2026-10-24');assert.equal(result.budgetHorizon,'payday');
 assert.equal(result.balance,10000);assert.equal(result.plannedExpenses,2200);assert.equal(result.free,7800);assert.equal(result.unknown,1);
 assert.equal(data.accounts[0].balance,10000);assert.equal(data.transactions.length,0);
 data.recurring[0].skippedPeriods=['once'];result=dashboard(data,'2026-10-17');
 assert.equal(result.free,10000);assert.equal(result.plannedExpenses,0);
});
test('Payday horizon is exclusive and includes only unpaid, active, spendable-account plans',()=>{
 const data=structuredClone(EMPTY);data.accounts=[{id:'card',balance:8000,currency:'RUB'},{id:'save',balance:1000,currency:'RUB',accType:'savings'}];
 data.settings.nextIncomeDate='2026-10-30';
 data.recurring=[
  {id:'before',name:'Before',active:true,frequency:'once',startDate:'2026-10-29',amount:500,accountId:'card'},
  {id:'payday',name:'Payday',active:true,frequency:'once',startDate:'2026-10-30',amount:500,accountId:'card'},
  {id:'saved',name:'Savings only',active:true,frequency:'once',startDate:'2026-10-28',amount:200,accountId:'save'},
  {id:'paused',name:'Paused',active:false,frequency:'once',startDate:'2026-10-20',amount:4000,accountId:'card'}
 ];
 const before=dashboard(data,'2026-10-17');assert.equal(before.plannedExpenses,500);assert.equal(before.free,7500);assert.equal(before.budgetHorizon,'payday');
 data.transactions=[{id:'real',type:'expense',date:'2026-10-29',amount:500,currency:'RUB',accountId:'card',recurringId:'before',recurringPeriod:'once'}];data.accounts[0].balance=7500;
 const after=dashboard(data,'2026-10-29');assert.equal(after.plannedExpenses,0);assert.equal(after.free,7500);
});
