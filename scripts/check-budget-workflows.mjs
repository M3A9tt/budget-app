import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,symlink,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {demoData,EMPTY} from '../src/mini-model.js';

const root=process.cwd(),baseline=process.env.WORKFLOWS_BASE||'6c9df2b';
const out=process.env.WORKFLOWS_SCREENSHOTS||join(tmpdir(),'burget-workflows-preview');
const date='2026-11-21',day=new Date(date+'T12:00:00Z');
const demo=demoData(date);
const fixture={...demo,settings:{...demo.settings,interfaceGuideSeen:true,telemetryEnabled:false,modules:{...demo.settings.modules,lunch:true}}};
await mkdir(out,{recursive:true});
await writeFile(join(out,'fixture.json'),JSON.stringify({baseline,date,fictional:true,data:fixture},null,2));
const before=await mkdtemp(join(tmpdir(),'burget-workflows-before-'));
let browser;

async function profile(browser,origin,seed=fixture) {
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU',reducedMotion:'reduce'});
 let data=structuredClone(seed),revision=1,changes=0;
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.clock.setFixedTime(day);
 await page.addInitScript(()=>{
  window.Telegram={WebApp:{initData:'fixture',BackButton:{onClick(fn){window.burgetBack=fn;},offClick(fn){if(window.burgetBack===fn)delete window.burgetBack;},show(){},hide(){}}}};
 });
 await page.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('**/api/v1/**',async route=>{
  if(!route.request().url().endsWith('/state'))return route.fulfill({json:{}});
  if(route.request().method()==='PUT'){
   const input=route.request().postDataJSON();
   assert.equal(input.expectedRevision,revision);
   data=input.data;
   revision++;
   changes++;
  }
  await route.fulfill({json:{data,revision,userId:'fictional-preview'}});
 });
 return {
  page,errors,data:()=>data,changes:()=>changes,
  open:async(path='')=>{
   await page.goto(origin+'/'+path);
   await page.locator('.mini-page').waitFor();
  },
  nav:name=>page.locator('.mini-nav').getByRole('button',{name,exact:true}).click(),
  back:()=>page.evaluate(()=>window.burgetBack())
 };
}

