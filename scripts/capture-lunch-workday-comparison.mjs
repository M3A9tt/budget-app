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

const root=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(),beforeSha=git('rev-parse',process.env.AUDIT_BEFORE_REF||'e5197becd24ba7969acfd6a32c67261ad20506c2'),afterSha=git('rev-parse',process.env.AUDIT_AFTER_REF||'5b4e35d1cf897d288dffcd2b541adb5e998b0502');
const out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'docs/audit-4.6.1'),temp=await mkdtemp(join(tmpdir(),'burget-workday-audit-')),today='2026-10-25',clock=today+'T09:00:00Z',evidence=[];
const empty=structuredClone(EMPTY);empty.accounts=[{id:'bank',name:'Основной счёт',balance:1000,currency:'RUB'}];empty.settings={...empty.settings,timeZone:'Europe/Moscow',modules:{lunch:true},lunchAskEnabled:true,lunchAskDays:[1,2,3,4,5],dailyReport:false,weeklyReport:false,monthlyReport:false};
let meal=putTransaction(empty,{id:'meal',type:'lunch',cat:'lunch',date:today,amount:350,note:'Суп и горячее'});meal=putTransaction(meal,{id:'topup',type:'expense',cat:'food',date:today,amount:50,accountId:'bank',lunchId:'meal',note:'Доплата за обед'});
let browser;await mkdir(out,{recursive:true});
try{
 for(const [label,sha] of [['before',beforeSha],['after',afterSha]]){
  const source=join(temp,label);git('worktree','add','--detach',source,sha);await symlink(join(root,'node_modules'),join(source,'node_modules'),'junction');
  const {lunchBudget}=await import(pathToFileURL(join(source,'src/lunch-budget.js'))),{notificationJobs}=await import(pathToFileURL(join(source,'server/notifications.js')));
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
  const context=await browser.newContext({viewport:{width:390,height:1000},locale:'ru-RU',deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   const page=await context.newPage(),errors=[];let state=structuredClone(empty),revision=1;page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(clock)});await page.route('**/telegram.org/**',r=>r.abort());await page.route('**/fonts.googleapis.com/**',r=>r.abort());
   await page.route('**/api/v1/**',r=>{if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.expectedRevision,revision);state=body.data;revision++;}return r.fulfill({json:{revision,data:structuredClone(state),isOwner:true}});});
   const origin='http://127.0.0.1:'+server.httpServer.address().port;
   await page.goto(origin+'/?lunch=1');await page.locator('.lunch-table').waitFor();const emptySundayVisible=await page.getByRole('button',{name:today+' · блюда и стоимость',exact:true}).count();await page.screenshot({path:join(out,label+'-empty-table.png'),fullPage:true,animations:'disabled'});
   state=structuredClone(meal);revision++;await page.goto(origin+'/?lunch=1');await page.getByRole('button',{name:today+' · блюда и стоимость',exact:true}).click();await page.locator('.lunch-day').waitFor();await page.setViewportSize({width:390,height:1800});await page.locator('.lunch-day').screenshot({path:join(out,label+'-day.png'),animations:'disabled'});
   const snapshot=JSON.stringify({accounts:state.accounts,transactions:state.transactions,history:state.history}),old=lunchBudget(state,'2026-10',today);
   if(label==='before'){await page.locator('.lunch-day-settings>summary').click();await page.getByRole('button',{name:'Полный день',exact:true}).click();}else{await page.getByRole('button',{name:/^Работал ·/}).click();await page.locator('.lunch-workday-status').waitFor();}
   await page.getByText('Рабочий день обновлён',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.lunch-workday-prompt'));assert.equal(state.lunchDayMod[today],1);assert.equal(JSON.stringify({accounts:state.accounts,transactions:state.transactions,history:state.history}),snapshot);
   const b=lunchBudget(state,'2026-10',today),day=b.days.find(d=>d.date===today),reminder=notificationJobs({...state,transactions:[]},new Date(today+'T08:00:00Z')).filter(j=>j.kind==='lunch').length,actualReminder=notificationJobs(state,new Date(today+'T08:00:00Z')).filter(j=>j.kind==='lunch').length;
   await page.locator('.lunch-day').screenshot({path:join(out,label+'-marked-day.png'),animations:'disabled'});await page.setViewportSize({width:390,height:1000});await page.getByRole('button',{name:'К таблице',exact:true}).click();await page.locator('.lunch-table').waitFor();await page.screenshot({path:join(out,label+'-marked-table.png'),fullPage:true,animations:'disabled'});
   evidence.push({revision:label,sha,emptySundayVisible,before:{budget:old.budget,accrued:old.accrued,spent:old.spent,own:old.own,confirmedDifference:old.confirmedDifference},afterMark:{budget:b.budget,accrued:b.accrued,spent:b.spent,own:b.own,confirmedDifference:b.confirmedDifference,dayLimit:day.limit,dayDifference:day.difference,personalBalance:state.accounts[0].balance},reminderWithoutMeal:reminder,reminderWithMeal:actualReminder});assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();await server.close();}
 }
 assert.deepEqual(evidence.map(e=>[e.emptySundayVisible,e.reminderWithoutMeal,e.reminderWithMeal]),[[0,0,0],[1,1,0]]);
 for(const e of evidence){assert.deepEqual(Object.values(e.before),[8800,6800,350,50,-350]);assert.deepEqual(Object.values(e.afterMark),[9200,7200,350,50,50,400,50,950]);}
 await writeFile(join(out,'financial-evidence.json'),JSON.stringify(evidence,null,2)+'\n');await writeFile(join(out,'capture.json'),JSON.stringify({beforeSha,afterSha,today,clock,viewport:{width:390,height:1000},dayViewport:{width:390,height:1800},fictional:true,empty,meal},null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{await browser?.close();for(const label of ['before','after'])try{git('worktree','remove','--force',join(temp,label));}catch{}await rm(temp,{recursive:true,force:true});}
