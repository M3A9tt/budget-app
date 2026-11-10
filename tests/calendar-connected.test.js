import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard,todayMoscow} from '../src/mini-model.js';
import {moveDate,scheduledEvents,cashTimeline} from '../src/finance-events.js';
import {calendarMonth} from '../src/calendar-model.js';
import {rescheduleEvent,prepareEvent} from '../src/event-actions.js';
import {createPlanned,schedulePlanned,linkPlannedTransaction} from '../src/planned-operations.js';
import {createInstallment} from '../src/finance-tools.js';
import {createDebt} from '../src/debt-actions.js';
import {putTransaction,deleteTransaction,transferMoney,migrateData} from '../src/ledger.js';
import {debtRemaining} from '../src/debt-state.js';
import {installmentRemaining} from '../src/installment-state.js';
import {botView} from '../server/bot-views.js';
import {applyBotAction} from '../server/bot-catalog.js';
const today=todayMoscow(),day=n=>moveDate(today,n),base=()=>({...structuredClone(EMPTY),accounts:[{id:'card',name:'Карта',currency:'RUB',balance:10000},{id:'save',name:'Резерв',currency:'RUB',balance:2000,accType:'savings'}],settings:{...EMPTY.settings,nextIncomeDate:day(20),notificationMode:'manual'}});
function fixture(){
 let d=createPlanned(base(),{id:'rent',name:'ЖКХ',type:'expense',frequency:'monthly',startDate:today,amount:700,accountId:'card',cat:'housing'});
 d=createPlanned(d,{id:'income',name:'Подработка',type:'income',frequency:'once',startDate:day(3),amount:3000,accountId:'card'});
 d=createPlanned(d,{id:'therapy',name:'Психотерапевт',type:'expense',frequency:'manual',amount:800,accountId:'card'});d=schedulePlanned(d,'therapy',day(3),today);
 d=createInstallment(d,{id:'split',name:'Сплит',total:2000,count:2,firstDate:day(3),accountId:'card'});
 d=createDebt(d,{id:'rent-debt',person:'Друг',type:'my',amount:500,dueDate:day(3)});
 d=createDebt(d,{id:'receivable',person:'Вернёт',type:'tome',amount:200,dueDate:day(4)});return d;
}
test('All financial sources share calendar events and budget, with no independent calendar records',()=>{
 const d=fixture(),before=structuredClone(d),month=calendarMonth(d,today,today.slice(0,7)),events=month.days.flatMap(p=>p.events);
 assert.deepEqual(new Set(events.map(e=>e.source)),new Set(['plan','installment','debt']));for(const name of ['ЖКХ','Подработка','Психотерапевт','Сплит','Друг','Вернёт'])assert.ok(events.some(e=>e.name===name),name);
 assert.equal(dashboard(d,today).obligations,3000);assert.equal(dashboard(d,today).free,7000);assert.equal(cashTimeline(d,today,10).endBalance,10200);assert.deepEqual(d,before);
});
test('Reschedule changes the source, removes its reminder, preserves financial facts and rejects stale dates both ways',()=>{
 for(const source of ['plan','installment','debt']){
  const d=fixture(),event=scheduledEvents(d,today,day(4)).find(e=>e.source===source&&e.type==='expense'),before=structuredClone(d);d.paymentReminders={[event.id]:{at:1,date:event.date}};
  let next=rescheduleEvent(d,event,day(25),today);assert.deepEqual(next.accounts,before.accounts);assert.deepEqual(next.transactions,before.transactions);assert.deepEqual(next.history,before.history);assert.equal(next.paymentReminders[event.id],undefined);
  assert.equal(scheduledEvents(next,today,day(25)).find(e=>e.id===event.id).date,day(25));assert.equal(dashboard(next,today).obligations,3000-event.amount);assert.throws(()=>rescheduleEvent(next,event,day(5),today),/изменено/);assert.throws(()=>prepareEvent(next,event,today),/изменён/);
  const moved=scheduledEvents(next,today,day(25)).find(e=>e.id===event.id);next=rescheduleEvent(next,moved,today,today);assert.throws(()=>prepareEvent(next,moved,today),/изменён/);assert.equal(scheduledEvents(next,today,day(25)).find(e=>e.id===event.id).date,today);assert.deepEqual(migrateData(next,EMPTY).transactions,[]);
 }
});
test('A partially paid installment can move its unpaid part without changing payment or double counting',()=>{
 let d=fixture(),event=scheduledEvents(d,today,day(4)).find(e=>e.source==='installment');d=putTransaction(d,{...prepareEvent(d,event,today),amount:400});event=scheduledEvents(d,today,day(4)).find(e=>e.source==='installment');assert.equal(event.amount,600);const fact=structuredClone(d.transactions[0]),accounts=structuredClone(d.accounts);
 d=rescheduleEvent(d,event,day(7),today);assert.deepEqual(d.transactions[0],fact);assert.deepEqual(d.accounts,accounts);assert.equal(installmentRemaining(d,d.installments[0].payments[0]),600);
 const moved=scheduledEvents(d,today,day(7)).find(e=>e.id===event.id);d=putTransaction(d,prepareEvent(d,moved,today));assert.equal(d.accounts[0].balance,9000);assert.equal(installmentRemaining(d,d.installments[0].payments[0]),0);assert.ok(!scheduledEvents(d,today,day(7)).some(e=>e.id===event.id));assert.throws(()=>rescheduleEvent(d,moved,day(8),today),/выполнено/);
});
test('Debt moves and payment use the same remaining balance, then deletion reopens its calendar event',()=>{
 let d=fixture(),event=scheduledEvents(d,today,day(4)).find(e=>e.sourceId==='rent-debt');d=rescheduleEvent(d,event,day(8),today);const moved=scheduledEvents(d,today,day(8)).find(e=>e.id===event.id);d=putTransaction(d,prepareEvent(d,moved,today));assert.equal(d.accounts[0].balance,9500);assert.equal(debtRemaining(d.debts.find(x=>x.id==='rent-debt'),d),0);assert.ok(!scheduledEvents(d,today,day(8)).some(e=>e.id===event.id));d=deleteTransaction(d,d.transactions[0].id);assert.equal(d.accounts[0].balance,10000);assert.equal(scheduledEvents(d,today,day(8)).find(e=>e.id===event.id).date,day(8));
});
test('Calendar fact list includes transfers with exact type identity and never changes forecast or stored balances',()=>{
 let d=transferMoney(base(),{id:'same',from:'card',to:'save',amount:500,date:today});d=putTransaction(d,{id:'same',date:today,type:'expense',amount:100,accountId:'card',cat:'other',note:'Покупка'});const before=structuredClone(d),m=calendarMonth(d,today,today.slice(0,7)),facts=m.days.find(p=>p.date===today).transactions;
 assert.deepEqual(new Set(facts.map(t=>t.type)),new Set(['expense','transfer']));assert.equal(facts.length,2);assert.equal(cashTimeline(d,today,3).endBalance,9400);assert.deepEqual(d,before);
});
test('Typed bot calendar routes colliding IDs to exact occurrences and moves through shared event command',()=>{
 let d=fixture();d.recurring.unshift({...d.recurring[0],id:'s',name:'Префикс',frequency:'once',startDate:day(30)});const view=botView(d,'calendar'),expense=view.actions.find(a=>a.label.includes('ЖКХ')),split=view.actions.find(a=>a.label.includes('Сплит')),debt=view.actions.find(a=>a.label.includes('Друг'));
 for(const action of [expense,split,debt])assert.equal(action.view,'calendarEvent');const card=botView(d,'calendarEvent',expense.args);assert.equal(card.actions.find(a=>a.op==='confirmPlan').args.id,'rent');const splitCard=botView(d,'calendarEvent',split.args),pay=splitCard.actions.find(a=>a.op==='payInstallment');assert.equal(pay.args.id,'split');assert.equal(pay.args.paymentId,d.installments[0].payments[0].id);
 const move=splitCard.actions.find(a=>a.op==='moveCalendarEvent');d=applyBotAction(d,move.op,move.args,{date:day(9)});assert.equal(d.installments[0].payments[0].date,day(9));assert.equal(d.accounts[0].balance,10000);assert.throws(()=>botView(d,'calendarEvent',split.args),/перенесено/);
 assert.ok(view.actions.some(a=>a.op==='plan'&&a.args.type==='income'));assert.ok(view.actions.some(a=>a.op==='installment'));assert.ok(view.actions.some(a=>a.op==='debt'));
});
test('Duplicate debt command cannot create two sources; invalid calendar moves do not mutate source',()=>{
 const d=fixture(),before=structuredClone(d),event=scheduledEvents(d,today,day(4))[0];assert.throws(()=>createDebt(d,{id:'rent-debt',person:'Друг',amount:500,type:'my'}),/уже создан/);
 for(const date of ['bad','2026-02-30',day(-1)])assert.throws(()=>rescheduleEvent(d,event,date,today));assert.deepEqual(d,before);
});

