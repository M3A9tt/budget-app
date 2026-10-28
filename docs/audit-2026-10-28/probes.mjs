// Read-only audit of the 4.6.3 baseline, using fictional in-memory profiles only.
// Observations are evidence of current behavior, not desired regression assertions.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {EMPTY,CATEGORIES,dashboard} from '../../src/mini-model.js';
import {putTransaction,transferMoney,migrateData} from '../../src/ledger.js';
import {reconcileAccount,commitImport,previewImport,createInstallment,payInstallment} from '../../src/finance-tools.js';
import {fieldsFor} from '../../server/bot-catalog.js';
import {repeatEntry} from '../../src/entry-assist.js';
import {commitJsonImport} from '../../src/json-import.js';
import {debtRemaining} from '../../src/debt-state.js';
import {createPlanned} from '../../src/planned-operations.js';
import {spendingReport} from '../../src/analytics-report.js';
import {MAX_STATE_BYTES,encodeState} from '../../server/state-persistence.js';
import {deliverNotifications} from '../../server/notification-outbox.js';
import {notificationJobs} from '../../server/notifications.js';
import worker from '../../server/worker.js';

const today='2026-10-28',baseline='c074475ca06a6f46dfde31254c97abad035e9834',base=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Карта',balance:1000,currency:'RUB'},{id:'cash',name:'Наличные',balance:0,currency:'RUB'}],settings:{...EMPTY.settings,timeZone:'Europe/Moscow',dailyReport:false,weeklyReport:false,monthlyReport:false}}),observations=[];
function note(id,value){observations.push({id,...value});}
function memoryDB(){const db=new DatabaseSync(':memory:');const DB={prepare(sql){let args=[];const stmt={bind(...v){args=v.map(x=>x instanceof ArrayBuffer?new Uint8Array(x):x);return stmt;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return stmt;},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};return {db,DB};}

// A past bank snapshot is assigned to the current balance despite later records.
{
 const paid=putTransaction(base(),{id:'buy',type:'expense',cat:'food',amount:100,currency:'RUB',date:today,accountId:'bank'}),result=reconcileAccount(paid,{accountId:'bank',balance:1000,date:'2026-10-01'});
 assert.equal(paid.accounts[0].balance,900);assert.equal(result.accounts[0].balance,1000);assert.equal(result.transactions.length,1);
 note('historical-reconciliation',{laterExpense:100,before:900,snapshotDate:'2026-10-01',snapshotAmount:1000,after:1000,recordStillPresent:true,expectedIfHistoricalSnapshot:900});
}
// The restore validator accepts inconsistent domain objects.
{
 const d=base();d.debts=[{id:'debt',person:'Тест',type:'my',amount:100,currency:'RUB',dueDate:today,payments:[{amount:-900,date:today}]}];
 const accepted=migrateData(d,EMPTY);assert.equal(debtRemaining(accepted.debts[0],accepted),1000);note('negative-legacy-debt-payment',{accepted:true,debtFaceValue:100,legacyRepayment:-900,displayedRemaining:1000});
 d.debts=[];d.installments=[{id:'plan',name:'Тест',total:100,currency:'RUB',accountId:'bank',payments:[{id:'part',date:today,amount:300}]}];const restored=migrateData(d,EMPTY);assert.equal(dashboard(restored,today).obligations,300);note('inconsistent-installment-restore',{accepted:true,declaredTotal:100,paymentSum:300,obligations:300});
}
// Category deduplication differs between the dashboard and analytics.
{
 let d=putTransaction(base(),{type:'expense',cat:'food',amount:100,date:today,accountId:'bank'});d.customCats=[{id:'food',name:'Ещё еда'}];d=migrateData(d,EMPTY);const home=dashboard(d,today),report=spendingReport(d,today);
 assert.equal(home.spent,100);assert.equal(home.categories.reduce((s,c)=>s+c.value,0),200);assert.equal(report.categories.reduce((s,c)=>s+c.value,0),100);
 note('duplicate-category-contract',{accepted:true,homeExpense:home.spent,homeCategorySum:200,analyticsCategorySum:100,homeCategoryNames:home.categories.map(c=>c.name)});
}
// A tiny expected income is enough to end the spendable budget horizon.
{
 let d=createPlanned(base(),{id:'bill',type:'expense',frequency:'once',name:'Счёт',amount:2000,startDate:'2026-10-30',accountId:'bank'});const before=dashboard(d,today);
 d=createPlanned(d,{id:'small-income',type:'income',frequency:'once',name:'Небольшой доход',amount:1,startDate:'2026-10-29',accountId:'bank'});const after=dashboard(d,today);assert.equal(before.free,-1000);assert.equal(after.free,1000);
 note('income-horizon-policy',{balance:1000,bill:{date:'2026-10-30',amount:2000},income:{date:'2026-10-29',amount:1},before:{free:before.free,until:before.budgetUntil},after:{free:after.free,until:after.budgetUntil},classification:'Product policy risk; dates are shown, no balance mutation'});
}
// The Mini App can confirm a partial installment; the native bot form has only a date.
{
 const d=createInstallment(base(),{id:'split',name:'Проверочный сплит',total:600,count:2,firstDate:today,accountId:'bank'}),fields=fieldsFor(d,'payInstallment',{id:'split',paymentId:d.installments[0].payments[0].id});assert.deepEqual(fields.map(f=>f.key),['date']);
 note('partial-installment-parity',{botConfirmationFields:fields.map(f=>f.key),miniAppSupportsPartialAmount:true,scheduledAmount:300});
}
// Generic repeat loses the installment link but still debits the account.
{
 let d=createInstallment(base(),{id:'repeat-plan',name:'Проверочный сплит',total:600,count:2,firstDate:'2026-10-14',cadence:'biweekly',accountId:'bank'});d=payInstallment(d,{planId:'repeat-plan',paymentId:d.installments[0].payments[0].id,date:'2026-10-14'});const before=dashboard(d,today),original=d.transactions[0],draft=repeatEntry(d,original,today,CATEGORIES);d=putTransaction(d,{...draft,amount:Number(draft.amount)});const after=dashboard(d,today);
 assert.equal(draft.installmentPaymentId,undefined);assert.deepEqual([before.free,after.free,after.obligations,d.accounts[0].balance],[400,100,300,400]);note('repeat-linked-payment',{before:{balance:700,obligations:300,free:400},after:{balance:400,obligations:300,free:100},repeatedExpenseLinked:false,expectedIfNextInstallmentPaid:{balance:400,obligations:0,free:400}});
}
// Mini App answers live in the profile; the reminder checks a separate SQL answer list.
{
 const d=base();d.settings.lunchAskEnabled=true;d.lunchAnswers={[today]:{status:'skipped',reason:'Не заказал, рабочий день'}};const jobs=notificationJobs(d,new Date(today+'T08:00:00Z'),[]).filter(j=>j.kind==='lunch');assert.equal(jobs.length,1);
 const own=putTransaction(base(),{type:'expense',cat:'food',amount:200,date:today,accountId:'bank',note:'Обед за свои',tags:['обед-за-свои']});own.settings.lunchAskEnabled=true;const ownJobs=notificationJobs(own,new Date(today+'T08:00:00Z'),[]).filter(j=>j.kind==='lunch');assert.equal(ownJobs.length,1);note('lunch-answer-divergence',{miniAppSkippedAnswerStored:true,sqlAnswers:[],questionsAfterSkipped:jobs.length,ownLunchRecorded:true,questionsAfterOwnLunch:ownJobs.length});
}
// CSV and JSON disagree about accepting future history-only rows.
{
 const date='2099-01-01',d=base(),csv=previewImport(d,'date;amount;note\n'+date+';-100;История','bank'),result=commitImport(d,csv);let error;
 try{commitJsonImport(d,{format:'burget-operations',version:1,operations:[{date,type:'expense',amount:100,currency:'RUB',account:'bank',category:'food',note:'История'}]});}catch(e){error=e.message;}
 assert.equal(result.transactions.length,1);assert.ok(error);note('future-import-contract',{date,csvAccepted:true,csvMode:result.transactions[0].balanceEffect,jsonAccepted:false,jsonError:error});
}
// Full-profile capacity, with realistic stored rows and a capped 200-event journal.
{
 const seed=putTransaction(base(),{id:'seed',type:'expense',cat:'food',amount:100,date:today,accountId:'bank',note:'Продукты, поездка и обычная запись для проверки объёма'}),sample=seed.transactions[0],rows=[];
 const state=n=>({...seed,transactions:Array.from({length:n},(_,i)=>({...sample,id:'transaction-'+i,externalId:'bank-reference-'+i})),history:Array.from({length:200},(_,i)=>({...seed.history[0],id:'event-'+i,after:{...sample,id:'transaction-'+i}}))});
 for(const count of [1000,3000,5000,10000]){const d=state(count),bytes=new TextEncoder().encode(JSON.stringify(d)).length;let accepted=true;try{encodeState(d);}catch{accepted=false;}const start=performance.now();migrateData(d,EMPTY);spendingReport(d,today);rows.push({count,bytes,accepted,validateAndReportMs:Number((performance.now()-start).toFixed(2))});}
 let low=1,high=10000;while(low<high){const mid=Math.floor((low+high)/2);try{encodeState(state(mid));low=mid+1;}catch{high=mid;}}
 note('profile-capacity',{limitBytes:MAX_STATE_BYTES,firstRejectedFixtureCount:low,rows,maximumSnapshotPayloadBytesAtLimit:MAX_STATE_BYTES*50,warning:'Synthetic fixture; the threshold and timings depend on record fields and hardware'});
}
// In-memory Worker API: a too-long summary returns a generic server error.
{
 const {db,DB}=memoryDB();db.exec(await readFile(new URL('../../server/schema.sql',import.meta.url),'utf8'));const env={DB,TELEGRAM_OWNER_ID:'111',API_TOKEN:'audit-only'};
 const req=path=>worker.fetch(new Request('https://audit.test/api/v1/'+path,{headers:{Authorization:'Bearer audit-only'}}),env);
 const normal=await req('summary?from=2026-10-01&to=2026-10-28'),long=await req('summary?from=2024-01-01&to=2026-10-28');assert.equal(normal.status,200);assert.equal(long.status,503);note('summary-api-range-error',{validStatus:normal.status,tooLongStatus:long.status,body:await long.json()});db.close();
}
// A notification lease is not a transaction with the external Telegram send.
// Simulate delivery success followed by local receipt failure.
{
 const {db,DB}=memoryDB();db.exec(await readFile(new URL('../../server/schema.sql',import.meta.url),'utf8'));const env={DB},d=base(),report={id:'check:'+today+':1200',day:today,kind:'expense',text:'Тест'},sent=[];d.settings.expenseCheckEnabled=true;
 const original=DB.batch.bind(DB);let fail=true;DB.batch=async statements=>{if(fail)throw Error('Receipt write unavailable');return original(statements);};
 await deliverNotifications(env,'111',today,d,[report],[],async(_e,_m,b)=>sent.push(b),()=>'',async()=>{});
 db.prepare('UPDATE user_notification_outbox SET lease_until=0').run();fail=false;await deliverNotifications(env,'111',today,d,[],[],async(_e,_m,b)=>sent.push(b),()=>'',async()=>{});
 assert.equal(sent.length,2);note('notification-delivery-ambiguity',{externalSends:sent.length,logicalJobCount:1,scenario:'Telegram accepted a send; the local receipt transaction failed; a retry sent it again',classification:'Confirmed fault-injection scenario, not a claim that it happened in production'});db.close();
}
// A missed cron slot beyond 15 minutes is not recovered on the next invocation.
{
 const d=base();d.settings.dailyReport=true;d.settings.reportTime='21:00';const count=minutes=>notificationJobs(d,new Date('2026-10-28T18:'+String(minutes).padStart(2,'0')+':00Z'),[],{catchUp:true}).filter(j=>j.id==='day:'+today).length;
 assert.equal(count(15),1);assert.equal(count(16),0);note('cron-catchup-window',{dailyReportAt2100:true,jobsAt2115:count(15),jobsAt2116:count(16)});
}

await writeFile(new URL('evidence.json',import.meta.url),JSON.stringify({baseline,date:today,fictional:true,node:process.version,observations},null,2)+'\n');
console.log(JSON.stringify(observations,null,2));
