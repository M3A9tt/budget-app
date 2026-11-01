import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile,mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {createPlanned} from '../src/planned-operations.js';
import {putTransaction} from '../src/ledger.js';
const baseline='7a662b52a1ba7db08440b3fcb3685c492ce9e278',out=process.env.USABILITY_SCREENSHOT_DIR||'/tmp/burget-usability',root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'burget-ui-before-'));
await mkdir(out,{recursive:true});
execFileSync('git',['fetch','origin',baseline,'--depth=1'],{stdio:'ignore'});execFileSync('git',['worktree','add','--detach',temp,baseline],{stdio:'ignore'});await symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
const today=todayMoscow();let seed=createPlanned({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:2000,currency:'RUB'}],settings:{...EMPTY.settings,modules:{plans:true},notificationMode:'manual'},customCats:[{id:'cat',name:'Коты',icon:'other',color:'#b8dec4'}]},{id:'housing',name:'ЖКХ',type:'expense',amount:200,accountId:'a',frequency:'monthly',startDate:today});seed=putTransaction(seed,{id:'manual',type:'expense',cat:'housing',amount:200,date:today,accountId:'a',note:'ЖКХ уже записано'});
await writeFile(path.join(out,'fixture.json'),JSON.stringify({baseline,today,fictional:true,data:seed},null,2));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const evidence=[];
try{for(const [label,appRoot] of [['before',temp],['after',root]]){
 const server=await createServer({root:appRoot,server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port,context=await browser.newContext({viewport:{width:390,height:1200},reducedMotion:'reduce'}),page=await context.newPage();let data=structuredClone(seed),revision=1;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));await page.route('**/api/v1/**',async r=>{if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.expectedRevision,revision);data=body.data;revision++;}await r.fulfill({json:{data,revision,userId:'fictional-ui',isOwner:false}});});
 await page.goto(origin);await page.getByRole('button',{name:/Карта.*1\s*800/}).waitFor();await page.screenshot({path:path.join(out,label+'-overview-390.png'),fullPage:true});if(label==='after'){await page.getByRole('button',{name:'Открыть платежи',exact:true}).click();await page.getByRole('heading',{name:'Платежи',exact:true}).waitFor();await page.goto(origin);}await page.getByRole('button',{name:'Что требует внимания',exact:true}).click();const item=page.locator('.attention-center article').filter({has:page.getByText('ЖКХ',{exact:true})});
 if(label==='after'){await item.getByRole('button',{name:'Уже учтено',exact:true}).click();await item.getByLabel('Найти запись',{exact:true}).fill('ЖКХ уже');await item.getByLabel('Уже записанная операция').selectOption('manual');await page.screenshot({path:path.join(out,label+'-payment-390.png'),fullPage:true});const balances=structuredClone(data.accounts);await item.getByRole('button',{name:'Связать без списания',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.attention-center article')?.textContent.includes('ЖКХ'));assert.deepEqual(data.accounts,balances);assert.equal(data.transactions.length,1);assert.equal(data.transactions[0].recurringId,'housing');}else await page.screenshot({path:path.join(out,label+'-payment-390.png'),fullPage:true});
 await page.goto(origin+'/?settings=1');await page.getByRole('button',{name:/Свои категории/}).click();
 if(label==='after'){
  await page.getByLabel('Название категории',{exact:true}).fill('Кофе');await page.getByRole('button',{name:'☕',exact:true}).click();await page.getByRole('button',{name:'Добавить категорию',exact:true}).click();await page.getByRole('button',{name:/☕ Кофе/}).waitFor();assert.equal(data.customCats.at(-1).emoji,'☕');
  await page.getByRole('button',{name:/Коты.*Изменить/}).click();await page.getByRole('button',{name:'🐈',exact:true}).click();await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();assert.equal(data.customCats.find(c=>c.id==='cat').emoji,'🐈');
  for(const width of [320,390,768]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(out,label+'-categories-'+width+'.png'),fullPage:true});}
 }else await page.screenshot({path:path.join(out,label+'-categories-390.png'),fullPage:true});
 assert.deepEqual(errors,[]);evidence.push({label,accountBalance:data.accounts[0].balance,transactionCount:data.transactions.length,linked:!!data.transactions[0].recurringId,customCategories:data.customCats.length,pageErrors:errors});
 }finally{await context.close();await server.close();}
}}finally{await browser.close();execFileSync('git',['worktree','remove','--force',temp],{stdio:'ignore'});await rm(temp,{recursive:true,force:true});}
await writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log('Intuitive payments/categories Chromium passed');
