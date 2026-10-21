import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoney,putTransaction,deleteTransaction,undoTransaction,transferMoney,migrateData,historicalRub} from '../src/ledger.js';
import {parseEntry} from '../src/quick-entry.js';
const defaults={transactions:[],accounts:[],debts:[],goals:[],customCats:[],transfers:[],recurring:[],history:[],lunchDayOff:[],settings:{lunchDaily:400},rates:{RUB:1,USD:92}};
const fixture=()=>({...structuredClone(defaults),accounts:[{id:'rub',name:'Сбер',balance:10000,currency:'RUB'},{id:'usd',name:'Доллар',balance:100,currency:'USD'}]});
const tx=(extra={})=>({type:'expense',cat:'food',amount:10,currency:'USD',date:'2026-10-12',accountId:'rub',...extra});
test('Lunch never changes personal account',()=>{const d=putTransaction(fixture(),tx({type:'lunch',cat:'lunch',currency:'RUB',amount:379.5}));assert.equal(d.accounts[0].balance,10000);assert.equal(d.transactions[0].accountId,undefined);});
test('Stale edit and stale undo are rejected',()=>{let d=putTransaction(fixture(),tx());const old=d.transactions[0];d=putTransaction(d,{...old,amount:20});assert.throws(()=>putTransaction(d,{...old,amount:30}),/изменена/);const event=d.history[0];d=putTransaction(d,{...d.transactions[0],amount:30});assert.throws(()=>undoTransaction(d,event),/изменялась/);});
test('Transfer and commission charged once in same currency',()=>{const d=fixture();d.accounts[1]={id:'other',name:'Т-Банк',balance:500,currency:'RUB'};const next=transferMoney(d,{from:'rub',to:'other',amount:1000,fee:10,date:'2026-10-12'});assert.equal(next.accounts[0].balance,8990);assert.equal(next.accounts[1].balance,1500);assert.equal(next.transactions.length,1);assert.equal(deleteTransaction(next,next.transactions[0].id).accounts[0].balance,9000);});
test('Cross currency transfer is explicitly blocked',()=>assert.throws(()=>transferMoney(fixture(),{from:'rub',to:'usd',amount:100,fee:0,date:'2026-10-12'}),/временно отключены/));
test('Legacy migration preserves balances and flags ambiguous FX',()=>{const input=fixture();input.transactions=[{...tx(),id:'old'}];const d=migrateData(input,defaults);assert.equal(d.accounts[0].balance,10000);assert.deepEqual(d.migrationWarnings,['old']);assert.throws(()=>deleteTransaction(d,'old'),/сверка/);assert.equal(input.schemaVersion,undefined);});
test('Malformed imports and repeated IDs are rejected',()=>{assert.throws(()=>migrateData({transactions:null},defaults));assert.throws(()=>migrateData({transactions:[{id:'x',amount:'x'}]},defaults));const d=fixture();d.accounts.push(d.accounts[0]);assert.throws(()=>migrateData(d,defaults),/Повторяющиеся/);assert.throws(()=>migrateData({schemaVersion:99},defaults));});
test('Ambiguous accounts need clarification',()=>{assert.throws(()=>parseEntry('кофе 180',fixture().accounts,[],'2026-10-12'),/название счёта/);assert.throws(()=>parseEntry('кофе 180 Сбер Доллар',fixture().accounts,[],'2026-10-12'),/несколько/);});
test('Currency ledger lifecycle: debit, editing and reversals preserve actual money',()=>{const failures=[];for(const [name,run] of [['USD purchase from RUB account and deletion restore exact balance',()=>{const added=putTransaction(fixture(),tx());assert.equal(added.accounts[0].balance,9080);assert.equal(deleteTransaction(added,added.transactions[0].id).accounts[0].balance,10000);}],
['RUB purchase from USD account uses account currency',()=>{const added=putTransaction(fixture(),tx({currency:'RUB',amount:920,accountId:'usd'}));assert.equal(added.accounts[1].balance,90);}],
['Changing current rates never changes reverse operation',()=>{let d=putTransaction(fixture(),tx());d={...d,rates:{RUB:1,USD:120}};assert.equal(deleteTransaction(d,d.transactions[0].id).accounts[0].balance,10000);assert.equal(historicalRub(d.transactions[0],()=>1200),920);const memo=putTransaction(d,{...d.transactions[0],note:'Changed'});assert.equal(memo.accounts[0].balance,9080);assert.equal(memo.transactions[0].amountRub,920);}],
['Editing amount records a new debit, not the old amountRub',()=>{let d=putTransaction(fixture(),tx());d=putTransaction(d,{...d.transactions[0],amount:20});assert.equal(d.accounts[0].balance,8160);assert.equal(d.transactions[0].amountRub,1840);}],
['Changing account reverses old account then applies new account',()=>{let d=putTransaction(fixture(),tx());d=putTransaction(d,{...d.transactions[0],accountId:'usd'});assert.equal(d.accounts[0].balance,10000);assert.equal(d.accounts[1].balance,90);}],
['Income add/edit/delete symmetry',()=>{let d=putTransaction(fixture(),tx({type:'income'}));assert.equal(d.accounts[0].balance,10920);d=putTransaction(d,{...d.transactions[0],amount:20});assert.equal(d.accounts[0].balance,11840);assert.equal(deleteTransaction(d,d.transactions[0].id).accounts[0].balance,10000);}],
['Undo create/delete/edit restores original balances',()=>{let d=putTransaction(fixture(),tx());assert.equal(undoTransaction(d,d.history[0]).accounts[0].balance,10000);d=deleteTransaction(d,d.transactions[0].id);d=undoTransaction(d,d.history[0]);assert.equal(d.accounts[0].balance,9080);d=putTransaction(d,{...d.transactions[0],amount:20});assert.equal(undoTransaction(d,d.history[0]).accounts[0].balance,9080);}]]){try{run();}catch(error){error.message=name+': '+error.message;failures.push(error);}}if(failures.length)throw new AggregateError(failures,'Currency ledger scenarios failed');});
test('Money and dates reject invalid input without mutating the source',()=>{for(const run of [()=>{assert.equal(parseMoney('1 379,50'),1379.5);for(const n of ['12junk','NaN','Infinity','1.234',''])assert.ok(Number.isNaN(parseMoney(n)));},()=>{const d=fixture();for(const amount of [-1,0,Infinity,'a',1.234])assert.throws(()=>putTransaction(d,tx({amount})));assert.throws(()=>putTransaction(d,tx({date:'2026-02-31'})));assert.equal(d.accounts[0].balance,10000);}])run();});

