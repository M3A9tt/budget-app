import {botView} from '../server/bot-views.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow,dashboard} from '../src/mini-model.js';
import {createPlanned,preparePlanned,skipPlanned,updatePlanned} from '../src/planned-operations.js';
import {plannedOccurrences} from '../src/planned-model.js';
import {createInstallment,payInstallment,paidInstallment,installmentRemaining,forecast} from '../src/finance-tools.js';
import {putTransaction,deleteTransaction,undoTransaction,migrateData,transferMoney,validateStateChange} from '../src/ledger.js';
import {paymentOverview} from '../src/payment-overview.js';
import {upcoming} from '../src/analytics.js';
import {notificationJobs} from '../server/notifications.js';
import {validateTelemetry} from '../src/telemetry-events.js';
const today=todayMoscow(),month=today.slice(0,7),base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Банк',balance:10000,currency:'RUB'},{id:'b',name:'Копилка',balance:1000,currency:'RUB',accType:'savings'}]});
const values={name:'План',amount:1000,type:'expense',frequency:'monthly',accountId:'a',cat:'housing',startDate:month+'-01'};
test('Settled and skipped plan periods survive memo, price and account edits without a second obligation',()=>{
 for(const status of ['paid','skipped']){let d=createPlanned(base(),values),id=d.recurring[0].id;d=status==='paid'?putTransaction(d,{...preparePlanned(d,id,month,today,false),amount:1000}):skipPlanned(d,id,month);const before=d.accounts.map(a=>a.balance);d=migrateData(updatePlanned(d,id,{...values,name:'Новое название',amount:1200}),EMPTY);assert.equal(d.recurring[0].id,id,status);assert.equal(plannedOccurrences(d,today,today).length,0,status);assert.deepEqual(d.accounts.map(a=>a.balance),before);assert.throws(()=>updatePlanned(d,id,{...values,type:'income'}));assert.throws(()=>updatePlanned(d,id,{...values,frequency:'daily'}));}
});
test('Edited installment payment propagates its exact residual through balance, obligations, forecast, bot model and undo',()=>{
 let d=createInstallment(base(),{name:'Сплит',total:1000,count:1,firstDate:today,accountId:'a'}),plan=d.installments[0],p=plan.payments[0];d=payInstallment(d,{planId:plan.id,paymentId:p.id,date:today});const first=d.transactions[0];d=migrateData(putTransaction(d,{...first,amount:100}),EMPTY);assert.equal(d.accounts[0].balance,9900);assert.equal(paidInstallment(d,p),false);assert.equal(installmentRemaining(d,p),900);assert.equal(dashboard(d,today).obligations,900);assert.equal(paymentOverview(d,today).installmentTotal,900);assert.equal(forecast(d,today,1).overdue,900);assert.equal(upcoming(d,today).find(x=>x.id===p.id).amount,900);assert.throws(()=>putTransaction(d,{...d.transactions[0],amount:1001}));assert.throws(()=>putTransaction(d,{...d.transactions[0],currency:'USD'}));assert.throws(()=>putTransaction(d,{...d.transactions[0],installmentPaymentId:undefined}));d=payInstallment(d,{planId:plan.id,paymentId:p.id,date:today});assert.equal(d.transactions.at(-1).amount,900);assert.equal(d.accounts[0].balance,9000);assert.equal(dashboard(d,today).obligations,0);assert.ok(botView(d,'schedule',{id:plan.id}).actions.some(a=>a.label.startsWith('✓')&&a.label.includes('1')));const entry=d.history[0];d=deleteTransaction(d,d.transactions.at(-1).id);assert.equal(installmentRemaining(d,p),900);d=undoTransaction(d,d.history[0]);assert.equal(installmentRemaining(d,p),0);assert.equal(installmentRemaining(undoTransaction(d,entry),p),900);
});
test('Future facts are rejected by common writes and whole-state transition; historical imports remain safe',()=>{
 const d=base(),date='2099-01-01',tx={id:'future',type:'income',cat:'income',amount:5000,currency:'RUB',date,accountId:'a'};
 assert.throws(()=>putTransaction(d,tx),/Будущую/);assert.throws(()=>transferMoney(d,{from:'a',to:'b',amount:100,date}),/Будущий/);assert.throws(()=>validateStateChange(d,{...d,transactions:[tx]}),/Будущие/);assert.equal(putTransaction(d,{...tx,balanceEffect:'history-only'}).accounts[0].balance,10000);const existing={...d,transactions:[tx]};assert.doesNotThrow(()=>validateStateChange(existing,existing));assert.equal(dashboard(existing,today).income,0);assert.equal(dashboard({...d,transactions:[{...tx,type:'expense',cat:'food'}]},today).spent,0);assert.equal(d.accounts[0].balance,10000);
});
test('Backup boundary rejects inconsistent money, links and payment dates',()=>{
 const d=base(),tx={id:'t',type:'expense',cat:'food',amount:100,currency:'RUB',accountId:'a',date:today};
 for(const patch of [{amountRub:-999},{accountAmount:-999},{amountRub:Infinity},{accountAmount:0.001},{accountId:'missing'},{amount:1e15},{balanceEffect:'untrusted'}])assert.throws(()=>migrateData({...d,transactions:[{...tx,...patch}]},EMPTY),JSON.stringify(patch));
 const plan=createInstallment(d,{name:'Split',total:100,count:1,firstDate:today,accountId:'a'});plan.installments[0].payments[0].date='2026-99-99';assert.throws(()=>migrateData(plan,EMPTY));assert.equal(migrateData({...d,_pinHash:'legacy-hash'},EMPTY)._pinHash,undefined);assert.equal(migrateData({...d,rates:{...d.rates,RUB:100}},EMPTY).rates.RUB,1);

});
