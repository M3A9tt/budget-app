import {readFile,writeFile} from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map((v,i,all)=>v.startsWith('--')?[v.slice(2),all[i+1]]:null).filter(Boolean));
if(!/^[1-9]\d*$/.test(args.owner||'')||!Number.isSafeInteger(Number(args.owner)))throw Error('Укажите --owner ЧИСЛОВОЙ_TELEGRAM_ID');
if(!/^[a-f0-9-]{36}$/i.test(args.database||''))throw Error('Укажите --database UUID_НОВОЙ_D1');
const friends=String(args.friends||'').split(',').map(x=>x.trim()).filter(Boolean);if(friends.some(x=>! /^[1-9]\d*$/.test(x)||!Number.isSafeInteger(Number(x))))throw Error('Друзья: числовые ID через запятую');
const url=new URL(args.url||'https://budget-staging.apersunov5.workers.dev');if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Нужен HTTPS URL без секретов');
const config=JSON.parse(await readFile(new URL('../server/wrangler.example.jsonc',import.meta.url),'utf8'));
config.name='budget-staging';config.d1_databases[0]={binding:'DB',database_name:'budget-staging',database_id:args.database};config.vars={TELEGRAM_OWNER_ID:args.owner,TELEGRAM_ALLOWED_IDS:friends.join(','),MINI_APP_URL:url.origin,RELEASE_ANNOUNCEMENTS:'off'};
const pilots=String(process.env.STAGING_FINANCE_PILOT_IDS||'').split(',').map(id=>id.trim()).filter(Boolean);
if(pilots.some(id=>! /^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))))throw Error('Участники пилота: числовые ID через запятую');
config.vars.FINANCE_PILOT_IDS=pilots.join(',');
config.vars.RECEIPT_OCR_PILOT=process.env.STAGING_RECEIPT_OCR_PILOT==='on'?'on':'off';
config.vars.FINANCE_ASSISTANT_PILOT=process.env.STAGING_FINANCE_ASSISTANT_PILOT==='on'?'on':'off';
if(config.vars.FINANCE_ASSISTANT_PILOT==='on'&&process.env.STAGING_FINANCE_ASSISTANT_WORKERS_FREE==='confirmed'){
  config.vars.FINANCE_ASSISTANT_WORKERS_FREE='confirmed';
  config.ai={binding:'AI'};
}
await writeFile(new URL('../server/wrangler.staging.jsonc',import.meta.url),JSON.stringify(config,null,2)+'\n',{flag:'wx'});console.log('Создан server/wrangler.staging.jsonc. Рабочий budget не затронут.');
