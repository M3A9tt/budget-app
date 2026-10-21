import test from 'node:test';import assert from 'node:assert/strict';
import {EMPTY,dashboard,todayMoscow} from '../src/mini-model.js';
import {customizeHome,homeBlocks,HOME_BLOCKS,initialProfile} from '../src/home-layout.js';
import {setModule,moduleEnabled} from '../src/modules.js';
import {migrateData} from '../src/ledger.js';
import {botView} from '../server/bot-views.js';
test('Personal home order, hidden modules and backup roundtrip preserve shared funds and obligations',()=>{
 const today=todayMoscow(),d={...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',balance:1000,currency:'RUB'},{id:'cash',name:'Резерв',balance:500,currency:'RUB',accType:'savings'}],debts:[{id:'d',person:'Мама',type:'iowe',amount:200,currency:'RUB',dueDate:today,payments:[]}]};
 const before=dashboard(d,today),simple=customizeHome(d,{preset:'simple'});assert.deepEqual(homeBlocks(simple),['budget','actions','accounts','recent']);
 const moved=customizeHome(simple,{key:'accounts',move:-1});assert.deepEqual(homeBlocks(moved),['budget','accounts','actions','recent']);
 let full=customizeHome(moved,{preset:'full'});for(const [key] of [['goals'],['limits'],['forecast'],['debts'],['plans'],['installments']])full=setModule(full,key,false);
 assert.ok(!homeBlocks(full).includes('wishes'));assert.ok(!homeBlocks(full).includes('forecast'));assert.ok(!homeBlocks(full).includes('limits'));assert.equal(dashboard(full,today).obligations,before.obligations);assert.equal(dashboard(full,today).free,before.free);
 const saved=migrateData(JSON.parse(JSON.stringify(full)),EMPTY);assert.deepEqual(saved.settings.homeLayout,full.settings.homeLayout);assert.deepEqual(saved.accounts,d.accounts);assert.deepEqual(saved.debts,d.debts);
 assert.ok(botView(saved,'home').actions.every(x=>x.view!=='goals'&&x.view!=='limits'));assert.ok(botView(saved,'payments').actions.every(x=>!['plans','installments','debts'].includes(x.view)));
 const restored=customizeHome(saved,{reset:true});assert.equal(restored.settings.homeLayout,undefined);assert.equal(moduleEnabled(restored,'goals'),false);
 for(const bad of [{order:[],hidden:[]},{order:HOME_BLOCKS.map(([id])=>id),hidden:['actions']},{order:HOME_BLOCKS.map(([id])=>id),hidden:['unknown']}])assert.throws(()=>migrateData({...d,settings:{homeLayout:bad}},EMPTY),/главной/);
 assert.throws(()=>customizeHome(d,{key:'actions',visible:false}));
 const fresh=initialProfile(EMPTY);assert.equal(fresh.accounts.length,0);assert.ok(Object.values(fresh.settings.modules).every(x=>x===false));assert.deepEqual(homeBlocks(fresh),['budget','actions','accounts','recent']);
});
