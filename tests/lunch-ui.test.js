import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EMPTY,CATEGORIES} from '../src/mini-model.js';
const require=createRequire(import.meta.url);
const bundle=buildSync({stdin:{contents:"export {default as LunchPage} from './src/LunchPage.jsx';export {default as SettingsPage} from './src/SettingsPage.jsx';export {default as MiniApp} from './src/MiniApp.jsx';",resolveDir:new URL('..',import.meta.url).pathname,loader:'jsx'},bundle:true,write:false,loader:{'.css':'empty'},format:'cjs',platform:'node',external:['react','react-dom'],define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
function components(search=''){const context={module:{exports:{}},exports:{},require,Intl,Date,console,location:{search},URLSearchParams,structuredClone};context.exports=context.module.exports;vm.runInNewContext(bundle,context);return context.module.exports;}
test('Settings initially show only the category menu, with no long import or reminder forms',()=>{
 const {SettingsPage}=components(),html=renderToStaticMarkup(React.createElement(SettingsPage,{data:structuredClone(EMPTY),cats:CATEGORIES,busy:false,demo:true,mutate:async()=>true,onUpdates:()=>{}}));
 for(const label of ['Твой Бюрджет','Твой ритм','Бюджет и лимиты','Импорт операций','Резервные копии','Свои категории','Обратная связь'])assert.ok(html.includes(label));
 assert.ok(!html.includes('<form'));assert.ok(!html.includes('<input'));assert.ok(!html.includes('<textarea'));
 assert.ok((html.match(/<svg/g)||[]).length>=14);
});
test('Lunch deep link renders the separate monthly budget and direct panel tab',async()=>{
 const {MiniApp}=components('?lunch=1&demo=1');const {renderToPipeableStream}=await import('react-dom/server');const {Writable}=await import('node:stream');let html='';await new Promise((resolve,reject)=>{const sink=new Writable({write(chunk,encoding,done){html+=chunk.toString();done();}});sink.on('finish',resolve);const stream=renderToPipeableStream(React.createElement(MiniApp),{onAllReady(){stream.pipe(sink);},onError:reject});});
 assert.ok(html.includes('data-page="lunch"'));assert.ok(html.includes('Профицит'));assert.ok(html.includes('JSON'));assert.ok(html.includes('Посчитать'));assert.ok(html.includes('<table'));for(const label of ['Доступно','Потрачено','± день','Баланс'])assert.ok(html.includes(label));assert.ok(!html.includes('<textarea'));assert.ok(!html.includes('<form'));assert.ok(html.includes('aria-current="page"'));assert.ok(html.includes('<span>Обеды</span>'));
 assert.ok(!html.includes('<details open'));assert.ok(!html.includes('lunch-json-example'));
});

test("Table summary labels a negative balance as deficit",()=>{const {LunchPage}=components(),d=structuredClone(EMPTY);d.transactions=[{id:"test",date:"2026-10-01",type:"lunch",cat:"lunch",currency:"RUB",amount:100000}];const html=renderToStaticMarkup(React.createElement(LunchPage,{data:d,mutate:async()=>true,busy:false,onAdd:()=>{},onEdit:()=>{}}));assert.ok(html.includes("Дефицит"));assert.ok(html.includes("lunch-table"));});
