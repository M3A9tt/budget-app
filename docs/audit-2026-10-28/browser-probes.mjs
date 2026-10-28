// Real 4.6.3 UI; no production service, credentials or personal profiles.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {EMPTY} from '../../src/mini-model.js';
import {putTransaction} from '../../src/ledger.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=fileURLToPath(new URL('./',import.meta.url)),date='2026-10-28',observations=[];
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Проверочный счёт',balance:1000,currency:'RUB'}],settings:{...EMPTY.settings,timeZone:'Europe/Moscow',telemetryEnabled:false}});
await mkdir(out,{recursive:true});const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
let browser;
async function session(run){browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});const context=await browser.newContext({viewport:{width:390,height:1000},locale:'ru-RU',deviceScaleFactor:1,isMobile:true,hasTouch:true});try{const page=await context.newPage();await page.clock.install({time:new Date(date+'T09:00:00Z')});await page.route('**/fonts.googleapis.com/**',r=>r.abort());await page.route('**/telegram.org/**',r=>r.abort());await run(page,context);}finally{await context.close();await browser.close();}}
const snap=(page,name)=>page.screenshot({path:out+name+'.png',fullPage:true,animations:'disabled'});
try{
 await session(async page=>{
  await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'fictional-audit-init-data',platform:'android'}};});
  await page.route('**/api/v1/**',r=>r.fulfill({status:503,json:{error:'Сервер временно недоступен'}}));await page.goto(origin);await page.getByRole('heading',{name:'Вернёмся к бюджету'}).waitFor();
  const text=await page.locator('.auth-gate').textContent();assert.match(text,/Сеанс входа завершился/);assert.ok(!text.includes('Сервер временно недоступен'));await snap(page,'auth-503-misdiagnosed');observations.push({id:'auth-diagnostic',serverStatus:503,displayed:'Сеанс входа завершился',actualErrorVisible:false});
 });
 await session(async page=>{
  let release,entered;const reached=new Promise(r=>entered=r),gate=new Promise(r=>release=r);await page.route('**/telegram.org/js/telegram-web-app.js',async route=>{entered();await gate;await route.abort();});await page.route('**/api/v1/**',r=>r.fulfill({json:{revision:1,data:base(),isOwner:false}}));
  await page.goto(origin,{waitUntil:'commit'});await reached;let ready=false;try{await page.locator('.mini-shell').waitFor({timeout:2000});ready=true;}catch{}
  assert.equal(ready,false);observations.push({id:'blocking-sdk',sdkHeldMs:2000,appReadyWhileSdkBlocked:false});release();await page.locator('.mini-shell').waitFor();
 });
 await session(async page=>{
  let writes=0;await page.route('**/api/v1/**',r=>{if(r.request().method()==='PUT')writes++;return r.fulfill({json:{revision:1,data:base(),isOwner:false}});});await page.goto(origin);await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();await page.locator('#amount').fill('180');await page.getByLabel('Комментарий',{exact:true}).fill('Незавершённая покупка');await snap(page,'draft-before-reload');await page.reload();await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();assert.equal(await page.locator('#amount').inputValue(),'');assert.equal(writes,0);await snap(page,'draft-after-reload');observations.push({id:'draft-persistence',beforeReload:'180',afterReload:'',financialWrites:0});
 });
 await session(async page=>{
  let state=putTransaction(base(),{id:'today-expense',type:'expense',cat:'food',amount:100,date,accountId:'bank',note:'Покупка после даты сверки'}),revision=1;
  await page.route('**/api/v1/**',r=>{if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.expectedRevision,revision);state=body.data;revision++;}return r.fulfill({json:{revision,data:state,isOwner:false}});});
  await page.goto(origin);await page.locator('.mini-nav').getByRole('button',{name:'Ещё',exact:true}).click();await page.locator('.account-tile').click();await page.locator('input[name=balance]').fill('1000');await page.locator('input[name=date]').fill('2026-10-01');await snap(page,'historical-reconcile-before');await page.getByRole('button',{name:'Подтвердить остаток',exact:true}).click();await page.locator('.account-action-panel').waitFor({state:'detached'});assert.equal(state.accounts[0].balance,1000);assert.equal(state.transactions[0].amount,100);await snap(page,'historical-reconcile-after');observations.push({id:'historical-reconciliation-ui',beforeBalance:900,selectedDate:'2026-10-01',enteredSnapshot:1000,afterBalance:state.accounts[0].balance,preservedExpense:state.transactions[0].amount});
 });
 await writeFile(out+'browser-evidence.json',JSON.stringify({sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),date,viewport:{width:390,height:1000},fictional:true,observations},null,2)+'\n');console.log(JSON.stringify(observations,null,2));
}finally{await browser?.close();await server.close();}
