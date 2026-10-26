import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {EMPTY} from '../src/mini-model.js';

const require=createRequire(import.meta.url);
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/BackupPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react']}).outputFiles[0].text;
const context={module:{exports:{}},exports:{},require,Intl,Date,console,structuredClone,crypto,Blob,clearTimeout,setTimeout:()=>0,URL:{createObjectURL:()=> 'blob:backup',revokeObjectURL:()=>{}},document:{createElement:()=>({click(){}})}};
context.exports=context.module.exports;vm.runInNewContext(bundle,context);const BackupPanel=context.module.exports.default;
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';

async function panel(){
  let data=structuredClone(EMPTY),view;
  data.accounts=[{id:'account',name:'Основной',currency:'RUB',balance:500}];
  const props=()=>({data,busy:false,demo:false,mutate:async change=>{data=change(data);return true;}});
  act(()=>{view=TestRenderer.create(React.createElement(BackupPanel,props()));});
  const button=label=>view.root.findAllByType('button').find(node=>text(node)===label);
  const refresh=next=>{data=next;act(()=>view.update(React.createElement(BackupPanel,props())));};
  await act(async()=>{await view.root.findByProps({type:'file'}).props.onChange({target:{files:[{size:100,text:async()=>JSON.stringify(EMPTY)}],value:'backup.json'}});});
  const approve=async()=>{await act(async()=>{await button('Скачать копию перед заменой').props.onClick();});act(()=>view.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));};
  return {view,button,refresh,approve,get data(){return data;},setCurrent:next=>{data=next;}};
}

test('A foreground update invalidates the pre-restore copy and confirmation until downloaded again',async()=>{
  const app=await panel();await app.approve();assert.equal(app.button('Восстановить проверенный бэкап').props.disabled,false);
  app.refresh({...app.data,accounts:[{...app.data.accounts[0],balance:480}]});
  assert.equal(app.button('Восстановить проверенный бэкап').props.disabled,true);
  assert.equal(app.view.root.findByProps({type:'checkbox'}).props.checked,false);
  assert.ok(text(app.view.toJSON()).includes('Бюджет обновился'));
  await app.approve();assert.equal(app.button('Восстановить проверенный бэкап').props.disabled,false);
  await act(async()=>{await app.button('Восстановить проверенный бэкап').props.onClick();});
  assert.equal(app.data.accounts.length,0);app.view.unmount();
});

test('Restore checks the latest state inside the mutation and preserves a change racing the click',async()=>{
  const app=await panel();await app.approve();
  const latest={...app.data,accounts:[{...app.data.accounts[0],balance:999}]};app.setCurrent(latest);
  await act(async()=>{await app.button('Восстановить проверенный бэкап').props.onClick();});
  assert.equal(app.data,latest);assert.ok(text(app.view.toJSON()).includes('Бюджет изменился после скачивания копии'));app.view.unmount();
});

test('A display-only account reorder does not invalidate a current pre-restore backup',async()=>{
  const app=await panel();app.refresh({...app.data,accounts:[...app.data.accounts,{id:'second',name:'Другой',currency:'RUB',balance:1}]});await app.approve();
  app.refresh({...app.data,accounts:[...app.data.accounts].reverse()});
  assert.equal(app.button('Восстановить проверенный бэкап').props.disabled,false);app.view.unmount();
});
