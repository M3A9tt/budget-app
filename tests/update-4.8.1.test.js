import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {rate,transactionRub,transferMoney} from '../src/ledger.js';
import {accountTotals} from '../src/account-balances.js';
import {cashTimeline} from '../src/finance-events.js';
import {updateTransfer,reverseTransfer} from '../src/transfer-actions.js';
import {calendarMonth} from '../src/calendar-model.js';
import {activityNetRub} from '../src/activity-history.js';
import {importDiagnostic,correctedImport,previewJsonImport,commitJsonImport} from '../src/json-import.js';
const date=todayMoscow();
function fixture(){return {...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'b',name:'Наличные',balance:0,currency:'RUB'}]};}
test('Calendar transfer opens the same ledger identity and counts only its fee; edit/delete use existing identities',()=>{
 const d=transferMoney(fixture(),{id:'move',from:'a',to:'b',amount:100,fee:5,date});
 const original=JSON.stringify(d),day=calendarMonth(d,date).days.find(x=>x.date===date);
 assert.equal(day.transactions.filter(t=>t.type==='transfer').length,1);
 assert.equal(day.transactions.find(t=>t.type==='transfer').id,'move');
 assert.equal(activityNetRub(d,day.transactions),-5);
 assert.equal(accountTotals(d).spendable,995);
 const changed=updateTransfer(d,{id:'move',amount:200,fee:10});assert.equal(accountTotals(changed).spendable,990);assert.equal(calendarMonth(changed,date).days.find(x=>x.date===date).transactions.find(t=>t.type==='transfer').amount,200);const undone=reverseTransfer(changed,'move');assert.equal(accountTotals(undone).spendable,1000);assert.equal(calendarMonth(undone,date).days.find(x=>x.date===date).transactions.length,0);
 assert.equal(JSON.stringify(d),original);
});
test('Unknown rates never become parity in balances, historical fallback or forecast; recorded history remains fixed',()=>{
 const d=fixture();d.rates={RUB:1};d.accounts[0].currency='USD';
 const missing=e=>e.code==='MISSING_EXCHANGE_RATE';
 assert.throws(()=>accountTotals(d),missing);
 assert.throws(()=>transactionRub(d,{amount:10,currency:'USD'}),missing);
 assert.equal(transactionRub(d,{amount:10,currency:'USD',amountRub:900}),900);
 d.accounts[0].currency='RUB';d.recurring=[{id:'rent',name:'Rent',amount:10,currency:'USD',frequency:'once',startDate:date,active:true,type:'expense',accountId:'a'}];
 assert.throws(()=>cashTimeline(d,date,1),missing);
 assert.equal(rate(d,'RUB'),1);
 d.rates.USD=90;assert.equal(transactionRub(d,{amount:10,currency:'USD'}),900);
});
test('Import report retains row reasons, corrected file roundtrips exclusions and reimport keeps balances and deduplicates',()=>{
 const d=fixture(),doc={format:'burget-operations',version:1,operations:[null,{date,type:'expense',amount:180,currency:'RUB',account:'a',category:'food',note:'Кофе'}]};
 const original=JSON.stringify(d),rows=previewJsonImport(d,doc),report=importDiagnostic(doc,rows);
 assert.equal(report.rows[0].row,1);assert.equal(report.rows[0].status,'error');assert.ok(report.rows[0].reason);
 const selected=previewJsonImport(d,doc,{excluded:[0]}),fixed=correctedImport(doc,selected);
 assert.equal(fixed.operations.length,1);
 const next=commitJsonImport(d,JSON.parse(JSON.stringify(fixed)));
 assert.deepEqual(next.accounts,d.accounts);assert.equal(next.transactions.length,1);
 assert.equal(previewJsonImport(next,fixed)[0].duplicate,true);
 assert.equal(JSON.stringify(d),original);
});
