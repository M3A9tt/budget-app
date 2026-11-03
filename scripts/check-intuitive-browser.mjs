import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile,mkdtemp,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow,money} from '../src/mini-model.js';
import {createPlanned} from '../src/planned-operations.js';
import {putTransaction} from '../src/ledger.js';
const baseline='a60e3ee88d1abceb6c3db16919f2ae9ea44d2c9d';
const out=process.env.USABILITY_SCREENSHOT_DIR||'/tmp/burget-usability',root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'burget-ui-before-'));
await mkdir(out,{recursive:true});
try{execFileSync('git',['cat-file','-e',baseline],{stdio:'ignore'});}catch{execFileSync('git',['fetch','origin',baseline,'--depth=1'],{stdio:'ignore'});}
execFileSync('git',['worktree','add','--detach',temp,baseline],{stdio:'ignore'});
await symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'junction');
const today=todayMoscow();
let seed=createPlanned({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:2000,currency:'RUB'}],settings:{...EMPTY.settings,modules:{plans:true},notificationMode:'manual'},customCats:[{id:'cat',name:'Коты',icon:'other',color:'#b8dec4'}]},{id:'housing',name:'ЖКХ',type:'expense',amount:200,accountId:'a',frequency:'monthly',startDate:today});
seed=putTransaction(seed,{id:'manual',type:'expense',cat:'housing',amount:200,date:today,accountId:'a',note:'ЖКХ уже записано'});
await writeFile(path.join(out,'fixture.json'),JSON.stringify({baseline,today,viewport:{width:390,height:844},fictional:true,data:seed},null,2));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const evidence=[];
try{
 for(const [label,appRoot] of [['before',temp],['after',root]]){
  const server=await createServer({root:appRoot,server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
  let data=structuredClone({...seed,settings:{...seed.settings,interfaceVersion:1,legacyInterfaceOptIn:true}}),revision=1;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const shot=async(name,fullPage=true)=>{await page.locator('.mini-toast').waitFor({state:'hidden'});return page.screenshot({path:path.join(out,label+'-'+name+'.png'),fullPage});};
  const noOverflow=async name=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name);
  try{
   await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
   await page.route('**/api/v1/**',async r=>{
    if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.expectedRevision,revision);data=body.data;revision++;}
    await r.fulfill({json:{data,revision,userId:'fictional-ui',isOwner:false}});
   });
   await page.goto(origin);await page.getByRole('button',{name:/Карта.*1\s*800/}).waitFor();
   const homeHeight=await page.locator('.ins-home').evaluate(e=>Math.ceil(e.getBoundingClientRect().height));
   const actionTop=await page.getByRole('button',{name:'Записать расход',exact:true}).evaluate(e=>Math.ceil(e.getBoundingClientRect().top));
   await shot('overview-390',false);await shot('overview-full-390');
   if(label==='after'){
    assert.equal(await page.locator('.mini-nav>button').count(),5);
    assert.ok(actionTop<650,'expense action should be in the first mobile screen');
    assert.ok(homeHeight<evidence[0].homeHeight*0.8,'default home must be materially shorter');
    for(const width of [320,390,768,1280]){
     await page.setViewportSize({width,height:844});await noOverflow('home '+width);await shot('home-'+width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Открыть планы',exact:true}).click();
    await page.locator('[data-page=payments]').waitFor();await page.getByRole('heading',{name:'Планы',exact:true}).waitFor();
    await shot('payments-route-390');await page.locator('.mini-nav').getByRole('button',{name:'Главная',exact:true}).click();
   }
   await page.getByRole('button',{name:'Что требует внимания',exact:true}).click();
   const item=page.locator('.attention-center article').filter({has:page.getByText('ЖКХ',{exact:true})});
   await item.getByRole('button',{name:'Уже учтено',exact:true}).click();
   await item.getByLabel('Найти запись',{exact:true}).fill('ЖКХ уже');
   await item.getByLabel('Уже записанная операция').selectOption('manual');await shot('payment-390');
   if(label==='after'){
    const balances=structuredClone(data.accounts);
    await item.getByRole('button',{name:'Связать без списания',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.attention-center article')?.textContent.includes('ЖКХ'));
    assert.deepEqual(data.accounts,balances);assert.equal(data.transactions.length,1);assert.equal(data.transactions[0].recurringId,'housing');
   }
   await page.locator('.mini-nav').getByRole('button',{name:'Ещё',exact:true}).click();
   if(label==='after')await page.locator('.more-menu').waitFor();else await page.locator('.account-grid').waitFor();
   await shot('more-390');
   if(label==='after'){
    await page.getByRole('button',{name:'Счета',exact:true}).click();await page.getByRole('heading',{name:'Счета',exact:true}).waitFor();
    await page.getByRole('button',{name:'Все разделы',exact:true}).click();await page.getByRole('button',{name:'Аналитика',exact:true}).click();await page.locator('.report-spending-hero').waitFor();
   }
   await page.locator('.mini-nav').getByRole('button',{name:'Записать',exact:true}).click();
   await page.locator('#amount').fill('37,50');
   if(label==='after'){
    await page.getByRole('button',{name:'Все категории',exact:false}).click();
    await page.getByRole('searchbox',{name:'Найти категорию',exact:true}).fill('Коты');await page.getByRole('button',{name:'Коты',exact:true}).click();
    await page.getByRole('button',{name:'Свернуть',exact:true}).click();await page.getByLabel('Комментарий',{exact:true}).fill('Покупка для котов');
   }
   await page.locator('#amount').blur();await shot('entry-390');
   if(label==='after'){
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});await noOverflow('entry '+width);}
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/Записать.*37,50/}).click();
    await page.locator('.report-spending-hero').waitFor();assert.equal(data.accounts[0].balance,1762.5);assert.equal(data.transactions.length,2);assert.equal(data.transactions.at(-1).cat,'cat');
    await page.locator('.mini-nav').getByRole('button',{name:'История',exact:true}).click();await page.getByLabel('Поиск операций',{exact:true}).fill('Покупка для котов');await page.getByText('Покупка для котов',{exact:true}).waitFor();
    await page.locator('.mini-nav').getByRole('button',{name:'Главная',exact:true}).click();const accountAmount=page.locator('.home-accounts button').filter({hasText:'Карта'}).locator('strong');await accountAmount.waitFor();assert.equal(await accountAmount.textContent(),money(1762.5));await shot('recorded-expense-390');
   }
   await page.goto(origin+'/?settings=1');await page.getByRole('button',{name:/Свои категории/}).click();
   if(label==='after'){
    const chooseIcon=async name=>{
     const disclosure=page.locator('.category-studio .symbol-picker');
     if(!await disclosure.evaluate(el=>el.open))await disclosure.locator(':scope > summary').click();
     await disclosure.getByRole('button',{name:'Значок: '+name,exact:true}).click();
    };
    await page.getByLabel('Название категории',{exact:true}).fill('Кофе');await chooseIcon('Кофе');await page.getByRole('button',{name:'Добавить категорию',exact:true}).click();await page.getByRole('button',{name:/Кофе.*Изменить/}).waitFor();assert.equal(data.customCats.at(-1).icon,'coffee');
    await page.getByRole('button',{name:/Коты.*Изменить/}).click();await chooseIcon('Питомцы');await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();assert.equal(data.customCats.find(c=>c.id==='cat').icon,'pet');
    for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await noOverflow('categories '+width);await shot('categories-'+width);}
   }else await shot('categories-390');
   assert.deepEqual(errors,[]);
   evidence.push({label,homeHeight,actionTop,accountBalance:data.accounts[0].balance,transactionCount:data.transactions.length,linked:!!data.transactions[0].recurringId,customCategories:data.customCats.length,pageErrors:errors});
  }finally{await context.close();await server.close();}
 }
}finally{await browser.close();await unlink(path.join(temp,'node_modules'));execFileSync('git',['worktree','remove','--force',temp],{stdio:'ignore'});}
await writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));
console.log('Task-first home, navigation, expense and recorded payment Chromium passed');
