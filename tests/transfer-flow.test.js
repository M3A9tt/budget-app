import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,CATEGORIES,dashboard} from '../src/mini-model.js';
import {parseOwnTransfer} from '../src/quick-entry.js';
import {transferMoney,migrateData} from '../src/ledger.js';
import {spendingReport} from '../src/analytics-report.js';
const today='2026-10-01',base=()=>({...structuredClone(EMPTY),accounts:[{id:'card',name:'Альфа',balance:1000,currency:'RUB'},{id:'save',name:'Учёба',balance:0,currency:'RUB',accType:'savings'}]});
test('One-line own transfer moves money once; only fee enters expenses, and retry cannot debit twice',()=>{
 const before=base(),parsed=parseOwnTransfer('Перевод 250 Альфа → Учёба',before.accounts,today),input={...parsed,id:'stable-transfer',fee:'5'};
 const after=migrateData(transferMoney(before,input),EMPTY);assert.equal(before.accounts[0].balance,1000);assert.equal(after.accounts[0].balance,745);assert.equal(after.accounts[1].balance,250);assert.equal(after.transfers.length,1);assert.equal(after.transactions.length,1);assert.equal(spendingReport(after,today).total,5);assert.equal(dashboard(after,today).free,745);
 assert.deepEqual(transferMoney(after,input),after);assert.throws(()=>transferMoney(after,{...input,amount:260}),/уже сохранён/);assert.throws(()=>transferMoney(before,{...input,to:'card'}),/разные/);
});
