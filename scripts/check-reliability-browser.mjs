import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {createInstallment,payInstallment} from '../src/finance-tools.js';
import {createPlanned} from '../src/planned-operations.js';
import {putTransaction,transferMoney} from '../src/ledger.js';
const root=process.env.AUDIT_APP_ROOT||process.cwd(),before=process.env.AUDIT_BASELINE==='1',label=before?'before':'after';
const dir=process.env.AUDIT_SCREENSHOT_DIR||path.join(process.cwd(),'docs/audit-4.7.0');await mkdir(dir,{recursive:true});
const today=todayMoscow(),offset=n=>new Date(Date.parse(today+'T12:00Z')+n*86400000).toISOString().slice(0,10);
let fixture={...structuredClone(EMPTY),accounts:[{id:'a',name:'Основная карта',balance:2000,currency:'RUB'},{id:'b',name:'Наличные',balance:0,currency:'RUB'}],settings:{...EMPTY.settings,timeZone:'Europe/Moscow',modules:{lunch:true,plans:true,installments:true},dailyReport:false,weeklyReport:false,monthlyReport:false},lunchAnswers:{[today]:{status:'skipped',reason:'Не заказал'}}};
fixture=createInstallment(fixture,{id:'split',name:'Проверочный сплит',total:600,count:2,firstDate:offset(-14),cadence:'biweekly',accountId:'a'});
fixture=payInstallment(fixture,{planId:'split',paymentId:fixture.installments[0].payments[0].id,date:offset(-14)});
fixture=createPlanned(fixture,{id:'housing',name:'ЖКХ',amount:200,type:'expense',frequency:'monthly',startDate:today,accountId:'a',cat:'housing'});
fixture=putTransaction(fixture,{id:'coffee',type:'expense',cat:'food',amount:180,date:offset(-1),accountId:'a',note:'Кофе'});
fixture=transferMoney(fixture,{id:'move',from:'a',to:'b',amount:100,fee:5,date:today,note:'На наличные'});
await writeFile(path.join(dir,'fixture.json'),JSON.stringify({today,data:fixture},null,2));
const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
let browser;const results=[];
try{
 const launch=()=>chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote'],headless:true});browser=await launch();
 const context=await browser.newContext({viewport:{width:390,height:1000},locale:'ru-RU'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
 let data=structuredClone(fixture),revision=1,status=200,userId='fictional-qa';
 await page.route('**/api/v1/**',async route=>{
  if(route.request().method()==='PUT'){const payload=route.request().postDataJSON();assert.equal(payload.expectedRevision,revision);data=payload.data;revision++;return route.fulfill({json:{revision}});}
  if(status!==200)return route.fulfill({status,json:{error:'Сервер временно недоступен'}});
  return route.fulfill({json:{revision,data,userId,isOwner:false}});
 });
 await page.goto(origin);await page.locator('.budget-clear').waitFor();
 await page.screenshot({path:path.join(dir,label+'-home.png'),fullPage:true});
 if(!before){
  await page.getByRole('button',{name:'Что требует внимания',exact:true}).click();
  const section=page.getByRole('heading',{name:'Что требует внимания',exact:true}).locator('..');
  const housing=section.locator('article').filter({has:page.getByText('ЖКХ',{exact:true})});
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'attention overflow '+width);await page.screenshot({path:path.join(dir,'after-attention-'+width+'.png'),fullPage:true});}
  await page.setViewportSize({width:390,height:1000});const balances=structuredClone(data.accounts);
  await housing.getByRole('button',{name:'Перенести',exact:true}).click();await housing.getByLabel('Новая дата',{exact:true}).fill(offset(2));await housing.locator('form').getByRole('button',{name:'Перенести',exact:true}).click();
  await page.waitForFunction(({date})=>document.body.textContent.includes(date),{date:offset(2)});assert.deepEqual(data.accounts,balances);assert.equal(data.recurring[0].dateOverrides[today.slice(0,7)],offset(2));assert.equal(data.recurring[0].dueDay,Number(today.slice(-2)));
  await page.screenshot({path:path.join(dir,'after-housing-moved.png'),fullPage:true});
  results.push({scenario:'housing-move',balancesUnchanged:true,anchor:data.recurring[0].dueDay,date:offset(2)});
  await housing.getByRole('button',{name:'Оплатил',exact:true}).click();await page.locator('#amount').waitFor();await page.getByRole('button',{name:/Записать.*200/}).click();await page.locator('.budget-clear').waitFor();assert.equal(data.transactions.filter(t=>t.recurringId==='housing').length,1);assert.equal(data.accounts[0].balance,balances[0].balance-200);
  await page.locator('.mini-nav').getByRole('button',{name:'История',exact:true}).click();await page.getByLabel('Поиск операций',{exact:true}).fill('Проверочный сплит');await page.locator('.mini-tx').first().click();
  await page.getByRole('button',{name:'Следующий платёж',exact:true}).click();await page.locator('#amount').waitFor();assert.equal(await page.locator('#amount').inputValue(),'300');await page.getByRole('button',{name:/Записать.*300/}).click();
  assert.equal(data.transactions.filter(t=>t.installmentPaymentId).length,2);results.push({scenario:'repeat-installment',linkedPayments:2,accountBalance:data.accounts[0].balance});
 }
 // Capture transfer visibility on both revisions, using a fresh identical profile.
 data=structuredClone(fixture);revision++;await page.goto(origin);await page.locator('.budget-clear').waitFor();await page.locator('.mini-nav').getByRole('button',{name:'История',exact:true}).click();await page.locator('.history-type-tabs').getByRole('button',{name:'Переводы',exact:true}).click();
 await page.screenshot({path:path.join(dir,label+'-transfer.png'),fullPage:true});
 if(!before){
  await page.locator('[data-transfer-id="move"]').click();await page.locator('.transfer-form').waitFor();await page.locator('[name=amount]').fill('200');await page.locator('[name=fee]').fill('10');await page.screenshot({path:path.join(dir,'after-transfer-preview.png'),fullPage:true});await page.getByRole('button',{name:'Сохранить перевод',exact:true}).click();await page.locator('.transfer-form').waitFor({state:'detached'});assert.deepEqual(data.accounts.map(a=>a.balance),[1310,200]);assert.equal(data.transactions.filter(t=>t.transferId==='move').length,1);
  await page.locator('[data-transfer-id="move"]').click();await page.locator('.transfer-form').waitFor();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Отменить перевод и комиссию',exact:true}).click();await page.locator('.transfer-form').waitFor({state:'detached'});assert.deepEqual(data.accounts.map(a=>a.balance),[1520,0]);assert.equal(data.transfers.length,0);results.push({scenario:'transfer-edit-and-reverse',balances:data.accounts.map(a=>a.balance),fees:data.transactions.filter(t=>t.transferId).length});
 }
 // Draft reload is observed on both revisions; financial data stays untouched.
 await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();await page.locator('#amount').waitFor();await page.locator('#amount').fill('180');await page.getByLabel('Комментарий',{exact:true}).fill('Незавершённый ввод');await page.screenshot({path:path.join(dir,label+'-draft-before-reload.png'),fullPage:true});const savedCount=data.transactions.length;await page.reload();await page.locator('.budget-clear').waitFor();
 if(!before){await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.locator('#amount').waitFor();assert.equal(await page.locator('#amount').inputValue(),'180');assert.equal(await page.getByLabel('Комментарий',{exact:true}).inputValue(),'Незавершённый ввод');}else{await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();await page.locator('#amount').waitFor();assert.equal(await page.locator('#amount').inputValue(),'');}
 assert.equal(data.transactions.length,savedCount);await page.screenshot({path:path.join(dir,label+'-draft-after-reload.png'),fullPage:true});results.push({scenario:'draft-reload',preserved:!before,financialWrites:0});
 if(!before){userId='fictional-other';await page.getByRole('button',{name:'Обновить данные',exact:true}).click();await page.locator('.budget-clear').waitFor();assert.equal(await page.locator('#amount').count(),0);assert.equal(await page.getByRole('heading',{name:'Новая запись',exact:true}).count(),0);results.push({scenario:'profile-change',oldDraftCleared:true});}
 await context.close();
 if(!before){
  await browser.close();browser=await launch();const failure=await browser.newContext({viewport:{width:390,height:1000}});await failure.addInitScript(()=>window.Telegram={WebApp:{initData:'fictional',platform:'android',ready(){},expand(){}}});const p=await failure.newPage();await p.route('https://telegram.org/**',r=>r.fulfill({body:''}));await p.route('**/api/v1/state',r=>r.fulfill({status:503,json:{error:'Сервер временно недоступен'}}));await p.goto(origin);await p.getByText('Сервер временно недоступен',{exact:true}).waitFor();assert.equal(await p.getByText(/Сеанс входа завершился/).count(),0);await p.screenshot({path:path.join(dir,'after-auth-503.png'),fullPage:true});await failure.close();
  await browser.close();browser=await launch();const sdk=await browser.newContext({viewport:{width:390,height:1000}}),p2=await sdk.newPage();let release;const gate=new Promise(resolve=>release=resolve);await p2.route('https://telegram.org/**',async r=>{await gate;await r.fulfill({body:'window.Telegram={WebApp:{initData:"fictional",platform:"android",ready(){},expand(){}}}',contentType:'application/javascript'});});await p2.route('**/api/v1/state',r=>r.fulfill({json:{data:fixture,revision:1,userId:'fictional-sdk'}}));await p2.goto(origin+'#tgWebAppVersion=8.0',{waitUntil:'domcontentloaded'});await p2.locator('.mini-shell').waitFor();assert.equal(await p2.getByRole('heading',{name:'Открываем бюджет…',exact:true}).count(),1);await p2.screenshot({path:path.join(dir,'after-sdk-wait.png'),fullPage:true});release();await p2.locator('.budget-clear').waitFor();await sdk.close();results.push({scenario:'auth-and-sdk',diagnostic503:true,shellBeforeSDK:true});
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,label+'-browser-results.json'),JSON.stringify({today,fictional:true,baseline:before,results,pageErrors:errors},null,2));console.log(label+': reliability Chromium passed');
}finally{await browser?.close();await server.close();}
