import test from 'node:test';
import assert from 'node:assert/strict';
import {accountMentions,classifyFinancialIntent,classifyIncomingMessage} from '../src/input-intent.js';
import {parseEntry} from '../src/quick-entry.js';
import {lunchOrders} from '../src/lunch-recognition.js';
import {CATEGORIES,EMPTY,dashboard} from '../src/mini-model.js';
import {putTransaction} from '../src/ledger.js';

const accounts=[{id:'alpha',name:'Альфа',currency:'RUB',balance:5000},{id:'sber',name:'Сбер',currency:'RUB',balance:2000}];
const date='2026-10-17';

test('A single account matcher is used by the classifier and transaction parser',()=>{
 assert.deepEqual(accountMentions('Кофе Альфа',accounts).map(x=>x.account.id),['alpha']);
 assert.deepEqual(accountMentions('С Альфы на Сбер',accounts).map(x=>x.account.id),['alpha','sber']);
 assert.equal(accountMentions('Обед в Бургер Кинге',accounts).length,0);
});
test('Pure intent recognises personal, explicitly company-paid and plain company shortcuts',()=>{
 const cases=[
  [{memo:'обед в Бургер Кинге',sign:'-',hasNamedAccount:true},'expense'],
  [{memo:'обед в Бургер Кинге',hasNamedAccount:true},'expense'],
  [{memo:'обед',companyLunchEnabled:true},'lunch'],
  [{memo:'обед компании'},'lunch'],
  [{memo:'обед от работодателя',hasNamedAccount:false},'lunch'],
  [{memo:'обед за свои'},'expense'],
  [{memo:'обед',companyLunchEnabled:false},'expense'],
  [{memo:'обед компании',sign:'-'},'expense'],
  [{memo:'зарплата',sign:'+',inferredType:'income'},'income']
 ];
 for(const [params,type] of cases)assert.equal(classifyFinancialIntent(params).type,type,JSON.stringify(params));
});
test('The same text becomes an identical entry with or without currency suffix',()=>{
 const texts=['-1039,97 обед в Бургер Кинге Альфа','-1039,97 р. обед в Бургер Кинге Альфа'];
 for(const text of texts){
  const entry=parseEntry(text,accounts,CATEGORIES,date,{companyLunchEnabled:true});
  assert.equal(entry.amount,1039.97);assert.equal(entry.type,'expense');
  assert.equal(entry.cat,'food');assert.equal(entry.accountId,'alpha');
  const before={...structuredClone(EMPTY),accounts:structuredClone(accounts)};
  const after=putTransaction(before,entry);
  assert.equal(after.accounts[0].balance,3960.03);
  assert.equal(dashboard(after,date).spent,1039.97);
  assert.equal(before.accounts[0].balance,5000);
 }
});
test('Router protects personal messages and accepts genuine forwarded company orders',()=>{
 const employee='Кучеров (1033)\nСуп\nГречка\n380';
 const orders=lunchOrders(employee);
 assert.equal(classifyIncomingMessage({message:{text:employee,forward_date:1760680800},orders,accounts}).route,'company-order');
 for(const message of [
  {text:'-1039,97 обед в Бургер Кинге Альфа'},
  {text:'-1039,97 обед в Бургер Кинге Альфа',forward_date:1760680800},
  {text:'1039,97 обед в Бургер Кинге Альфа',forward_date:1760680800}
 ])assert.equal(classifyIncomingMessage({message,orders:lunchOrders(message.text),accounts}).route,'financial-entry');
 assert.equal(classifyIncomingMessage({message:{text:'Суп, гречка 380',forward_date:1760680800},orders:lunchOrders('Суп, гречка 380'),accounts}).route,'company-order');
});
