import {botView} from '../server/bot-views.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {putTransaction,migrateData,deleteTransaction,undoTransaction} from '../src/ledger.js';
import {createPlanned,linkPlannedTransaction,plannedLinkCandidates,skipPlanned} from '../src/planned-operations.js';
import {plannedOccurrences} from '../src/planned-model.js';
import {saveCustomCategory,categoryEmoji} from '../src/category-customization.js';
import {categoryCatalog} from '../src/categories.js';
import {applyBotAction} from '../server/bot-catalog.js';
const today=todayMoscow(),period=today.slice(0,7);
const fixture=()=>createPlanned({...structuredClone(EMPTY),accounts:[{id:'a',balance:1000,currency:'RUB',name:'Карта'}]},{id:'rent',name:'ЖКХ',type:'expense',amount:100,frequency:'monthly',startDate:today,accountId:'a'});
test('Linking an existing manual payment changes no money, dates, counts or historical rates; retry is idempotent and undo reopens the plan',()=>{
 let d=putTransaction(fixture(),{id:'manual',amount:100,type:'expense',date:today,accountId:'a',cat:'housing'});const before=structuredClone(d);
 d=linkPlannedTransaction(d,'rent',period,'manual');assert.equal(d.accounts[0].balance,900);assert.equal(d.transactions.length,1);assert.equal(d.transactions[0].amountRub,before.transactions[0].amountRub);assert.equal(d.transactions[0].date,today);assert.equal(plannedOccurrences(d,today).length,0);assert.equal(linkPlannedTransaction(d,'rent',period,'manual'),d);migrateData(d,EMPTY);
 const undone=undoTransaction(d,d.history[0]);assert.equal(undone.accounts[0].balance,900);assert.equal(undone.transactions.length,1);assert.equal(plannedOccurrences(undone,today).length,1);
 assert.equal(plannedOccurrences(deleteTransaction(d,'manual'),today).length,1);
});
test('History-only payment and obsolete period never debit a manually entered starting balance',()=>{
 let d=putTransaction(fixture(),{id:'old',amount:100,type:'expense',date:today,accountId:'a',cat:'housing',balanceEffect:'history-only'});d=linkPlannedTransaction(d,'rent',period,'old');assert.equal(d.accounts[0].balance,1000);assert.equal(d.transactions[0].balanceEffect,'history-only');
 const raw=fixture();raw.paymentReminders={['plan:rent:'+period]:{date:today,time:'18:00'}};const next=skipPlanned(raw,'rent',period);assert.equal(next.accounts[0].balance,1000);assert.equal(next.transactions.length,0);assert.equal(plannedOccurrences(next,today).length,0);assert.equal(Object.keys(next.paymentReminders).length,0);
});
test('Bot and app share links, exclude other accounts/types/linked facts, and cannot reuse a payment for another period',()=>{
 let d=putTransaction(fixture(),{id:'manual',amount:100,type:'expense',date:today,accountId:'a',cat:'housing'});d=putTransaction(d,{id:'income',amount:100,type:'income',date:today,accountId:'a'});assert.deepEqual(plannedLinkCandidates(d,'rent',period).map(t=>t.id),['manual']);
 const next=applyBotAction(structuredClone(d),'linkPlan',{id:'rent',period},{transactionId:'manual'});assert.deepEqual(next.accounts,d.accounts);assert.throws(()=>linkPlannedTransaction(next,'rent','2099-12','manual'));assert.throws(()=>linkPlannedTransaction(d,'rent',period,'income'));
});
test('Emoji categories edit stable IDs without losing budgets or operations and survive restore and bot creation',()=>{
 let d=saveCustomCategory(fixture(),{name:'Коты',emoji:'🐈',color:'#abc123'});const id=d.customCats[0].id;d.categoryBudgets[id]=500;d=putTransaction(d,{id:'food',amount:50,type:'expense',cat:id,accountId:'a',date:today});d=saveCustomCategory(d,{name:'Мои коты',emoji:'❤️',color:'#112233'},id);
 assert.equal(d.customCats[0].id,id);assert.equal(d.transactions[0].cat,id);assert.equal(d.categoryBudgets[id],500);assert.equal(categoryCatalog(d.customCats).find(c=>c.id===id).name,'❤️ Мои коты');assert.equal(migrateData(d,EMPTY).customCats[0].emoji,'❤️');
 const many={...d,customCats:Array.from({length:30},(_,i)=>({id:'c'+i,name:'Категория '+i,emoji:'🐈'}))};assert.ok(botView(many,'customCategories').actions.length<=10);
 const bot=applyBotAction(fixture(),'category',{newId:'custom-cat'},{name:'Учёба',emoji:'🎓'});assert.equal(bot.customCats[0].id,'custom-cat');assert.equal(bot.customCats[0].emoji,'🎓');
 for(const s of ['word','🐈🐈','<img>'])assert.throws(()=>categoryEmoji(s));for(const s of ['👨‍👩‍👧','🇷🇺','❤️',''])assert.equal(categoryEmoji(s),s);
});