test('Reassigning an unchanged foreign purchase preserves its historical valuation and native-currency debit',()=>{
 let d=putTransaction(fixture(),tx());d.rates.USD=120;
 d=putTransaction(d,{...d.transactions[0],accountId:'usd'});
 assert.equal(d.transactions[0].amountRub,920);assert.equal(d.transactions[0].accountAmount,10);
 assert.equal(d.accounts[0].balance,10000);assert.equal(d.accounts[1].balance,90);
 const back=deleteTransaction(d,d.transactions[0].id);assert.equal(back.accounts[1].balance,100);
});
test('A same-currency debit is not rounded through the reporting currency',()=>{
 const d=fixture();d.rates.USD=.3;
 const next=putTransaction(d,tx({amount:.01,accountId:'usd'}));
 assert.equal(next.accounts[1].balance,99.99);assert.equal(next.transactions[0].accountAmount,.01);
 assert.equal(deleteTransaction(next,next.transactions[0].id).accounts[1].balance,100);
});
test('A consumed deletion undo cannot resurrect an older version after later edits and deletion',()=>{
 let d=putTransaction(fixture(),tx({currency:'RUB',amount:100}));const id=d.transactions[0].id;
 d=deleteTransaction(d,id);const oldDelete=d.history[0];d=undoTransaction(d,oldDelete);
 d=putTransaction(d,{...d.transactions[0],amount:200});d=deleteTransaction(d,id);
 assert.throws(()=>undoTransaction(d,oldDelete));assert.equal(d.accounts[0].balance,10000);
 const restored=undoTransaction(d,d.history[0]);assert.equal(restored.transactions[0].amount,200);assert.equal(restored.accounts[0].balance,9800);
});
test('Undo reads its authoritative journal entry rather than a changed client copy',()=>{
 let d=putTransaction(fixture(),tx({currency:'RUB',amount:100}));d=deleteTransaction(d,d.transactions[0].id);
 const deletion=d.history[0],forged={...deletion,before:{...deletion.before,amount:900,accountAmount:900}};
 const restored=undoTransaction(d,forged);assert.equal(restored.transactions[0].amount,100);assert.equal(restored.accounts[0].balance,9900);
});
