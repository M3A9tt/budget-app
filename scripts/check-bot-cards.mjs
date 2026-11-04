import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {reviewData} from './preview-data.mjs';
import {reportAssets} from '../server/report-assets.js';
const out=process.env.BOT_CARD_SCREENSHOT_DIR||path.resolve('../../outputs/bot-cards-505a');fs.mkdirSync(out,{recursive:true});
const assets=await reportAssets({ASSETS:{fetch:async request=>{const file=path.join('public',new URL(request.url).pathname);return new Response(fs.readFileSync(file));}}});
const bundled=await build({entryPoints:['server/report-html.jsx'],bundle:true,write:false,format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'text'}});
const {renderReportHtml}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
let beforeRenderer;if(process.env.BOT_CARD_BEFORE_REF){const old=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',process.env.BOT_CARD_BEFORE_REF+':server/report-html.jsx'],{encoding:'utf8'});const b=await build({stdin:{contents:old,resolveDir:path.resolve('server'),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'text'}});beforeRenderer=(await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].contents).toString('base64'))).renderReportHtml;}
const data=reviewData(),date=new Date().toISOString(),today=date.slice(0,10),kinds=['budget','analytics','categories','forecast','lunch','savings','summary'];
const cases=kinds.map(kind=>({kind,days:30,forecastDays:7,month:today.slice(0,7),from:today,to:today,title:'Итог дня',page:0}));
for(const name of ['accounts','calendar','history','more','settings','settingsData','installments','installment','add'])cases.push({kind:'screen',name,args:name==='installment'?{id:data.installments[0].id}:{}});
const launch=fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{};
const browser=await chromium.launch({headless:true,...launch});const checks=[];
try{const page=await browser.newPage({viewport:{width:640,height:1600},deviceScaleFactor:2});
for(const params of cases){const name=params.kind==='screen'?params.name:params.kind,html=renderReportHtml(data,params,date,assets);const errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.setContent(html);await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.fonts.check('500 16px Commissioner')),true,name+' font');assert.equal(await page.locator('.burget-lockup').evaluate(img=>img.complete&&img.naturalWidth>0),true,name+' logo');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=640),true,name+' overflow');const box=await page.locator('#report-card').boundingBox();assert(box.height<4300,name+' Telegram image bounds');await page.locator('#report-card').screenshot({path:path.join(out,name+'.png')});assert.deepEqual(errors,[]);checks.push({name,width:box.width,height:box.height,font:true,logo:true,overflow:false});}
if(beforeRenderer)for(const kind of ['budget','analytics','lunch']){const params=cases.find(p=>p.kind===kind);await page.setContent(beforeRenderer(data,params,date));await page.locator('#report-card').screenshot({path:path.join(out,'before-'+kind+'.png')});}
fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('PASS '+checks.length+' real rendered report cards: current logo, local Commissioner, no overflow, Telegram image bounds');
}finally{await browser.close();}
