import {createServer} from 'vite';
const server=await createServer({root:process.cwd(),server:{host:'127.0.0.1',port:0}});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
import {chromium} from 'playwright-core';
import {build} from 'esbuild';
import {EMPTY,demoData,todayMoscow} from '../src/mini-model.js';
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
await page.getByRole('button',{name:/Показать нулевые/}).click();assert.deepEqual(await page.locator('.account-tile h3').allTextContents(),['Альфа','Яндекс','Сбер']);await checkOverflow('zero accounts');
// Switching account tiles must retarget the actual reconciliation form.
await page.locator('.account-tile').filter({hasText:'Альфа'}).click();assert.equal(await page.locator('select[name=accountId]').inputValue(),'alpha');
await page.locator('.account-tile').filter({hasText:'Яндекс'}).click();assert.equal(await page.locator('select[name=accountId]').inputValue(),'yandex');
await page.getByRole('button',{name:'Закрыть действие',exact:true}).click();
await page.locator('.account-history summary').click();await page.screenshot({path:screenshotDir+'/03-account-history-390.png',fullPage:true});
await page.goto(origin+'/?lunch=1');await page.getByRole('button',{name:today+' · блюда и стоимость'}).click();await page.getByText('Суп, салат и горячее').waitFor();assert.equal(await page.locator('.lunch-day-record').count(),2);await checkOverflow('lunch day');await page.screenshot({path:screenshotDir+'/04-lunch-day-390.png',fullPage:true});
await page.locator('.lunch-day-record').first().getByRole('button',{name:'Доплата',exact:true}).click();await page.locator('#amount').fill('20');await page.getByRole('button',{name:/Яндекс.*644/}).click();await page.getByRole('button',{name:/Записать.*20/}).click();await page.locator('.lunch-day').waitFor();assert.equal(data.transactions.length,3);assert.equal(data.transactions.at(-1).lunchId,'meal');assert.equal(data.accounts.find(a=>a.id==='yandex').balance,624);
await page.locator('.lunch-day-record').first().getByRole('button',{name:'Изменить или удалить'}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.locator('.lunch-day').waitFor();assert.equal(data.transactions.length,0);assert.equal(data.accounts.find(a=>a.id==='yandex').balance,694);assert.equal(await page.locator('.lunch-day-record').count(),0);
await page.getByRole('button',{name:'К таблице'}).click();await page.locator('.lunch-legend summary').click();await page.screenshot({path:screenshotDir+'/05-lunch-guide-390.png',fullPage:true});
for(const width of [320,360,430,768,1280]){await page.setViewportSize({width,height:900});await page.goto(origin+'/?lunch=1');await page.locator('.lunch-legend summary').click();await checkOverflow('guide '+width);await page.goto(origin);await page.getByRole('button',{name:/Можно потратить:.*Посмотреть состав/}).click();await checkOverflow('hero '+width);await page.screenshot({path:screenshotDir+'/hero-'+width+'.png',fullPage:true});}
// 4.0: analytical drilldown, a changed planned payment and shared event removal.
await page.setViewportSize({width:390,height:844});
const past=days=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
data=putTransaction(data,{id:'report-food',type:'expense',cat:'food',amount:120,date:today,accountId:'alpha',note:'Продукты для отчёта'});
data=putTransaction(data,{id:'report-income',type:'income',cat:'income',amount:1000,date:today,accountId:'alpha',note:'Доход для отчёта'});
data=putTransaction(data,{id:'report-before',type:'expense',cat:'food',amount:60,date:past(-31),accountId:'alpha',note:'Прошлые продукты'});
data.recurring=[{id:'calendar-bill',name:'Тестовый платёж',active:true,type:'expense',frequency:'once',startDate:today,amount:100,currency:'RUB',accountId:'alpha',cat:'housing'},{id:'calendar-income',name:'Ожидаемый доход',active:true,type:'income',frequency:'once',startDate:past(3),amount:500,currency:'RUB',accountId:'alpha'}];
await page.goto(origin);await page.locator('.mini-nav').getByRole('button',{name:'Анализ',exact:true}).click();await page.locator('.report-spending-hero').waitFor();await checkOverflow('report 390');assert.equal(await page.locator('.report-category').count(),1);await page.screenshot({path:screenshotDir+'/06-analytics-390.png',fullPage:true});
await page.locator('.report-income-row').getByRole('button').click();await page.locator('[data-page="history"]').waitFor();await page.getByText('Доход для отчёта',{exact:true}).waitFor();assert.equal(await page.getByText('Продукты для отчёта',{exact:true}).count(),0);await page.getByRole('button',{name:'К аналитике',exact:true}).click();
await page.getByRole('button',{name:'7 дней',exact:true}).click();await page.locator('.report-category').first().click();await page.getByText('Продукты для отчёта',{exact:true}).waitFor();assert.equal(await page.getByText('Прошлые продукты',{exact:true}).count(),0);await page.getByRole('button',{name:'К аналитике',exact:true}).click();assert.equal(await page.getByRole('button',{name:'7 дней',exact:true}).getAttribute('aria-pressed'),'true');
await page.getByRole('button',{name:/Что впереди/}).click();await page.locator('.money-calendar').waitFor();await checkOverflow('calendar 390');await page.screenshot({path:screenshotDir+'/07-calendar-390.png',fullPage:true});
const beforePayment=data.accounts.find(a=>a.id==='alpha').balance;
await page.getByRole('button',{name:/Тестовый платёж/}).click();await page.getByRole('button',{name:'Сумма другая',exact:true}).click();await page.locator('#amount').fill('125');await page.getByRole('button',{name:/Записать.*125/}).click();await page.locator('.money-calendar').waitFor();assert.equal(data.accounts.find(a=>a.id==='alpha').balance,beforePayment-125);assert.equal(data.transactions.filter(t=>t.recurringId==='calendar-bill').length,1);assert.equal(await page.locator('.money-event').filter({hasText:'Тестовый платёж'}).count(),0);
for(const width of [320,360,430,768,1280]){
 await page.setViewportSize({width,height:900});await checkOverflow('calendar '+width);await page.screenshot({path:screenshotDir+'/calendar-'+width+'.png',fullPage:true});
 await page.getByRole('button',{name:'Куда ушли',exact:true}).click();await checkOverflow('report '+width);await page.screenshot({path:screenshotDir+'/analytics-'+width+'.png',fullPage:true});await page.getByRole('button',{name:/Что впереди/}).click();
}
// 4.1: calendar state survives actual confirmation outside the default horizon.
await page.setViewportSize({width:390,height:844});
data.settings.modules={...data.settings.modules,plans:true,installments:true};
data.recurring.push({id:'later-bill',name:'Дальний платёж',active:true,type:'expense',frequency:'once',startDate:past(10),amount:80,currency:'RUB',accountId:'alpha',cat:'housing'});
data.installments=[{id:'qa-split',name:'Сплит для проверки',total:300,accountId:'alpha',currency:'RUB',cat:'tech',payments:[{id:'qa-part',amount:300,date:today}]}];
await page.goto(origin);await page.locator('.mini-nav').getByRole('button',{name:'Анализ',exact:true}).click();await page.getByRole('button',{name:/Что впереди/}).click();
await page.getByRole('button',{name:'Месяц',exact:true}).click();await page.getByRole('checkbox',{name:/Учесть ожидаемые доходы/}).check();
await page.getByRole('button',{name:new RegExp('^'+past(10)+' ·')}).click();await page.getByRole('button',{name:/Дальний платёж/}).click();await page.getByRole('button',{name:'Сумма другая',exact:true}).click();await page.locator('#amount').fill('77');await page.getByRole('button',{name:/Записать.*77/}).click();await page.locator('.money-calendar').waitFor();
assert.equal(await page.getByRole('button',{name:'Месяц',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:new RegExp('^'+past(10)+' ·')}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('checkbox',{name:/Учесть ожидаемые доходы/}).isChecked(),true);
// The same transfer form accepts one-line input and keeps a zero destination.
await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();await page.getByRole('button',{name:'Одной строкой',exact:true}).click();await page.locator('#quick').fill('Перевод 50 Альфа → Учёба');await page.getByRole('button',{name:'Проверить запись',exact:true}).click();await page.locator('.transfer-form').waitFor();
const sourceBefore=data.accounts.find(a=>a.id==='alpha').balance,targetBefore=data.accounts.find(a=>a.id==='edu').balance,transferCount=data.transfers.length;
assert.equal(await page.locator('select[name=from]').inputValue(),'alpha');assert.equal(await page.locator('select[name=to]').inputValue(),'edu');await page.locator('input[name=fee]').fill('2');await checkOverflow('transfer 390');await page.screenshot({path:screenshotDir+'/08-transfer-390.png',fullPage:true});
await page.getByRole('button',{name:'Подтвердить перевод',exact:true}).click();await page.locator('.transfer-form').waitFor({state:'detached'});assert.equal(data.accounts.find(a=>a.id==='alpha').balance,sourceBefore-52);assert.equal(data.accounts.find(a=>a.id==='edu').balance,targetBefore+50);assert.equal(data.transfers.length,transferCount+1);assert.equal(data.transactions.at(-1).amount,2);
// Installment review accepts a partial sum and returns to the same section.
await page.goto(origin+'/?payments=1');await page.getByRole('button',{name:'До погашения',exact:true}).click();await page.getByRole('button',{name:/Кредиты, сплит, рассрочки/}).click();
const beforeSplit=data.accounts.find(a=>a.id==='alpha').balance;await page.getByRole('button',{name:'Проверить платёж',exact:true}).click();assert.equal(data.accounts.find(a=>a.id==='alpha').balance,beforeSplit);await page.locator('#amount').fill('100');await page.getByRole('button',{name:/Записать.*100/}).click();await page.locator('.installment-payment').waitFor();assert.equal(data.accounts.find(a=>a.id==='alpha').balance,beforeSplit-100);await page.getByText(/осталось.*200/).waitFor();
await page.getByRole('button',{name:/оплачено.*100.*открыть запись/}).click();await page.locator('#amount').fill('125');await page.getByRole('button',{name:'Сохранить изменения',exact:false}).click();await page.locator('.installment-payment').waitFor();assert.equal(data.accounts.find(a=>a.id==='alpha').balance,beforeSplit-125);assert.equal(data.transactions.filter(t=>t.installmentPaymentId==='qa-part').length,1);await page.getByText(/осталось.*175/).waitFor();
for(const width of [320,360,390,430,768,1280]){
 await page.setViewportSize({width,height:900});await checkOverflow('installments '+width);
 await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();await page.getByRole('button',{name:'Перевод',exact:true}).click();await page.locator('select[name=from]').selectOption('alpha');await page.locator('select[name=to]').selectOption('sber');await page.locator('input[name=amount]').fill('10');await checkOverflow('transfer '+width);await page.screenshot({path:screenshotDir+'/transfer-'+width+'.png',fullPage:true});
 await page.goto(origin+'/?payments=1');await page.getByRole('button',{name:'До погашения',exact:true}).click();await page.getByRole('button',{name:/Кредиты, сплит, рассрочки/}).click();
}
// 4.2: repair a partially valid JSON import in Settings without changing bank balances.
await page.setViewportSize({width:390,height:844});
await page.goto(origin+'/?settings=1');
await page.getByRole('button',{name:/Импорт операций/}).click();
const importBox=page.getByRole('textbox',{name:'Или вставить JSON',exact:true});
const importNote='Импорт через браузер: сгруппированные копейки';
await importBox.fill(JSON.stringify({format:'burget-operations',version:1,operations:[null,{date:today,type:'expense',amount:12.3,currency:'RUB',account:'alpha',category:'food',note:importNote,paymentMethod:'sbp'}]}));
await page.getByRole('button',{name:'Проверить и исправить',exact:true}).click();
const badImportRow=page.locator('.json-import-row').nth(0),goodImportRow=page.locator('.json-import-row').nth(1);
await badImportRow.locator('summary').waitFor();
assert.match(await badImportRow.locator('summary').textContent(),/Неизвестные поля операции/);
assert.equal(await page.getByRole('button',{name:'Подтвердить импорт · 1',exact:true}).isDisabled(),true);
assert.equal(await page.locator('.json-import-row').count(),2);
await badImportRow.getByRole('checkbox',{name:'Исключить строку',exact:true}).check();
await goodImportRow.locator('summary').click();
await goodImportRow.getByRole('textbox',{name:'Сумма',exact:true}).fill('1 234,50');
assert.equal(await goodImportRow.getByRole('textbox',{name:'Сумма',exact:true}).inputValue(),'1 234,50');
assert.equal(await page.getByRole('checkbox',{name:'Также изменить остатки счетов',exact:true}).isChecked(),false);
assert.equal(await page.getByRole('button',{name:'Подтвердить импорт · 1',exact:true}).isEnabled(),true);
await checkOverflow('json partial import 390');
await page.screenshot({path:screenshotDir+'/09-json-repair-390.png',fullPage:true});
const beforeJsonBalances=data.accounts.map(a=>({id:a.id,balance:a.balance}));
await page.getByRole('button',{name:'Подтвердить импорт · 1',exact:true}).click();
await page.locator('.json-import-row').first().waitFor({state:'detached'});
const importedExpense=data.transactions.find(t=>t.note===importNote);
assert.ok(importedExpense);assert.equal(importedExpense.amount,1234.5);assert.equal(importedExpense.balanceEffect,'history-only');
assert.deepEqual(data.accounts.map(a=>({id:a.id,balance:a.balance})),beforeJsonBalances);
// Corporate lunch editing must retain its account-free import contract.
const lunchImportNote='Обед компании через браузер';
await importBox.fill(JSON.stringify({format:'burget-operations',version:1,operations:[{date:today,type:'lunch',amount:379.5,currency:'RUB',note:lunchImportNote}]}));
await page.getByRole('button',{name:'Проверить и исправить',exact:true}).click();
const companyImportRow=page.locator('.json-import-row');
await companyImportRow.locator('summary').click();
assert.equal(await companyImportRow.getByLabel('Оплата',{exact:true}).count(),0);
assert.equal(await companyImportRow.getByLabel('Счёт',{exact:true}).count(),0);
await companyImportRow.getByRole('textbox',{name:'Описание',exact:true}).fill(lunchImportNote+' · проверено');
assert.equal(await page.getByRole('button',{name:'Подтвердить импорт · 1',exact:true}).isEnabled(),true);
await page.getByRole('button',{name:'Подтвердить импорт · 1',exact:true}).click();
await page.locator('.json-import-row').first().waitFor({state:'detached'});
const importedLunch=data.transactions.find(t=>t.note===lunchImportNote+' · проверено');
assert.equal(importedLunch?.type,'lunch');assert.equal(importedLunch.accountId,undefined);assert.equal(importedLunch.paymentMethod,undefined);
assert.deepEqual(data.accounts.map(a=>({id:a.id,balance:a.balance})),beforeJsonBalances);
// A backup downloaded before another device writes must be downloaded again.
await page.goto(origin+'/?settings=1');
await page.getByRole('button',{name:/Резервные копии/}).click();
await page.getByLabel('Восстановить бэкап',{exact:true}).setInputFiles({name:'browser-qa-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
await page.getByRole('button',{name:'Скачать копию перед заменой',exact:true}).waitFor();
await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Скачать копию перед заменой',exact:true}).click()]);
await page.getByRole('checkbox',{name:/Копию сохранил, понимаю/}).check();
assert.equal(await page.getByRole('button',{name:'Восстановить проверенный бэкап',exact:true}).isEnabled(),true);
data=putTransaction(data,{id:'qa-remote-write',type:'expense',cat:'food',date:today,amount:1,currency:'RUB',accountId:'alpha',note:'С другого устройства во время восстановления'});revision++;
await page.locator('.mini-header').getByRole('button',{name:'Обновить данные',exact:true}).click();
await page.getByText(/Бюджет обновился\. Перед заменой скачай свежую копию/).waitFor();
assert.equal(await page.getByRole('button',{name:'Восстановить проверенный бэкап',exact:true}).isDisabled(),true);
assert.equal(await page.getByRole('checkbox',{name:/Копию сохранил, понимаю/}).isChecked(),false);
assert.equal(data.transactions.filter(t=>t.id==='qa-remote-write').length,1);
await checkOverflow('backup refreshed 390');
await page.screenshot({path:screenshotDir+'/10-backup-refresh-390.png',fullPage:true});
// Summary images use the same exact-period model as their full text.
const reportBundle=await build({entryPoints:['server/report-html.jsx'],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'text'}});
const {renderReportHtml}=await import('data:text/javascript;base64,'+Buffer.from(reportBundle.outputFiles[0].contents).toString('base64'));
await page.setViewportSize({width:640,height:1600});
for(const [name,source,from] of [['day',demoData(today),today],['week',demoData(today),past(-6)],['empty',structuredClone(EMPTY),today]]){
 await page.setContent(renderReportHtml(source,{kind:'summary',from,to:today,title:name==='week'?'Итог недели':'Итог дня'}));
 await page.locator('.summary-hero').waitFor();
 const bounds=await page.locator('#report-card').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,height:e.clientHeight}));assert.equal(bounds.width,640);assert.ok(bounds.scroll<=641);assert.ok(bounds.height<2000);
 await page.locator('#report-card').screenshot({path:screenshotDir+'/summary-'+name+'.png'});
}
assert.deepEqual(errors,[]);console.log('PASS: real Chromium: disclosure, zero disclosure, day details, linked deletion/refund, history, analytics drilldowns, planned confirmation, overflow at 320/360/390/430/768/1280px; calendar state, transfer with fee, partial installment/edit; partial JSON repair, grouped decimals, corporate lunch contract, history-only balances, stale backup confirmation; day/week/empty summary cards; no page errors.');
}finally{await browser?.close();await server.close();}
