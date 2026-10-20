import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {EMPTY} from '../src/mini-model.js';

const require=createRequire(import.meta.url),bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/JsonImportPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react']}).outputFiles[0].text;
const scope={module:{exports:{}},exports:{},require,Intl,Date,crypto,structuredClone,console};scope.exports=scope.module.exports;vm.runInNewContext(bundle,scope);
const Panel=scope.module.exports.default;
const text=x=>typeof x==='string'?x:Array.isArray(x)?x.map(text).join(''):x?.children?text(x.children):'';
const document=operations=>JSON.stringify({format:'burget-operations',version:1,operations});
const expense={date:'2026-10-13',type:'expense',amount:180,currency:'RUB',account:'a',category:'food',note:'Кофе'};
function mount(){
 let data={...structuredClone(EMPTY),accounts:[{id:'a',name:'Банк',currency:'RUB',balance:5000}]},calls=0,view;
 act(()=>{view=TestRenderer.create(React.createElement(Panel,{data,busy:false,mutate:async fn=>{data=fn(data);calls++;return true;}}));});
 const click=async label=>{const b=view.root.findAllByType('button').find(n=>text(n).includes(label));assert.ok(b,label);await act(async()=>{await b.props.onClick();});};
 const load=async source=>{act(()=>view.root.findByType('textarea').props.onChange({target:{value:source}}));await click('Проверить и исправить');};
 return {view,click,load,state:()=>data,calls:()=>calls};
}

test('JSON import shows malformed rows and can import the valid remainder after explicit exclusion',async()=>{
 const a=mount();try{
  await a.load(document([null,expense]));assert.ok(text(a.view.toJSON()).includes('1 ошибок'));assert.equal(a.calls(),0);
  const excludes=a.view.root.findAllByType('label').filter(n=>text(n).includes('Исключить строку'));
  act(()=>excludes[0].findByType('input').props.onChange({target:{checked:true}}));
  assert.ok(text(a.view.toJSON()).includes('0 ошибок'));await a.click('Подтвердить импорт');
  assert.equal(a.calls(),1);assert.equal(a.state().transactions.length,1);assert.equal(a.state().accounts[0].balance,5000);
 }finally{a.view.unmount();}
});

test('Corporate lunch preview never offers payment-method fields that would invalidate the import',async()=>{
 const a=mount();try{
  await a.load(document([{date:'2026-10-13',type:'lunch',amount:379,currency:'RUB',note:'Суп и горячее'}]));
  assert.equal(a.view.root.findAllByType('label').some(n=>text(n).startsWith('Оплата')),false);
  await a.click('Подтвердить импорт');assert.equal(a.state().transactions[0].type,'lunch');assert.equal(a.state().accounts[0].balance,5000);
 }finally{a.view.unmount();}
});

test('Correcting an amount accepts grouped decimal input and keeps preview free of writes',async()=>{
 const a=mount();try{
  await a.load(document([expense]));const amount=a.view.root.findAllByType('input').find(n=>n.props.inputMode==='decimal');
  act(()=>amount.props.onChange({target:{value:'1 234,50'}}));assert.equal(a.calls(),0);
  assert.ok(text(a.view.toJSON()).includes('0 ошибок'));await a.click('Подтвердить импорт');
  assert.equal(a.state().transactions[0].amount,1234.5);assert.equal(a.state().accounts[0].balance,5000);
 }finally{a.view.unmount();}
});
