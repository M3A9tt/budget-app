import {dashboard,EMPTY} from '../src/mini-model.js';
import {issueWebCode,webSession,webAuthRoute} from './web-auth.js';
import {notificationJobs} from './notifications.js';
import {validateTelegramInitData} from './telegram-auth.js';
// Separate new D1 database. This Worker never writes to legacy Supabase.
import {putTransaction,migrateData,historicalRub} from '../src/ledger.js';
import {parseEntry} from '../src/quick-entry.js';

const DEFAULTS={transactions:[],accounts:[],debts:[],goals:[],customCats:[],transfers:[],recurring:[],history:[],lunchDayOff:[],settings:{budget:0,lunchDaily:400,workDays:22},rates:{RUB:1,USD:92,EUR:100,GBP:117,CNY:12.7,TRY:2.8}};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function equalSecret(a,b) {
  if(!a||!b)return false;
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [aa,bb]=await Promise.all([digest(a),digest(b)]);let mismatch=0;
  for(let i=0;i<aa.length;i++)mismatch|=aa[i]^bb[i];return mismatch===0;
}
export function moscowDate(date=new Date()) {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(date);}
export function periodSummary(data,from,to,title) {
  const txs=data.transactions.filter(t=>t.date>=from&&t.date<=to);
  const rub=t=>historicalRub(t,(amount,currency)=>amount*(data.rates[currency]||1));
  const sum=type=>txs.filter(t=>t.type===type&&(type!=='expense'||t.cat!=='lunch')).reduce((n,t)=>n+rub(t),0);
  const fmt=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
  const expense=sum('expense'),income=sum('income'),lunch=txs.filter(t=>t.type==='lunch'||t.cat==='lunch').reduce((n,t)=>n+rub(t),0);
  const actual=data.accounts.filter(a=>(a.accType||'regular')!=='savings').reduce((n,a)=>n+a.balance*(data.rates[a.currency||'RUB']||1),0);
  const groups={};txs.filter(t=>t.type==='expense'&&t.cat!=='lunch').forEach(t=>{groups[t.cat]=(groups[t.cat]||0)+rub(t);});
  const top=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([cat,n])=>`${data.customCats?.find(c=>c.id===cat)?.name||({food:'Еда',transport:'Транспорт',health:'Здоровье',housing:'ЖКХ',other:'Другое'}[cat]||cat)}: ${fmt(n)}`);
  const start=new Date(from+'T12:00:00Z'),end=new Date(to+'T12:00:00Z');
  const days=Math.round((end-start)/86400000)+1;start.setUTCDate(start.getUTCDate()-days);end.setUTCDate(end.getUTCDate()-days);
  const previous=data.transactions.filter(t=>t.type==='expense'&&t.cat!=='lunch'&&t.date>=start.toISOString().slice(0,10)&&t.date<=end.toISOString().slice(0,10)).reduce((n,t)=>n+rub(t),0);
  const planning=dashboard({...EMPTY,...data,settings:{...EMPTY.settings,...data.settings}},moscowDate()),savings=data.accounts.filter(a=>a.accType==='savings').reduce((n,a)=>n+a.balance*(data.rates[a.currency||'RUB']||1),0);
  const extra=`\nК предыдущему периоду той же длины: ${fmt(expense-previous)} (по записанным операциям)\nВ накоплениях сейчас: ${fmt(savings)}\nСвободно после резерва и платежей: ${fmt(planning.free)}${planning.days?' · до дохода '+planning.days+' дн.':''}`;
  return `${title}\n${from} — ${to}\nРасходы: ${fmt(expense)}\nДоходы: ${fmt(income)}\nОбеды за счёт компании: ${fmt(lunch)}\nНа обычных счетах: ${fmt(actual)}${top.length?'\n'+top.join('\n'):''}\nУчтено операций: ${txs.length}.${extra} Незаписанные покупки в итог не входят.`;
}
async function readState(env) {
  const row=await env.DB.prepare("SELECT revision,data FROM finance_state WHERE id='owner'").first();
  if(!row)throw new Error('Сначала импортируйте JSON-бэкап в новую базу');
  return {revision:row.revision,data:JSON.parse(row.data)};
}
async function writeTransaction(env,input,key) {
  if(!key||key.length>160)throw new Error('Нужен уникальный Idempotency-Key');
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(input)))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const prior=await env.DB.prepare('SELECT result,request_hash FROM idempotency WHERE id=?').bind(key).first();
  if(prior){if(prior.request_hash!==requestHash)throw new Error('Ключ уже использован для другой операции');return JSON.parse(prior.result);}
  const state=await readState(env),next=putTransaction(state.data,input),tx=next.history[0].after;
  const result={transaction:tx,revision:state.revision+1};
  // SQLite transaction: INSERT result succeeds only for the matching snapshot.
  const rows=await env.DB.batch([
    env.DB.prepare("INSERT INTO idempotency(id,request_hash,result,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM finance_state WHERE id='owner' AND revision=?)").bind(key,requestHash,JSON.stringify(result),Date.now(),state.revision),
    env.DB.prepare("UPDATE finance_state SET data=?,revision=revision+1,updated_at=? WHERE id='owner' AND revision=? AND EXISTS(SELECT 1 FROM idempotency WHERE id=?)").bind(JSON.stringify(next),new Date().toISOString(),state.revision,key)
  ]);
  if(rows[1].meta.changes!==1)throw new Error('Конфликт обновления. Повторите с тем же ключом');
  return result;
}
async function telegram(env,method,body) {
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error('Telegram не настроен');
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await r.json();if(!r.ok||!result.ok)throw new Error('Не удалось доставить сообщение Telegram');return result.result;
}
async function handleTelegram(update,env) {
  const source=update.callback_query?.from||update.message?.from;
  const chat=update.callback_query?.message?.chat||update.message?.chat;
  if(!source||String(source.id)!==env.TELEGRAM_OWNER_ID||chat?.type!=='private'||String(chat.id)!==env.TELEGRAM_OWNER_ID)return;
  const send=text=>telegram(env,'sendMessage',{chat_id:chat.id,text});
  try {
    if(update.callback_query) {
      const callback=update.callback_query,data=callback.data||'';
      if(data.startsWith('save:')) {
        const id=data.slice(5),draft=await env.DB.prepare('SELECT * FROM telegram_drafts WHERE id=? AND owner=?').bind(id,env.TELEGRAM_OWNER_ID).first();
        if(!draft||draft.expires_at<Date.now())throw new Error('Карточка устарела — отправьте покупку заново');
        const result=await writeTransaction(env,JSON.parse(draft.payload),'tg-draft:'+id);
        await env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=?').bind(id).run();
        await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Записано'});
        await telegram(env,'editMessageText',{chat_id:chat.id,message_id:callback.message.message_id,text:`Записано: ${result.transaction.note} · ${result.transaction.amount} ₽\nID: ${result.transaction.id}`,reply_markup:{inline_keyboard:[]}});
      }
      return;
    }
    const text=(update.message.text||'').trim();
    if(text==='/start'||text==='/help'){await send('Пишите: кофе 180 Сбер или обед 379,50. Бот сначала покажет карточку — запись только после кнопки. /today — день, /week — 7 дней, /month — текущий месяц.');if(env.MINI_APP_URL)await telegram(env,'sendMessage',{chat_id:chat.id,text:'Ваши финансы — в одном месте',reply_markup:{inline_keyboard:[[{text:'Открыть Финансы',web_app:{url:env.MINI_APP_URL}}]]}});return;}
    if(text==='/web'){const code=await issueWebCode(env);await send('Одноразовый код входа в веб-версию (5 минут):\n'+code+'\nОткройте адрес приложения в браузере и вставьте код. Не передавайте его другим.');return;}
    const state=await readState(env),today=moscowDate();
    if(['/today','/week','/month'].includes(text)) {
      const start=new Date(today+'T12:00:00Z');
      if(text==='/week')start.setUTCDate(start.getUTCDate()-6);
      const from=text==='/month'?today.slice(0,8)+'01':start.toISOString().slice(0,10);
      await send(periodSummary(state.data,from,today,'Сводка расходов'));return;
    }
    const draft=parseEntry(text,state.data.accounts,state.data.customCats||[],today);
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?)').bind(id,env.TELEGRAM_OWNER_ID,JSON.stringify(draft),Date.now()+600000).run();
    const account=state.data.accounts.find(a=>a.id===draft.accountId)?.name||(draft.type==='lunch'?'Оплата компанией':'Без счёта');
    await telegram(env,'sendMessage',{chat_id:chat.id,text:`Проверьте: ${draft.note}\n${draft.amount} ₽ · ${account}\nКатегория: ${draft.cat}\nДата: ${draft.date}`,reply_markup:{inline_keyboard:[[{text:'Записать',callback_data:'save:'+id}]]}});
  } catch(e){await send(e.message);}
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/telegram/webhook') {
      if(request.method!=='POST'||!await equalSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Unauthorized'},401);
      try {await handleTelegram(await request.json(),env);return json({ok:true});}catch{return json({error:'Delivery failed'},503);}
    }
    if(!url.pathname.startsWith('/api/v1/'))return env.ASSETS?env.ASSETS.fetch(request):json({error:'Not found'},404);
    if(['/api/v1/auth/login','/api/v1/auth/logout'].includes(url.pathname))return webAuthRoute(request,env,url.pathname);
    const auth=request.headers.get('Authorization')||'';
    const telegramUser=auth.startsWith('tma ')?await validateTelegramInitData(auth.slice(4),env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_OWNER_ID):null;
    const apiAccess=auth.startsWith('Bearer ')&&await equalSecret(auth,env.API_TOKEN?'Bearer '+env.API_TOKEN:null);
    const sessionAccess=!auth&&await webSession(request,env);
    if(sessionAccess&&!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
    if(!telegramUser&&!apiAccess&&!sessionAccess)return json({error:'Откройте приложение заново из меню Telegram-бота'},401);
    try {
      if(request.method==='GET'&&url.pathname==='/api/v1/state'){const row=await env.DB.prepare("SELECT revision,data FROM finance_state WHERE id='owner'").first();return json(row?{revision:row.revision,data:JSON.parse(row.data)}:{revision:0,data:DEFAULTS,uninitialized:true});}
      if(request.method==='PUT'&&url.pathname==='/api/v1/state') {
        const input=await request.json(),data=migrateData(input.data,DEFAULTS);
        // Import cannot replace the state without its exact expected revision.
        const current=await env.DB.prepare("SELECT revision FROM finance_state WHERE id='owner'").first();
        if((current?.revision??0)!==input.expectedRevision)return json({error:'Revision conflict'},409);
        delete data._pinHash;
        const result=current?(await env.DB.batch([
          env.DB.prepare("INSERT OR IGNORE INTO state_backups(revision,data,created_at) SELECT revision,data,updated_at FROM finance_state WHERE id='owner' AND revision=?").bind(input.expectedRevision),
          env.DB.prepare("UPDATE finance_state SET data=?,revision=revision+1,updated_at=? WHERE id='owner' AND revision=?").bind(JSON.stringify(data),new Date().toISOString(),input.expectedRevision)
        ]))[1]:await env.DB.prepare("INSERT OR IGNORE INTO finance_state(id,data,revision,updated_at) VALUES('owner',?,1,?)").bind(JSON.stringify(data),new Date().toISOString()).run();
        if(result.meta.changes!==1)return json({error:'Revision conflict'},409);
        await env.DB.prepare('DELETE FROM state_backups WHERE revision < ?').bind(Math.max(0,input.expectedRevision-49)).run();
        return json({revision:input.expectedRevision+1});
      }
      if(request.method==='POST'&&url.pathname==='/api/v1/transactions')return json(await writeTransaction(env,await request.json(),request.headers.get('Idempotency-Key')),201);
      if(request.method==='GET'&&url.pathname==='/api/v1/summary') {
        const state=await readState(env);return json({text:periodSummary(state.data,url.searchParams.get('from')||moscowDate(),url.searchParams.get('to')||moscowDate(),'Расходы')});
      }
      return json({error:'Not found'},404);
    }catch(e){return json({error:e.message},400);}
  },
  async scheduled(event,env,ctx) {
    // Hourly wake-up; reports at 21:00 Moscow. No dependency on an open browser.
    ctx.waitUntil((async()=>{
      const now=new Date(event.scheduledTime);
      const exists=await env.DB.prepare("SELECT revision FROM finance_state WHERE id='owner'").first();if(!exists)return;
      const state=await readState(env),reports=notificationJobs(state.data,now);
      for(const report of reports){const claim=await env.DB.prepare('INSERT OR IGNORE INTO reports_sent(id,created_at) VALUES(?,?)').bind(report.id,Date.now()).run();if(!claim.meta.changes)continue;
        try{await telegram(env,'sendMessage',{chat_id:env.TELEGRAM_OWNER_ID,text:report.text||periodSummary(state.data,report.from,report.to,report.title)});}catch(e){await env.DB.prepare('DELETE FROM reports_sent WHERE id=?').bind(report.id).run();throw e;}}
      await env.DB.prepare('DELETE FROM web_codes WHERE expires_at<?').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM web_sessions WHERE expires_at<?').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM telegram_drafts WHERE expires_at<?').bind(Date.now()).run();
    })());
  }
};
