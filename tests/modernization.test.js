import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {putTransaction,migrateData} from '../src/ledger.js';
import {createPlanned,preparePlanned,skipPlanned} from '../src/planned-operations.js';
import {analytics} from '../src/analytics.js';
import {spendingReport} from '../src/analytics-report.js';
import {periodSummaryData} from '../server/period-summary.js';
const today='2026-10-13';
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',balance:10000,currency:'RUB'}]});
const planned=()=>createPlanned(base(),{name:'ЖКХ',amount:'100',accountId:'bank',type:'expense',frequency:'weekly',startDate:'2026-10-01',cat:'housing'});
test('Editing a confirmed payment cannot silently detach or reassign its plan, even after plan deletion',()=>{
 let d=planned();d=putTransaction(d,{...preparePlanned(d,d.recurring[0].id,'2026-10-08',today,false),amount:100});
 for(const deleted of [false,true])for(const recurringId of [undefined,'another']){
  const data={...d,recurring:deleted?[]:d.recurring},before=structuredClone(data);
  assert.throws(()=>putTransaction(data,{...data.transactions[0],recurringId}),/Связь.*план/);
  assert.deepEqual(data,before);
 }
});
test('Skipping rejects impossible, unanchored or inactive periods without modifying the budget',()=>{
 for(const period of ['2026-02-31','2026-09-24','2026-10-02','2026-13-01','once',null]){
  const d=planned(),before=structuredClone(d);assert.throws(()=>skipPlanned(d,d.recurring[0].id,period));assert.deepEqual(d,before);
 }
 const d=planned();d.recurring[0].active=false;assert.throws(()=>skipPlanned(d,d.recurring[0].id,'2026-10-08'));
});
test('Currency fallback uses the same per-operation cent valuation in overview, chart and Telegram summary',()=>{
 const d=base();d.rates.USD=201.5;
 d.transactions=Array.from({length:3},(_,i)=>({id:'old-'+i,type:'expense',cat:'food',amount:0.05,currency:'USD',date:today,tags:[]}));
 const a=analytics(d,today),r=spendingReport(d,today,'7'),s=periodSummaryData(d,today,today,'День'),home=dashboard(d,today);
 for(const total of [a.total,a.cats[0].value,a.daily.at(-1).value,r.total,r.categories[0].value,s.expense,s.categories[0].value,home.spent,home.categories[0].value,home.daily.at(-1).amount])assert.equal(total,30.24);
 assert.equal(r.flex,30.24);assert.equal(r.delta,30.24);assert.equal(d.transactions[0].amountRub,undefined);
});
test('Malformed backup labels and nested rows are rejected before they can crash a screen or destroy recovery',()=>{
 for(const change of [d=>{d.accounts[0].name={bad:true};},d=>{d.accounts[0].id={bad:true};},d=>{d.history=[null];},d=>{d.installments=[{id:'p',total:10,currency:'RUB',payments:[null]}];},d=>{d.transactions=[{id:'t',type:'expense',cat:'food',date:today,amount:10,tags:[{}]}];}]){
  const d=base();change(d);const before=structuredClone(d);assert.throws(()=>migrateData(d,EMPTY));assert.deepEqual(d,before);
 }
});

test('Restoring a skipped occurrence is idempotent, preserves balances, and can be confirmed once after backup recovery',async()=>{
 const {restorePlanned}=await import('../src/planned-operations.js');
 const {plannedOccurrences}=await import('../src/planned-model.js');
 let d=planned(),r=d.recurring[0];d=skipPlanned(d,r.id,'2026-10-08');assert.equal(skipPlanned(d,r.id,'2026-10-08'),d);
 assert.ok(!plannedOccurrences(d,today,today).some(x=>x.period==='2026-10-08'));
 d=migrateData(JSON.parse(JSON.stringify(d)),EMPTY);d=restorePlanned(d,r.id,'2026-10-08');
 assert.equal(d.accounts[0].balance,10000);assert.equal(d.transactions.length,0);assert.equal(restorePlanned(d,r.id,'2026-10-08'),d);
 assert.ok(plannedOccurrences(d,today,today).some(x=>x.period==='2026-10-08'));
 d=putTransaction(d,{...preparePlanned(d,r.id,'2026-10-08',today,false),amount:100});
 assert.equal(d.accounts[0].balance,9900);assert.throws(()=>restorePlanned(d,r.id,'2026-10-08'));
});

test('Indexed schedules retain legacy paid markers, date anchors and skipped periods across a long daily history',async()=>{
 const {plannedOccurrences}=await import('../src/planned-model.js');
 const d=base();d.recurring=[{id:'daily',name:'Ежедневный',active:true,frequency:'daily',startDate:'2026-01-01',type:'expense',amount:1,skippedPeriods:['2026-10-10']},{id:'legacy',name:'Старый',active:true,dueDay:1,amount:2,lastCreated:'2026-10'}];
 d.transactions=Array.from({length:20000},(_,i)=>({id:'noise-'+i,type:i%2?'expense':'income',date:'2026-10-01',amount:1}));
 d.transactions.push({id:'paid',type:'expense',recurringId:'daily',recurringPeriod:'2026-10-11',date:today,amount:1});
 const rows=plannedOccurrences(d,today,today);
 assert.ok(!rows.some(r=>r.rule.id==='legacy'));assert.ok(!rows.some(r=>['2026-10-10','2026-10-11'].includes(r.period)));
 assert.ok(rows.some(r=>r.period==='2026-10-12'));assert.ok(rows.some(r=>r.period===today));
});
