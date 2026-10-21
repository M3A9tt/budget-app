import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';
import {previewImport,commitImport} from '../src/finance-tools.js';
import {parseImportJson,previewJsonImport,commitJsonImport} from '../src/json-import.js';
import {prepareImportAccounts,importAccountSources} from '../src/import-accounts.js';
import {migrateData} from '../src/ledger.js';

const base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Основной',currency:'RUB',balance:5000},{id:'b',name:'Копилка',currency:'RUB',balance:1000,accType:'savings'}]});
const date='2026-10-13',doc=operations=>({format:'burget-operations',version:1,operations});
const expense=(fields={})=>({date,type:'expense',amount:180,currency:'RUB',account:'a',category:'food',note:'Кофе',...fields});
const transfer=(fields={})=>({date,type:'transfer',amount:100,currency:'RUB',from:'a',to:'b',note:'Мои деньги',...fields});

test('JSON and CSV use the same similarity rule even when bank descriptions differ',()=>{
 const json=doc([expense()]),csv='date;amount;note;type\n'+date+';-180;Покупка COFFEE;expense';
 const fromJson=commitJsonImport(base(),json,{affectBalances:true});
 assert.equal(previewImport(fromJson,csv,'a')[0].duplicate,true);
 assert.deepEqual(commitImport(fromJson,previewImport(fromJson,csv,'a'),{affectBalances:true}),fromJson);
 const fromCsv=commitImport(base(),previewImport(base(),csv,'a'),{affectBalances:true});
 assert.equal(previewJsonImport(fromCsv,json)[0].duplicate,true);
 assert.equal(fromCsv.accounts[0].balance,4820);
});

test('CSV transfer bank IDs cannot be forced through changed amounts or repeated lines',()=>{
 const csv='date;amount;note;type;toAccount;externalId\n'+date+';-100;Откладываю;transfer;b;bank-1';
 const d=commitImport(base(),previewImport(base(),csv,'a'),{affectBalances:true});
 const changed=csv.replace(';-100;',';-200;'),rows=previewImport(d,changed,'a');
 assert.equal(rows[0].referenceDuplicate,true);rows[0].force=true;
 assert.deepEqual(commitImport(d,rows,{affectBalances:true}),d);
 const sameFile=previewImport(base(),csv+'\n'+date+';-200;Ещё;transfer;b;bank-1','a');
 assert.equal(sameFile[1].referenceDuplicate,true);sameFile[1].force=true;
 assert.equal(commitImport(base(),sameFile,{affectBalances:true}).transfers.length,1);
});

test('Strong bank IDs remain unique when an operation is reclassified between expense and transfer',()=>{
 const d=commitJsonImport(base(),doc([expense({externalId:'bank-1'})]),{affectBalances:true});
 const rows=previewJsonImport(d,doc([transfer({externalId:'bank-1'})]));
 assert.equal(rows[0].referenceDuplicate,true);
 assert.throws(()=>commitJsonImport(d,doc([transfer({externalId:'bank-1'})]),{forced:[0],affectBalances:true}),/Нет новых/);
 const moved=commitJsonImport(base(),doc([transfer({externalId:'bank-2'})]),{affectBalances:true});
 assert.equal(previewJsonImport(moved,doc([expense({externalId:'bank-2'})]))[0].referenceDuplicate,true);
});

test('Incoming CSV transfer keeps the receiver bank ID across backup and cross-format checks',()=>{
 const csv='date;amount;note;type;fromAccount;externalId\n'+date+';100;Входящий;transfer;a;incoming-1';
 let d=commitImport(base(),previewImport(base(),csv,'b'),{affectBalances:true});
 assert.equal(d.transfers[0].externalAccountId,'b');
 d=migrateData(JSON.parse(JSON.stringify(d)),EMPTY);
 const income=doc([expense({type:'income',account:'b',category:'income',amount:200,externalId:'incoming-1'})]);
 assert.equal(previewJsonImport(d,income)[0].referenceDuplicate,true);
 const received=commitJsonImport(base(),income,{affectBalances:true});
 assert.equal(previewImport(received,csv,'b')[0].referenceDuplicate,true);
 assert.equal(previewJsonImport(d,doc([expense({externalId:'incoming-1'})]))[0].referenceDuplicate,false);
});

test('CSV commit rechecks current state instead of trusting an earlier preview',()=>{
 const csv='date;amount;note;externalId\n'+date+';-180;Кофе;live-bank-1',d=base(),rows=previewImport(d,csv,'a');
 const newer=commitJsonImport(d,doc([expense({externalId:'live-bank-1'})]),{affectBalances:true});
 rows[0].force=true;
 assert.deepEqual(commitImport(newer,rows,{affectBalances:true}),newer);
 assert.equal(d.accounts[0].balance,5000);
});

test('Malformed JSON rows reach the row preview and can be excluded without losing valid rows',()=>{
 const d=base(),document=parseImportJson(JSON.stringify(doc([null,7,['invalid'],expense()])));
 assert.deepEqual(importAccountSources(document).map(s=>s.name),['a']);
 const prepared=prepareImportAccounts(d,document),rows=previewJsonImport(prepared.data,prepared.doc);
 assert.equal(rows.filter(r=>r.error).length,3);assert.equal(rows[3].error,undefined);
 assert.throws(()=>commitJsonImport(d,document),/Исправьте/);
 const next=commitJsonImport(d,document,{excluded:[0,1,2],affectBalances:true});
 assert.equal(next.transactions.length,1);assert.equal(next.accounts[0].balance,4820);
 assert.equal(d.transactions.length,0);
});

test('Bank reference namespaces cannot collide with a company lunch or another account',()=>{
 const d=base();d.accounts.push({id:'company-lunch',name:'Совпадающий ID',currency:'RUB',balance:0});
 const lunch={date,type:'lunch',amount:100,currency:'RUB',note:'Обед',externalId:'same-id'};
 const next=commitJsonImport(d,doc([expense({account:'company-lunch',externalId:'same-id'})]));
 assert.equal(previewJsonImport(next,doc([lunch]))[0].referenceDuplicate,false);
 assert.equal(previewJsonImport(next,doc([expense({account:'b',externalId:'same-id'})]))[0].referenceDuplicate,false);
});

test('A genuinely separate matching purchase can be confirmed in both import formats',()=>{
 let d=commitJsonImport(base(),doc([expense()]),{affectBalances:true});
 const csv='date;amount;note;type\n'+date+';-180;Ещё кофе;expense',rows=previewImport(d,csv,'a');rows[0].force=true;
 d=commitImport(d,rows,{affectBalances:true});
 assert.equal(d.transactions.length,2);assert.equal(d.accounts[0].balance,4640);
 d=commitJsonImport(d,doc([expense()]),{forced:[0],affectBalances:true});
 assert.equal(d.transactions.length,3);assert.equal(d.accounts[0].balance,4460);
});
