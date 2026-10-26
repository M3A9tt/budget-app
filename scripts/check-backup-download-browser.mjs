import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,symlink,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import {EMPTY} from '../src/mini-model.js';

const root=process.cwd(),out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'/tmp/burget-backup-download');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const beforeSha=git('rev-parse','79c7053ead0af898f8c35ad6edf6f3569edae7a2'),afterSha=git('rev-parse','HEAD');
const temporary=await mkdtemp(join(tmpdir(),'burget-backup-')),oldRoot=join(temporary,'before');
const fixture={...structuredClone(EMPTY),accounts:[{id:'bank',name:'Основной счёт',balance:777,currency:'RUB'}]};
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('server/schema.sql','utf8'));
sqlite.prepare('INSERT INTO user_finance_state VALUES(?,7,?,?)').run('111',JSON.stringify(fixture),'test');
sqlite.prepare('INSERT INTO legacy_owner_migrations VALUES(?,0)').run('111');
const DB={prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};return statement;},async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const env={DB,TELEGRAM_OWNER_ID:'111',TELEGRAM_BOT_TOKEN:'fictional-browser-test-token'};
const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:111,first_name:'QA'})});
const secret=createHmac('sha256','WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
params.set('hash',createHmac('sha256',secret).update([...params].map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
let browser;
await mkdir(out,{recursive:true});
try{
 git('worktree','add','--detach',oldRoot,beforeSha);await symlink(join(root,'node_modules'),join(oldRoot,'node_modules'),'junction');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temporary,'key.pem'),'-out',join(temporary,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const https={key:await readFile(join(temporary,'key.pem')),cert:await readFile(join(temporary,'cert.pem'))};
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [label,source,sha] of [['before',oldRoot,beforeSha],['after',root,afterSha]]){
  const server=await createServer({root:source,server:{host:'127.0.0.1',port:0,https}});await server.listen();
  const context=await browser.newContext({viewport:{width:390,height:1100},ignoreHTTPSErrors:true,isMobile:true,hasTouch:true,locale:'ru-RU'});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-10-26T09:00:00Z')});
   await page.route('https://telegram.org/**',route=>route.abort());
   await page.addInitScript(initData=>{
    window.__nativeDownloads=[];window.__blobDownloads=0;window.__acceptDownload=true;
    const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:')){window.__blobDownloads++;return;}return click.call(this);};
    window.Telegram={WebApp:{initData,isVersionAtLeast:()=>true,downloadFile:(file,callback)=>{window.__nativeDownloads.push(file);window.__downloadCallback=callback;if(window.__acceptDownload!==null)callback(window.__acceptDownload);}}};
   },params.toString());
   // Exercise the real authenticated Worker and SQLite persistence, not a mock export API.
   await page.route('**/api/v1/**',async route=>{const request=route.request(),response=await worker.fetch(new Request(request.url(),{method:request.method(),headers:request.headers(),body:request.postData()||undefined}),env);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
   const origin='https://127.0.0.1:'+server.httpServer.address().port;
   await page.goto(origin+'/?settings=1');await page.getByRole('button',{name:/Резервные копии/}).click();
   await page.getByRole('button',{name:'Скачать текущий JSON',exact:true}).click();
   if(label==='after'){
    await page.getByRole('status').filter({hasText:'Скачивание начато в Telegram'}).waitFor();
    const calls=await page.evaluate(()=>window.__nativeDownloads);assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>window.__blobDownloads),0);
    const file=await worker.fetch(new Request(calls[0].url),env);assert.equal(file.status,200);assert.match(file.headers.get('Content-Disposition'),/attachment/);assert.deepEqual(await file.json(),fixture);
   }else{assert.equal(await page.evaluate(()=>window.__nativeDownloads.length),0);assert.equal(await page.evaluate(()=>window.__blobDownloads),1);}
   await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(out,'backup-'+label+'-390.png'),fullPage:true,animations:'disabled'});
   await page.getByLabel('Восстановить бэкап',{exact:true}).setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(EMPTY))});
   await page.evaluate(()=>window.__acceptDownload=null);await page.getByRole('button',{name:'Скачать копию перед заменой',exact:true}).click();
   if(label==='after'){
    assert.equal(await page.getByRole('checkbox',{name:/Копию сохранил/}).isDisabled(),true);
    await page.waitForFunction(()=>window.__nativeDownloads.length===2);
    await page.evaluate(()=>window.__downloadCallback(false));await page.getByRole('status').filter({hasText:'Скачивание отменено'}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:/Копию сохранил/}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Восстановить проверенный бэкап',exact:true}).isDisabled(),true);
   }else assert.equal(await page.getByRole('checkbox',{name:/Копию сохранил/}).isEnabled(),true);
   await page.screenshot({path:join(out,'restore-'+label+'-390.png'),fullPage:true,animations:'disabled'});
   if(label==='after'){
    await page.evaluate(()=>window.__acceptDownload=true);await page.getByRole('button',{name:'Скачать копию перед заменой',exact:true}).click();await page.getByRole('checkbox',{name:/Копию сохранил/}).check();assert.equal(await page.getByRole('button',{name:'Восстановить проверенный бэкап',exact:true}).isEnabled(),true);
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:1100});const bounds=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.client+1,JSON.stringify(bounds));}
   }
   assert.deepEqual(errors,[]);assert.deepEqual(JSON.parse(sqlite.prepare('SELECT data FROM user_finance_state WHERE user_id=?').get('111').data),fixture);
   await writeFile(join(out,label+'.json'),JSON.stringify({sha,date:'2026-10-26',fixture,environment:'Chromium with a simulated Telegram bridge and blocked blob navigation; real Worker and SQLite',nativeCalls:await page.evaluate(()=>window.__nativeDownloads.length),blockedBlobCalls:await page.evaluate(()=>window.__blobDownloads)},null,2)+'\n');
  }finally{await context.close();await server.close();}
 }
 console.log('PASS: backup native HTTPS download; actual authenticated Worker and SQLite; exact snapshot; blocked WebView blob simulation; cancelled copy cannot unlock restore; accepted copy plus acknowledgement; 320/390/768/1280px; unchanged finances. '+JSON.stringify({beforeSha,afterSha,out}));
}finally{await browser?.close();sqlite.close();try{git('worktree','remove','--force',oldRoot);}finally{await rm(temporary,{recursive:true,force:true});}}
