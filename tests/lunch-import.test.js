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