try {
 execFileSync('git',['worktree','add','--detach',before,baseline],{stdio:'ignore'});
 await symlink(join(root,'node_modules'),join(before,'node_modules'),'junction');
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox']});
 for(const [label,appRoot] of [['before',before],['after',root]]) {
  const server=await createServer({root:appRoot,logLevel:'error',server:{host:'127.0.0.1',port:0}});
  await server.listen();
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  try {
   const captures=await profile(browser,origin);
   try {
    for(const width of [320,390,1280]) {
     await captures.page.setViewportSize({width,height:844});
     if(width!==320)await captures.page.evaluate(()=>localStorage.clear());
     await captures.open();
     const shot=async name=>{
      await captures.page.evaluate(()=>document.fonts.ready);
      assert.equal(await captures.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+' '+width);
      await captures.page.screenshot({path:join(out,label+'-'+name+'-'+width+'.png'),fullPage:true});
     };
     await captures.page.locator('.home-budget').waitFor();
     await shot('home');
     await captures.nav('Записать');
     await captures.page.locator('#amount').fill('1000.01');
     await shot('entry');
     await captures.back();
     await captures.nav('Аналитика');
     await captures.page.locator('.report-total-button').waitFor();
     await shot('analytics');
     await captures.page.locator('.report-category').first().click();
     await captures.page.getByRole('button',{name:'К аналитике',exact:true}).waitFor();
     await shot('operations');
     await captures.nav('Открыть календарь');
     await captures.page.locator('.money-calendar').waitFor();
     await shot('calendar');
    }
    assert.deepEqual(captures.errors,[]);
    assert.equal(captures.changes(),0);
   } finally {await captures.page.close();}

   if(label==='after'){
    const empty=await profile(browser,origin,{...structuredClone(EMPTY),settings:{...EMPTY.settings,interfaceGuideSeen:true,telemetryEnabled:false}});
    try {
     await empty.open();
     await empty.page.getByRole('button',{name:'Перенести данные',exact:true}).click();
     await empty.page.getByRole('button',{name:/Восстановить копию/}).click();
     await empty.page.locator('input[type=file]').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
     await empty.page.getByRole('heading',{name:'Перед заменой проверь'}).waitFor();
     assert.equal(await empty.page.getByRole('button',{name:'Восстановить проверенный бэкап'}).isDisabled(),true);
     await empty.back();
     await empty.page.getByRole('button',{name:/Импортировать историю/}).waitFor();
     await empty.back();
     await empty.page.getByRole('heading',{name:'Настройки',exact:true}).waitFor();
     await empty.back();
     await empty.page.getByRole('button',{name:'Начать с текущих остатков'}).click();
     await empty.page.locator('#account-name').fill('Первая карта');
     await empty.page.locator('#account-balance').fill('1000');
     await empty.page.getByRole('button',{name:'Добавить счёт',exact:true}).click();
     await empty.page.locator('#amount').fill('77.01');
     await empty.page.getByRole('button',{name:/^Записать.*77,01/}).click();
     await empty.page.locator('.home-budget').waitFor();
     assert.equal(empty.data().transactions.length,1);
     assert.equal(empty.data().transactions[0].accountId,empty.data().accounts[0].id);
     assert.equal(empty.data().accounts[0].balance,922.99);
     assert.equal(empty.changes(),2);
     assert.deepEqual(empty.errors,[]);
    } finally {await empty.page.close();}

    const filled=await profile(browser,origin);
    try {
     await filled.open();
     await filled.nav('Аналитика');
     await filled.page.getByRole('button',{name:'7 дней',exact:true}).click();
     await filled.page.locator('.report-category').first().click();
     const filters=filled.page.getByRole('group',{name:'Активные фильтры'});
     await filters.getByRole('button',{name:/Снять фильтр:.*—/}).waitFor();
     assert.ok(await filters.getByRole('button',{name:/Снять фильтр:/}).count()>=3);
     await filters.getByRole('button',{name:'Сбросить все'}).click();
     assert.equal(await filters.getByRole('button',{name:/Снять фильтр:/}).count(),0);
     await filled.back();
     assert.equal(await filled.page.getByRole('button',{name:'7 дней',exact:true}).getAttribute('aria-pressed'),'true');
     await filled.nav('Операции');
     await filled.page.getByRole('searchbox',{name:'Поиск операций'}).fill('Кофе');
     await filled.page.getByRole('button',{name:'Открыть таблицу обедов'}).click();
     await filled.page.getByRole('button',{name:'История обедов',exact:true}).click();
     await filled.page.getByRole('heading',{name:'История обедов'}).waitFor();
     await filled.back();
     await filled.page.getByRole('button',{name:'К операциям',exact:true}).click();
     assert.equal(await filled.page.getByRole('searchbox',{name:'Поиск операций'}).inputValue(),'Кофе');
     assert.equal(filled.changes(),0);
     const balances=filled.data().accounts.map(account=>[account.id,account.balance]);
     await filled.open('?settings=1');
     await filled.page.getByRole('button',{name:/Импорт операций/}).click();
     await filled.page.locator('.settings-json').getByRole('button',{name:'Текст',exact:true}).click();
     const account=filled.data().accounts.find(item=>item.currency==='RUB');
     await filled.page.getByRole('textbox',{name:'Вставить JSON',exact:true}).fill(JSON.stringify({format:'burget-operations',version:1,operations:[{date,type:'expense',amount:12.34,currency:'RUB',account:account.id,category:'food',note:'Старая покупка из выписки'}]}));
     await filled.page.getByRole('button',{name:'Проверить и исправить',exact:true}).click();
     assert.equal(await filled.page.getByRole('checkbox',{name:'Также изменить остатки счетов'}).isChecked(),false);
     await filled.page.getByRole('button',{name:'Подтвердить импорт · 1',exact:true}).click();
     await filled.page.locator('.json-import-row').first().waitFor({state:'detached'});
     assert.deepEqual(filled.data().accounts.map(account=>[account.id,account.balance]),balances);
     assert.equal(filled.data().transactions.find(tx=>tx.note==='Старая покупка из выписки')?.amount,12.34);
     assert.equal(filled.changes(),1);
     assert.deepEqual(filled.errors,[]);
    } finally {await filled.page.close();}
   }
  } finally {await server.close();}
 }
} finally {
 await browser?.close();
 await unlink(join(before,'node_modules')).catch(()=>{});
 execFileSync('git',['worktree','remove','--force',before],{stdio:'ignore'});
}
console.log('Budget workflow comparisons and browser scenarios passed.');
