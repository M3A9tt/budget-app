import {chromium} from 'playwright-core';import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
const open=async()=>{await p.goto('http://127.0.0.1:5188/');await p.locator('.mini-nav').getByRole('button',{name:'Ещё',exact:true}).click();await p.locator('.more-tile-grid').waitFor();};
await open();assert.equal(await p.locator('.more-tile-grid>.settings-group-tile').count(),3);
const names=await p.locator('.more-menu section button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
for(const width of [320,390,1280]){await p.setViewportSize({width,height:900});await p.waitForTimeout(350);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'../../outputs/more-tiles-'+width+'.png',fullPage:true});}
await p.setViewportSize({width:390,height:844});for(const name of names){await open();await p.locator('.more-menu').getByRole('button',{name,exact:true}).click();await p.locator('.more-menu').waitFor({state:'detached'});assert(await p.locator('main').innerText().then(s=>s.trim().length>0));}
assert.deepEqual(errors,[]);console.log('PASS 3 groups, 320/390/1280 without overflow, '+names.length+' navigation links, no page errors');
}finally{await b.close();}
