import {createServer} from 'vite';
const server=await createServer({root:process.cwd(),server:{host:'127.0.0.1',port:0}});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
import {chromium} from 'playwright-core';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {putTransaction} from '../src/ledger.js';
import fs from 'node:fs';import assert from 'node:assert/strict';
const screenshotDir=process.env.BROWSER_SCREENSHOT_DIR||'/tmp/burget-browser-qa';
const today=todayMoscow(),future=new Date(today+'T12:00:00Z');future.setUTCDate(future.getUTCDate()+7);
let browser;
try{
browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote'],headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
let data=structuredClone(EMPTY),revision=1;data.settings={...data.settings,modules:{lunch:true},nextIncomeDate:future.toISOString().slice(0,10)};
data.accounts=[{id:'sber',name:'Сбер',balance:0,currency:'RUB'},{id:'alpha',name:'Альфа',balance:5405.2,currency:'RUB'},{id:'yandex',name:'Яндекс',balance:694,currency:'RUB'},{id:'edu',name:'Учёба',balance:35086.66,currency:'RUB',accType:'savings'}];
data=putTransaction(data,{id:'meal',type:'lunch',cat:'lunch',date:today,amount:350,note:'Суп, салат и горячее'});
data=putTransaction(data,{id:'topup',type:'expense',cat:'food',date:today,amount:50,accountId:'yandex',lunchId:'meal',note:'Доплата за обед',tags:['обед-за-свои']});
data.reconciliations=[{id:'r',accountId:'alpha',date:today,before:5000,after:5405.2,note:'По приложению банка'}];
await page.route('**/api/v1/**',async route=>{if(route.request().method()==='PUT'){const body=route.request().postDataJSON();assert.equal(body.expectedRevision,revision);data=body.data;revision++;}await route.fulfill({json:{revision,data}});});
fs.mkdirSync(screenshotDir,{recursive:true});
const checkOverflow=async label=>{const size=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));if(size.scroll>size.client+1){console.log(label,await page.evaluate(()=>[...document.querySelectorAll('*')].map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(x=>x.right>document.documentElement.clientWidth+1).slice(0,30)));await page.screenshot({path:screenshotDir+'/overflow-'+label.replace(/ /g,'-')+'.png',fullPage:true});}assert.ok(size.scroll<=size.client+1,label+': '+JSON.stringify(size));};
await page.goto(origin);await page.getByRole('button',{name:/Можно потратить:.*Посмотреть состав/}).click();await page.locator('#spendable-breakdown').waitFor();await checkOverflow('expanded hero');await page.screenshot({path:screenshotDir+'/01-spendable-390.png',fullPage:true});
await page.getByRole('button',{name:'Все счета',exact:false}).click();await page.locator('.account-grid').waitFor();assert.equal(await page.locator('.account-tile h3').allTextContents().then(x=>x.join(',')),'Альфа,Яндекс');await page.screenshot({path:screenshotDir+'/02-accounts-390.png',fullPage:true});
await page.getByRole('button',{name:/Нулевые/}).click();assert.deepEqual(await page.locator('.account-tile h3').allTextContents(),['Сбер']);await checkOverflow('zero accounts');
await page.locator('.account-history summary').click();await page.screenshot({path:screenshotDir+'/03-account-history-390.png',fullPage:true});
await page.goto(origin+'/?lunch=1');await page.getByRole('button',{name:today+' · блюда и стоимость'}).click();await page.getByText('Суп, салат и горячее').waitFor();assert.equal(await page.locator('.lunch-day-record').count(),2);await checkOverflow('lunch day');await page.screenshot({path:screenshotDir+'/04-lunch-day-390.png',fullPage:true});
await page.locator('.lunch-day-record').first().getByRole('button',{name:'Доплата',exact:true}).click();await page.locator('#amount').fill('20');await page.getByRole('button',{name:/Яндекс.*644/}).click();await page.getByRole('button',{name:/Записать.*20/}).click();await page.locator('.lunch-day').waitFor();assert.equal(data.transactions.length,3);assert.equal(data.transactions.at(-1).lunchId,'meal');assert.equal(data.accounts.find(a=>a.id==='yandex').balance,624);
await page.locator('.lunch-day-record').first().getByRole('button',{name:'Изменить или удалить'}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.locator('.lunch-day').waitFor();assert.equal(data.transactions.length,0);assert.equal(data.accounts.find(a=>a.id==='yandex').balance,694);assert.equal(await page.locator('.lunch-day-record').count(),0);
await page.getByRole('button',{name:'К таблице'}).click();await page.locator('.lunch-legend summary').click();await page.screenshot({path:screenshotDir+'/05-lunch-guide-390.png',fullPage:true});
for(const width of [320,360,430,768,1280]){await page.setViewportSize({width,height:900});await page.goto(origin+'/?lunch=1');await page.locator('.lunch-legend summary').click();await checkOverflow('guide '+width);await page.goto(origin);await page.getByRole('button',{name:/Можно потратить:.*Посмотреть состав/}).click();await checkOverflow('hero '+width);await page.screenshot({path:screenshotDir+'/hero-'+width+'.png',fullPage:true});}
assert.deepEqual(errors,[]);console.log('PASS: real Chromium: disclosure, zero tabs, day details, linked deletion/refund, history, overflow at 320/360/390/430/768/1280px; no page errors.');
}finally{await browser?.close();await server.close();}
