import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,CATEGORIES} from '../src/mini-model.js';
import {putTransaction,deleteTransaction,undoTransaction,migrateData,roundMoney,transferMoney} from '../src/ledger.js';
import {createPlanned,preparePlanned,skipPlanned,updatePlanned} from '../src/planned-operations.js';
import {plannedPaid} from '../src/planned-model.js';
import {cashTimeline} from '../src/finance-events.js';
import {forecast} from '../src/finance-tools.js';
import {entryDefaults,repeatSuggestions,categoryShortlist} from '../src/entry-assist.js';

const today='2026-10-13';
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',currency:'RUB',balance:10000}]});
function planned(frequency='monthly'){
 return createPlanned(base(),{name:'ЖКХ',amount:'1000',type:'expense',frequency,startDate:'2026-10-01',accountId:'bank',cat:'housing'});
}
function paid(){let d=planned();return putTransaction(d,{...preparePlanned(d,d.recurring[0].id,'2026-10',today,false),amount:1000});}

test('Undoing a deleted payment cannot debit a recurring occurrence which was confirmed again',()=>{
 let d=paid();d=deleteTransaction(d,d.transactions[0].id);const deletion=d.history[0];
 d=putTransaction(d,{...preparePlanned(d,d.recurring[0].id,'2026-10',today,false),amount:1100});
 const before=structuredClone(d);
 assert.throws(()=>undoTransaction(d,deletion),/период уже подтверждён/);
 assert.deepEqual(d,before);assert.equal(d.transactions.length,1);assert.equal(d.accounts[0].balance,8900);
 assert.equal(plannedPaid(d,d.recurring[0],'2026-10'),true);
 d=deleteTransaction(d,d.transactions[0].id);d=undoTransaction(d,deletion);
 assert.equal(d.transactions.length,1);assert.equal(d.accounts[0].balance,9000);
});

test('Undoing an occurrence edit cannot duplicate another payment or restore a skipped period',()=>{
 let d=paid(),rule=d.recurring[0];d=putTransaction(d,{...d.transactions[0],recurringPeriod:'2026-11'});const edit=d.history[0];
 d=putTransaction(d,{...preparePlanned(d,rule.id,'2026-10',today,false),amount:1000});
 assert.throws(()=>undoTransaction(d,edit),/период уже подтверждён/);assert.equal(d.accounts[0].balance,8000);
 let skipped=paid();skipped=deleteTransaction(skipped,skipped.transactions[0].id);const deletion=skipped.history[0];
 skipped=skipPlanned(skipped,skipped.recurring[0].id,'2026-10');
 assert.throws(()=>undoTransaction(skipped,deletion),/пропущенный период/);assert.equal(skipped.accounts[0].balance,10000);
});

test('Backups reject duplicate recurring facts without changing recorded balances or source data',()=>{
 const d=paid(),before=structuredClone(d);d.transactions.push({...d.transactions[0],id:'duplicate'});
 assert.throws(()=>migrateData(d,EMPTY),/период уже подтверждён/);assert.equal(d.accounts[0].balance,9000);
 assert.equal(d.transactions.length,2);assert.equal(before.transactions.length,1);
});

test('Daily and weekly confirmations must refer to real occurrences, independently of the payment date',()=>{
 for(const [frequency,period] of [['daily','2026-02-31'],['daily','2026-09-30'],['weekly','2026-10-02']]){
  const d=planned(frequency),rule=d.recurring[0],before=structuredClone(d);
  assert.throws(()=>putTransaction(d,{type:'expense',cat:'housing',amount:1000,currency:'RUB',accountId:'bank',date:today,recurringId:rule.id,recurringPeriod:period}),/период плана/);
  assert.deepEqual(d,before);
 }
 let d=planned('weekly'),rule=d.recurring[0];
 d=putTransaction(d,{...preparePlanned(d,rule.id,'2026-10-08',today,false),amount:1000});
 assert.equal(d.transactions[0].date,today);assert.equal(d.transactions[0].recurringPeriod,'2026-10-08');
 assert.equal(d.accounts[0].balance,9000);
});

