import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard,todayMoscow} from '../src/mini-model.js';
import {putTransaction,deleteTransaction,undoTransaction,migrateData} from '../src/ledger.js';
import {plannedOccurrences} from '../src/planned-model.js';
import {createPlanned,schedulePlanned,preparePlanned,updatePlanned,reschedulePlanned,skipPlanned,restorePlanned,linkPlannedTransaction,previewPlanned} from '../src/planned-operations.js';
import {notificationJobs} from '../server/notifications.js';
import {applyBotAction,fieldsFor} from '../server/bot-catalog.js';
import {botView} from '../server/bot-views.js';
const today=todayMoscow(),day=n=>new Date(Date.parse(today+'T12:00Z')+n*86400000).toISOString().slice(0,10);
const values={id:'therapy',name:'Психотерапевт',amount:8000,type:'expense',frequency:'manual',startDate:'',accountId:'bank',cat:'health'};
const seed=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Карта',balance:10000,currency:'RUB'}],settings:{...EMPTY.settings,nextIncomeDate:day(60),notificationMode:'manual'}});
const create=()=>createPlanned(seed(),values);
const events=d=>plannedOccurrences(d,today,'2099-12-31');
test('Undated reusable payment has no forecast obligation, transaction or automatic reminder',()=>{
 const d=create();assert.deepEqual(d.recurring[0].scheduledDates,[]);assert.equal(events(d).length,0);assert.equal(dashboard(d,today).obligations,0);assert.equal(dashboard(d,today).free,10000);assert.equal(d.accounts[0].balance,10000);assert.equal(d.transactions.length,0);
 const reminders={...d,settings:{...d.settings,notificationMode:'digest',plannedReminders:true,reminders:false,dailyReport:false,weeklyReport:false,monthlyReport:false}};
 assert.ok(notificationJobs(reminders,new Date(today+'T15:00Z')).every(job=>!job.openPayments));
 assert.match(botView(d,'plan',{id:'therapy'}).lines.join('\n'),/Дата пока не назначена/);
});
test('Arbitrary appointments reserve only explicit occurrences; payment keeps template and creates no next date',()=>{
 let d=schedulePlanned(create(),'therapy',day(2),today);assert.equal(d.accounts[0].balance,10000);assert.equal(d.transactions.length,0);assert.equal(dashboard(d,today).obligations,8000);assert.equal(dashboard(d,today).free,2000);assert.deepEqual(events(d).map(e=>e.date),[day(2)]);
 d=putTransaction(d,preparePlanned(d,'therapy',day(2),today,false));assert.equal(d.accounts[0].balance,2000);assert.equal(d.transactions.length,1);assert.equal(d.transactions[0].recurringPeriod,day(2));assert.equal(dashboard(d,today).obligations,0);assert.equal(events(d).length,0);assert.equal(d.recurring[0].active,true);
 assert.throws(()=>putTransaction(d,{...d.transactions[0],id:'duplicate'}),/подтверждён/);
 d=updatePlanned(d,'therapy',{...d.recurring[0],amount:9000});d=schedulePlanned(d,'therapy',day(47),today);assert.equal(d.transactions[0].amount,8000);assert.deepEqual(events(d).map(e=>[e.date,e.remaining]),[[day(47),9000]]);assert.throws(()=>schedulePlanned(d,'therapy',day(47),today),/уже назначена/);
 const restored=migrateData(JSON.parse(JSON.stringify(d)),EMPTY);assert.deepEqual(restored.recurring[0].scheduledDates,[day(2),day(47)]);assert.equal(restored.accounts[0].balance,2000);assert.equal(restored.transactions[0].recurringPeriod,day(2));
});
test('Move, skip, restore and link existing payment preserve balances and original occurrence identity',()=>{
 let d=schedulePlanned(create(),'therapy',today,today);d=reschedulePlanned(d,'therapy',today,day(9),today);assert.deepEqual(events(d).map(e=>[e.period,e.date]),[[today,day(9)]]);
 d=skipPlanned(d,'therapy',today);assert.equal(events(d).length,0);d=restorePlanned(d,'therapy',today);assert.equal(events(d)[0].date,day(9));assert.equal(d.accounts[0].balance,10000);
 d=putTransaction(d,{id:'existing',date:today,type:'expense',cat:'health',amount:8000,currency:'RUB',accountId:'bank',note:'Сеанс уже внесён'});d=linkPlannedTransaction(d,'therapy',today,'existing');assert.equal(d.accounts[0].balance,2000);assert.equal(d.transactions.length,1);assert.equal(events(d).length,0);assert.equal(d.transactions[0].recurringPeriod,today);
 const entry=d.history[0];assert.equal(deleteTransaction(d,'existing').accounts[0].balance,10000);assert.equal(events(deleteTransaction(d,'existing'))[0].date,day(9));const undone=undoTransaction(d,entry);assert.equal(undone.accounts[0].balance,2000);assert.equal(undone.transactions.length,1);assert.equal(events(undone)[0].date,day(9));
});
test('API and import reject forged schedules, unassigned confirmations and orphaned overrides',()=>{
 const d=create();for(const scheduledDates of [null,{},[today,today],['2026-02-30'],[false]])assert.throws(()=>migrateData({...d,recurring:[{...d.recurring[0],scheduledDates}]},EMPTY),/назначенные даты/);
 assert.throws(()=>migrateData({...d,recurring:[{...d.recurring[0],dateOverrides:{[today]:day(1)}}]},EMPTY),/переноса/);
 assert.throws(()=>migrateData({...d,recurring:[{...d.recurring[0],skippedPeriods:[today]}]},EMPTY),/пропущенный/);
 assert.throws(()=>putTransaction(d,{date:today,type:'expense',cat:'health',amount:8000,accountId:'bank',recurringId:'therapy',recurringPeriod:today}),/период/);
 assert.throws(()=>schedulePlanned(d,'therapy',day(-1),today),/будущую/);assert.throws(()=>schedulePlanned(d,'therapy','2026-02-30',today),/будущую/);
});
test('Native bot creates undated plan and schedules through the same domain contract',()=>{
 let d=applyBotAction(seed(),'plan',{}, {...values,hasDate:false,startDate:today});assert.equal(events(d).length,0);assert.equal(d.recurring[0].startDate,'');const id=d.recurring[0].id;
 assert.ok(fieldsFor(d,'plan',{},values).find(f=>f.key==='frequency').choices.some(c=>c[0]==='manual'));
 assert.ok(fieldsFor(d,'plan',{},values).some(f=>f.key==='hasDate'));assert.ok(!fieldsFor(d,'plan',{},values).some(f=>f.key==='startDate'));
 d=applyBotAction(d,'schedulePlan',{id},{date:day(12)});assert.equal(d.accounts[0].balance,10000);assert.deepEqual(events(d).map(e=>e.date),[day(12)]);assert.ok(botView(d,'plans',{manual:true}).actions.some(a=>a.args?.id===id));assert.ok(!botView(d,'plans').actions.some(a=>a.args?.id===id));
 d=applyBotAction(d,'confirmPlan',{id,period:day(12)},{changed:false,date:today});assert.equal(d.accounts[0].balance,2000);assert.equal(events(d).length,0);assert.equal(d.transactions.length,1);
});
test('Far future explicit appointment is visible in preview and undated income never becomes an anchor',()=>{
 assert.equal(previewPlanned(seed(),{...values,startDate:day(180)},today).items[0].date,day(180));
 const d=createPlanned(seed(),{...values,type:'income',budgetAnchor:true});assert.equal(dashboard(d,today).income,0);assert.equal(dashboard(d,today).free,10000);assert.equal(events(d).length,0);
});
test('Bot card stays bounded for many explicit dates and uses current overrides',()=>{
 const d=create(),dates=Array.from({length:600},(_,i)=>day(i));d.recurring[0].scheduledDates=dates;d.recurring[0].dateOverrides={[today]:day(700)};
 const card=botView(d,'plan',{id:'therapy'});assert.ok(card.lines.join('\n').length<500);assert.match(card.lines.join('\n'),/ещё 595/);assert.ok(card.lines.join('\n').includes(day(1)));
});
