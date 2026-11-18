import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateExpensePercentages,expenseCategoryAmounts} from '../src/expense-allocations.js';
import {putTransaction,deleteTransaction,undoTransaction,migrateData} from '../src/ledger.js';
import {dashboard,EMPTY} from '../src/mini-model.js';
import {matchesInsight,spendingReport} from '../src/analytics-report.js';
import {activityNetRub,filterActivity} from '../src/activity-history.js';
import {repeatEntry} from '../src/entry-assist.js';
import {CATEGORIES} from '../src/categories.js';
import {botView} from '../server/bot-views.js';
import {applyBotAction} from '../server/bot-catalog.js';
import {compactTransaction} from '../server/bot-dialog.js';

const day='2026-10-10';
const fixture=()=>({...structuredClone(EMPTY),accounts:[{id:'card',name:'Карта',balance:1000,currency:'RUB'}]});
const purchase={
  id:'purchase',type:'expense',cat:'food',accountId:'card',date:day,amount:10.01,currency:'RUB',
  categoryAllocations:[{cat:'food',minor:501},{cat:'transport',minor:500}],
};

test('a multi-category expense debits one amount and each report only counts the assigned share',()=>{
  let data=putTransaction(fixture(),purchase);
  assert.equal(data.transactions.length,1);
  assert.equal(data.accounts[0].balance,989.99);
  const report=spendingReport(data,day);
  assert.equal(report.total,10.01);
  assert.equal(report.count,1);
  assert.deepEqual(report.categories.map(({id,value,count})=>[id,value,count]),[['food',5.01,1],['transport',5,1]]);
  assert.equal(dashboard(data,day).spent,10.01);
  assert.equal(dashboard(data,day).categories.find(category=>category.id==='transport').value,5);
  assert.equal(matchesInsight(data.transactions[0],{cat:'transport'}),true);
  const filtered=filterActivity(data.transactions,data,CATEGORIES,{search:'транспорт',chartFilter:{cat:'transport'}});
  assert.deepEqual(filtered.map(tx=>tx.id),[purchase.id]);
  assert.equal(activityNetRub(data,filtered,'transport'),-5);
  data=migrateData(JSON.parse(JSON.stringify(data)),EMPTY);
  assert.deepEqual(data.transactions[0].categoryAllocations,purchase.categoryAllocations);
  const removed=deleteTransaction(data,purchase.id);
  assert.equal(removed.accounts[0].balance,1000);
  const restored=undoTransaction(removed,removed.history[0]);
  assert.equal(restored.accounts[0].balance,989.99);
  assert.deepEqual(restored.transactions[0].categoryAllocations,purchase.categoryAllocations);
});

test('the bot shares the same split, history and repeat rules as the financial form',()=>{
  const args={type:'expense',newId:'bot-split'};
  const values={...purchase,id:undefined,categoryAllocations:undefined,categoryDistribution:'Еда;50%\nТранспорт;50%'};
  let data=applyBotAction(fixture(),'tx',args,values);
  assert.deepEqual(data.transactions[0].categoryAllocations,purchase.categoryAllocations);
  assert.equal(data.accounts[0].balance,989.99);
  assert.match(compactTransaction(data,{values,args}).join('\n'),/Транспорт · 5\s*₽/);
  const view=botView(data,'history',{cat:'transport'});
  assert.ok(view.actions.some(action=>action.args.id==='bot-split'&&/5\s*₽/.test(action.label)));
  const repeated=repeatEntry(data,data.transactions[0],day,CATEGORIES);
  data=putTransaction(data,repeated);
  assert.deepEqual(data.transactions[1].categoryAllocations,purchase.categoryAllocations);
  const original=data.transactions[0];
  const edited=applyBotAction(data,'tx',{id:original.id},{...original,categoryDistribution:'одна категория'});
  assert.equal(edited.transactions[0].categoryAllocations,undefined);
  assert.equal(edited.accounts[0].balance,979.98);
  assert.throws(()=>applyBotAction(fixture(),'tx',args,{...values,categoryDistribution:'Еда;5.01\nТранспорт;50%'}),/один формат/);
});

test('split weights and historical ruble amounts keep rounding exact and deterministic',()=>{
  const rows=[{cat:'food',basisPoints:3333},{cat:'transport',basisPoints:3333},{cat:'tech',basisPoints:3334}];
  assert.deepEqual(allocateExpensePercentages(10.01,rows),[{cat:'food',minor:334},{cat:'transport',minor:333},{cat:'tech',minor:334}]);
  assert.throws(()=>allocateExpensePercentages(0.02,rows),/не меньше/);
  const data=putTransaction(fixture(),{...purchase,currency:'USD'});
  const tx=migrateData({...data,rates:{...data.rates,USD:99}},EMPTY).transactions[0];
  const rubles=expenseCategoryAmounts(tx,tx.amountRub);
  assert.deepEqual(rubles,[{cat:'food',amount:460.92},{cat:'transport',amount:460}]);
  assert.equal(tx.amountRub,920.92);
});

test('invalid allocations are rejected in both financial commands and restore',()=>{
  for(const parts of [
    [{cat:'food',minor:501},{cat:'food',minor:500}],
    [{cat:'food',minor:500},{cat:'transport',minor:500}],
    [{cat:'food',minor:501},{cat:'lunch',minor:500}],
    [{cat:'food',minor:501},{cat:'transport',minor:500.1}],
  ]) {
    const invalid={...purchase,categoryAllocations:parts};
    assert.throws(()=>putTransaction(fixture(),invalid));
    assert.throws(()=>migrateData({...fixture(),transactions:[invalid]},EMPTY));
  }
  assert.throws(()=>putTransaction(fixture(),{...purchase,type:'income'}),/обычный расход/);
  assert.throws(()=>putTransaction(fixture(),{...purchase,amount:10.02}),/совпадать/);
});
