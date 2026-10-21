import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {putTransaction,deleteTransaction,undoTransaction,migrateData} from '../src/ledger.js';
import {lunchBudget} from '../src/lunch-budget.js';
import {lunchDeletionRecords,lunchDayRecords,orphanedLunchTopups} from '../src/lunch-records.js';
const date='2026-10-01';
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',balance:1000,currency:'RUB'},{id:'usd',name:'Валюта',balance:10,currency:'USD'}]});
const meal=(d,id='meal')=>putTransaction(d,{id,type:'lunch',cat:'lunch',date,amount:350,note:'Суп, салат'});
const topup=(d,values={})=>putTransaction(d,{id:'topup',type:'expense',cat:'food',date,amount:50,accountId:'bank',tags:['обед-за-свои'],note:'Доплата за обед',lunchId:'meal',...values});
test('Delete lunch cascades exact linked top-ups, restores accounts and budget; undo restores all once',()=>{
 let d=topup(meal(base()));d=topup(d,{id:'fx',accountId:'usd',amount:1,currency:'USD'});
 const before=structuredClone(d);assert.equal(lunchBudget(d,'2026-10',date).own,142);assert.equal(d.accounts[1].balance,9);
 d=deleteTransaction(d,'meal');const event=d.history[0];assert.equal(d.transactions.length,0);assert.deepEqual(d.accounts,base().accounts);assert.equal(lunchBudget(d,'2026-10',date).own,0);assert.equal(lunchBudget(d,'2026-10',date).spent,0);assert.equal(dashboard(d,date).spent,0);
 d=undoTransaction(d,event);assert.deepEqual(d.accounts,before.accounts);assert.deepEqual(d.transactions,before.transactions);assert.throws(()=>undoTransaction(d,event),/отменено/);
});
test('Deleting only a top-up keeps company meal and other personal expenses',()=>{
 let d=topup(meal(base()));d=putTransaction(d,{type:'expense',cat:'food',date,amount:100,note:'Обед за свои',accountId:'bank',tags:['обед-за-свои']});
 d=deleteTransaction(d,'topup');assert.equal(d.transactions.length,2);assert.equal(lunchBudget(d,'2026-10',date).spent,350);assert.equal(lunchBudget(d,'2026-10',date).own,100);assert.equal(d.accounts[0].balance,900);
});
test('Legacy uniquely named top-up follows a single deleted lunch; full personal meals never cascade',()=>{
 let d=topup(meal(base()),{lunchId:undefined});d=putTransaction(d,{type:'expense',cat:'food',date,amount:100,note:'Обед за свои',accountId:'bank',tags:['обед-за-свои']});
 assert.equal(lunchDeletionRecords(d,'meal').length,2);d=deleteTransaction(d,'meal');assert.equal(d.transactions.length,1);assert.equal(d.accounts[0].balance,900);
});
test('Several meals on one day retain unrelated and ambiguous legacy top-ups',()=>{
 let d=meal(meal(base()),'second');d=topup(d);d=topup(d,{id:'legacy',lunchId:undefined,amount:20});d=topup(d,{id:'other',lunchId:'second',amount:30});
 d=deleteTransaction(d,'meal');assert.deepEqual(d.transactions.map(t=>t.id),['second','legacy','other']);assert.equal(d.accounts[0].balance,950);assert.equal(lunchDayRecords(d,date).length,3);
});
test('Explicit top-up links survive backups, reject orphan/date/type tampering and remain tied during parent date edits',()=>{
 let d=topup(meal(base()));assert.deepEqual(migrateData(JSON.parse(JSON.stringify(d)),EMPTY).transactions,JSON.parse(JSON.stringify(d.transactions)));
 for(const fields of [{lunchId:'missing'},{date:'2026-10-02'},{type:'income'},{cat:'lunch'}])assert.throws(()=>topup(d,{...d.transactions[1],...fields}));
 const before=structuredClone(d),parent=d.transactions[0];d=putTransaction(d,{...parent,date:'2026-10-02'});assert.equal(d.transactions[1].date,'2026-10-02');assert.deepEqual(d.accounts,before.accounts);
 d=undoTransaction(d,d.history[0]);assert.deepEqual([...d.transactions].sort((a,b)=>a.id.localeCompare(b.id)),[...before.transactions].sort((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(d.accounts,before.accounts);
 const bad=structuredClone(before);bad.transactions=bad.transactions.filter(t=>t.id!=='meal');assert.throws(()=>migrateData(bad,EMPTY),/Доплата/);
});
test('Undo cannot orphan a later top-up or overwrite a changed linked top-up',()=>{
 let d=meal(base());const creation=d.history[0];d=topup(d);assert.throws(()=>undoTransaction(d,creation),/Доплата/);
 d=putTransaction(d,{...d.transactions[0],date:'2026-10-02'});const edit=d.history[0];d=putTransaction(d,{...d.transactions[1],amount:70});assert.throws(()=>undoTransaction(d,edit),/изменилась/);
});
test('Existing leftovers are suggested only with evidence of a deleted lunch and restored by explicit deletion',()=>{
 let d=meal(base());d=deleteTransaction(d,'meal');d=topup(d,{lunchId:undefined});assert.deepEqual(orphanedLunchTopups(d).map(t=>t.id),['topup']);assert.equal(d.accounts[0].balance,950);
 d=deleteTransaction(d,'topup');assert.equal(orphanedLunchTopups(d).length,0);assert.equal(d.accounts[0].balance,1000);
 const standalone=topup(base(),{lunchId:undefined});assert.equal(orphanedLunchTopups(standalone).length,0);
});
test('Personal lunch confirms the day without spending company money or leaving a question mark',()=>{
 const d=topup(base(),{lunchId:undefined,note:'Обед за свои'}),day=lunchBudget(d,'2026-10',date).days[0];assert.equal(day.confirmed,true);assert.equal(day.company,0);assert.equal(day.own,50);assert.equal(day.cumulative,400);
});