test('Historical payments remain restorable after their plan is deleted',()=>{
 let d=paid();d=deleteTransaction(d,d.transactions[0].id);const deletion=d.history[0];d.recurring=[];
 d=undoTransaction(d,deletion);assert.equal(d.transactions.length,1);assert.equal(d.accounts[0].balance,9000);
 assert.equal(migrateData(d,EMPTY).transactions[0].recurringId,d.transactions[0].recurringId);
});

test('Changing future schedule dates preserves historical occurrences, edits and backup compatibility',()=>{
 let d=planned('weekly'),rule=d.recurring[0];d=putTransaction(d,{...preparePlanned(d,rule.id,'2026-10-08',today,false),amount:1000});
 d=updatePlanned(d,rule.id,{...d.recurring[0],startDate:'2026-10-15'});
 assert.equal(migrateData(d,EMPTY).transactions[0].recurringPeriod,'2026-10-08');
 d=putTransaction(d,{...d.transactions[0],note:'Уточнение оплаты'});
 assert.equal(d.accounts[0].balance,9000);assert.equal(d.transactions[0].recurringPeriod,'2026-10-08');
 assert.throws(()=>putTransaction(d,{type:'expense',cat:'housing',amount:1000,currency:'RUB',accountId:'bank',date:today,recurringId:rule.id,recurringPeriod:'2026-10-01'}),/период плана/);
});

test('Undoing confirmation restores its changed future amount and variable setting with the exact account balance',()=>{
 let d=planned();d.recurring[0].variable=true;const original=structuredClone(d),rule=d.recurring[0];
 d=putTransaction(d,{...preparePlanned(d,rule.id,'2026-10',today,true),amount:1500,saveRecurringAmount:true});
 const event=d.history[0];assert.equal(d.recurring[0].amount,1500);assert.equal(d.recurring[0].variable,false);assert.equal(d.accounts[0].balance,8500);
 d=undoTransaction(d,event);assert.deepEqual(d.recurring[0],{...original.recurring[0],lastCreated:''});
 assert.equal(d.transactions.length,0);assert.deepEqual(d.accounts,original.accounts);
});

test('Undoing a transaction edit restores both the old actual amount and old future plan amount after a backup roundtrip',()=>{
 let d=paid();const original=structuredClone(d);
 d=putTransaction(d,{...d.transactions[0],amount:1400,saveRecurringAmount:true});
 assert.equal(d.accounts[0].balance,8600);assert.equal(d.recurring[0].amount,1400);
 d=migrateData(JSON.parse(JSON.stringify(d)),EMPTY);d=undoTransaction(d,d.history[0]);
 assert.equal(d.accounts[0].balance,9000);assert.equal(d.transactions[0].amount,1000);assert.deepEqual(d.recurring,original.recurring);
});

test('Undo rejects later plan changes or deletion atomically instead of overwriting current settings',()=>{
 for(const change of ['schedule','name','delete','confirmation']){
  let d=planned(),rule=d.recurring[0];d=putTransaction(d,{...preparePlanned(d,rule.id,'2026-10',today,true),amount:1300,saveRecurringAmount:true});const event=d.history[0];
  if(change==='delete')d={...d,recurring:[]};
  else if(change==='confirmation')d=putTransaction(d,{...preparePlanned(d,rule.id,'2026-11',today,false),amount:1300});
  else d=updatePlanned(d,rule.id,{...d.recurring[0],...(change==='schedule'?{startDate:'2026-10-05'}:{name:'Новое название'})});
  const before=structuredClone(d);assert.throws(()=>undoTransaction(d,event),/план изменялся или был удалён/);assert.deepEqual(d,before);
 }
});

test('Forecast allocates fractional-cent daily averages without losing or inventing the monthly total',()=>{
 for(const total of [0.01,0.10,1,10,100.01]){
  const d=putTransaction(base(),{type:'expense',cat:'food',amount:total,currency:'RUB',accountId:'bank',date:today});
  const projected=forecast(d,today,30),start=d.accounts[0].balance;
  assert.equal(projected.points.at(-1).balance,Math.round((start-total)*100)/100,String(total));
  assert.ok(projected.points.every(p=>Number.isFinite(p.balance)));
 }
 const flow=cashTimeline(base(),today,30,1/30);
 assert.equal(flow.points[0].balance,10000);assert.equal(flow.points[5].balance,9999.83);
 assert.equal(flow.points[30].balance,9999);assert.equal(flow.points[30].expectedBalance,9999);
});

