import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';

const root=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const beforeSha=git('rev-parse',process.env.AUDIT_BEFORE_REF||'83feca385d040f8888e8a1774c152dcd44ace082'),afterSha=git('rev-parse',process.env.AUDIT_AFTER_REF||'72a04df8fba15e271de2fe13f474ffe74c4c7e11');
const out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'docs/audit-4.6.0'),temp=await mkdtemp(join(tmpdir(),'burget-clarity-audit-')),today='2026-10-24',clock=today+'T09:00:00Z',comparison=[];
const fixture=structuredClone(EMPTY);
fixture.accounts=[{id:'bank',name:'Основной счёт',balance:12000,currency:'RUB'},{id:'cash',name:'Наличные',balance:3000,currency:'RUB'},{id:'save',name:'Накопления',balance:20000,currency:'RUB',accType:'savings'},{id:'zero',name:'Счёт с историей',balance:0,currency:'RUB'}];
fixture.settings={...fixture.settings,timeZone:'Europe/Moscow',nextIncomeDate:'',modules:{plans:true,installments:true,debts:true}};
const tx=(id,date,amount,extra={})=>({id,date,amount,currency:'RUB',type:'expense',cat:'food',accountId:'bank',balanceEffect:'history-only',note:id,...extra});
fixture.recurring=[{id:'future',name:'Предстоящая покупка',type:'expense',frequency:'once',startDate:'2026-10-28',amount:10000,currency:'RUB',accountId:'bank',cat:'other',active:true},{id:'rent',name:'Жильё',type:'expense',frequency:'monthly',startDate:'2026-09-01',dueDay:15,amount:200,currency:'RUB',accountId:'bank',cat:'housing',active:false}];
fixture.installments=[{id:'split',name:'Ноутбук',total:6050,currency:'RUB',accountId:'bank',cat:'tech',obligationKind:'split',payments:[{id:'sep-part',date:'2026-09-10',amount:250},{id:'oct-part',date:'2026-10-10',amount:300},{id:'nov-part',date:'2026-11-01',amount:5500}]}];
fixture.debts=[{id:'debt',person:'Знакомый',type:'my',amount:50,currency:'RUB',dueDate:'2026-10-18',payments:[]}];
fixture.transactions=[tx('Продукты','2026-10-05',300),tx('Покупки наличными','2026-10-20',400,{accountId:'cash'}),tx('Транспорт','2026-10-22',100,{cat:'transport'}),tx('Жильё в октябре','2026-10-15',200,{cat:'housing',recurringId:'rent',recurringPeriod:'2026-10'}),tx('Платёж за ноутбук','2026-10-10',300,{cat:'tech',installmentPaymentId:'oct-part'}),tx('Возврат долга','2026-10-18',50,{cat:'other',debtId:'debt'}),tx('Монитор','2026-10-23',1500,{cat:'tech'}),tx('Подработка','2026-10-24',2000,{type:'income',cat:'income'}),tx('Обед компании','2026-10-21',400,{type:'lunch',cat:'lunch',accountId:''}),tx('Сентябрьские продукты','2026-09-05',200),tx('Сентябрь наличными','2026-09-20',250,{accountId:'cash'}),tx('Проезд в сентябре','2026-09-08',80,{cat:'transport'}),tx('Жильё в сентябре','2026-09-15',100,{cat:'housing',recurringId:'rent',recurringPeriod:'2026-09'}),tx('Прошлый платёж за ноутбук','2026-09-10',250,{cat:'tech',installmentPaymentId:'sep-part'}),tx('Покупка со старого счёта','2026-09-12',70,{accountId:'zero'}),tx('Покупка в конце сентября','2026-09-30',4000),tx('Возврат на старый счёт','2026-09-10',200,{accountId:'zero',type:'income',cat:'income'}),tx('Начало августа','2026-08-01',25),tx('Конец августа','2026-08-30',30)];
fixture.transfers=[{id:'own-transfer',from:'bank',to:'save',amount:3000,date:'2026-10-18',currency:'RUB',balanceEffect:'history-only'}];
const original=JSON.stringify(fixture);let browser;
await mkdir(out,{recursive:true});
try{
 for(const [label,sha] of [['before',beforeSha],['after',afterSha]]){
  const source=join(temp,label);git('worktree','add','--detach',source,sha);await symlink(join(root,'node_modules'),join(source,'node_modules'),'junction');
  const {dashboard}=await import(pathToFileURL(join(source,'src/mini-model.js'))),{spendingReport}=await import(pathToFileURL(join(source,'src/analytics-report.js'))),{periodSummaryData}=await import(pathToFileURL(join(source,'server/period-summary.js')));
  const s=dashboard(fixture,today),r=spendingReport(fixture,today,'month'),summary=periodSummaryData(fixture,'2026-09-01','2026-09-30','Итог сентября');
  comparison.push({revision:label,sha,balance:s.balance,obligations:s.obligations,free:s.free,savings:s.reserve,total:r.total,income:r.income,net:r.net,previous:r.previous,delta:r.delta,previousFrom:r.previousFrom,previousTo:r.previousTo,septemberTotal:summary.expense,septemberPrevious:summary.previous,...(label==='after'?{groups:r.groups,custom:spendingReport(fixture,today,{period:'custom',from:'2026-09-01',to:'2026-09-15',accountId:'zero'})}:{} )});
  assert.equal(JSON.stringify(fixture),original);
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
  const context=await browser.newContext({viewport:{width:390,height:1000},locale:'ru-RU',deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(clock)});
   await page.route('**/telegram.org/**',r=>r.abort());await page.route('**/fonts.googleapis.com/**',r=>r.abort());await page.route('**/api/v1/**',r=>{assert.equal(r.request().method(),'GET');return r.fulfill({json:{revision:1,data:structuredClone(fixture),isOwner:true}});});
   const origin='http://127.0.0.1:'+server.httpServer.address().port;
   await page.goto(origin);await page.locator('.ins-hero').waitFor();await page.screenshot({path:join(out,label+'-home.png'),fullPage:true,animations:'disabled'});
   await page.setViewportSize({width:390,height:2000});await page.locator(label==='before'?'.ins-hero':'.home-budget').screenshot({path:join(out,label+'-budget.png'),animations:'disabled'});
   await page.setViewportSize({width:390,height:1000});await page.locator('.mini-nav').getByRole('button',{name:'Анализ',exact:true}).click();await page.locator('.report-spending-hero').waitFor();await page.screenshot({path:join(out,label+'-analytics.png'),fullPage:true,animations:'disabled'});
   if(label==='after'){
    await page.locator('.report-date-options>summary').click();await page.getByLabel('Начало периода',{exact:true}).fill('2026-09-01');await page.getByLabel('Конец периода',{exact:true}).fill('2026-09-15');await page.getByRole('button',{name:'Применить даты',exact:true}).click();await page.getByLabel('Счёт отчёта',{exact:true}).selectOption('zero');
    await page.locator('.report-advanced>summary').click();await page.screenshot({path:join(out,'after-custom-account.png'),fullPage:true,animations:'disabled'});
    await page.locator('.report-total-button').click();await page.locator('[data-page="history"]').waitFor();await page.getByText('Покупка со старого счёта',{exact:true}).waitFor();assert.equal(await page.getByText('Покупка в конце сентября',{exact:true}).count(),0);await page.screenshot({path:join(out,'after-scoped-history.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'К аналитике',exact:true}).click();assert.equal(await page.getByLabel('Счёт отчёта',{exact:true}).inputValue(),'zero');assert.equal(await page.locator('.report-advanced').getAttribute('open'),'');
   }
   await page.setViewportSize({width:1280,height:1000});await page.goto(origin);await page.locator('.ins-hero').waitFor();await page.screenshot({path:join(out,label+'-home-desktop.png'),fullPage:true,animations:'disabled'});assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();await server.close();}
 }
 assert.deepEqual(comparison.map(r=>[r.balance,r.obligations,r.free,r.savings,r.total,r.income,r.net]),Array(2).fill([15000,15500,-500,20000,2850,2000,-850]));
 assert.deepEqual(comparison.map(r=>[r.previous,r.delta,r.septemberTotal,r.septemberPrevious]),[[4750,-1900,4950,30],[950,1900,4950,55]]);
 assert.deepEqual(comparison[1].groups.map(g=>g.value),[2300,200,300,50]);assert.deepEqual([comparison[1].custom.total,comparison[1].custom.income,comparison[1].custom.count],[70,200,1]);
 await writeFile(join(out,'financial-evidence.json'),JSON.stringify(comparison,null,2)+'\n');
 await writeFile(join(out,'capture.json'),JSON.stringify({beforeSha,afterSha,today,clock,viewport:{width:390,height:1000},budgetViewport:{width:390,height:2000},desktopViewport:{width:1280,height:1000},fictional:true,fixture},null,2)+'\n');
 console.log('Captured '+beforeSha+' → '+afterSha);console.log(comparison.map(({custom,groups,...r})=>r));
}finally{await browser?.close();for(const label of ['before','after'])try{git('worktree','remove','--force',join(temp,label));}catch{}await rm(temp,{recursive:true,force:true});}
