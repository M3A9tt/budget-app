import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {EMPTY,CATEGORIES,dashboard} from '../src/mini-model.js';
import {orderedAccounts,accountTotals} from '../src/account-balances.js';
import {putTransaction} from '../src/ledger.js';
const require=createRequire(import.meta.url),bundle=buildSync({stdin:{contents:"export {default as LunchPage} from './src/LunchPage.jsx';export {default as AccountsPage} from './src/AccountsPage.jsx';export {default as EntryComposer} from './src/EntryComposer.jsx';export {BudgetHero,HomeAccounts} from './src/Insights.jsx';export {AccountTools} from './src/FinancePanels.jsx';",resolveDir:new URL('..',import.meta.url).pathname,loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom'],define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
const ctx={module:{exports:{}},exports:{},require,Intl,Date,console,structuredClone,window:{scrollTo:()=>{}},crypto:globalThis.crypto};ctx.exports=ctx.module.exports;vm.runInNewContext(bundle,ctx);const ui=ctx.module.exports;
const state=()=>({...structuredClone(EMPTY),accounts:[{id:'zero',name:'Пустой счёт',balance:0,currency:'RUB'},{id:'small',name:'Малый счёт',balance:100,currency:'RUB'},{id:'fx',name:'Доллары',balance:20,currency:'USD'},{id:'large',name:'Большой счёт',balance:1000,currency:'RUB'},{id:'reserve',name:'Резервный счёт',balance:3000,currency:'RUB',savingsKind:'deposit'}]});
const text=x=>typeof x==='string'?x:Array.isArray(x)?x.map(text).join(''):x?.children?text(x.children):'';

const labelText=node=>node.findAllByType('span').map(x=>x.children.filter(c=>typeof c==='string').join('')).join(' ')+node.children.filter(c=>typeof c==='string').join('');
function mount(name,props){let view;act(()=>{view=TestRenderer.create(React.createElement(ui[name],props));});return view;}
function click(view,predicate){const target=view.root.findAllByType('button').find(predicate);assert.ok(target,'Expected button');act(()=>target.props.onClick());}
test('Shared ordering compares currencies, keeps negative balances and does not mutate storage',()=>{
 const d=state();d.accounts.push({id:'negative',name:'Минус',balance:-20,currency:'RUB'});const before=structuredClone(d);assert.deepEqual(orderedAccounts(d).map(a=>a.id),['reserve','fx','large','small','zero','negative']);assert.deepEqual(d,before);assert.equal(accountTotals(d).spendable,2920);assert.equal(dashboard(d,'2026-10-01').balance,2920);
});
test('Account tiles and home strip append zeros with a supplemental SVG disclosure and retain funded accounts',()=>{
 for(const name of ['AccountsPage','HomeAccounts']){const view=mount(name,{data:state(),mutate:()=>{},onOpen:()=>{}});let output=text(view.toJSON());assert.ok(output.indexOf('Доллары')<output.indexOf('Большой счёт'));assert.ok(output.indexOf('Большой счёт')<output.indexOf('Малый счёт'));assert.ok(!output.includes('Пустой счёт'));assert.ok(!output.includes('Резервный счёт'));
 const listClass=name==='AccountsPage'?'account-grid':'ins-account-strip';assert.deepEqual(view.root.findAll(x=>[listClass,'account-visibility'].includes(x.props.className)).map(x=>x.props.className),[listClass,'account-visibility']);const tab=view.root.findAllByType('button').find(x=>labelText(x).includes('Показать нулевые'));assert.ok(tab.findAllByType('svg').length);act(()=>tab.props.onClick());output=text(view.toJSON());assert.ok(output.includes('Пустой счёт'));assert.ok(output.includes('Малый счёт'));assert.ok(!view.root.findAllByType('button').some(x=>labelText(x).includes('С деньгами')));assert.equal(tab.props['aria-expanded'],true);click(view,x=>labelText(x).includes('Скрыть нулевые'));assert.ok(text(view.toJSON()).includes('Доллары'));view.unmount();}
});
test('Zero-account tab stays escapable after its last account receives money',()=>{
 const d=state(),props={data:d,busy:false,mutate:()=>{}},v=mount('AccountsPage',props);click(v,x=>labelText(x).includes('Показать нулевые'));d.accounts[0].balance=50;act(()=>v.update(React.createElement(ui.AccountsPage,{...props,data:{...d}})));click(v,x=>labelText(x).includes('Скрыть нулевые'));assert.ok(text(v.toJSON()).includes('Пустой счёт'));v.unmount();
});
test('Spendable disclosure shows actual account balances, reserves separately and subtracts commitments once',()=>{
 const d=state();d.recurring=[{id:'plan',name:'Платёж',frequency:'once',startDate:'2026-10-19',amount:500,currency:'RUB',active:true,type:'expense'}];let route='';const v=mount('BudgetHero',{data:d,onMore:x=>route=x});assert.equal(v.root.findAllByProps({id:'spendable-breakdown'}).length,0);click(v,x=>x.props['aria-controls']==='spendable-breakdown');
 const panel=v.root.findByProps({id:'spendable-breakdown'}),output=text(panel.toJSON?.()||v.toJSON());assert.ok(output.includes('Всего на этих счетах'));assert.ok(output.includes('Минус предстоящие платежи'));assert.ok(output.includes('Доллары'));assert.ok(!panel.findAllByType('button').some(x=>labelText(x).includes('Резервный счёт')));const bars=panel.findByProps({className:'spendable-bar'}).findAllByType('span');assert.ok(Math.abs(bars.reduce((n,b)=>n+parseFloat(b.props.style.width),0)-100)<1e-8);click(v,x=>x.props.className==='spendable-account');assert.equal(route,'accounts');click(v,x=>x.props['aria-controls']==='spendable-breakdown');assert.equal(v.root.findAllByProps({id:'spendable-breakdown'}).length,0);v.unmount();
});
test('Date opens dishes and amounts; top-up targets exact meal; back returns to monthly table',()=>{
 let d=state();for(const [id,amount,note] of [['first',350,'Суп и салат'],['second',200,'Горячее']])d=putTransaction(d,{id,type:'lunch',cat:'lunch',amount,date:'2026-10-01',note});let draft,selected;const v=mount('LunchPage',{data:d,initialMonth:'2026-10',mutate:()=>{},onAdd:x=>draft=x,onEdit:x=>draft=x,onSelectDate:x=>selected=x});click(v,x=>x.props['aria-label']==='2026-10-01 · блюда и стоимость');let output=text(v.toJSON());assert.ok(output.includes('Суп и салат'));assert.ok(output.includes('Горячее'));assert.ok(output.includes('350'));assert.ok(output.includes('200'));assert.equal(selected,'2026-10-01');assert.equal(v.root.findAllByProps({className:'lunch-day-record'}).length,2);
 const first=v.root.findAllByProps({className:'lunch-day-record'})[0];const top=first.findAllByType('button').find(x=>labelText(x).includes('Доплата'));act(()=>top.props.onClick());assert.equal(draft.lunchId,'first');assert.equal(draft.date,'2026-10-01');assert.equal(draft.type,'expense');click(v,x=>labelText(x).includes('К таблице'));assert.equal(v.root.findAllByType('table').length,1);assert.equal(selected,'');v.unmount();
});
test('Entry account picker orders all regular accounts, makes zero destinations reachable, preserves selected zero',()=>{
 const data=state(),draft={type:'income',amount:'10',date:'2026-10-01',currency:'RUB',accountId:'',note:''};let picked;const props={data,draft,cats:CATEGORIES,busy:false,setDraft:x=>picked=x,onSave:()=>{}};const v=mount('EntryComposer',props);let output=text(v.toJSON());assert.ok(output.indexOf('Доллары')<output.indexOf('Большой счёт'));assert.ok(!output.includes('Пустой счёт'));click(v,x=>labelText(x).includes('Показать нулевые'));click(v,x=>x.props['data-track']==='account_choose'&&labelText(x).includes('Пустой счёт'));assert.equal(picked.accountId,'zero');act(()=>v.update(React.createElement(ui.EntryComposer,{...props,draft:picked})));click(v,x=>labelText(x).includes('Скрыть нулевые'));const selected=v.root.findAllByType('button').find(x=>x.props['data-track']==='account_choose'&&x.props['aria-pressed']);assert.ok(labelText(selected).includes('Пустой счёт'));v.unmount();
});
test('Transfer/reconcile options share ordering and keep zero-balance destinations',()=>{
 const v=mount('AccountTools',{data:state(),action:'transfer',mutate:()=>{}}),selects=v.root.findAllByType('select');for(const select of selects.slice(0,2))assert.deepEqual(select.findAllByType('option').map(x=>x.props.value).filter(Boolean),['reserve','fx','large','small','zero']);v.unmount();
});
