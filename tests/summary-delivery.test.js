import test from 'node:test';
import assert from 'node:assert/strict';
import {sendSummary} from '../server/summary-delivery.js';
import {periodSummaryData,periodSummary} from '../server/period-summary.js';
import {EMPTY} from '../src/mini-model.js';
const report={from:'2026-10-12',to:'2026-10-18',title:'Итог недели',text:'Полный текст\n'+('Подробности '.repeat(150)),visual:true};
test('Summary delivers photo before complete text and retries text without repeating photo',async()=>{
 const calls=[],progress={};let fail=true;
 const options={progress,picture:async()=>({}),upload:async()=>calls.push('photo'),checkpoint:async p=>{assert.equal(p.photoSent,true);calls.push('checkpoint');}};
 const send=async(e,method,body)=>{calls.push('text');assert.equal(body.text,report.text);if(fail)throw Error('Telegram unavailable');};
 await assert.rejects(sendSummary({BROWSER:{}},'1',{},report,send,options));fail=false;
 await sendSummary({BROWSER:{}},'1',{},report,send,options);
 assert.deepEqual(calls,['photo','checkpoint','text','text']);
});
test('Rendering and upload failures preserve full text; monthly reports stay textual',async()=>{
 for(const broken of ['render','upload','unavailable','month']){
  const calls=[];await sendSummary(broken==='unavailable'?{}:{BROWSER:{}},'1',{}, {...report,visual:broken!=='month'},async(e,m,b)=>{calls.push('text');assert.equal(b.text,report.text);},{picture:async()=>{calls.push('render');if(broken==='render')throw Error('quota');return {};},upload:async()=>{calls.push('upload');throw Error('delivery');}});
  assert.equal(calls.at(-1),'text');if(['month','unavailable'].includes(broken))assert.deepEqual(calls,['text']);
 }
});
test('Shared summary model separates corporate lunches and transfers and uses historical currency rates',()=>{
 const d=structuredClone(EMPTY);d.accounts=[{id:'a',name:'Банк',balance:1000},{id:'b',name:'Вклад',balance:500,savingsKind:'deposit'}];
 d.transactions=[{date:report.to,type:'expense',cat:'food',amount:10,currency:'USD',amountRub:800},{date:report.to,type:'lunch',amount:400,currency:'RUB'},{date:report.to,type:'income',amount:200,currency:'RUB'},{date:report.to,type:'transfer',amount:100,currency:'RUB'}];
 const r=periodSummaryData(d,report.from,report.to,report.title);assert.equal(r.expense,800);assert.equal(r.income,200);assert.equal(r.lunch,400);assert.equal(r.actual,1000);assert.equal(r.savings,500);assert.equal(r.categories[0].value,r.expense);
 assert.match(periodSummary(d,report.from,report.to,report.title),/Обеды за счёт компании/);
});
