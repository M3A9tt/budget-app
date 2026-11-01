import test from 'node:test';import assert from 'node:assert/strict';
import {EMPTY,todayMoscow,dashboard,CATEGORIES} from '../src/mini-model.js';
import {submitEntry} from '../src/entry-submit.js';import {moveDate,scheduledEvents} from '../src/finance-events.js';
import {parseEntry,parseOwnTransfer} from '../src/quick-entry.js';import {prepareEvent} from '../src/event-actions.js';
import {applyBotAction} from '../server/bot-catalog.js';import {compactTransaction,actionOutcome} from '../server/bot-dialog.js';
const today=todayMoscow(),base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',currency:'RUB',balance:1000}]});
test('One expense entry routes actual and future dates to their existing financial states',()=>{
 const expense={id:'buy',type:'expense',cat:'food',amount:100,currency:'RUB',date:moveDate(today,2),accountId:'a',note:'Покупка'};let d=submitEntry(base(),expense,today);assert.equal(d.accounts[0].balance,1000);assert.equal(d.transactions.length,0);assert.equal(dashboard(d,today).obligations,100);assert.equal(d.recurring[0].type,'expense');assert.throws(()=>submitEntry(d,expense,today),/создан/);
 d=submitEntry(d,prepareEvent(d,scheduledEvents(d,today,expense.date)[0],today),today);assert.equal(d.accounts[0].balance,900);assert.equal(d.transactions[0].recurringId,'buy');assert.equal(dashboard(d,today).obligations,0);
 const actual=submitEntry(base(),{...expense,date:today},today);assert.equal(actual.accounts[0].balance,900);assert.equal(actual.recurring.length,0);
});
test('Future income stays income and never credits cash before actual confirmation',()=>{
 let d=submitEntry(base(),{id:'salary',type:'income',amount:500,accountId:'a',currency:'RUB',date:moveDate(today,2),note:'Доход'},today);assert.equal(d.accounts[0].balance,1000);assert.equal(dashboard(d,today).free,1000);d=submitEntry(d,prepareEvent(d,scheduledEvents(d,today,moveDate(today,2))[0],today),today);assert.equal(d.accounts[0].balance,1500);assert.equal(d.transactions.length,1);
});
test('Text and native bot use the same expense contract; preview and receipt describe a plan honestly',()=>{
 const draft=parseEntry('завтра кофе 100 Карта',base().accounts,CATEGORIES,today);assert.equal(draft.type,'expense');assert.equal(draft.timing,'planned');const d=applyBotAction(base(),'tx',{newId:'text',type:'expense'},draft);assert.equal(d.recurring[0].type,'expense');assert.equal(d.accounts[0].balance,1000);assert.match(compactTransaction(base(),{values:draft,args:{type:'expense'}}).join(' '),/Остатки сейчас не изменятся/);assert.match(actionOutcome(d,{op:'tx',args:{type:'expense'},values:draft},{}).title,/Расход запланирован/);
 assert.throws(()=>parseOwnTransfer('завтра перевод 100 Карта → Резерв',[...base().accounts,{id:'s',name:'Резерв',currency:'RUB'}],today),/Будущий перевод/);
});
test('Future timing cannot reclassify existing facts, linked payments, company lunches or silently convert currency',()=>{
 const d=submitEntry(base(),{id:'old',type:'expense',amount:50,currency:'RUB',date:today,accountId:'a'},today),before=structuredClone(d),future=moveDate(today,2);
 for(const entry of [{...d.transactions[0],date:future},{type:'expense',recurringId:'p'},{type:'lunch'},{type:'expense',currency:'USD'}])assert.throws(()=>submitEntry(d,{date:future,amount:100,currency:'RUB',accountId:'a',...entry},today));assert.deepEqual(d,before);
 const manual=submitEntry(base(),{type:'expense',amount:100,currency:'RUB',accountId:'a',timing:'planned',frequency:'manual',date:'',note:'Без расписания'},today);assert.equal(scheduledEvents(manual,today,moveDate(today,100)).length,0);
});
