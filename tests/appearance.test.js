import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {putTransaction,migrateData} from '../src/ledger.js';
import {setAccountAppearance,iconAppearance} from '../src/appearance.js';
import {saveCustomCategory} from '../src/category-customization.js';
import {saveWish,completeWish} from '../src/wishes.js';
import {accountInput} from '../src/account-input.js';

const seed=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'s',name:'Резерв',balance:500,currency:'RUB',accType:'savings'}]});
test('Account appearance survives backup migration and changes no ledger amounts, records or account identity',()=>{
 const data=putTransaction(seed(),{id:'t',type:'expense',accountId:'a',cat:'food',amount:100,date:todayMoscow()}),original=structuredClone(data);
 let next=setAccountAppearance(data,'a',{icon:'card',emoji:''});
 assert.deepEqual(next.transactions,original.transactions);assert.deepEqual(next.history,original.history);
 assert.deepEqual(next.accounts.map(a=>({...a,icon:undefined,emoji:undefined})),original.accounts.map(a=>({...a,icon:undefined,emoji:undefined})));
 next=migrateData(JSON.parse(JSON.stringify(next)),EMPTY);assert.equal(next.accounts[0].icon,'card');assert.deepEqual(data,original);
 assert.throws(()=>setAccountAppearance(data,'missing',{icon:'card'}),/не найден/);
 assert.throws(()=>setAccountAppearance(data,'a',{icon:'<svg onload=alert(1)>'}),/коллекции/);
 assert.throws(()=>iconAppearance({icon:'https://example.com/icon.svg'}),/коллекции/);
 assert.throws(()=>iconAppearance({emoji:'обычный текст'}),/эмодзи/);
});
test('Switching a category from emoji to SVG preserves references, limits, historical money and undo metadata',()=>{
 let data=saveCustomCategory(seed(),{id:'custom',name:'Кофе',emoji:'☕',color:'#baa9d4'});
 data=putTransaction(data,{id:'coffee',cat:'custom',type:'expense',accountId:'a',amount:80,date:todayMoscow()});
 data.categoryBudgets={custom:1200};const original=structuredClone(data);
 const next=saveCustomCategory(data,{name:'Кофе',icon:'coffee',emoji:''},'custom');
 assert.equal(next.customCats[0].id,'custom');assert.equal(next.customCats[0].emoji,'');assert.equal(next.customCats[0].icon,'coffee');
 for(const key of ['accounts','transactions','categoryBudgets','history'])assert.deepEqual(next[key],original[key]);
 const restored=migrateData(JSON.parse(JSON.stringify(next)),EMPTY);assert.equal(restored.customCats[0].icon,'coffee');
 assert.equal(saveCustomCategory(next,{name:'Кофе',emoji:'☕'},'custom').customCats[0].emoji,'☕');
 assert.deepEqual(data,original);
});
test('Optional account and wish icons never create financial operations, and completion keeps the selected symbol',()=>{
 const account=accountInput({name:'Карта',kind:'regular',balance:'200',currency:'RUB',icon:'bank',emoji:''});assert.equal(account.balance,200);assert.equal(account.icon,'bank');
 const data=seed(),next=saveWish(data,{name:'Отпуск',accountId:'s',target:2000,icon:'plane',emoji:''});
 assert.deepEqual(next.accounts,data.accounts);assert.deepEqual(next.transactions,data.transactions);
 const done=completeWish(next,next.wishes[0].id,true);assert.equal(done.wishes[0].icon,'plane');assert.equal(done.wishes[0].done,true);
 assert.equal(migrateData(JSON.parse(JSON.stringify(done)),EMPTY).wishes[0].icon,'plane');
});
