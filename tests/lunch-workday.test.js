import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {lunchBudget} from '../src/lunch-budget.js';
import {lunchReminderDay,setLunchWorkday} from '../src/lunch-schedule.js';
import {putTransaction,deleteTransaction,migrateData} from '../src/ledger.js';
import {notificationJobs} from '../server/notifications.js';
import {applyBotAction,fieldsFor} from '../server/bot-catalog.js';
import {botView} from '../server/bot-views.js';
import {actionOutcome,compactTransaction} from '../server/bot-dialog.js';
const sunday='2026-10-25',base=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',balance:1000,currency:'RUB'}],settings:{...EMPTY.settings,timeZone:'Europe/Moscow',lunchAskEnabled:true,lunchAskDays:[1,2,3,4,5],dailyReport:false,weeklyReport:false,monthlyReport:false}});
test('An extra Sunday shift adds one allowance, retains existing meals/top-ups and never changes personal money',()=>{
 let d=putTransaction(base(),{id:'meal',type:'lunch',cat:'lunch',date:sunday,amount:350,note:'Суп и горячее'});d=putTransaction(d,{id:'topup',type:'expense',cat:'food',date:sunday,amount:50,accountId:'bank',lunchId:'meal'});
 const before=structuredClone(d),old=lunchBudget(d,'2026-10',sunday);d=setLunchWorkday(d,sunday,1);const b=lunchBudget(d,'2026-10',sunday),day=b.days.find(d=>d.date===sunday);
 assert.deepEqual([old.budget,old.accrued,old.spent,old.own],[8800,6800,350,50]);assert.deepEqual([b.budget,b.accrued,b.spent,b.own,b.extraDays,day.limit,day.difference],[9200,7200,350,50,1,400,50]);assert.equal(b.remaining-old.remaining,400);assert.equal(b.confirmedDifference-old.confirmedDifference,400);
 assert.deepEqual(d.accounts,before.accounts);assert.deepEqual(d.transactions,before.transactions);assert.deepEqual(d.history,before.history);assert.deepEqual(d.settings,before.settings);assert.equal(dashboard(d,sunday).free,dashboard(before,sunday).free);assert.deepEqual(setLunchWorkday(d,sunday,1),d);assert.equal(lunchBudget(migrateData(d,EMPTY),'2026-10',sunday).budget,9200);
 d=putTransaction(d,{id:'second',type:'lunch',cat:'lunch',date:sunday,amount:25});assert.equal(lunchBudget(d,'2026-10',sunday).days.find(d=>d.date===sunday).limit,400);
 d=deleteTransaction(d,'meal');assert.equal(lunchBudget(d,'2026-10',sunday).budget,9200);assert.deepEqual(d.transactions.map(t=>t.id),['second']);assert.equal(d.accounts[0].balance,1000);
 const reset=setLunchWorkday(d,sunday,'calendar');assert.equal(lunchBudget(reset,'2026-10',sunday).budget,8800);assert.deepEqual(reset.transactions,d.transactions);assert.deepEqual(reset.accounts,d.accounts);
});
test('Half shifts, holiday work, absence conflicts and future shifts follow the same schedule without early accrual',()=>{
 let d=base();d.lunchDayOff=[sunday,sunday];d.lunchDayMod={[sunday]:0.5};d=setLunchWorkday(d,sunday,1);assert.deepEqual(d.lunchDayOff,[]);d=setLunchWorkday(d,sunday,0.5);let b=lunchBudget(d,'2026-10',sunday);assert.equal(b.budget,9000);assert.equal(b.extraDays,0.5);assert.equal(b.accrued,7000);
 d=setLunchWorkday(d,sunday,0);assert.equal(d.lunchDayOff.length,1);assert.ok(!Object.hasOwn(d.lunchDayMod,sunday));assert.equal(lunchBudget(d,'2026-10',sunday).budget,8800);
 d=setLunchWorkday(d,'2026-11-04',1);b=lunchBudget(d,'2026-11',sunday);assert.equal(b.budget,8400);assert.equal(b.accrued,0);assert.equal(b.extraDays,1);assert.equal(lunchBudget(d,'2026-11','2026-11-04').days.find(x=>x.date==='2026-11-04').limit,400);
 d.settings.lunchCalendar='weekly';d.settings.lunchWorkDays=[0,6];d=setLunchWorkday(d,'2026-10-26',1);assert.equal(lunchBudget(d,'2026-10','2026-10-26').extraDays,1);assert.ok(lunchReminderDay(d,'2026-10-26'));
});
test('Extra-shift reminders bypass ordinary weekdays but keep opt-in, real meals, answers, absence and reset checks',()=>{
 let d=base();const jobs=(state,date=sunday)=>notificationJobs(state,new Date(date+'T08:00:00Z')).filter(j=>j.kind==='lunch');assert.equal(jobs(d).length,0);d=setLunchWorkday(d,sunday,1);assert.equal(jobs(d).length,1);assert.equal(jobs(setLunchWorkday(d,sunday,0.5)).length,1);assert.equal(jobs(setLunchWorkday(d,sunday,'calendar')).length,0);assert.equal(jobs(setLunchWorkday(d,sunday,0)).length,0);
 assert.equal(jobs({...d,settings:{...d.settings,lunchAskEnabled:false}}).length,0);assert.equal(jobs({...d,settings:{...d.settings,modules:{lunch:false}}}).length,0);assert.equal(jobs(putTransaction(d,{type:'lunch',cat:'lunch',date:sunday,amount:350})).length,0);
 assert.equal(notificationJobs(d,new Date(sunday+'T08:00:00Z'),[{day:sunday,kind:'lunch',status:'skipped'}]).filter(j=>j.kind==='lunch').length,0);d.settings.lunchAskDays=[2];assert.equal(jobs(d,'2026-10-26').length,0);d=setLunchWorkday(d,'2026-11-04',1);assert.equal(jobs(d,'2026-11-04').length,1);
});
test('Bot workday commands share the app model and display the resulting allowance without creating financial operations',()=>{
 const d=base(),v={date:sunday,ratio:1},next=applyBotAction(d,'dayOff',{},v);assert.deepEqual(next,setLunchWorkday(d,sunday,1));assert.deepEqual(next.transactions,[]);assert.deepEqual(next.accounts,d.accounts);
 const screen=botView(next,'lunch',{month:'2026-10'});assert.ok(screen.actions.some(a=>a.op==='dayOff'&&a.label.includes('Рабочий день')));assert.ok(screen.lines.some(l=>l.includes('Дополнительные выходы: 1')));assert.ok(actionOutcome(next,{op:'dayOff',args:{},values:v},{}).lines.some(l=>/400\s*₽/.test(l)));assert.ok(fieldsFor(d,'dayOff').find(f=>f.key==='ratio').hint.includes('один раз'));
 assert.deepEqual(applyBotAction(next,'dayOff',{}, {...v,ratio:'reset'}),setLunchWorkday(d,sunday,'calendar'));assert.ok(compactTransaction(d,{args:{type:'lunch'},values:{date:sunday,amount:350}}).some(l=>l.includes('За эту дату лимит 0')));
});
test('Invalid workday overrides cannot enter through commands or backup restore',()=>{
 const d=base();for(const [date,ratio] of [['2026-02-30',1],[sunday,2],[sunday,-1],[sunday,'1'],['bad',0.5]])assert.throws(()=>setLunchWorkday(d,date,ratio));
 for(const extra of [{lunchDayOff:['2026-02-30']},{lunchDayMod:{[sunday]:-1}},{lunchDayMod:{[sunday]:2}},{lunchDayMod:{[sunday]:'1'}},{lunchDayMod:{bad:1}}])assert.throws(()=>migrateData({...d,...extra},EMPTY));assert.deepEqual(migrateData(d,EMPTY).accounts,d.accounts);
});
