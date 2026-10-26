import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';
import {putTransaction,transferMoney} from '../src/ledger.js';

const root=process.cwd(),out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'/tmp/burget-transfer-comparison');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const beforeSha=git('rev-parse',process.env.AUDIT_BEFORE_REF||'da5105f379aa2b690f5965fa5cf158fd644ce52b'),afterSha=git('rev-parse','HEAD');
const temporary=await mkdtemp(join(tmpdir(),'burget-transfers-')),oldRoot=join(temporary,'before'),date='2026-10-26';
let fixture=structuredClone(EMPTY);
fixture.settings={...fixture.settings,timeZone:'Europe/Moscow'};
fixture.accounts=[{id:'card',name:'Основная карта',balance:10000,currency:'RUB'},{id:'save',name:'Накопления на учёбу',balance:0,currency:'RUB',accType:'savings'}];
fixture=putTransaction(fixture,{id:'income',date,type:'income',cat:'income',accountId:'card',amount:1000,note:'Подработка'});
fixture=putTransaction(fixture,{id:'coffee',date,type:'expense',cat:'food',accountId:'card',amount:120,note:'Кофе'});
fixture=transferMoney(fixture,{id:'move-to-savings',date,from:'card',to:'save',amount:5000,fee:5,note:'Отложил на семестр'});
fixture=transferMoney(fixture,{id:'imported-move',date:'2026-10-25',from:'save',to:'card',amount:300,note:'Старая выписка',balanceEffect:'history-only'});
const unchanged=JSON.stringify(fixture);
let browser;
await mkdir(out,{recursive:true});
try{
 git('worktree','add','--detach',oldRoot,beforeSha);
 await symlink(join(root,'node_modules'),join(oldRoot,'node_modules'),'junction');
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [label,source,sha] of [['before',oldRoot,beforeSha],['after',root,afterSha]]){
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});await server.listen();
  const context=await browser.newContext({viewport:{width:390,height:1100},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU'});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date(date+'T09:00:00Z')});
   await page.route('https://telegram.org/**',route=>route.abort());
   await page.route('**/api/v1/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:{revision:1,data:structuredClone(fixture)}});});
   const origin='http://127.0.0.1:'+server.httpServer.address().port;
   await page.goto(origin);await page.locator('.home-recent').waitFor();
   assert.equal(await page.locator('[data-transfer-id]').count(),label==='after'?1:0);
   await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(out,'home-'+label+'-390.png'),fullPage:true,animations:'disabled'});
   await page.locator('.mini-nav').getByRole('button',{name:'История',exact:true}).click();
   for(const width of [390,1280]){
    await page.setViewportSize({width,height:1100});await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('[data-transfer-id]').count(),label==='after'?2:0);
    if(label==='after'){
     assert.match(await page.locator('[data-transfer-id="move-to-savings"]').textContent(),/Основная карта → Накопления на учёбу/);
     assert.match(await page.locator('[data-transfer-id="imported-move"]').textContent(),/остатки не изменены/);
     if(width===390)assert.match(await page.locator('.mini-day-label b').first().textContent(),/^875/);
    }
    const bounds=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.client+1,JSON.stringify(bounds));
    await page.screenshot({path:join(out,'history-'+label+'-'+width+'.png'),fullPage:true,animations:'disabled'});
   }
   if(label==='after'){
    await page.setViewportSize({width:390,height:1100});await page.locator('.history-type-tabs').getByRole('button',{name:'Переводы',exact:true}).click();
    assert.equal(await page.locator('[data-transfer-id]').count(),2);
    await page.getByLabel('Поиск операций',{exact:true}).fill('5 000');assert.equal(await page.locator('[data-transfer-id]').count(),1);
    await page.getByLabel('Поиск операций',{exact:true}).fill('');await page.screenshot({path:join(out,'filter-after-390.png'),fullPage:true,animations:'disabled'});
   }
   assert.deepEqual(errors,[]);assert.equal(JSON.stringify(fixture),unchanged);
   await writeFile(join(out,label+'.json'),JSON.stringify({sha,date,fixture,checks:{visibleTransfers:label==='after'?2:0,dayNetRub:875,expenseRub:125,incomeRub:1000}},null,2)+'\n');
  }finally{await context.close();await server.close();}
 }
 console.log(JSON.stringify({beforeSha,afterSha,out,checks:'Actual revisions, identical fictional ledger, mobile/desktop, 2 visible transfers, neutral day total, fee once, filters, unchanged balances, no page errors'}));
}finally{
 await browser?.close();try{git('worktree','remove','--force',oldRoot);}finally{await rm(temporary,{recursive:true,force:true});}
}
