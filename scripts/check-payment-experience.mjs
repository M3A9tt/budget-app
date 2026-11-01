import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile,mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow,dashboard} from '../src/mini-model.js';
import {createPlanned} from '../src/planned-operations.js';
import {createInstallment} from '../src/finance-tools.js';
import {putTransaction} from '../src/ledger.js';
const baseline='bd6c289782ffe10f4e093a437dd9e942eb375ea4';
const out=process.env.PAYMENT_SCREENSHOT_DIR||'/tmp/burget-payment-experience',root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'burget-payments-before-'));
await mkdir(out,{recursive:true});
execFileSync('git',['fetch','origin',baseline,'--depth=1'],{stdio:'ignore'});
execFileSync('git',['worktree','add','--detach',temp,baseline],{stdio:'ignore'});
await symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
const today=todayMoscow(),offset=n=>new Date(Date.parse(today+'T12:00Z')+n*86400000).toISOString().slice(0,10);
let seed={...structuredClone(EMPTY),accounts:[{id:'card',name:'Основная карта',balance:2000,currency:'RUB'}],settings:{...EMPTY.settings,notificationMode:'manual',modules:{plans:true,installments:true,debts:true}}};
for(const [id,name,n,amount] of [['housing','ЖКХ',-1,200],['stale','Старый платёж',-2,500],['internet','Интернет',0,100],['travel','Проездной',3,350],['unknown','Уточняемый платёж',10,50]])seed=createPlanned(seed,{id,name,frequency:'once',type:'expense',startDate:offset(n),amount,accountId:'card',cat:'housing',variable:id==='unknown'});
seed=createInstallment(seed,{id:'split',name:'Тестовый сплит',total:600,count:2,firstDate:today,cadence:'biweekly',accountId:'card'});
seed=putTransaction(seed,{id:'manual',type:'expense',cat:'housing',amount:200,date:offset(-1),accountId:'card',note:'ЖКХ внесено раньше'});
await writeFile(path.join(out,'fixture.json'),JSON.stringify({baseline,today,viewport:{width:390,height:844},fictional:true,data:seed},null,2));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const evidence=[];
try{
 for(const [label,appRoot] of [['before',temp],['after',root]]){
  const server=await createServer({root:appRoot,server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
  let data=structuredClone(seed),revision=1,writes=0;const errors=[],steps=[];
  const shot=async(name,fullPage=true)=>{await page.locator('.mini-toast').waitFor({state:'hidden'});await page.screenshot({path:path.join(out,label+'-'+name+'.png'),fullPage});};
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
   await page.route('**/api/v1/**',async r=>{
    if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.expectedRevision,revision);data=body.data;revision++;writes++;}
    await r.fulfill({json:{data,revision,userId:'fictional-payment-ui',isOwner:false}});
   });
   await page.goto(origin+'/?payments=1');await page.locator('.payments-upcoming').waitFor();await page.getByText('ЖКХ',{exact:true}).waitFor();
   await shot('list-390',false);await shot('list-full-390');
   if(label==='after'){
    const ids={'ЖКХ':'housing','Старый платёж':'stale','Интернет':'internet','Проездной':'travel','Уточняемый платёж':'unknown'};
    const row=name=>page.locator('[data-payment-event="plan:'+ids[name]+':once"]');
    const query=page.getByRole('searchbox',{name:'Найти платёж',exact:true});
    await query.fill('ЖКХ');await row('ЖКХ').locator('.upcoming-payment').click();
    assert.equal(writes,0);assert.equal(await page.locator('[data-page=payments]').count(),1);steps.push({action:'open-row',writes});
    await row('ЖКХ').getByRole('button',{name:'Уже учтено',exact:true}).click();
    await row('ЖКХ').getByLabel('Найти запись',{exact:true}).fill('ЖКХ внесено');await shot('link-panel-before-selection-390');await row('ЖКХ').getByLabel('Уже записанная операция',{exact:true}).selectOption('manual');
    await shot('recorded-payment-390');const balances=structuredClone(data.accounts),future=structuredClone(data.recurring.find(r=>r.id==='travel'));
    await row('ЖКХ').getByRole('button',{name:'Связать без списания',exact:true}).click();await page.getByText('Ничего не найдено',{exact:true}).waitFor();
    assert.deepEqual(data.accounts,balances);assert.equal(data.transactions.length,1);assert.equal(data.transactions[0].recurringId,'housing');assert.deepEqual(data.recurring.find(r=>r.id==='travel'),future);
    steps.push({action:'link-existing',balance:data.accounts[0].balance,transactions:data.transactions.length});
    await query.fill('Старый платёж');await row('Старый платёж').locator('.upcoming-payment').click();await row('Старый платёж').getByRole('button',{name:'Уже учтено',exact:true}).click();
    await row('Старый платёж').getByRole('button',{name:'Учтено в остатке / не нужно',exact:true}).click();await shot('skip-period-390');
    page.once('dialog',d=>d.accept());await row('Старый платёж').getByRole('button',{name:'Неактуально в этом периоде',exact:true}).click();await page.getByText('Ничего не найдено',{exact:true}).waitFor();
    assert.deepEqual(data.accounts,balances);assert.equal(data.transactions.length,1);assert.ok(data.recurring.find(r=>r.id==='stale').skippedPeriods.includes('once'));assert.deepEqual(data.recurring.find(r=>r.id==='travel'),future);
    steps.push({action:'skip-obsolete',balance:data.accounts[0].balance,transactions:data.transactions.length});
    await query.fill('Интернет');await row('Интернет').locator('.upcoming-payment').click();await row('Интернет').getByRole('button',{name:'Перенести дату',exact:true}).click();
    await row('Интернет').getByLabel('Новая дата',{exact:true}).fill(offset(2));await row('Интернет').locator('form').getByRole('button',{name:'Перенести',exact:true}).click();
    await page.waitForFunction(date=>document.querySelector('[data-payment-event="plan:internet:once"]')?.textContent.includes(date),new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(offset(2)+'T12:00Z')));
    assert.deepEqual(data.accounts,balances);assert.equal(data.recurring.find(r=>r.id==='internet').dateOverrides.once,offset(2));
    await page.getByRole('button',{name:'Календарь',exact:true}).click();await page.getByRole('button',{name:new RegExp('^'+offset(2)+' ·')}).click();await page.locator('.money-event').filter({hasText:'Интернет'}).waitFor();await shot('moved-calendar-390');
    await page.getByRole('button',{name:'К списку',exact:true}).click();await page.getByRole('searchbox',{name:'Найти платёж',exact:true}).fill('Проездной');await row('Проездной').locator('.upcoming-payment').click();
    await row('Проездной').getByRole('button',{name:'Записать оплату',exact:true}).click();await page.locator('#amount').waitFor();assert.equal(writes,3);assert.equal(await page.locator('#amount').inputValue(),'350');
    await page.getByRole('button',{name:/Записать.*350/}).click();await page.locator('[data-page=payments]').waitFor();assert.equal(data.accounts[0].balance,1450);assert.equal(data.transactions.length,2);
    assert.equal(data.transactions.filter(t=>t.recurringId==='travel').length,1);steps.push({action:'confirm-payment',balance:data.accounts[0].balance,transactions:data.transactions.length});
    await page.locator('.mini-nav').getByRole('button',{name:'История',exact:true}).click();await page.getByLabel('Поиск операций',{exact:true}).fill('Проездной');await page.getByText('Проездной',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Открыть планы',exact:true}).click();
    const filters=page.getByRole('group',{name:'Срок платежей',exact:true});await filters.getByRole('button',{name:/7 дней/}).click();
    assert.equal(await page.getByText('Уточняемый платёж',{exact:true}).count(),0);
    await filters.getByRole('button',{name:/Все/}).click();await page.getByRole('searchbox',{name:'Найти платёж',exact:true}).fill('никакого совпадения');
    await page.getByText('Ничего не найдено',{exact:true}).waitFor();await page.getByRole('button',{name:'Сбросить поиск и фильтр',exact:true}).click();
    for(const width of [320,390,768,1280]){
     await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'payment list overflow '+width);await shot('responsive-list-'+width);
    }
    await page.setViewportSize({width:390,height:844});await page.getByRole('searchbox',{name:'Найти платёж',exact:true}).fill('Уточняемый');await row('Уточняемый платёж').locator('.upcoming-payment').click();await row('Уточняемый платёж').getByRole('button',{name:'Уже учтено',exact:true}).click();
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'recorded panel overflow '+width);await shot('actions-'+width);}
   }
   await page.setViewportSize({width:390,height:844});await page.goto(origin+'/?settings=1');await page.getByRole('button',{name:/Свои категории/}).waitFor();await shot('settings-390');
   if(label==='after'){
    assert.equal(await page.getByRole('heading',{name:'Настройки',exact:true}).count(),1);await page.getByRole('button',{name:/Уведомления/}).click();
    await page.getByRole('heading',{name:'Уведомления',exact:true}).waitFor();assert.equal(data.settings.notificationMode,'manual');assert.equal(writes,4);
   }
   assert.deepEqual(errors,[]);evidence.push({label,writes,balance:data.accounts[0].balance,transactions:data.transactions.length,budget:dashboard(data,today).free,steps,pageErrors:errors});
  }catch(error){await shot('failure').catch(()=>{});console.log(JSON.stringify({label,page:await page.locator('main').getAttribute('data-page'),events:await page.locator('[data-payment-event]').allTextContents()}));throw error;}finally{await context.close();await server.close();}
 }
}finally{await browser.close();execFileSync('git',['worktree','remove','--force',temp],{stdio:'ignore'});await rm(temp,{recursive:true,force:true});}
await writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log('Payment experience Chromium passed: link, skip, move, confirm and shared history');