test('Half-cent currency valuation rounds symmetrically and deletion restores the exact debit',()=>{
 for(const [value,result] of [[10.075,10.08],[-10.075,-10.08],[1.005,1.01],[-1.005,-1.01],[1e-7,0],[-1e-7,0],[1e12,1e12]])assert.equal(roundMoney(value),result,String(value));
 const d=base();d.rates.USD=201.5;
 let next=putTransaction(d,{type:'expense',cat:'food',amount:0.05,currency:'USD',accountId:'bank',date:today});
 assert.equal(next.transactions[0].amountRub,10.08);assert.equal(next.accounts[0].balance,9989.92);
 next=deleteTransaction(next,next.transactions[0].id);assert.equal(next.accounts[0].balance,10000);
});

test('Linked lunch supplements do not teach generic expense defaults or repeat suggestions',()=>{
 const d=base();d.accounts.push({id:'meal-card',name:'Обеды',currency:'RUB',balance:1000});
 const ordinary={id:'coffee',date:'2026-10-12',type:'expense',cat:'transport',amount:100,currency:'RUB',accountId:'bank',note:'Метро',paymentMethod:'sbp'};
 d.transactions=[ordinary,...Array.from({length:12},(_,i)=>({...ordinary,id:'topup-'+i,date:today,cat:'tech',accountId:'meal-card',paymentMethod:'card',lunchId:'meal',note:'Доплата за обед'}))];
 assert.equal(entryDefaults(d,'expense',today,CATEGORIES).accountId,'bank');
 assert.equal(entryDefaults(d,'expense',today,CATEGORIES).cat,'transport');
 assert.deepEqual(repeatSuggestions(d,today).map(t=>t.id),['coffee']);
 assert.equal(categoryShortlist(d,today,CATEGORIES,'transport')[0].id,'transport');
});

test('Transfer bank reference retains the selected receiving account through backup and stable retries',()=>{
 const d=base();d.accounts.push({id:'receiving',name:'Другой банк',currency:'RUB',balance:1000});
 const input={id:'bank-transfer',from:'bank',to:'receiving',amount:200,fee:5,date:today,externalId:'receiver-bank-001',externalAccountId:'receiving'};
 const next=transferMoney(d,input);assert.equal(next.transfers[0].externalAccountId,'receiving');
 assert.equal(next.accounts[0].balance,9795);assert.equal(next.accounts[1].balance,1200);
 assert.equal(next.transactions.length,1);assert.equal(next.transactions[0].externalId,undefined);
 const restored=migrateData(JSON.parse(JSON.stringify(next)),EMPTY);assert.equal(restored.transfers[0].externalAccountId,'receiving');
 assert.equal(transferMoney(restored,input),restored);assert.equal(restored.accounts[0].balance,9795);
 assert.throws(()=>transferMoney(restored,{...input,externalAccountId:'bank'}),/уже сохранён/);
 assert.throws(()=>transferMoney(restored,{...input,externalAccountId:undefined}),/уже сохранён/);
});

test('Absent transfer reference scope remains compatible; invalid or unrelated scopes reject without mutation',()=>{
 const d=base();d.accounts.push({id:'receiving',name:'Другой банк',currency:'RUB',balance:1000},{id:'unrelated',name:'Третий банк',currency:'RUB',balance:0});
 const input={id:'legacy-transfer',from:'bank',to:'receiving',amount:200,date:today,externalId:'source-bank-001'},next=transferMoney(d,input);
 assert.equal(Object.hasOwn(next.transfers[0],'externalAccountId'),false);
 assert.equal(transferMoney(next,{...input,externalAccountId:'bank'}),next);
 assert.equal(Object.hasOwn(migrateData(JSON.parse(JSON.stringify(next)),EMPTY).transfers[0],'externalAccountId'),false);
 for(const externalAccountId of [null,'','missing','unrelated']){
  const before=structuredClone(d);assert.throws(()=>transferMoney(d,{...input,externalAccountId}),/внешнего идентификатора/);assert.deepEqual(d,before);
  const invalid=structuredClone(next);invalid.transfers[0].externalAccountId=externalAccountId;
  assert.throws(()=>migrateData(invalid,EMPTY),/внешнего идентификатора/);
 }
});