test('A stale bot calendar action cannot pay a moved installment',()=>{
 const d=fixture(),event=scheduledEvents(d,today,day(4)).find(e=>e.source==='installment');
 const payAction=e=>botView(d,'calendarEvent',{eventId:e.id,date:e.date}).actions.find(a=>a.op==='payInstallment');
 const stale=payAction(event),moved=rescheduleEvent(d,event,day(7),today),before=structuredClone(moved);
 const payment={amount:400,accountId:'card',date:today};
 assert.throws(()=>applyBotAction(moved,stale.op,stale.args,payment),/перенесено/);
 assert.deepEqual(moved,before);
 const fresh=botView(moved,'calendarEvent',{eventId:event.id,date:day(7)}).actions.find(a=>a.op==='payInstallment');
 const paid=applyBotAction(moved,fresh.op,fresh.args,payment);
 assert.equal(paid.accounts[0].balance,9600);
 assert.equal(paid.transactions.length,1);
 assert.equal(installmentRemaining(paid,paid.installments[0].payments[0]),600);
});

test('Moving the 29th to the 17th replaces its occurrence and preserves a different billing period',()=>{
 const date='2026-11-10';
 const d=createPlanned(base(),{id:'transit',name:'Проезд',type:'expense',frequency:'monthly',startDate:'2026-10-29',dueDay:29,amount:900,accountId:'card'});
 const events=data=>scheduledEvents(data,date,'2026-11-30');
 for(const [period,expected] of [
  ['2026-11',[['2026-11-17','2026-11','2026-11-29']]],
  ['2026-10',[['2026-11-17','2026-10','2026-10-29'],['2026-11-29','2026-11','2026-11-29']]]
 ]){
  const moved=rescheduleEvent(d,events(d).find(e=>e.period===period),'2026-11-17',date);
  assert.deepEqual(events(moved).filter(e=>e.date>date).map(e=>[e.date,e.billingPeriod,e.originalDate]),expected);
  assert.deepEqual(moved.accounts,d.accounts);
  assert.deepEqual(moved.transactions,d.transactions);
 }
});
