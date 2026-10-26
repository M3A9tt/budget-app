import {todayMoscow} from '../src/mini-model.js';
import {hasAccess} from './users.js';
import {RequestError} from './request-errors.js';

const TTL=5*60*1000,encoder=new TextEncoder();
const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'https://web.telegram.org','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'};
async function key(env){
 const secret=env.TELEGRAM_BOT_TOKEN||env.API_TOKEN;
 if(!secret)throw new RequestError('Экспорт временно недоступен',503);
 return crypto.subtle.importKey('raw',encoder.encode('burget-backup-download:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');

export async function createBackupDownload(env,userId,state,input,origin,now=Date.now()){
 if(!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.beforeRestore!=='boolean')throw new RequestError('Нужна версия текущего бэкапа');
 if(input.revision!==state.revision)throw new RequestError('Бюджет изменился. Обнови данные и скачай свежую копию.',409);
 const filename=(input.beforeRestore?'burget-before-restore-':'burget-backup-')+todayMoscow(state.data.settings?.timeZone)+'.json';
 // The link is a scoped, short-lived capability. No session or Telegram credentials enter it.
 const payload=btoa(JSON.stringify({userId:String(userId),revision:state.revision,expires:now+TTL,filename})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const signature=hex(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(payload)));
 const url=new URL('/api/v1/backup/file',origin);url.searchParams.set('token',payload+'.'+signature);
 return {url:url.href,file_name:filename,expiresAt:now+TTL,revision:state.revision};
}

export async function backupFile(request,env,now=Date.now()){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD, OPTIONS'}});
 const token=new URL(request.url).searchParams.get('token')||'';
 const match=token.length<1000&&token.match(/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/);
 if(!match)throw new RequestError('Ссылка на бэкап недействительна',401);
 const signature=Uint8Array.from(match[2].match(/../g),h=>parseInt(h,16));
 if(!await crypto.subtle.verify('HMAC',await key(env),signature,encoder.encode(match[1])))throw new RequestError('Ссылка на бэкап недействительна',401);
 let ticket;try{ticket=JSON.parse(atob(match[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw new RequestError('Ссылка на бэкап недействительна',401);}
 if(!/^[1-9]\d{0,19}$/.test(ticket.userId||'')||!Number.isSafeInteger(ticket.revision)||ticket.revision<0||!Number.isSafeInteger(ticket.expires)||ticket.expires<=now||ticket.expires>now+TTL||!/^burget-(?:backup|before-restore)-\d{4}-\d{2}-\d{2}\.json$/.test(ticket.filename||''))throw new RequestError('Ссылка устарела. Скачай бэкап заново.',410);
 if(!await hasAccess(env,ticket.userId))throw new RequestError('Нет доступа к этому профилю',403);
 // One read pins the exact revision even if another device writes during the download.
 const row=await env.DB.prepare('SELECT data FROM user_finance_state WHERE user_id=? AND revision=? UNION ALL SELECT data FROM user_state_backups WHERE user_id=? AND revision=? LIMIT 1').bind(ticket.userId,ticket.revision,ticket.userId,ticket.revision).first();
 if(!row)throw new RequestError('Копия устарела. Скачай свежий бэкап.',410);
 return new Response(request.method==='HEAD'?null:JSON.stringify(JSON.parse(row.data),null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+ticket.filename+'"'}});
}
