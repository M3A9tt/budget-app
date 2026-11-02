import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const out=path.resolve('docs/glass-interface');fs.mkdirSync(out,{recursive:true});
const baseline=process.env.INTERFACE_BASELINE;
const server=await createServer({plugins:baseline?[{name:'baseline-interface',enforce:'pre',transform(code,id){const relative=path.relative(process.cwd(),id.split('?')[0]).replaceAll('\\','/');if(/^src\/.*\.(css|jsx|js)$/.test(relative)){try{return {code:execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',baseline+':'+relative],{encoding:'utf8',stdio:['ignore','pipe','ignore']}),map:null};}catch{}}}}]:[],server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let data=JSON.parse(fs.readFileSync('docs/personal-interface/fixture.json','utf8')).data,revision=1;
data.settings={...data.settings,interfaceVersion:2,interfaceGuideSeen:true,modules:{...data.settings.modules,goals:true,lunch:true,limits:true}};
data.wishes=[{id:'wish',name:'Камера в поездку',note:'Компактная, с хорошим объективом',target:65000,currency:'RUB',priority:'main',accountId:'',done:false}];
const original=structuredClone(data),errors=[],screens=[],writes=[];fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify({fictional:true,data:original},null,2));
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
const nav=name=>page.locator('.mini-nav').getByRole('button',{name,exact:true});
const more=async name=>{await nav('Ещё').click();await page.getByRole('button',{name,exact:true}).last().click();};
const shot=async name=>{await page.locator('.mini-section-loading').waitFor({state:'hidden'});await page.evaluate(()=>document.fonts.ready);for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow '+width);if([390,1280].includes(width))await page.screenshot({path:path.join(out,(baseline?'before-':'after-')+name+'-'+width+'.jpg'),type:'jpeg',quality:90,fullPage:false});screens.push({name,width,noOverflow:true});}await page.setViewportSize({width:390,height:844});};
try{
 await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('**/api/v1/**',r=>{const url=new URL(r.request().url());if(url.pathname==='/api/v1/telemetry')return r.fulfill({json:{ok:true}});if(url.pathname!=='/api/v1/state')return r.fulfill({status:503,json:{error:'Вымышленный профиль: сервис недоступен'}});if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.expectedRevision,revision);data=body.data;writes.push(structuredClone(data));revision++;}return r.fulfill({json:{data,revision,userId:'fictional-glass-interface'}});});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('.ins-home').waitFor();await shot('home');
 await page.getByRole('button',{name:'Записать операцию',exact:true}).click();await page.locator('#amount').fill('250');await page.getByLabel('Комментарий',{exact:true}).fill('Кофе с собой');await shot('entry');await page.getByRole('button',{name:'Назад',exact:true}).click();
 await nav('Открыть календарь').click();await page.locator('.money-calendar').waitFor();await shot('calendar');
 await nav('Операции').click();await page.locator('.mini-page[data-page=history]').waitFor();await shot('operations');
 for(const [name,key] of [['Счета','accounts'],['Накопления','savings'],['Цели','goals'],['Аналитика','analytics'],['Обеды','lunch'],['Настройки','settings']]){await more(name);await shot(key);}
 for(const [name,key] of [['Уведомления','notifications'],['Бюджет и лимиты','limits'],['Импорт операций','import'],['Резервные копии','backup'],['Модули и главная','modules']]){await page.getByRole('button',{name:new RegExp(name)}).click();await shot(key);await page.getByRole('button',{name:'Все настройки',exact:true}).click();}
 await page.getByRole('button',{name:/Свои категории/}).click();await shot('categories');
 if(!baseline){
  await page.getByLabel('Название категории',{exact:true}).fill('Кофе с собой');
  await page.locator('.symbol-picker>summary').click();
  assert.equal(await page.getByRole('group',{name:'SVG-значки',exact:true}).locator('button').count(),36);
  for(const svg of await page.getByRole('group',{name:'SVG-значки',exact:true}).locator('button svg').all())assert.notEqual(await svg.getAttribute('data-icon'),null);
  await page.getByLabel('Найти значок',{exact:true}).fill('Кофе');await page.getByRole('button',{name:'Значок: Кофе',exact:true}).click();await shot('symbol-picker');
  await page.getByRole('button',{name:'Добавить категорию',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Название категории"]').value==='');
  const category=data.customCats.find(c=>c.name==='Кофе с собой');assert(category);assert.equal(category.icon,'coffee');assert.equal(category.emoji,'');assert.deepEqual(data.accounts,original.accounts);assert.deepEqual(data.transactions,original.transactions);
  await more('Счета');await page.locator('.account-tile').first().click();await page.locator('.account-appearance>summary').click();await page.locator('.account-appearance .symbol-picker>summary').click();await page.getByRole('button',{name:'Значок: Карта',exact:true}).click();await page.getByRole('button',{name:'Сохранить оформление',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.mini-toast')?.textContent.includes('Значок счёта сохранён'));
  assert.equal(data.accounts[0].icon,'card');assert.deepEqual(data.accounts.map(a=>a.balance),original.accounts.map(a=>a.balance));assert.deepEqual(data.transactions,original.transactions);
  await nav('Главная').click();assert.equal(await page.locator('.ins-account-strip [data-icon=card]').count(),1);
  await page.reload();await page.locator('.ins-home').waitFor();assert.equal(await page.locator('.ins-account-strip [data-icon=card]').count(),1);
  await page.getByRole('button',{name:'Записать операцию',exact:true}).click();await page.getByRole('button',{name:'Продолжить',exact:true}).click();assert.equal(await page.locator('#amount').inputValue(),'250');
  await page.locator('.entry-picker-trigger').filter({hasText:'Категория'}).click();await page.getByRole('dialog').getByRole('button',{name:'Кофе с собой',exact:true}).click();
  await page.locator('.entry-picker-trigger').filter({hasText:'Счёт'}).click();assert.equal(await page.getByRole('dialog').locator('[data-icon=card]').count(),1);await page.getByRole('dialog').getByRole('button',{name:/Основная карта/}).click();
  await page.getByRole('button',{name:/^Записать.*250/}).click();await page.locator('.ins-home').waitFor();assert.equal(data.accounts[0].balance,original.accounts[0].balance-250);assert.equal(data.transactions.length,original.transactions.length+1);assert.equal(data.transactions.find(t=>t.note==='Кофе с собой').cat,category.id);
  await nav('Операции').click();assert(await page.locator('[data-icon=coffee]').count()>0);await shot('operations-custom-icon');
  await nav('Открыть календарь').click();await page.locator('.money-calendar').waitFor();assert(await page.locator('.money-selected-day [data-icon=coffee]').count()>0);await page.locator('.calendar-symbol-help>summary').click();assert((await page.locator('.calendar-symbol-key').innerText()).includes('Кофе'));await shot('calendar-custom-icon');
  await more('Настройки');await page.getByRole('button',{name:/Вид приложения/}).click();await page.getByRole('button',{name:'Прежний вид',exact:true}).click();await page.locator('.mini-shell:not(.personal-ui)').waitFor();assert.equal(data.accounts[0].icon,'card');assert.equal(data.customCats.find(c=>c.id===category.id).icon,'coffee');assert.equal(data.accounts[0].balance,original.accounts[0].balance-250);
  await page.getByRole('button',{name:'Новый вид · пилот',exact:true}).click();await page.locator('.personal-ui').waitFor();
 }
 assert.deepEqual(errors,[]);if(baseline)assert.deepEqual(data,original);
 fs.writeFileSync(path.join(out,(baseline?'before':'after')+'-checks.json'),JSON.stringify({fictional:true,baseline:baseline||null,sourceRevision:execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'rev-parse','HEAD'],{encoding:'utf8'}).trim(),screens,writes:writes.length,errors,iconRoundtrip:!baseline,expenseDebitedOnce:!baseline,legacySwitch:!baseline},null,2));
 console.log('PASS whole glass interface: '+screens.length+' viewport checks; '+(baseline?'baseline unchanged':'local SVG picker, metadata-only account changes, reload, expense, history and server-shell roundtrip')+'.');
}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log({error:String(error),pageErrors:errors});console.log((await page.locator('body').innerText()).slice(0,3500));throw error;}finally{await browser.close();await server.close();}
