import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Capture actual immutable revisions with one fictional profile, clock and viewport.
const root=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const beforeSha=git('rev-parse',process.env.AUDIT_BEFORE_REF||'1a3dfeb6db3342c1314bbbb8e849f3f6a120c143'),afterSha=git('rev-parse',process.env.AUDIT_AFTER_REF||'HEAD');
const out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'docs/audit-4.4.0'),temporary=await mkdtemp(join(tmpdir(),'burget-menu-audit-')),date='2026-10-23';
const {EMPTY,dashboard}=await import('../src/mini-model.js'),{putTransaction}=await import('../src/ledger.js');
const {createPlanned,preparePlanned}=await import('../src/planned-operations.js');
let fixture=structuredClone(EMPTY);
fixture.accounts=[{id:'bank',name:'Основной счёт',balance:30000,currency:'RUB'},{id:'cash',name:'Наличные',balance:1000,currency:'RUB'},{id:'savings',name:'Накопления',balance:20000,currency:'RUB',accType:'savings'}];
fixture.settings={...fixture.settings,nextIncomeDate:'2026-11-01',modules:{plans:true,installments:true,debts:true},timeZone:'Europe/Moscow'};
const bill={id:'housing',name:'ЖКХ',amount:6840.44,accountId:'bank',cat:'housing',type:'expense',frequency:'monthly',startDate:'2026-09-01',dueDay:15};
fixture=createPlanned(fixture,bill);
fixture=putTransaction(fixture,{...preparePlanned(fixture,bill.id,'2026-09','2026-09-15',false),id:'paid-housing',amount:6800});
fixture=createPlanned(fixture,{id:'internet',name:'Интернет',amount:700,accountId:'bank',cat:'housing',type:'expense',frequency:'monthly',startDate:'2026-10-01',dueDay:27});
fixture=createPlanned(fixture,{id:'salary',name:'Зарплата',amount:35000,accountId:'bank',type:'income',frequency:'once',startDate:'2026-11-01'});
fixture=createPlanned(fixture,{id:'repair',name:'Ремонт велосипеда',amount:1800,accountId:'bank',type:'expense',frequency:'once',startDate:'2026-10-30'});
fixture.installments=[{id:'phone',name:'Телефон',total:9000,currency:'RUB',accountId:'bank',cat:'tech',obligationKind:'split',cadence:'biweekly',payments:[{id:'phone1',date:'2026-10-25',amount:3000},{id:'phone2',date:'2026-11-08',amount:3000},{id:'phone3',date:'2026-11-22',amount:3000}]}];
fixture.debts=[{id:'friend',person:'Илья',type:'my',amount:1500,currency:'RUB',dueDate:'2026-10-29',payments:[]}];
await mkdir(out,{recursive:true});let browser;const regressions=[];
try{
 for(const [label,sha] of [['before',beforeSha],['after',afterSha]]){
  const source=join(temporary,label);git('worktree','add','--detach',source,sha);await symlink(join(root,'node_modules'),join(source,'node_modules'),'junction');
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
  const context=await browser.newContext({viewport:{width:390,height:1000},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ru-RU'});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(date+'T09:00:00Z')});
   await page.route('**/telegram.org/**',r=>r.abort());await page.route('**/api/v1/**',r=>r.fulfill({json:{revision:1,data:structuredClone(fixture),isOwner:true}}));
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/?payments=1');
   await page.locator('.connected-payments').waitFor();await page.screenshot({animations:'disabled',path:join(out,label+'-overview.png'),fullPage:true});
   if(label==='before'){await page.getByRole('button',{name:'До погашения',exact:true}).click();await page.getByRole('button',{name:/Кредиты, сплит, рассрочки/}).click();}
   else await page.getByRole('button',{name:'Сплиты и кредиты',exact:true}).click();
   await page.locator('.installment-card').waitFor();await page.screenshot({animations:'disabled',path:join(out,label+'-splits.png'),fullPage:true});
   await page.getByRole('button',{name:label==='before'?'Постоянные':'Регулярные',exact:true}).click();
   const card=page.locator(label==='before'?'.mini-card':'.planned-card').filter({has:page.getByText('ЖКХ',{exact:true})}).last();
   if(label==='after')await card.locator('.planned-actions>summary').click();
   await card.getByRole('button',{name:label==='before'?'Изменить':'Изменить план',exact:true}).click();
   await card.locator('input[name=amount]').waitFor();
   // Align the same editor at the top, retaining the unchanged fixed navigation.
   await card.evaluate(e=>window.scrollTo({top:window.scrollY+e.getBoundingClientRect().top,behavior:'instant'}));
   await page.screenshot({animations:'disabled',path:join(out,label+'-monthly-editor.png'),fullPage:true});
   await page.setViewportSize({width:390,height:1600});await card.screenshot({animations:'disabled',path:join(out,label+'-monthly-card.png')});
   assert.deepEqual(errors,[]);
   const {updatePlanned:edit}=await import(pathToFileURL(join(source,'src/planned-operations.js'))),legacy=structuredClone(fixture);legacy.recurring[0].variable=true;
   const {id,dueDay,variable,...formValues}=legacy.recurring[0],changed=edit(legacy,id,{...formValues,name:'Коммунальные услуги'});
   regressions.push({revision:label,sha,dueDay:changed.recurring[0].dueDay,variable:changed.recurring[0].variable,balance:changed.accounts[0].balance,oldPaid:changed.transactions.find(t=>t.id==='paid-housing').amount});
  }finally{await context.close();await browser.close();await server.close();}
 }
 const {updatePlanned,previewPlanned}=await import(pathToFileURL(join(temporary,'after/src/planned-operations.js'))),{putTransaction:record,deleteTransaction}=await import(pathToFileURL(join(temporary,'after/src/ledger.js')));
 const values={...bill,amount:6700,dueDay:28},edited=updatePlanned(fixture,bill.id,values),paid=record(edited,{...preparePlanned(edited,bill.id,'2026-10',date,false),id:'actual-housing'}),deleted=deleteTransaction(paid,'actual-housing');
 const numbers=[['До редактирования',fixture],['Сумма 6700, число 28',edited],['Оплата подтверждена',paid],['Оплата удалена',deleted]].map(([stage,data])=>{const s=dashboard(data,date);return {stage,balance:data.accounts.find(a=>a.id==='bank').balance,obligations:s.obligations,available:s.free,oldPaid:data.transactions.find(t=>t.id==='paid-housing').amount,linkedOctober:data.transactions.filter(t=>t.recurringId===bill.id&&t.recurringPeriod==='2026-10').length};});
 assert.deepEqual(edited.accounts,fixture.accounts);assert.deepEqual(edited.transactions,fixture.transactions);assert.deepEqual(edited.history,fixture.history);
 assert.equal(numbers[1].obligations,numbers[0].obligations-140.44);assert.equal(numbers[2].balance,numbers[1].balance-6700);assert.equal(numbers[2].obligations,numbers[1].obligations-6700);assert.equal(numbers[2].available,numbers[1].available);assert.equal(numbers[3].balance,numbers[1].balance);assert.equal(numbers[3].obligations,numbers[1].obligations);
 assert.deepEqual(previewPlanned(fixture,values,date,bill.id).items.map(p=>p.date),['2026-10-28','2026-11-28','2026-12-28']);
 assert.deepEqual(regressions.map(r=>[r.dueDay,r.variable]),[[1,false],[15,true]]);
 await writeFile(join(out,'edit-regression.json'),JSON.stringify(regressions,null,2)+'\n');
 await writeFile(join(out,'finance-scenario.json'),JSON.stringify(numbers,null,2)+'\n');
 await writeFile(join(out,'capture.json'),JSON.stringify({beforeSha,afterSha,date,viewport:{width:390,height:1000},fixture,edit:values},null,2)+'\n');
 console.log('Captured actual revisions: '+beforeSha+' → '+afterSha);console.log(numbers);
}finally{await browser?.close();for(const label of ['before','after']){try{git('worktree','remove','--force',join(temporary,label));}catch{}}await rm(temporary,{recursive:true,force:true});}
