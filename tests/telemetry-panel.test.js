import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';

const require=createRequire(import.meta.url);
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/TelemetryPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react']}).outputFiles[0].text;
const report={format:'burget-telemetry',version:1,from:'2026-11-01',to:'2026-11-08',rows:[{day:'2026-11-08',event:'page_view',screen:'overview',device:'mobile',count:2}]};
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';

async function mount({telegram=false,failSend=false}={}){
 const calls=[];let clicked=0;
 const context={
  module:{exports:{}},exports:{},require,Intl,Date,console,Blob,Response,AbortController,AbortSignal,clearTimeout,
  setTimeout:(fn,ms)=>ms===60000?0:setTimeout(fn,ms),
  window:telegram?{Telegram:{WebApp:{initData:'signed'}}}:{},
  URL:{createObjectURL:()=> 'blob:telemetry',revokeObjectURL(){}},
  document:{body:{appendChild(){}},createElement:()=>({click(){clicked++;},remove(){}})},
  fetch:async(url,options)=>{
   calls.push({url,options});
   if(url==='/api/v1/admin/telemetry')return Response.json(report);
   if(url==='/api/v1/admin/telemetry/send')return failSend?Response.json({error:'Telegram не принял файл'},{status:503}):Response.json({sent:true});
   return Response.json({error:'Unexpected request'},{status:404});
  }
 };
 context.exports=context.module.exports;vm.runInNewContext(bundle,context);
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(context.module.exports.default));});
 return {view,calls,clicked:()=>clicked,button:()=>view.root.findAllByType('button').find(node=>text(node).includes('JSON'))};
}

test('Telegram Mini App export sends the report to the bot and confirms where to save it',async()=>{
 const app=await mount({telegram:true});
 try{
  assert.match(text(app.view.toJSON()),/Получить JSON в чате бота/);
  await act(async()=>{await app.button().props.onClick();});
  assert.equal(app.calls.filter(call=>call.url==='/api/v1/admin/telemetry/send').length,1);
  assert.equal(app.clicked(),0);
  assert.match(text(app.view.toJSON()),/JSON отправлен в чат бота/);
 }finally{app.view.unmount();}
});

test('Regular browser keeps direct JSON download without contacting Telegram',async()=>{
 const app=await mount();
 try{
  assert.match(text(app.view.toJSON()),/Скачать JSON/);
  await act(async()=>{await app.button().props.onClick();});
  assert.equal(app.clicked(),1);
  assert.equal(app.calls.filter(call=>call.url==='/api/v1/admin/telemetry/send').length,0);
  assert.match(text(app.view.toJSON()),/Скачивание начато/);
 }finally{app.view.unmount();}
});

test('Telegram send failure is visible and does not claim a saved export',async()=>{
 const app=await mount({telegram:true,failSend:true});
 try{
  await act(async()=>{await app.button().props.onClick();});
  assert.match(text(app.view.toJSON()),/Telegram не принял файл/);
  assert.doesNotMatch(text(app.view.toJSON()),/JSON отправлен в чат бота/);
  assert.equal(app.button().props.disabled,false);
 }finally{app.view.unmount();}
});
