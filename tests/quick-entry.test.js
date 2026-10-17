import test from 'node:test';import assert from 'node:assert/strict';
import {parseEntry,parseOwnTransfer} from '../src/quick-entry.js';
import {EMPTY,CATEGORIES} from '../src/mini-model.js';
import {putTransaction,transferMoney} from '../src/ledger.js';
const today='2026-10-17',accounts=[{id:'a',name:'Альфа',currency:'RUB',balance:5000},{id:'b',name:'Банк 2',currency:'RUB',balance:1000},{id:'s',name:'Сбер',currency:'RUB',balance:1000},{id:'c',name:'Копилка',currency:'RUB',balance:2000,accType:'savings'}];
const parse=(text,options={})=>parseEntry(text,accounts,CATEGORIES,today,{allowMissingAccount:true,...options});
test('Flexible expenses and income preserve amount, date, category and ledger direction across formats',()=>{
 for(const text of ['кофе 180 Альфа','−180 кофе Альфа','Альфа; кофе; 180р','кофе 180 ₽ с Альфы']){const draft=parse(text);assert.equal(draft.amount,180);assert.equal(draft.type,'expense');assert.equal(draft.accountId,'a');assert.equal(draft.note,'кофе');const next=putTransaction({...structuredClone(EMPTY),accounts},draft);assert.equal(next.accounts[0].balance,4820);}
 const grouped=parse('продукты 1\u202f250,50 руб. Альфа');assert.equal(grouped.amount,1250.5);
 const old=parse('вчера такси 450 Альфа');assert.equal(old.date,'2026-10-16');assert.equal(old.cat,'transport');
 assert.equal(parse('14.10.2026 Банк 2 кино 300').amount,300);assert.equal(parse('14.10.2026 Банк 2 кино 300').date,'2026-10-14');
 for(const text of ['+3000 подработка Альфа','доход 3000 Альфа','получил 3000 подработка Альфа']){const draft=parse(text);assert.equal(draft.type,'income');assert.equal(putTransaction({...structuredClone(EMPTY),accounts},draft).accounts[0].balance,8000);}
 assert.equal(parse('подарок 500 Альфа #развлечения').cat,'fun');assert.equal(parse('кофе 180').accountId,'');assert.equal(parse('обед 350',{companyLunchEnabled:false}).type,'expense');assert.equal(parse('обед компании 350',{companyLunchEnabled:false}).type,'lunch');
});
test('Ambiguous amounts, dates and accounts never become a financial draft; own transfer stays out of income and expense',()=>{
 for(const text of ['кофе 180 и такси 300','2 кофе 180','завтра кофе 180','31.02.2026 кофе 180','кофе 0','кофе 1000000000001','вчера сегодня кофе 180','кофе 180 Альфа Сбер'])assert.throws(()=>parse(text),text);
 assert.throws(()=>parseEntry('кофе 180',accounts,CATEGORIES,today),/название счёта/);
 const transfer=parseOwnTransfer('вчера перевод 500 Сбер → Копилка',accounts,today); 
 assert.equal(transfer.amount,500);assert.equal(transfer.date,'2026-10-16');
 const t=parseOwnTransfer('перевод 500 Сбер → Копилка вчера',accounts,today);assert.equal(t.date,'2026-10-16');const next=transferMoney({...structuredClone(EMPTY),accounts},t);assert.equal(next.accounts[2].balance,500);assert.equal(next.accounts[3].balance,2500);assert.equal(next.transactions.length,0);assert.equal(next.transfers.length,1);
 assert.equal(parseOwnTransfer('перевёл маме 500',accounts,today),null);assert.throws(()=>parseOwnTransfer('перевод 500 Сбер → Сбер',accounts,today));
});

test('An explicit debit and named account make a personal lunch, with or without ruble suffix',()=>{
 for(const text of [
  '-1039,97 р. обед в Бургер Кинге Альфа',
  '-1039,97 обед в Бургер Кинге Альфа',
  '−1039,97 обед в Бургер Кинге Альфа',
  '1039,97 обед в Бургер Кинге Альфа',
  'обед в Бургер Кинге 1039,97 Альфа'
 ]){
  const t=parse(text,{companyLunchEnabled:true});
  assert.equal(t.type,'expense',text);
  assert.equal(t.cat,'food',text);
  assert.equal(t.accountId,'a',text);
  assert.equal(t.amount,1039.97,text);
  assert.deepEqual(t.tags,['обед-за-свои'],text);
  const next=putTransaction({...structuredClone(EMPTY),accounts},t);
  assert.equal(next.accounts[0].balance,3960.03,text);
 }
});
test('Unmarked corporate lunch shortcut stays available, but named personal accounts do not become company money',()=>{
 for(const text of ['обед 379','Обед компании 379','обед за счёт компании 379']){
  const tx=parse(text,{companyLunchEnabled:true});
  assert.equal(tx.type,'lunch',text);assert.equal(tx.amount,379,text);assert.equal(tx.accountId,undefined,text);
 }
 const personal=parse('обед 379 Альфа');
 assert.equal(personal.type,'expense');assert.equal(personal.accountId,'a');assert.equal(personal.amount,379);
});
