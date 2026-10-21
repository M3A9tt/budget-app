import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';
import {expenseCheckSummary} from '../src/expense-check.js';
import {expenseReminder} from '../server/notifications.js';
const day='2026-10-21';
test('Expense check lists the latest personal expenses for its day and totals all rows in historical rubles',()=>{
 const d={...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',currency:'RUB',balance:10000}],rates:{...EMPTY.rates,USD:201.5}};
 d.transactions=[...Array.from({length:7},(_,i)=>({id:'t'+i,date:day,type:'expense',cat:'food',amount:0.05,currency:'USD',accountId:'bank',note:'Кофе '+i})),{id:'fixed',date:day,type:'expense',cat:'tech',amount:1,currency:'USD',amountRub:80,note:'Платёж за телефон',installmentPaymentId:'p'},...['lunch','income'].map(type=>({id:type,type,cat:type,date:day,amount:999,note:'Не личный расход'})),{id:'old',type:'expense',cat:'food',date:'2026-10-20',amount:999,note:'Вчерашний расход'}];
 const snapshot=expenseCheckSummary(d,day);
 assert.equal(snapshot.count,8);assert.equal(snapshot.total,150.56);assert.deepEqual(snapshot.entries.map(t=>t.id),['fixed','t6','t5','t4','t3']);
 const reminder=expenseReminder(d,day),text=reminder.text;
 assert.match(text,/150,56/);assert.match(text,/Ещё 3/);assert.match(text,/Банк/);assert.doesNotMatch(text,/Вчерашний|Не личный/);
 const buttons=reminder.reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.callback_data==='check:'+day+':history'));assert.ok(!buttons.some(b=>b.callback_data.endsWith(':none')));
 assert.equal(d.accounts[0].balance,10000);
});
test('Empty check, arbitrary names and custom reminder text stay clear and bounded',()=>{
 const d=structuredClone(EMPTY);d.settings.reminderText='Мой текст';d.settings.reminderStyle='custom';
 let r=expenseReminder(d,day,-1);assert.match(r.text,/Расходов за этот день пока нет/);assert.match(r.text,/Мой текст/);assert.ok(r.reply_markup.inline_keyboard.flat().some(b=>b.callback_data.endsWith(':none')));
 d.accounts=[{id:'a',name:'Очень длинный счёт '.repeat(100)}];d.transactions=Array.from({length:30},(_,i)=>({id:String(i),type:'expense',cat:'food',date:day,amount:1,accountId:'a',note:'Покупка\n'.repeat(1000)}));
 r=expenseReminder(d,day);assert.ok(r.text.length<2000);assert.equal(r.text.split('\n').filter(s=>s.startsWith('• ')).length,5);assert.match(r.text,/Ещё 25/);
});
