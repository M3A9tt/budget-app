import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {EMPTY,CATEGORIES,dashboard,todayMoscow} from '../src/mini-model.js';
import {putTransaction,deleteTransaction,transferMoney,migrateData} from '../src/ledger.js';
import {createInstallment,payInstallment,reconcileAccount,commitImport,previewImport} from '../src/finance-tools.js';
import {repeatEntry} from '../src/entry-assist.js';
import {createPlanned,reschedulePlanned,preparePlanned} from '../src/planned-operations.js';
import {scheduledEvents,budgetWindow} from '../src/finance-events.js';
import {reverseTransfer,updateTransfer} from '../src/transfer-actions.js';
import {setLunchAnswer,lunchDayStatus} from '../src/lunch-day-state.js';
import {attentionItems} from '../src/attention.js';
import {notificationJobs} from '../server/notifications.js';
import {deliverNotifications} from '../server/notification-outbox.js';
import {setPaymentReminder,paymentReminderEvents,localReminderInstant} from '../src/payment-reminders.js';
import {saveEntryDraft,loadEntryDraft,clearEntryDrafts} from '../src/entry-draft.js';
import {changeInstallmentPayment,installmentReturnStatus,refundInstallment} from '../src/installment-actions.js';
import {lunchDayRatio,lunchCalendarVerified} from '../src/lunch-schedule.js';
import {fieldsFor,applyBotAction} from '../server/bot-catalog.js';
import {financialCommand} from '../server/financial-command.js';
import worker from '../server/worker.js';
import {showBotView} from '../server/bot-chat.js';
const day='2026-10-28',now=Date.parse(day+'T18:00:00Z');
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'b',name:'Наличные',balance:0,currency:'RUB'}],settings:{...EMPTY.settings,timeZone:'Europe/Moscow',modules:{lunch:false},dailyReport:false,weeklyReport:false,monthlyReport:false}});
const plan=(d=base())=>createPlanned(d,{id:'rent',name:'ЖКХ',type:'expense',amount:200,accountId:'a',frequency:'monthly',startDate:'2026-10-10'});
function dbFixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));const DB={prepare(sql){let args=[];const s={bind(...v){args=v;return s;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};return s;},async batch(rows){sqlite.exec('BEGIN');try{const result=[];for(const s of rows)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {env:{DB},sqlite};}
test('F01 repeat pays the next linked installment and does not leave the obligation outstanding',()=>{
 let d=createInstallment(base(),{id:'s',name:'Сплит',total:600,count:2,firstDate:'2026-10-14',cadence:'biweekly',accountId:'a'});
 d=payInstallment(d,{planId:'s',paymentId:d.installments[0].payments[0].id,date:'2026-10-14'});const before=dashboard(d,day);
 const draft=repeatEntry(d,d.transactions[0],day,CATEGORIES);assert.ok(draft.installmentPaymentId);d=putTransaction(d,draft);
 assert.equal(d.accounts[0].balance,400);assert.equal(dashboard(d,day).obligations,0);assert.equal(dashboard(d,day).free,before.free);
 assert.throws(()=>putTransaction(d,{...draft,id:'duplicate'}),/больше взноса/);
});
test('F01 a planned payment repeats into its next period with the same linkage',()=>{
 let d=plan();d=putTransaction(d,preparePlanned(d,'rent','2026-10',day));const draft=repeatEntry(d,d.transactions[0],day,CATEGORIES);
 assert.equal(draft.recurringId,'rent');assert.equal(draft.recurringPeriod,'2026-11');assert.equal(draft.date,day);
});
test('F02 current reconciliation previews a correction, and a past snapshot cannot overwrite today',()=>{
 const d=putTransaction(base(),{type:'expense',amount:100,date:day,cat:'food',accountId:'a'}),original=structuredClone(d);
 assert.throws(()=>reconcileAccount(d,{accountId:'a',balance:1000,date:'2026-10-01'}),/сейчас/);assert.deepEqual(d,original);
 const next=reconcileAccount(d,{accountId:'a',balance:950,date:todayMoscow()});assert.equal(next.reconciliations[0].difference,50);assert.equal(next.transactions[0].amount,100);
});
test('F03 restore rejects negative debt repayments, inconsistent schedules and duplicate category IDs atomically',()=>{
 const d=base();for(const invalid of [
  {...d,debts:[{id:'d',type:'my',amount:100,currency:'RUB',payments:[{date:day,amount:-900}]}]},
  {...d,installments:[{id:'s',total:100,currency:'RUB',payments:[{id:'p',date:day,amount:300}]}]},
  {...d,customCats:[{id:'food',name:'Ещё еда'}]},
  {...d,recurring:[{id:'bad',amount:100,currency:'XXX'}]}
 ])assert.throws(()=>migrateData(invalid,EMPTY));assert.equal(d.accounts[0].balance,1000);
});
test('F04 reverse and update use linked fee facts and preserve neutral transfer totals',()=>{
 const original=base();let d=transferMoney(original,{id:'move',from:'a',to:'b',amount:100,fee:5,date:day});assert.equal(d.transactions[0].transferId,'move');
 d=updateTransfer(d,{id:'move',revision:1,from:'a',to:'b',amount:200,fee:10,date:day});assert.deepEqual(d.accounts.map(a=>a.balance),[790,200]);assert.equal(d.transactions.length,1);assert.equal(d.transfers[0].revision,2);
 assert.throws(()=>updateTransfer(d,{id:'move',revision:1,from:'a',to:'b',amount:200,date:day}),/изменён/);
 d=reverseTransfer(d,'move',{revision:2});assert.deepEqual(d.accounts,original.accounts);assert.equal(d.transactions.length,0);assert.deepEqual(reverseTransfer(d,'move'),d);
});
test('F04 history-only reversal leaves supplied current balances unchanged',()=>{
 const d=transferMoney(base(),{id:'move',from:'a',to:'b',amount:100,fee:5,date:day,balanceEffect:'history-only'});const next=reverseTransfer(d,'move');assert.deepEqual(next.accounts,base().accounts);assert.equal(next.transactions.length,0);
});
test('F04 old commissions require explicit selection rather than a guessed text match',()=>{
 let d=transferMoney(base(),{id:'move',from:'a',to:'b',amount:100,fee:5,date:day});const fee=d.transactions[0];d={...d,transactions:[{...fee,transferId:undefined}]};
 assert.throws(()=>reverseTransfer(d,'move'),/явно/);const next=reverseTransfer(d,'move',{legacyFeeId:fee.id});assert.deepEqual(next.accounts,base().accounts);
});
test('F05 future schedule edits preserve paid facts and refund expectations do not credit money',()=>{
 let d=createInstallment(base(),{id:'s',name:'Сплит',total:600,count:2,firstDate:day,accountId:'a'}),id=d.installments[0].payments[0].id;
 d=payInstallment(d,{planId:'s',paymentId:id,amount:100,date:day});const paid=structuredClone(d.transactions);
 d=changeInstallmentPayment(d,'s',id,{date:'2026-11-10',remainingAmount:150});assert.deepEqual(d.transactions,paid);assert.equal(d.installments[0].total,550);assert.equal(d.accounts[0].balance,900);
 d=installmentReturnStatus(d,'s','awaiting');assert.equal(d.accounts[0].balance,900);
 d=refundInstallment(d,'s',{id:'refund',amount:100,date:day,accountId:'a'});assert.equal(d.accounts[0].balance,1000);assert.equal(d.installments[0].total,550);migrateData(d,EMPTY);
});
test('F06 native bot supports partial amount and account with the same common payment command',()=>{
 let d=createInstallment(base(),{id:'s',name:'Сплит',total:300,count:1,firstDate:day,accountId:'a'});const args={id:'s',paymentId:d.installments[0].payments[0].id};
 assert.deepEqual(fieldsFor(d,'payInstallment',args).map(f=>f.key),['amount','accountId','date']);d=applyBotAction(d,'payInstallment',args,{amount:100,accountId:'a',date:day});assert.equal(d.accounts[0].balance,900);assert.equal(dashboard(d,day).obligations,200);
});
test('F07 lunch answers and personal meals close questions, while explicit reset supersedes old SQL',()=>{
 let d=base();d.settings.modules.lunch=true;d.settings.lunchAskEnabled=true;
 d=setLunchAnswer(d,day,'skipped');assert.equal(lunchDayStatus(d,day),'skipped');assert.equal(notificationJobs(d,new Date(day+'T08:00Z')).length,0);
 d=setLunchAnswer(d,day,'unanswered');const responses=[{day,kind:'lunch',status:'skipped'}];assert.equal(lunchDayStatus(d,day,responses),'unanswered');
 d=putTransaction(d,{type:'expense',amount:200,date:day,cat:'food',accountId:'a',tags:['обед-за-свои']});assert.equal(lunchDayStatus(d,day),'own');assert.equal(notificationJobs(d,new Date(day+'T08:00Z'),responses).length,0);
});
test('F08 an incidental one-ruble income does not truncate the budget horizon or hide the shortage',()=>{
 let d=createPlanned(base(),{id:'bill',name:'Счёт',type:'expense',amount:2000,accountId:'a',frequency:'once',startDate:'2026-10-30'});const before=dashboard(d,day);
 d=createPlanned(d,{id:'small',name:'Мелочь',type:'income',amount:1,accountId:'a',frequency:'once',startDate:'2026-10-29'});assert.equal(dashboard(d,day).budgetUntil,before.budgetUntil);assert.equal(dashboard(d,day).free,-1000);assert.equal(dashboard(d,day).firstShortage,'2026-10-30');
 d.recurring.find(r=>r.id==='small').budgetAnchor=true;assert.equal(budgetWindow(d,day).until,'2026-10-29');assert.equal(dashboard(d,day).firstShortage,'2026-10-30');
});
test('ЖКХ reschedule changes one occurrence and cancels the old explicit reminder without moving later months',()=>{
 let d=plan();const event=scheduledEvents(d,day,'2026-11-30').find(e=>e.period==='2026-10');d=setPaymentReminder(d,event.id,'2026-10-29','10:00',now);
 d=reschedulePlanned(d,'rent','2026-10','2026-11-12',day);assert.equal(paymentReminderEvents(d,Date.parse('2026-10-29T07:00Z')).length,0);
 const events=scheduledEvents(d,day,'2026-12-31');assert.equal(events.find(e=>e.period==='2026-10').date,'2026-11-12');assert.equal(events.find(e=>e.period==='2026-11').date,'2026-11-10');assert.deepEqual(d.accounts,base().accounts);
});
test('Manual mode sends only a specifically requested reminder; paying removes it',()=>{
 let d=plan();d.settings.notificationMode='manual';assert.equal(notificationJobs(d,new Date(now)).length,0);
 d=setPaymentReminder(d,'plan:rent:2026-10','2026-10-29','10:00',now);const at=Date.parse('2026-10-29T07:00Z');assert.equal(notificationJobs(d,new Date(at)).length,1);
 d=putTransaction(d,preparePlanned(d,'rent','2026-10',day));assert.equal(notificationJobs(d,new Date(at)).length,0);
});
test('One digest reconstructs after an hour of cron downtime, contains all open items and disappears when empty',()=>{
 let d=plan();d.settings.notificationMode='digest';d.settings.reportTime='20:00';const jobs=notificationJobs(d,new Date(now),[],{catchUp:true});assert.equal(jobs.length,1);assert.equal(jobs[0].id,'digest:'+day);
 assert.ok(attentionItems(d,day).some(i=>i.name==='ЖКХ'));d=putTransaction(d,preparePlanned(d,'rent','2026-10',day));assert.equal(attentionItems(d,day).filter(i=>i.kind==='payment').length,0);assert.equal(notificationJobs(d,new Date(now),[],{catchUp:true}).length,0);
});
test('F14 accepted delivery plus failed receipt transaction never sends externally twice',async()=>{
 const {env,sqlite}=dbFixture(),d=plan(),sent=[];d.settings.notificationMode='digest';const jobs=notificationJobs(d,new Date(now),[],{catchUp:true}),batch=env.DB.batch;let fail=true;
 env.DB.batch=async rows=>{if(fail)throw Error('receipt unavailable');return batch(rows);};
 try{await deliverNotifications(env,'111',day,d,jobs,[],async(e,m,b)=>{sent.push(b);return {message_id:1};},()=>'',async()=>{});assert.equal(sent.length,1);
 fail=false;sqlite.prepare('UPDATE user_notification_outbox SET lease_until=0').run();await deliverNotifications(env,'111',day,d,jobs,[],async()=>sent.push('duplicate'),()=>'',async()=>{});assert.equal(sent.length,1);assert.equal(sqlite.prepare('SELECT count(*) n FROM user_reports_sent').get().n,1);
 }finally{sqlite.close();}
});
test('F14 unknown external result remains inspectable and does not enter a blind retry loop',async()=>{
 const {env,sqlite}=dbFixture(),d=plan();d.settings.notificationMode='digest';const jobs=notificationJobs(d,new Date(now),[],{catchUp:true});let attempts=0;
 try{const send=async()=>{attempts++;throw Error('connection lost after write');};await deliverNotifications(env,'111',day,d,jobs,[],send,()=>'',async()=>{});sqlite.prepare('UPDATE user_notification_outbox SET lease_until=0').run();await deliverNotifications(env,'111',day,d,[],[],send,()=>'',async()=>{});assert.equal(attempts,1);assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM user_notification_outbox').get().payload).delivery.phase,'uncertain');}finally{sqlite.close();}
});
test('F14 a known 429 rejection retries safely once the lease expires',async()=>{
 const {env,sqlite}=dbFixture(),d=plan();d.settings.notificationMode='digest';const jobs=notificationJobs(d,new Date(now),[],{catchUp:true});let attempts=0;
 try{await deliverNotifications(env,'111',day,d,jobs,[],async()=>{attempts++;throw Object.assign(Error('rate limited'),{telegramCode:429,retryAfter:5});},()=>'',async()=>{});sqlite.prepare('UPDATE user_notification_outbox SET lease_until=0').run();await deliverNotifications(env,'111',day,d,[],[],async()=>{attempts++;return {message_id:2};},()=>'',async()=>{});assert.equal(attempts,2);assert.equal(sqlite.prepare('SELECT count(*) n FROM user_notification_outbox').get().n,0);}finally{sqlite.close();}
});
test('F10 entry draft survives reload, expires and is isolated by user',()=>{
 const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i],get length(){return values.size;}};
 saveEntryDraft('111',{amount:'180',note:'Кофе'},storage,now);assert.equal(loadEntryDraft('111',storage,now+1000).amount,'180');assert.equal(loadEntryDraft('222',storage,now),null);assert.equal(loadEntryDraft('111',storage,now+86400001),null);saveEntryDraft('222',{amount:'20'},storage,now);clearEntryDrafts(storage);assert.equal(values.size,0);
});
test('F15 CSV future history follows the JSON policy without modifying balances',()=>{
 const d=base(),rows=previewImport(d,'date;amount;note\n2099-01-01;-100;Будущее','a');assert.throws(()=>commitImport(d,rows),/планы/);assert.equal(d.transactions.length,0);
});
test('F17 verified 2027 calendar includes the working Saturday and totals 247 working days',()=>{
 const d=base();assert.equal(lunchDayRatio(d,'2027-02-20'),1);assert.equal(lunchDayRatio(d,'2027-02-22'),0);assert.equal(lunchDayRatio(d,'2027-11-05'),0);assert.equal(lunchCalendarVerified(d,'2028-01'),false);
 let count=0;for(let i=0;i<365;i++){const date=new Date(Date.parse('2027-01-01T12:00Z')+i*86400000).toISOString().slice(0,10);count+=lunchDayRatio(d,date);}assert.equal(count,247);
});
test('Explicit reminder uses the configured timezone and rejects a nonexistent DST time',()=>{
 const d=base();assert.equal(localReminderInstant(d,'2026-10-29','10:00'),Date.parse('2026-10-29T07:00Z'));d.settings.timeZone='Europe/Berlin';assert.throws(()=>localReminderInstant(d,'2027-03-28','02:30'),/Такого времени/);
});
test('Partial expected income credits only received money and forecasts only the remaining portion',()=>{
 let d=createPlanned(base(),{id:'salary',name:'Зарплата',type:'income',amount:600,accountId:'a',frequency:'once',startDate:day});
 d=putTransaction(d,{...preparePlanned(d,'salary','once',day),amount:200,recurringPartial:true});assert.equal(d.accounts[0].balance,1200);assert.equal(scheduledEvents(d,day,day)[0].amount,400);migrateData(d,EMPTY);
 d=putTransaction(d,{...preparePlanned(d,'salary','once',day),amount:400,recurringPartial:false});assert.equal(d.accounts[0].balance,1600);assert.equal(scheduledEvents(d,day,day).length,0);migrateData(d,EMPTY);
 d=deleteTransaction(d,d.transactions[1].id);assert.equal(d.accounts[0].balance,1200);assert.equal(scheduledEvents(d,day,day)[0].amount,400);
});
test('Server command boundary persists one fact, isolates receipts and rejects stale revisions',async()=>{
 const {env,sqlite}=dbFixture();const d=base();sqlite.prepare('INSERT INTO user_finance_state VALUES(?,1,?,?)').run('111',JSON.stringify(d),'test');
 const read=async(e,userId)=>{const row=sqlite.prepare('SELECT revision,data FROM user_finance_state WHERE user_id=?').get(userId);return {revision:row.revision,data:JSON.parse(row.data)};};
 const input={action:'tx',args:{type:'expense'},values:{amount:100,date:day,accountId:'a',cat:'food',currency:'RUB'},expectedRevision:1};
 try{const result=await financialCommand(env,'111',input,'test-command',read);assert.equal(result.revision,2);assert.deepEqual(await financialCommand(env,'111',input,'test-command',read),result);assert.equal((await read(env,'111')).data.accounts[0].balance,900);await assert.rejects(financialCommand(env,'111',{...input,values:{...input.values,amount:200}},'test-command',read),/Ключ/);await assert.rejects(financialCommand(env,'111',input,'new-key',read),/изменились/);}finally{sqlite.close();}
});
test('Web sessions are listed and revoked only for the authenticated profile',async()=>{
 const {env,sqlite}=dbFixture();Object.assign(env,{API_TOKEN:'test-token',TELEGRAM_OWNER_ID:'111'});sqlite.prepare('INSERT INTO user_web_sessions VALUES(?,?,?)').run('a'.repeat(64),'111',Date.now()+10000);sqlite.prepare('INSERT INTO user_web_sessions VALUES(?,?,?)').run('b'.repeat(64),'222',Date.now()+10000);
 const call=(method='GET',body)=>worker.fetch(new Request('https://budget.test/api/v1/security/sessions',{method,headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 try{const list=await(await call()).json();assert.equal(list.sessions.length,1);await call('POST',{id:'b'.repeat(64)});assert.equal(sqlite.prepare('SELECT count(*) n FROM user_web_sessions').get().n,2);await call('POST',{all:true});assert.equal(sqlite.prepare('SELECT user_id FROM user_web_sessions').get().user_id,'222');}finally{sqlite.close();}
});
test('Digest recovers a missed evening across midnight using the persisted scheduler cursor',()=>{
 const d=plan();d.settings.notificationMode='digest';d.settings.reportTime='23:00';
 const recovered=notificationJobs(d,new Date('2026-10-28T21:30Z'),[],{catchUp:true,lastRun:Date.parse('2026-10-28T19:50Z')});assert.equal(recovered.length,1);assert.equal(recovered[0].id,'digest:2026-10-29');
 assert.equal(notificationJobs(d,new Date('2026-10-28T21:30Z'),[],{catchUp:true,lastRun:Date.parse('2026-10-28T20:10Z')}).length,0);
});
test('A canceled one-shot reminder stays canceled after the payment is moved back to its old date',()=>{
 let d=plan();d=setPaymentReminder(d,'plan:rent:2026-10','2026-10-29','10:00',now);d=reschedulePlanned(d,'rent','2026-10','2026-11-12',day);d=reschedulePlanned(d,'rent','2026-10','2026-10-29',day);assert.equal(Object.keys(d.paymentReminders).length,0);
});
test('Billing month remains independent of the payment day and of a one-off reschedule',()=>{
 let d=createPlanned(base(),{id:'housing',name:'ЖКХ',type:'expense',amount:200,frequency:'monthly',startDate:'2026-11-10',billingMonthOffset:-1,accountId:'a'});
 const event=scheduledEvents(d,day,'2026-11-30')[0];assert.equal(event.billingPeriod,'2026-10');assert.equal(event.date,'2026-11-10');d=reschedulePlanned(d,'housing','2026-11','2026-11-12',day);const moved=scheduledEvents(d,day,'2026-11-30')[0];assert.equal(moved.billingPeriod,'2026-10');assert.equal(moved.date,'2026-11-12');
});
test('Concurrent manual summary opens create one message, and reopening edits that same message',async()=>{
 const {env,sqlite}=dbFixture(),sent=[],api={readState:async()=>({revision:1,data:plan()}),telegram:async(e,method,body)=>{sent.push({method,body});return {message_id:body.message_id||10};}};
 try{await Promise.all([showBotView(env,'111',api,'attention'),showBotView(env,'111',api,'attention')]);assert.equal(sent.filter(x=>x.method==='sendMessage').length,1);await showBotView(env,'111',api,'attention');assert.equal(sent.filter(x=>x.method==='sendMessage').length,1);assert.equal(sent.filter(x=>x.method==='editMessageText').length,1);}finally{sqlite.close();}
});
