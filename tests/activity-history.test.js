import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,CATEGORIES,dashboard} from '../src/mini-model.js';
import {putTransaction,transferMoney} from '../src/ledger.js';
import {spendingReport} from '../src/analytics-report.js';
import {activityEntries,filterActivity,activityNetRub,transferDetails} from '../src/activity-history.js';

const date='2026-10-25';
function fixture(){
 let data=structuredClone(EMPTY);
 data.accounts=[{id:'card',name:'Карта',balance:10000,currency:'RUB'},{id:'save',name:'На учёбу',balance:0,currency:'RUB',accType:'savings'}];
 data=putTransaction(data,{id:'income',date,type:'income',cat:'income',accountId:'card',amount:1000,note:'Подработка'});
 data=putTransaction(data,{id:'same-id',date,type:'expense',cat:'food',accountId:'card',amount:120,note:'Кофе'});
 return transferMoney(data,{id:'same-id',date,from:'card',to:'save',amount:5000,fee:5,note:'На семестр'});
}

test('The activity feed includes each transfer once without changing storage or financial totals',()=>{
 const data=fixture(),before=structuredClone(data),entries=activityEntries(data);
 assert.equal(entries.length,4);assert.equal(entries.filter(t=>t.type==='transfer').length,1);
 assert.equal(entries.filter(t=>t.id==='same-id').length,2);
 assert.equal(activityNetRub(data,entries),875);assert.equal(spendingReport(data,date).total,125);
 assert.equal(dashboard(data,date).income,1000);assert.equal(data.accounts[0].balance,5875);assert.equal(data.accounts[1].balance,5000);
 assert.deepEqual(data,before);assert.equal(data.transfers[0].type,undefined);
});

test('Transfers share date/search/type filters; analytic expense drilldowns only include the actual fee',()=>{
 const data=fixture(),entries=activityEntries(data),find=options=>filterActivity(entries,data,CATEGORIES,options);
 for(const search of ['Карта','На учёбу','На семестр','5 000','5000','перевод'])assert.equal(find({type:'transfer',search}).length,1,search);
 assert.equal(find({type:'transfer',date}).length,1);assert.equal(find({type:'transfer',date:'2026-10-24'}).length,0);
 assert.equal(find({type:'income'}).length,1);assert.equal(find({type:'expense'}).length,2);assert.equal(find({type:'lunch'}).length,0);
 const expenses=find({chartFilter:{type:'expense',date,accountId:'card'}});
 assert.equal(expenses.length,2);assert.equal(activityNetRub(data,expenses),-125);
 assert.equal(activityNetRub(data,find({type:'transfer'})),0);
});

test('Imported and legacy transfers stay visible with honest account and balance labels',()=>{
 const data=fixture();data.transfers=[{id:'old',from:'removed',amount:200,currency:'RUB',date:'2026-10-24',balanceEffect:'history-only'},{id:'import',from:'card',to:'save',amount:300,currency:'RUB',date,balanceEffect:'history-only'}];
 const before=structuredClone(data),entries=activityEntries(data);
 assert.equal(entries.at(-1).id,'old');assert.equal(filterActivity(entries,data,CATEGORIES,{search:'Удалённый счёт'}).length,1);
 const old=transferDetails(data,entries.at(-1));assert.equal(old.route,'Удалённый счёт → Внешнее движение');assert.match(old.description,/старого учёта/);assert.match(old.description,/остатки не изменены/);
 assert.match(transferDetails(data,entries.find(t=>t.id==='import')).route,/Карта → На учёбу/);assert.deepEqual(data,before);
});

test('A transfer-only account history has a nonempty feed and uses the common chronological pagination',()=>{
 const data=fixture();data.transactions=[];data.transfers=Array.from({length:120},(_,i)=>({...data.transfers[0],id:'move-'+i,date:i<60?'2026-10-24':date}));
 const entries=activityEntries(data),rows=filterActivity(entries,data,CATEGORIES);
 assert.equal(rows.length,120);assert.equal(rows[0].date,date);assert.equal(rows.slice(0,100).length,100);assert.equal(rows.slice(100).length,20);assert.equal(activityNetRub(data,rows),0);
});

test('Recent activity orders new transfers by recording time rather than random UUID text',()=>{
 const data=fixture();data.transactions=[{id:'zzzz',type:'expense',date,amount:1,updatedAt:'2026-10-25T10:00:00.000Z'}];
 data.transfers=[{...data.transfers[0],id:'0000',updatedAt:'2026-10-25T10:01:00.000Z'},{...data.transfers[0],id:'ffff-legacy',updatedAt:undefined}];
 assert.deepEqual(activityEntries(data).map(t=>t.id),['0000','zzzz','ffff-legacy']);
});
