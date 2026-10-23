import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

// Compare real revisions, with identical fictional records and viewport.
const root=process.cwd(),beforeRef=process.env.AUDIT_BEFORE_REF||'4755826e182350c88abaac17c6070b8700b98afb';
const out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'/tmp/burget-audit-comparison');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const beforeSha=git('rev-parse',beforeRef),afterSha=git('rev-parse','HEAD');
const temporary=await mkdtemp(join(tmpdir(),'burget-audit-')),oldRoot=join(temporary,'before');
const date='2026-10-21';
const fixture={schemaVersion:2,transactions:Array.from({length:3},(_,i)=>({id:'old-fx-'+i,type:'expense',cat:'food',amount:0.05,currency:'USD',date,note:'Старая валютная покупка',tags:[]})),accounts:[{id:'bank',name:'Основной счёт',balance:10000,currency:'RUB'}],debts:[],goals:[],wishes:[],customCats:[],transfers:[],recurring:[{id:'skipped',name:'Оплата интернета',amount:600,currency:'RUB',accountId:'bank',cat:'comm',type:'expense',frequency:'monthly',startDate:date,dueDay:21,active:true,skippedPeriods:['2026-10']}],history:[],lunchDayOff:[],lunchDayMod:{},categoryBudgets:{},settings:{budget:0,lunchDaily:400,workDays:22,reserveRub:0,nextIncomeDate:'2026-11-01',timeZone:'Europe/Moscow',modules:{plans:true}},rates:{RUB:1,USD:201.5,EUR:100,GBP:117,CNY:12.7,TRY:2.8}};
let browser;
await mkdir(out,{recursive:true});
try{
 git('worktree','add','--detach',oldRoot,beforeSha);
 await symlink(join(root,'node_modules'),join(oldRoot,'node_modules'),'junction');
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [label,source,sha] of [['before',oldRoot,beforeSha],['after',root,afterSha]]){
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});
  await server.listen();
  const context=await browser.newContext({viewport:{width:390,height:1200},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date(date+'T09:00:00Z')});
   await page.route('https://telegram.org/**',route=>route.abort());
   await page.route('**/api/v1/**',route=>route.fulfill({json:{revision:1,data:structuredClone(fixture)}}));
   const origin='http://127.0.0.1:'+server.httpServer.address().port;
   await page.goto(origin+'/?payments=1');await page.getByRole('button',{name:/^(Постоянные|Регулярные)$/,exact:true}).click();
   const card=page.locator('.mini-card').filter({has:page.getByText('Оплата интернета',{exact:true})});await card.waitFor();
   if(label==='after'){if(await card.locator('.planned-actions>summary').count())await card.locator('.planned-actions>summary').click();await card.locator('.plan-skipped summary').click();await card.getByRole('button',{name:'Вернуть в план 2026-10',exact:true}).waitFor();}
   else assert.equal(await card.getByRole('button',{name:/Вернуть в план/}).count(),0);
   await page.evaluate(()=>document.fonts.ready);await card.evaluate(el=>el.scrollIntoView({block:'start'}));await card.screenshot({path:join(out,'plans-'+label+'.png'),animations:'disabled'});
   await page.locator('.mini-nav').getByRole('button',{name:'Анализ',exact:true}).click();await page.locator('.report-spending-hero').waitFor();
   const amount=(await page.locator('.report-total-button strong').textContent()).replace(/\s/g,'');assert.equal(amount,label==='before'?'30,23₽':'30,24₽');
   await page.locator('.report-spending-hero').screenshot({path:join(out,'money-'+label+'.png'),animations:'disabled'});
   assert.deepEqual(errors,[]);
   await writeFile(join(out,label+'.json'),JSON.stringify({sha,date,viewport:{width:390,height:1200},fixture,displayedTotal:amount},null,2)+'\n');
  }finally{await context.close();await server.close();}
 }
 console.log(JSON.stringify({beforeSha,afterSha,date,out,checks:'Actual UI from both revisions; same records; totals asserted; no page errors'}));
}finally{
 await browser?.close();
 try{git('worktree','remove','--force',oldRoot);}finally{await rm(temporary,{recursive:true,force:true});}
}
