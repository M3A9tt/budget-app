import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {EMPTY} from '../src/mini-model.js';
import {putTransaction} from '../src/ledger.js';
import {createPlanned} from '../src/planned-operations.js';

const root=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(),beforeSha=git('rev-parse',process.env.AUDIT_BEFORE_REF||'a6b976d3c877404b6cd06b7fee86ed1c0e29e964'),afterSha=git('rev-parse',process.env.AUDIT_AFTER_REF||'HEAD');
const out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'docs/audit-4.5.0'),temp=await mkdtemp(join(tmpdir(),'burget-calendar-audit-')),today='2026-10-24',comparison=[];
let fixture=structuredClone(EMPTY),browser;
fixture.accounts=[{id:'bank',name:'Основной счёт',balance:8180,currency:'RUB'},{id:'save',name:'Накопления',balance:20000,currency:'RUB',accType:'savings'}];fixture.settings={...fixture.settings,nextIncomeDate:'2026-11-10',timeZone:'Europe/Moscow',modules:{plans:true,installments:true,debts:true}};
fixture=putTransaction(fixture,{id:'coffee',date:'2026-10-23',type:'expense',cat:'food',amount:180,currency:'RUB',accountId:'bank',note:'Кофе и булочка'});
for(const v of [{id:'late',name:'Задержанная подработка',type:'income',amount:2000,startDate:'2026-10-20'},{id:'vacation',name:'Отпускные',type:'income',amount:5000,startDate:'2026-10-30'},{id:'salary',name:'Зарплата',type:'income',amount:25000,startDate:'2026-10-01',frequency:'monthly',dueDay:10},{id:'internet',name:'Интернет',type:'expense',amount:700,startDate:'2026-10-28'},{id:'housing',name:'ЖКХ',type:'expense',amount:3000,startDate:'2026-11-02'}])fixture=createPlanned(fixture,{frequency:'once',accountId:'bank',...v});
// The earlier monthly salary is already received; the account balance is fictional current cash.
fixture.recurring.find(r=>r.id==='salary').skippedPeriods=['2026-10'];
await mkdir(out,{recursive:true});
try{
 for(const [label,sha] of [['before',beforeSha],['after',afterSha]]){
  const source=join(temp,label);git('worktree','add','--detach',source,sha);await symlink(join(root,'node_modules'),join(source,'node_modules'),'junction');
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
  const context=await browser.newContext({viewport:{width:390,height:1000},locale:'ru-RU',deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(today+'T09:00:00Z')});await page.route('**/telegram.org/**',r=>r.abort());await page.route('**/api/v1/**',r=>r.fulfill({json:{revision:1,data:structuredClone(fixture),isOwner:true}}));
   const origin='http://127.0.0.1:'+server.httpServer.address().port;
   await page.goto(origin+'/?payments=1');await page.getByRole('button',{name:'Календарь',exact:true}).click();await page.locator('.money-calendar').waitFor();await page.screenshot({animations:'disabled',path:join(out,label+'-calendar.png'),fullPage:true});
   if(label==='after'){
    await page.getByRole('button',{name:/^2026-10-23 ·/}).click();await page.locator('.money-fact').waitFor();await page.screenshot({animations:'disabled',path:join(out,'after-recorded-day.png'),fullPage:true});
    await page.locator('.calendar-forecast>summary').click();await page.getByRole('button',{name:'Месяц',exact:true}).click();await page.getByRole('checkbox',{name:/Учесть ожидаемые доходы/}).check();await page.locator('.calendar-overdue>summary').click();await page.screenshot({animations:'disabled',path:join(out,'after-forecast.png'),fullPage:true});
   }
   await page.goto(origin+'/?payments=1');
   if(label==='before')await page.getByRole('button',{name:'Регулярные',exact:true}).click();else await page.locator('.payments-income-entry').click();
   await page.locator('.mini-disclosure>summary').click();const form=page.locator('.planned-form');
   await form.locator('[name=name]').fill('Отпускные');await form.locator('[name=amount]').fill('5000');await form.locator('[name=startDate]').fill('2026-10-30');await form.locator('[name=accountId]').selectOption('bank');
   if(label==='before'){await form.locator('.payment-settings>summary').click();await form.locator('[name=type]').selectOption('income');await form.locator('[name=frequency]').selectOption('once');}
   await form.evaluate(e=>e.ownerDocument.activeElement?.blur());await page.setViewportSize({width:390,height:2000});await page.locator('.mini-disclosure').screenshot({animations:'disabled',path:join(out,label+'-income-form.png')});assert.deepEqual(errors,[]);
   const {cashTimeline,budgetWindow}=await import(pathToFileURL(join(source,'src/finance-events.js'))),{dashboard}=await import(pathToFileURL(join(source,'src/mini-model.js'))),flow=cashTimeline(fixture,today,30),s=dashboard(fixture,today);
   comparison.push({revision:label,sha,budgetUntil:budgetWindow(fixture,today).until,balance:s.balance,obligations:s.obligations,available:s.free,expected30:flow.endBalance,plannedIncome30:flow.plannedIncome,delayedIncome:flow.delayedIncome||0});
  }finally{await context.close();await browser.close();await server.close();}
 }
 assert.deepEqual(comparison.map(r=>[r.balance,r.obligations,r.available,r.expected30]),[[8000,3700,4300,36300],[8000,700,7300,34300]]);
 const {reschedulePlanned,preparePlanned}=await import(pathToFileURL(join(temp,'after/src/planned-operations.js'))),{putTransaction:record,deleteTransaction}=await import(pathToFileURL(join(temp,'after/src/ledger.js'))),{dashboard}=await import(pathToFileURL(join(temp,'after/src/mini-model.js'))),{cashTimeline}=await import(pathToFileURL(join(temp,'after/src/finance-events.js')));
 const moved=reschedulePlanned(fixture,'vacation','once','2026-11-04',today),paid=record(moved,{...preparePlanned(moved,'vacation','once',today,false),id:'actual-vacation'}),deleted=deleteTransaction(paid,'actual-vacation');
 assert.deepEqual(moved.accounts,fixture.accounts);assert.deepEqual(moved.transactions,fixture.transactions);assert.deepEqual(moved.history,fixture.history);
 const stages=[['Исходный план',fixture],['Доход перенесён на 4 ноября',moved],['Поступление подтверждено',paid],['Запись поступления удалена',deleted]].map(([stage,d])=>{const s=dashboard(d,today);return {stage,balance:s.balance,budgetUntil:s.budgetUntil,obligations:s.obligations,available:s.free,expected30:cashTimeline(d,today,30).endBalance,actualIncome:d.transactions.filter(t=>t.recurringId==='vacation').length};});
 assert.deepEqual(stages.map(s=>[s.balance,s.obligations,s.available,s.actualIncome]),[[8000,700,7300,0],[8000,3700,4300,0],[13000,3700,9300,1],[8000,3700,4300,0]]);assert.ok(stages.every(s=>s.expected30===34300));
 await writeFile(join(out,'financial-evidence.json'),JSON.stringify({comparison,stages},null,2)+'\n');await writeFile(join(out,'capture.json'),JSON.stringify({beforeSha,afterSha,today,clock:'2026-10-24T09:00:00Z',viewport:{width:390,height:1000},formViewport:{width:390,height:2000},fixture},null,2)+'\n');console.log('Captured '+beforeSha+' → '+afterSha);console.log({comparison,stages});
}finally{await browser?.close();for(const label of ['before','after'])try{git('worktree','remove','--force',join(temp,label));}catch{}await rm(temp,{recursive:true,force:true});}
