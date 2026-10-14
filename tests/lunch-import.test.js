import test from 'node:test';import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';
import {parseImportJson,previewJsonImport,commitJsonImport} from '../src/json-import.js';
import {lunchBudget} from '../src/lunch-budget.js';
const data=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',currency:'RUB',balance:5000}]});
const doc=operations=>({format:'burget-operations',version:1,operations});
const lunch=(fields={})=>({date:'2026-10-13',type:'lunch',amount:379,currency:'RUB',note:'Суп и горячее',...fields});
test('Lunch JSON needs no account or category and changes only the lunch budget',()=>{
 const d=data(),source=doc([lunch()]),parsed=parseImportJson(JSON.stringify(source)),preview=previewJsonImport(d,parsed);assert.equal(preview[0].error,undefined);assert.equal(d.transactions.length,0);
 for(const affectBalances of [false,true]){const next=commitJsonImport(d,parsed,{affectBalances});assert.equal(next.transactions[0].type,'lunch');assert.equal(next.transactions[0].cat,'lunch');assert.equal(next.accounts[0].balance,5000);assert.equal(lunchBudget(next,'2026-10','2026-10-14').spent,379);}
});
test('Lunch duplicates are skipped within file and rechecked against newly recorded meals',()=>{
 const d=data(),source=doc([lunch(),lunch(),lunch({amount:200,externalId:'meal-1'}),lunch({amount:300,externalId:'meal-1'})]);
 const rows=previewJsonImport(d,source);assert.equal(rows[1].duplicate,true);assert.equal(rows[3].referenceDuplicate,true);
 const next=commitJsonImport(d,source);assert.equal(next.transactions.length,2);assert.equal(next.accounts[0].balance,5000);assert.throws(()=>commitJsonImport(next,source),/Нет новых/);
 const later=commitJsonImport(data(),doc([lunch()]));assert.throws(()=>commitJsonImport(later,doc([lunch()])),/Нет новых/);
});
test('Lunch import rejects ambiguous fields, unsupported currencies, future meals and invalid batches atomically',()=>{
 const d=data();for(const change of [{account:'bank'},{category:'food'},{paymentMethod:'card'},{fee:1},{currency:'USD'},{amount:null},{unknown:1}])assert.ok(previewJsonImport(d,doc([lunch(change)]))[0].error);
 assert.throws(()=>commitJsonImport(d,doc([lunch({date:'2099-01-01'})])),/Будущие/);
 assert.throws(()=>commitJsonImport(d,doc([lunch(),lunch({amount:0})])),/Исправьте/);assert.equal(d.transactions.length,0);assert.equal(d.accounts[0].balance,5000);
});
test('Bank expense with matching external ID does not shadow company lunch ID',()=>{
 const d=data();d.transactions=[{id:'old',type:'expense',cat:'food',accountId:'bank',date:'2026-10-13',amount:379,currency:'RUB',externalId:'meal-1'}];assert.equal(previewJsonImport(d,doc([lunch({externalId:'meal-1'})]))[0].duplicate,false);
});
test('Existing burget-lunches-v1 format converts items without importing employee identity or changing allowance',()=>{
 const original={format:'burget-lunches-v1',employee:{name:'Тестовый сотрудник',id:'demo'},currency:'RUB',daily_allowance:500,lunches:[{date:'2026-10-01',amount:100,items:[{name:'Суп',quantity:2}]},{date:'2026-10-02',amount:200,items:[{name:'Горячее',quantity:1}]}]};
 const parsed=parseImportJson(JSON.stringify(original));assert.equal(parsed.format,'burget-operations');assert.equal(parsed.operations[0].note,'Суп × 2');assert.equal(parsed.operations[0].amount,100);
 assert.equal(parsed.employee,undefined);assert.equal(parsed.daily_allowance,undefined);
 const next=commitJsonImport(data(),parsed);assert.equal(next.settings.lunchDaily,400);assert.equal(next.accounts[0].balance,5000);assert.equal(lunchBudget(next,'2026-10','2026-10-02').spent,300);
 assert.throws(()=>commitJsonImport(next,parsed),/Нет новых/);
 assert.equal(original.lunches[0].amount,100);
});
test('Single Markdown JSON fence is accepted while unrelated formats and prose remain errors',()=>{
 assert.equal(parseImportJson('```json\n'+JSON.stringify(doc([lunch()]))+'\n```').operations[0].type,'lunch');
 assert.throws(()=>parseImportJson('Вот JSON: '+JSON.stringify(doc([lunch()]))),/только JSON/);
 assert.throws(()=>parseImportJson(JSON.stringify({format:'other',lunches:[]})));
 assert.throws(()=>parseImportJson(JSON.stringify({format:'burget-lunches-v1',currency:'RUB',lunches:[{date:'2026-10-01',amount:100,items:[{name:'Суп',quantity:0}]}]})),/количества/);
});
