import {chromium} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkReportLogo} from './report-logo-check.mjs';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {latestRelease} from '../src/release-notes.js';
const config=JSON.parse(await readFile('server/wrangler.staging.jsonc','utf8'));
if(config.name!=='budget-staging')throw Error('Only staging is configured');
const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('Missing deployment credential');
// A separate announcement credential: raw Cloudflare token never reaches the app.
const key=createHash('sha256').update('budget-release:'+config.name+':'+token).digest('hex');
const secret=spawnSync('npx',['--no-install','wrangler','secret','put','RELEASE_DEPLOY_TOKEN','--config','server/wrangler.staging.jsonc'],{input:key+'\n',encoding:'utf8',env:process.env});
if(secret.status!==0)throw Error('Could not configure announcement credential');
const browser=await chromium.launch({headless:true});try{for(const scene of ['budget','calendar','event']){
 const endpoint=new URL('/api/v1/releases/check-picture',config.vars.MINI_APP_URL);endpoint.searchParams.set('scene',scene);
 const smoke=await fetch(endpoint,{method:'POST',headers:{'X-Budget-Release-Key':key},signal:AbortSignal.timeout(60000)});
 const checked=await smoke.json();if(!smoke.ok||checked.releaseId!==latestRelease.id||checked.storage!==true||!checked.width||!checked.height)throw Error('Deployed screenshot render check failed: '+scene+' '+JSON.stringify(checked));
 endpoint.searchParams.set('png','1');const image=await fetch(endpoint,{method:'POST',headers:{'X-Budget-Release-Key':key},signal:AbortSignal.timeout(60000)});if(!image.ok)throw Error('Could not retrieve deployed screenshot');
 const png=new Uint8Array(await image.arrayBuffer());await writeFile(join(process.env.RUNNER_TEMP||tmpdir(),'burget-deployed-report-'+scene+'.png'),png);
 const logo=await checkReportLogo(browser,png);console.log('Screenshot render check: '+JSON.stringify({...checked,...logo}));
}}finally{await browser.close();}
if(process.argv.includes('--check-only'))process.exit(0);
const endpoint=new URL('/api/v1/releases/announce',config.vars.MINI_APP_URL);
for(let attempt=0;attempt<3;attempt++){
 try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Budget-Release-Key':key},body:JSON.stringify({releaseId:latestRelease.id}),signal:AbortSignal.timeout(60000)});const result=await response.json();if(!response.ok)throw Error('Announcement endpoint returned '+response.status);console.log('Release announcement: '+JSON.stringify(result));process.exit(0);}catch{if(attempt===2)throw Error('Announcement failed; hourly retry is configured.');await new Promise(resolve=>setTimeout(resolve,3000));}
}
