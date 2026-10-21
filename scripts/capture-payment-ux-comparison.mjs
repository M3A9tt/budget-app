import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Real revisions, identical fictional data and fixed clock. No customer data.
const root=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const beforeSha=git('rev-parse',process.env.AUDIT_BEFORE_REF||'b401cbcfa95171bd550d68345584402595753778'),afterSha=git('rev-parse',process.env.AUDIT_AFTER_REF||'HEAD');
const out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'docs/audit-4.3.0'),temporary=await mkdtemp(join(tmpdir(),'burget-payment-audit-')),date='2026-10-21';
const fixture={schemaVersion:2,accounts:[{id:'bank',name:'Основной счёт',balance:12000,currency:'RUB'},{id:'savings',name:'Накопления',balance:20000,currency:'RUB',accType:'savings'}],transactions:[{id:'coffee',type:'expense',cat:'food',date,amount:180,currency:'RUB',accountId:'bank',note:'Кофе'},{id:'taxi',type:'expense',cat:'transport',date,amount:380,currency:'RUB',accountId:'bank',note:'Такси'},{id:'meal',type:'lunch',cat:'lunch',date,amount:330,currency:'RUB',note:'Обед компании'}],installments:[{id:'laptop',name:'Ноутбук',total:18000,currency:'RUB',accountId:'bank',cat:'tech',obligationKind:'installment',cadence:'monthly',payments:[{id:'laptop1',date:'2026-10-25',amount:6000},{id:'laptop2',date:'2026-11-25',amount:6000},{id:'laptop3',date:'2026-12-25',amount:6000}]}],debts:[],goals:[],wishes:[],customCats:[],transfers:[],recurring:[],history:[],lunchDayOff:[],lunchDayMod:{},categoryBudgets:{},settings:{budget:0,lunchDaily:400,workDays:22,reserveRub:0,nextIncomeDate:'2026-11-01',timeZone:'Europe/Moscow',modules:{plans:true,installments:true,debts:true},reminderStyle:'custom',reminderText:'Всё записал за день? Добавь то, что ещё не попало в бюджет.'},rates:{RUB:1,USD:90,EUR:100,GBP:117,CNY:12.7,TRY:2.8}};
const input={name:'Телефон',total:'9000',count:'3',firstDate:'2026-10-28',cadence:'biweekly',accountId:'bank',cat:'tech',obligationKind:'split'};
let browser;
await mkdir(out,{recursive:true});
try{
 for(const [label,sha] of [['before',beforeSha],['after',afterSha]]){
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
  const source=join(temporary,label);git('worktree','add','--detach',source,sha);await symlink(join(root,'node_modules'),join(source,'node_modules'),'junction');
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});await server.listen();
  const context=await browser.newContext({viewport:{width:390,height:1200},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU'});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(date+'T09:00:00Z')});
   await page.route('**/telegram.org/**',r=>r.abort());await page.route('**/api/v1/**',r=>r.fulfill({json:{revision:1,data:structuredClone(fixture),isOwner:true}}));
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?payments=1');
   await page.getByRole('button',{name:'До погашения',exact:true}).click();await page.getByRole('button',{name:/Кредиты, сплит, рассрочки/}).click();
   const disclosure=label==='before'?page.locator('details.mini-disclosure').filter({has:page.getByText('Добавить обязательство',{exact:true})}):page.locator('.installment-create');
   await disclosure.locator(':scope>summary').click();
   for(const key of ['name','total','count','firstDate'])await disclosure.locator(`[name="${key}"]`).fill(input[key]);
   if(label==='before')for(const key of ['cadence','accountId','cat','obligationKind'])await disclosure.locator(`[name="${key}"]`).selectOption(input[key]);
   else await disclosure.getByLabel('Как часто',{exact:true}).selectOption(input.cadence);
   await page.screenshot({path:join(out,label+'-page.png'),fullPage:true});await disclosure.evaluate(e=>window.scrollTo({top:window.scrollY+e.getBoundingClientRect().top,behavior:'instant'}));await disclosure.screenshot({path:join(out,label+'-form.png')});
   if(label==='after'){
    await disclosure.getByRole('button',{name:'Посмотреть график',exact:true}).click();await disclosure.getByLabel('С какого счёта платить',{exact:true}).selectOption(input.accountId);
    await disclosure.locator('.installment-example summary').click();await disclosure.getByLabel('Тип графика',{exact:true}).selectOption(input.obligationKind);await disclosure.getByLabel('Категория расходов',{exact:true}).selectOption(input.cat);await disclosure.locator('.installment-example summary').click();
    assert.equal(await disclosure.locator('.installment-preview li').count(),3);await disclosure.evaluate(e=>window.scrollTo({top:window.scrollY+e.getBoundingClientRect().top,behavior:'instant'}));await disclosure.screenshot({path:join(out,'after-preview.png')});
   }
   assert.deepEqual(errors,[]);
   const {expenseReminder}=await import(pathToFileURL(join(source,'server/notifications.js')));await writeFile(join(out,label+'-reminder.json'),JSON.stringify(expenseReminder(fixture,date),null,2)+'\n');
   if(label==='after'){
    const {createInstallment,payInstallment}=await import(pathToFileURL(join(source,'src/finance-tools.js'))),{deleteTransaction,migrateData}=await import(pathToFileURL(join(source,'src/ledger.js'))),{EMPTY,dashboard}=await import(pathToFileURL(join(source,'src/mini-model.js')));
    const base=migrateData(structuredClone(fixture),EMPTY),scheduled=createInstallment(base,input),plan=scheduled.installments.at(-1),paid=payInstallment(scheduled,{planId:plan.id,paymentId:plan.payments[0].id,date}),deleted=deleteTransaction(paid,paid.transactions.at(-1).id);
    const values=[['До графика',base],['График создан',scheduled],['Первый платёж подтверждён',paid],['Оплата удалена',deleted]].map(([stage,data])=>{const s=dashboard(data,date);return {stage,balance:data.accounts.find(a=>a.id==='bank').balance,expenses:s.spent,obligations:s.obligations,available:s.free,transactions:data.transactions.length};});
    assert.deepEqual(values.map(x=>[x.balance,x.expenses,x.obligations,x.available]),[[12000,560,6000,6000],[12000,560,9000,3000],[9000,3560,6000,3000],[12000,560,9000,3000]]);
    await writeFile(join(out,'finance-scenario.json'),JSON.stringify(values,null,2)+'\n');
   }
  }finally{await context.close();await server.close();await browser.close();}
 }
 await writeFile(join(out,'capture.json'),JSON.stringify({beforeSha,afterSha,date,viewport:{width:390,height:1200},fixture,input},null,2)+'\n');
 console.log('Captured actual source revisions: '+beforeSha+' → '+afterSha);
}finally{await browser?.close();for(const label of ['before','after']){try{git('worktree','remove','--force',join(temporary,label));}catch{}}await rm(temporary,{recursive:true,force:true});}
