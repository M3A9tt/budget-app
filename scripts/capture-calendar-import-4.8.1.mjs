import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
const output=path.resolve('docs/audit-4.8.1');await mkdir(output,{recursive:true});
const today=todayMoscow(),data={...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',currency:'RUB',balance:895},{id:'b',name:'Наличные',currency:'RUB',balance:100}],transfers:[{id:'move',from:'a',to:'b',amount:100,fee:5,date:today,currency:'RUB'}],transactions:[{id:'fee',transferId:'move',type:'expense',cat:'other',amount:5,amountRub:5,currency:'RUB',accountId:'a',date:today,note:'Комиссия'}]};
await writeFile(path.join(output,'fixture.json'),JSON.stringify({today,data},null,2));
const launch=()=>chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
for(const [label,root] of [['before',process.argv[2]],['after',process.cwd()]]){
 const browser=await launch();
 const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
 try{const page=await browser.newPage({viewport:{width:390,height:1100},locale:'ru-RU'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="background:#111418;color:#eef2f0"><div class="mini-app"><main class="mini-main" id="root"></main></div><script type="module">import React from 'react';import{createRoot}from 'react-dom/client';import Calendar from '/src/MoneyCalendar.jsx';import Panel from '/src/JsonImportPanel.jsx';import '/src/mini.css';import '/src/insights.css';import '/src/report.css';import '/src/calendar.css';const data=${JSON.stringify(data)};const root=createRoot(document.getElementById('root'));window.show=mode=>root.render(React.createElement(mode==='calendar'?Calendar:Panel,{data,initialDate:'${today}',onEdit:t=>window.edited=t,mutate:()=>{throw Error('Unexpected write')}}));window.show('calendar');</script></body></html>`;
 await writeFile(path.join(root,'qa-481.html'),html);await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa-481.html');await page.getByRole('heading',{name:'Календарь денег'}).waitFor();
 if(label==='after'){await page.getByRole('button',{name:/Карта → Наличные/}).click();assert.equal(await page.evaluate(()=>window.edited.id),'move');}
 await page.screenshot({path:path.join(output,label+'-calendar.png'),fullPage:true});
 await page.evaluate(()=>window.show('import'));await page.getByRole('heading',{name:'Скриншоты → ChatGPT → JSON'}).waitFor();
 await page.getByPlaceholder('{', {exact:false}).count().catch(()=>0);
 await page.locator('textarea').fill(JSON.stringify({format:'burget-operations',version:1,operations:[null,{date:today,type:'expense',amount:180,currency:'RUB',account:'a',category:'food',note:'Кофе'}]}));await page.getByRole('button',{name:'Проверить и исправить'}).click();
 if(label==='after'){await page.getByLabel('Только ошибки и дубли').check();assert.equal(await page.locator('.json-import-row').count(),1);assert.equal(await page.getByRole('button',{name:'Скачать исправленный JSON'}).isDisabled(),true);}
 await page.screenshot({path:path.join(output,label+'-import.png'),fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }finally{await browser.close();await server.close();await rm(path.join(root,'qa-481.html'),{force:true});}
}
console.log('Calendar transfer callback, import filter and before/after screenshots passed');
