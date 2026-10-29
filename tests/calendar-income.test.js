import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {createPlanned,reschedulePlanned,preparePlanned,updatePlanned} from '../src/planned-operations.js';
import {plannedOccurrences} from '../src/planned-model.js';
import {budgetWindow,cashTimeline,scheduledEvents} from '../src/finance-events.js';
import {paymentOverview} from '../src/payment-overview.js';
import {calendarMonth,shiftMonth} from '../src/calendar-model.js';
import {prepareEvent} from '../src/event-actions.js';
import {putTransaction,deleteTransaction,migrateData} from '../src/ledger.js';
import {notificationJobs} from '../server/notifications.js';
import {botView} from '../server/bot-views.js';
import {fieldsFor,applyBotAction} from '../server/bot-catalog.js';
import {todayMoscow} from '../src/mini-model.js';
const today='2026-10-24',base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'s',name:'Накопления',balance:2000,currency:'RUB',accType:'savings'}],settings:{...EMPTY.settings,nextIncomeDate:'2026-11-10'}});
const income={id:'salary',name:'Зарплата',type:'income',budgetAnchor:true,frequency:'monthly',startDate:'2026-10-01',dueDay:25,amount:5000,accountId:'a'};
test('A moved income updates the shared horizon, calendar and reminders, then confirms once without double forecasting',()=>{
 let d=createPlanned(base(),income);
 d=createPlanned(d,{id:'rent',name:'Аренда',type:'expense',frequency:'once',startDate:'2026-10-26',amount:1200,accountId:'a'});
 d=createPlanned(d,{id:'phone',name:'Связь',type:'expense',frequency:'once',startDate:'2026-11-01',amount:500,accountId:'a'});
 assert.equal(budgetWindow(d,today).until,'2026-10-25');assert.equal(dashboard(d,today).free,1000);
 const original=structuredClone(d),old=scheduledEvents(d,today,'2026-11-03').find(e=>e.sourceId==='salary');
 d=reschedulePlanned(d,'salary','2026-10','2026-11-03',today);
 assert.deepEqual(d.accounts,original.accounts);assert.deepEqual(d.transactions,original.transactions);assert.deepEqual(d.history,original.history);assert.equal(d.recurring[0].dueDay,25);assert.equal(d.recurring[0].startDate,'2026-10-01');
 assert.deepEqual(plannedOccurrences(d,today,'2026-11-30').filter(p=>p.rule.id==='salary').map(p=>[p.period,p.date]),[['2026-10','2026-11-03'],['2026-11','2026-11-25']]);
 assert.equal(dashboard(d,today).budgetUntil,'2026-11-03');assert.equal(dashboard(d,today).obligations,1700);assert.equal(dashboard(d,today).free,-700);assert.equal(cashTimeline(d,today,30).endBalance,4300);assert.throws(()=>prepareEvent(d,old,today),/изменён/);
 d.settings={...d.settings,plannedReminders:true,plannedReminderTime:'18:00',dailyReport:false,weeklyReport:false,monthlyReport:false};
 assert.equal(notificationJobs(d,new Date('2026-10-25T15:00:00Z')).filter(j=>j.openPayments).length,0);
 assert.equal(notificationJobs(d,new Date('2026-11-03T15:00:00Z')).filter(j=>j.openPayments).length,1);
 const event=scheduledEvents(d,today,'2026-11-03').find(e=>e.sourceId==='salary'),draft={...prepareEvent(d,event,today),id:'actual-salary'};
 d=putTransaction(d,draft);assert.equal(d.accounts[0].balance,6000);assert.equal(d.transactions[0].recurringPeriod,'2026-10');assert.equal(budgetWindow(d,today).until,'2026-11-25');assert.equal(cashTimeline(d,today,30).endBalance,4300);assert.throws(()=>putTransaction(d,{...draft,id:'duplicate'}),/подтверждён/);assert.throws(()=>reschedulePlanned(d,'salary','2026-10','2026-11-04',today));
 assert.equal(calendarMonth(d,today,'2026-10').days.find(p=>p.date===today).transactions[0].id,'actual-salary');
 d=deleteTransaction(d,'actual-salary');assert.equal(d.accounts[0].balance,1000);assert.equal(budgetWindow(d,today).until,'2026-11-03');assert.equal(cashTimeline(d,today,30).endBalance,4300);assert.deepEqual(migrateData(d,EMPTY).recurring,d.recurring);
});
test('A late unreceived income stays visible without being treated as cash arriving today',()=>{
 const d=createPlanned(base(),{...income,frequency:'once',startDate:'2026-10-20'}),before=structuredClone(d),flow=cashTimeline(d,today,7);
 assert.equal(flow.plannedIncome,0);assert.equal(flow.endBalance,1000);assert.equal(flow.delayedIncome,5000);assert.equal(flow.delayedIncomeCount,1);assert.equal(flow.points[0].events[0].overdue,true);
 assert.equal(calendarMonth(d,today,'2026-10').days.find(p=>p.date==='2026-10-20').events.length,1);assert.deepEqual(d,before);
 const moved=reschedulePlanned(d,'salary','once','2026-10-27',today);assert.equal(cashTimeline(moved,today,7).endBalance,6000);assert.equal(cashTimeline(moved,today,7).delayedIncomeCount,0);
});
test('Unknown and savings income do not set the spendable budget boundary or inflate projection',()=>{
 let d=createPlanned(base(),{...income,variable:true,amount:''});d=createPlanned(d,{...income,id:'interest',accountId:'s',startDate:'2026-10-24',dueDay:26});
 assert.equal(budgetWindow(d,today).incomeSource,'manual');assert.equal(budgetWindow(d,today).until,'2026-11-10');assert.equal(cashTimeline(d,today,7).endBalance,1000);assert.equal(cashTimeline(d,today,7).unknown,1);
 const unknown=scheduledEvents(d,today,'2026-10-25')[0];assert.equal(unknown.amount,null);assert.equal(prepareEvent(d,unknown,today).amount,'');
 d=putTransaction(d,{...prepareEvent(d,unknown,today),amount:750});assert.equal(d.accounts[0].balance,1750);assert.equal(d.recurring[0].variable,true);assert.equal(d.recurring[0].amount,0);
});
test('A future original period can be brought forward and remains separate from this month',()=>{
 let d=createPlanned(base(),income);d=reschedulePlanned(d,'salary','2026-11','2026-10-30',today);
 const items=scheduledEvents(d,today,'2026-10-31').filter(e=>e.sourceId==='salary');assert.deepEqual(items.map(e=>[e.period,e.date]),[['2026-10','2026-10-25'],['2026-11','2026-10-30']]);
 d=putTransaction(d,{...preparePlanned(d,'salary','2026-11',today,false),amount:4500});assert.equal(d.transactions[0].recurringPeriod,'2026-11');assert.equal(scheduledEvents(d,today,'2026-10-31').filter(e=>e.sourceId==='salary').length,1);
 assert.throws(()=>updatePlanned(d,'salary',{...income,frequency:'weekly'}),/отдельный/);
});
test('Month grids align Monday, retain leap days and show facts instead of fabricated historical balances',()=>{
 const d=base();d.transactions=[{id:'past',date:'2028-02-29',type:'expense',amount:10,note:'Продукты',currency:'RUB',accountId:'a'},{id:'future',date:'2028-03-03',type:'income',budgetAnchor:true,amount:100,currency:'RUB',accountId:'a'}];
 const m=calendarMonth(d,'2028-03-01','2028-02');assert.equal(m.days.length,42);assert.equal(new Date(m.start+'T12:00:00Z').getUTCDay(),1);assert.equal(m.days.filter(p=>p.inMonth).length,29);assert.equal(m.days.find(p=>p.date==='2028-02-29').transactions[0].id,'past');assert.equal(m.days.find(p=>p.date==='2028-03-03').transactions.length,0);assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('Invalid overrides and stale moves are rejected at the common storage boundary',()=>{
 const d=createPlanned(base(),income);
 for(const dateOverrides of [[],null,{'2026-13':'2026-11-01'},{'2026-10':'2026-02-30'},{'2026-10':3}])assert.throws(()=>migrateData({...d,recurring:[{...d.recurring[0],dateOverrides}]},EMPTY),/перенос/);
 for(const date of ['2026-10-20','2026-02-30','bad'])assert.throws(()=>reschedulePlanned(d,'salary','2026-10',date,today));
 const moved=reschedulePlanned(d,'salary','2026-10','2026-11-03',today),restored=reschedulePlanned(moved,'salary','2026-10','2026-10-25',today);assert.deepEqual(restored.recurring[0].dateOverrides,{});assert.equal(budgetWindow(restored,today).until,'2026-10-25');
});
test('Bot links retain the original period after a cross-month move and use the same budget date',()=>{
 const now=todayMoscow(),next=new Date(now+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+5);const payday=next.toISOString().slice(0,10),original=now.slice(0,7),later=new Date(now+'T12:00:00Z');later.setUTCMonth(later.getUTCMonth()+1);const sourcePeriod=later.toISOString().slice(0,7);
 let d=createPlanned(base(),{...income,startDate:original+'-01'});d=createPlanned(d,{...income,id:'bill',name:'Перенесённый платёж',type:'expense',startDate:original+'-01',dueDay:1,amount:100});d=reschedulePlanned(d,'bill',sourcePeriod,now,now);d=updatePlanned(d,'salary',{...d.recurring[0],frequency:'once',startDate:payday});
 const allocation=botView(d,'allocation');assert.ok(allocation.lines.some(l=>l.includes(payday)));const link=botView(d,'allocationItems').actions.find(a=>a.args?.id==='bill'&&a.args?.period===sourcePeriod);assert.ok(link);assert.equal(link.view,'dueItem');
 const values={...income,id:'new-unknown',frequency:'once',startDate:now,variable:true,amount:''},fields=fieldsFor(d,'plan',{},values);assert.ok(fields.some(f=>f.key==='variable'||f.name==='variable'));assert.ok(!fields.some(f=>f.key==='amount'||f.name==='amount'));const created=applyBotAction(d,'plan',{},values);assert.equal(created.recurring.at(-1).amount,0);assert.equal(created.recurring.at(-1).variable,true);
});
test('Browsing a distant month uses a bounded occurrence range and keeps the current overdue list',()=>{
 const d=createPlanned(base(),{...income,frequency:'daily',startDate:'2026-10-24'}),month=calendarMonth(d,today,'2090-01');assert.equal(month.days.length,42);assert.equal(month.days.filter(p=>p.events.length).length,42);
 const past=createPlanned(base(),{...income,frequency:'once',startDate:'2026-10-20'});assert.equal(calendarMonth(past,today,'2026-08').overdue.length,1);
});

test('Moved one-time expenses remain in the total until payoff, beyond their original date',()=>{let d=createPlanned(base(),{...income,frequency:'once',type:'expense',startDate:today});d=reschedulePlanned(d,'salary','once','2026-12-01',today);assert.equal(paymentOverview(d,today).oneOffTotal,5000);assert.equal(paymentOverview(d,today).oneOff[0].date,'2026-12-01');assert.equal(dashboard(d,today).obligations,0);});
