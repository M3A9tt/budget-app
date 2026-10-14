import test from 'node:test';import assert from 'node:assert/strict';
import {reminderSettingsFromDraft} from '../src/reminder-settings.js';
import {openTimePicker} from '../src/time-settings.js';
import {putTransaction,deleteTransaction,transferMoney,roundMoney} from '../src/ledger.js';
import {EMPTY} from '../src/mini-model.js';
test('Reminder numeric draft can be empty while editing but cannot silently save zero',()=>{
 const draft={checkEscalationDays:'',expenseCheckEnabled:true};assert.throws(()=>reminderSettingsFromDraft(draft),/от 1 до 7/);assert.equal(draft.checkEscalationDays,'');
 for(let n=1;n<=7;n++){const input={...draft,checkEscalationDays:String(n)};assert.equal(reminderSettingsFromDraft(input).checkEscalationDays,n);assert.equal(typeof input.checkEscalationDays,'string');}
 for(const input of ['0','8','1.5','-1','abc',' '])assert.throws(()=>reminderSettingsFromDraft({...draft,checkEscalationDays:input}));
 assert.equal(reminderSettingsFromDraft({}).checkEscalationDays,undefined);
});
test('Native picker is invoked on the input with graceful unsupported or rejected fallback',()=>{
 let called=0;const input={showPicker(){assert.equal(this,input);called++;}};assert.equal(openTimePicker(input),true);assert.equal(called,1);assert.equal(openTimePicker({}),false);assert.equal(openTimePicker({showPicker(){throw Error('NotAllowedError');}}),false);
});
test('500 deterministic financial operations conserve balances and deleting entries restores cents',()=>{
 let d={...structuredClone(EMPTY),accounts:[{id:'a',name:'A',currency:'RUB',balance:100000},{id:'b',name:'B',currency:'RUB',balance:50000}]},expected=150000;
 for(let i=1;i<=500;i++){const amount=((i*7919)%99999+1)/100;if(i%3===0){const fee=(i%13)/100;d=transferMoney(d,{from:i%2?'a':'b',to:i%2?'b':'a',amount,fee,date:'2026-10-13'});expected=roundMoney(expected-fee);}else{const type=i%2?'expense':'income';const before=d.accounts.map(a=>a.balance);d=putTransaction(d,{type,cat:type==='income'?'income':'food',accountId:i%2?'a':'b',amount,currency:'RUB',date:'2026-10-13'});if(i%5===0){d=deleteTransaction(d,d.transactions.at(-1).id);assert.deepEqual(d.accounts.map(a=>a.balance),before);}else expected=roundMoney(expected+(type==='income'?amount:-amount));}assert.equal(roundMoney(d.accounts.reduce((sum,a)=>sum+a.balance,0)),expected);}
});
