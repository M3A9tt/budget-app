import test from 'node:test';import assert from 'node:assert/strict';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {transferMoney,putTransaction,deleteTransaction,undoTransaction,migrateData,validateStateChange} from '../src/ledger.js';
import {reverseTransfer,updateTransfer} from '../src/transfer-actions.js';
import {createDebt,repayDebt} from '../src/debt-actions.js';
import {isFreeTransaction} from '../src/transaction-roles.js';
import {initialProfile,customizeHome} from '../src/home-layout.js';
import {setInterfaceVersion,personalInterface} from '../src/interface-settings.js';
import {acceptsProfile} from '../src/profile-session.js';
import {apiRequest,invalidateSessionReads} from '../src/mini-api.js';
import {botKeyboard,navigationCommand} from '../server/bot-navigation.js';
const today=todayMoscow(),base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'b',name:'Наличные',balance:100,currency:'RUB'}]});
const transfer=()=>transferMoney(base(),{id:'move',from:'a',to:'b',amount:200,fee:5,date:today});
test('G01 fee is inseparable from transfer through edit, delete, undo and imported state',()=>{
 const d=transfer(),fee=d.transactions[0];assert.deepEqual(d.accounts.map(a=>a.balance),[795,300]);
 assert.throws(()=>putTransaction(d,{...fee,amount:10}),/самом переводе/);assert.throws(()=>deleteTransaction(d,fee.id),/самом переводе/);assert.deepEqual(undoTransaction(d,d.history[0]).accounts,base().accounts);
 assert.throws(()=>migrateData({...d,transactions:[]},EMPTY),/комиссия/);
 assert.throws(()=>validateStateChange(d,{...d,transactions:[]}),/комиссия/);
 const edited=updateTransfer(d,{...d.transfers[0],amount:100,fee:10});assert.deepEqual(edited.accounts.map(a=>a.balance),[890,200]);assert.equal(edited.transactions.length,1);assert.equal(edited.transactions[0].amount,10);assert.equal(edited.transfers[0].revision,2);migrateData(edited,EMPTY);const unedited=undoTransaction(edited,edited.history[0]);assert.deepEqual(unedited.accounts,d.accounts);assert.deepEqual(unedited.transactions,d.transactions);
 const cancelled=reverseTransfer(edited,'move');assert.deepEqual(cancelled.accounts.map(a=>a.balance),[1000,100]);assert.equal(cancelled.transactions.length,0);assert.equal(cancelled.transfers.length,0);migrateData(cancelled,EMPTY);assert.deepEqual(reverseTransfer(cancelled,'move'),cancelled);const restored=undoTransaction(cancelled,cancelled.history[0]);assert.deepEqual(restored.accounts,edited.accounts);assert.deepEqual(restored.transactions,edited.transactions);assert.deepEqual(restored.transfers,edited.transfers);migrateData(restored,EMPTY);assert.throws(()=>undoTransaction(restored,cancelled.history[0]),/отменено|отсутствует/);
});
test('G02 bank fee cannot repay a person; every exclusive role is unavailable for linking',()=>{
 let d=createDebt(transfer(),{person:'Друг',type:'my',amount:5});assert.throws(()=>repayDebt(d,{id:d.debts[0].id,transactionId:d.transactions[0].id}),/подходящую/);
 for(const key of ['transferId','recurringId','installmentPaymentId','installmentRefundId','lunchId','debtId'])assert.equal(isFreeTransaction({type:'expense',cat:'food',[key]:'x'}),false);
 assert.throws(()=>migrateData({...d,transactions:[{...d.transactions[0],debtId:d.debts[0].id}]},EMPTY),/связана/);assert.deepEqual(d.accounts.map(a=>a.balance),[795,300]);
});
test('G07 contradictory new lunch expense is rejected; historical balances are never recalculated',()=>{
 const d=base(),input={id:'legacy',type:'expense',cat:'lunch',accountId:'a',amount:100,currency:'RUB',date:today};assert.throws(()=>putTransaction(d,input),/обед/);assert.equal(d.accounts[0].balance,1000);
 const old=migrateData({...d,transactions:[{...input,accountId:undefined}]},EMPTY);assert.equal(old.accounts[0].balance,1000);const memo=putTransaction(old,{...old.transactions[0],note:'Уточнение'});assert.equal(memo.accounts[0].balance,1000);assert.throws(()=>putTransaction(memo,{...memo.transactions[0],amount:120}),/обед/);
});
test('Pilot switches only presentation and preserves preferences, history, money and all modules',()=>{
 const d=customizeHome(transfer(),{preset:'full'}),next=setInterfaceVersion(d,2),back=setInterfaceVersion(next,1);assert(personalInterface(d));assert(personalInterface({...d,settings:{...d.settings,interfaceVersion:1}}));assert(personalInterface(next));assert(!personalInterface(back));
 assert.deepEqual({...back,settings:d.settings},d);assert.deepEqual(next.settings.homeLayout,d.settings.homeLayout);migrateData(next,EMPTY);assert.throws(()=>migrateData({...d,settings:{...d.settings,interfaceVersion:3}},EMPTY));assert.equal(initialProfile(EMPTY).settings.interfaceGuideSeen,true);assert.equal(personalInterface(initialProfile(EMPTY)),true);
});
test('G06 compare revisions only within the same owner',()=>{assert(acceptsProfile({userId:'a',revision:100},{userId:'b',revision:1}));assert(acceptsProfile({userId:'a',revision:1},{userId:'b',revision:100}));assert(!acceptsProfile({userId:'a',revision:100},{userId:'a',revision:99}));});
test('G06 a delayed state read cannot cross logout/login or erase a newer pending read',async t=>{
 const pending=[];t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>pending.push(resolve)));invalidateSessionReads();
 const old=apiRequest('state'),rejected=assert.rejects(old,e=>e.code==='STALE_SESSION');invalidateSessionReads();const fresh=apiRequest('state');pending[0](Response.json({userId:'a',revision:100}));await rejected;
 const shared=apiRequest('state');assert.equal(pending.length,2);pending[1](Response.json({userId:'b',revision:1}));assert.deepEqual(await fresh,await shared);invalidateSessionReads();
});
test('Bot pilot speaks the same concepts, and old commands still resolve',()=>{assert.deepEqual(botKeyboard('',setInterfaceVersion(base(),2)).keyboard.map(row=>row.map(b=>b.text)),[['Главная','Операции'],['Записать','Календарь'],['Ещё']]);assert.equal(navigationCommand('🕘 История'),'/history');assert.equal(navigationCommand('📅 Планы'),'/payments');assert.equal(navigationCommand('Операции'),'/history');assert.equal(navigationCommand('Календарь'),'/calendar');});

test('A legacy commission selected explicitly is cancelled and restored as the same fee record',()=>{
 const d=transfer(),fee=d.transactions[0];delete fee.transferId;delete d.transfers[0].feeTransactionId;
 const cancelled=reverseTransfer(d,'move',{legacyFeeId:fee.id});assert.deepEqual(cancelled.accounts,base().accounts);
 const restored=undoTransaction(cancelled,cancelled.history[0]);assert.deepEqual(restored.accounts,d.accounts);assert.equal(restored.transactions[0].id,fee.id);assert.equal(restored.transactions[0].transferId,'move');assert.equal(restored.transfers[0].feeTransactionId,fee.id);migrateData(restored,EMPTY);
});
