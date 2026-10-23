import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {createPlanned,updatePlanned,previewPlanned,preparePlanned} from '../src/planned-operations.js';
import {plannedOccurrences} from '../src/planned-model.js';
import {putTransaction,deleteTransaction,migrateData} from '../src/ledger.js';
import {scheduledEvents} from '../src/finance-events.js';
import {notificationJobs} from '../server/notifications.js';
import {applyBotAction} from '../server/bot-catalog.js';
const today='2026-10-23',draft={id:'bill',name:'ЖКХ',amount:'6840.44',accountId:'a',cat:'housing',frequency:'monthly',type:'expense',startDate:'2026-09-01',dueDay:15};
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Альфа',currency:'RUB',balance:20000},{id:'b',name:'Другой счёт',currency:'RUB',balance:1000},{id:'usd',name:'Доллары',currency:'USD',balance:100}],settings:{...EMPTY.settings,nextIncomeDate:'2026-10-25'}});
test('Changing a monthly day previews the exact unpaid schedule and updates the common budget without rewriting paid history',()=>{
 let data=createPlanned(base(),draft);data=putTransaction(data,{...preparePlanned(data,'bill','2026-09','2026-09-15',false),amount:6800});
 const before=structuredClone(data),values={...draft,amount:'6700',dueDay:28},preview=previewPlanned(data,values,today,'bill');
 assert.deepEqual(data,before);assert.deepEqual(preview.items.map(p=>p.date),['2026-10-28','2026-11-28','2026-12-28']);assert.equal(dashboard(data,today).obligations,6840.44);
 data=migrateData(updatePlanned(data,'bill',values),EMPTY);assert.equal(dashboard(data,today).obligations,0);assert.equal(dashboard(data,today).free,data.accounts[0].balance+1000+100*data.rates.USD);assert.deepEqual(data.accounts,before.accounts);assert.deepEqual(data.transactions,before.transactions);assert.deepEqual(data.history,before.history);
 assert.deepEqual(plannedOccurrences(data,today,'2027-01-24').map(p=>p.date).slice(0,3),preview.items.map(p=>p.date));
 assert.equal(scheduledEvents(data,today,'2026-10-31').find(e=>e.sourceId==='bill').date,'2026-10-28');
 data.settings={...data.settings,plannedReminders:true,plannedReminderTime:'18:00',dailyReport:false,weeklyReport:false,monthlyReport:false};
 assert.equal(notificationJobs(data,new Date(today+'T15:00:00Z')).filter(x=>x.openPayments).length,0);
 assert.equal(notificationJobs(data,new Date('2026-10-28T15:00:00Z')).filter(x=>x.openPayments).length,1);
 const priorBalance=data.accounts[0].balance;data=putTransaction(data,{...preparePlanned(data,'bill','2026-10',today,false),amount:6700});assert.equal(data.accounts[0].balance,priorBalance-6700);assert.throws(()=>putTransaction(data,{...preparePlanned(data,'bill','2026-10',today,false),amount:6700}));
 const paid=data.transactions.at(-1);data=deleteTransaction(data,paid.id);assert.equal(data.accounts[0].balance,priorBalance);assert.equal(scheduledEvents(data,today,'2026-10-31').find(e=>e.sourceId==='bill').amount,6700);
});
test('Renaming a variable legacy schedule preserves its independent due day, unknown sum and actual balances',()=>{
 const data=createPlanned(base(),{...draft,dueDay:31,variable:true}),before=structuredClone(data);
 const {dueDay,...values}=draft,next=updatePlanned(data,'bill',{...values,name:'Коммунальные услуги'});
 assert.equal(next.recurring[0].dueDay,31);assert.equal(next.recurring[0].variable,true);assert.equal(scheduledEvents(next,today,'2026-11-30')[0].amount,null);assert.deepEqual(next.accounts,before.accounts);assert.deepEqual(next.transactions,before.transactions);
 assert.deepEqual(plannedOccurrences(next,today,'2026-11-30').map(p=>p.date),['2026-09-30','2026-10-31','2026-11-30']);
});
test('Month-end preview uses the same clamp as saving; invalid day and repeated draft are blocked',()=>{
 const values={...draft,startDate:'2028-01-01',dueDay:31},data=base(),preview=previewPlanned(data,values,'2028-01-01');
 assert.deepEqual(preview.items.map(p=>p.date),['2028-01-31','2028-02-29','2028-03-31']);
 const next=createPlanned(data,values);assert.throws(()=>createPlanned(next,values),/уже создан/);
 for(const dueDay of [0,32,1.5,'no'])assert.throws(()=>createPlanned(data,{...values,dueDay}),/число|Число/);
 assert.equal(data.recurring.length,0);
});
test('Bot date editing and metadata editing preserve the shared schedule semantics',()=>{
 const data=createPlanned(base(),draft),old=data.recurring[0];
 const renamed=applyBotAction(data,'plan',{id:old.id},{...old,name:'Квартплата'});assert.equal(renamed.recurring[0].dueDay,15);
 const dated=applyBotAction(data,'plan',{id:old.id},{...old,startDate:'2026-11-10'});assert.equal(dated.recurring[0].dueDay,10);assert.equal(plannedOccurrences(dated,today,'2026-12-31')[0].date,'2026-11-10');
});
