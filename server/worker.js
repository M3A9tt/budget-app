import {botChat,showBotView} from './bot-chat.js';
import {commitBotAction} from './bot-commit.js';
import {sendBotFile,readBotDocument} from './bot-files.js';
import {lunchChatMessage,lunchChatCallback,pruneLunchChat} from './lunch-chat.js';
import {learningQueue,moderateLearning,pruneLearning} from './lunch-learning.js';
import {botKeyboard,navigationCommand,summariesMenu,extraMenu,botHelp} from './bot-navigation.js';
import {sendTestMessage} from './test-messages.js';
import {telegramPresentation} from '../src/telegram-presentation.js';
import {collectTelemetry,telemetryReport,pruneTelemetry} from './telemetry.js';
import {deliverNotifications} from './notification-outbox.js';
import {sendFeedback} from './feedback.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {broadcastRelease} from './releases.js';
import {latestRelease,releaseText} from '../src/release-notes.js';
import {entryDefaults} from '../src/entry-assist.js';
import {dayChecks,setDayCheck,habitCallback,habitAmount} from './habits.js';
import {allAllowedUsers,hasAccess,ensureInvites} from './users.js';
import {dashboard,EMPTY,CATEGORIES} from '../src/mini-model.js';
import {issueWebCode,webSession,webAuthRoute,hashToken} from './web-auth.js';
import {notificationJobs} from './notifications.js';
import {validateTelegramInitData} from './telegram-auth.js';
// Separate new D1 database. This Worker never writes to legacy Supabase.
import {putTransaction,migrateData,historicalRub} from '../src/ledger.js';
import {parseEntry} from '../src/quick-entry.js';

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
  const planning=dashboard({...EMPTY,...data,settings:{...EMPTY.settings,...data.settings}},clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date),savings=data.accounts.filter(a=>a.accType==='savings').reduce((n,a)=>n+a.balance*(data.rates[a.currency||'RUB']||1),0);
  return [title,from===to?from:`${from} — ${to}`,'',`Расходы: ${fmt(expense)}`,income?`Доходы: ${fmt(income)}`:null,lunch?`Обеды за счёт компании: ${fmt(lunch)}`:null,'',`На обычных счетах: ${fmt(actual)}`,`Свободно после резерва и платежей: ${fmt(planning.free)}`,savings?`В копилках: ${fmt(savings)}`:null,...(top.length?['','Больше всего',...top.map(line=>'• '+line)]:[]),previous?`\nК прошлому периоду: ${expense-previous>0?'+':''}${fmt(expense-previous)}`:null,`\nУчтено операций: ${txs.length}.`].filter(line=>line!==null).join('\n');
}
async function readState(env,userId) {
  if(!await hasAccess(env,userId))throw new Error('Нет доступа');
  // One-time copy, only for the configured owner; old tables stay untouched.
  if(String(userId)===String(env.TELEGRAM_OWNER_ID)&&!await env.DB.prepare('SELECT user_id FROM legacy_owner_migrations WHERE user_id=?').bind(String(userId)).first())await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO user_finance_state(user_id,revision,data,updated_at) SELECT ?,revision,data,updated_at FROM finance_state WHERE id='owner'").bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,id,request_hash,result,created_at FROM idempotency').bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO user_state_backups(user_id,revision,data,created_at) SELECT ?,revision,data,created_at FROM state_backups').bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO user_reports_sent(user_id,id,created_at) SELECT ?,id,created_at FROM reports_sent').bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO legacy_owner_migrations(user_id,created_at) VALUES(?,?)').bind(String(userId),Date.now())
  ]);
  await env.DB.prepare('INSERT OR IGNORE INTO user_finance_state(user_id,revision,data,updated_at) VALUES(?,0,?,?)').bind(String(userId),JSON.stringify(EMPTY),new Date().toISOString()).run();
  const row=await env.DB.prepare('SELECT revision,data FROM user_finance_state WHERE user_id=?').bind(String(userId)).first();
  return {revision:row.revision,data:JSON.parse(row.data),userId:String(userId),isOwner:String(userId)===String(env.TELEGRAM_OWNER_ID),uninitialized:row.revision===0};
}
async function writeTransaction(env,userId,input,key) {
  if(!key||key.length>160)throw new Error('Нужен уникальный Idempotency-Key');
  const state=await readState(env,userId);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(input)))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const prior=await env.DB.prepare('SELECT result,request_hash FROM user_idempotency WHERE user_id=? AND id=?').bind(userId,key).first();
  if(prior){if(prior.request_hash!==requestHash)throw new Error('Ключ уже использован для другой операции');return JSON.parse(prior.result);}
  const next=putTransaction(state.data,input),tx=next.history[0].after;
  const result={transaction:tx,revision:state.revision+1};
  // SQLite transaction: INSERT result succeeds only for the matching snapshot.
  const rows=await env.DB.batch([
    env.DB.prepare("INSERT INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM user_finance_state WHERE user_id=? AND revision=?)").bind(userId,key,requestHash,JSON.stringify(result),Date.now(),userId,state.revision),
    env.DB.prepare("UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)").bind(JSON.stringify(next),new Date().toISOString(),userId,state.revision,userId,key)
  ]);
  if(rows[1].meta.changes!==1)throw new Error('Конфликт обновления. Повторите с тем же ключом');
  return result;
}
async function telegram(env,method,body) {
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error('Telegram не настроен');
  if(['sendMessage','editMessageText'].includes(method)&&typeof body.text==='string'&&!body.parse_mode&&!body.entities)body={...body,...telegramPresentation(body.text)};
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const result=await r.json();if(method==='editMessageText'&&result.description?.includes('message is not modified'))return null;if(!r.ok||!result.ok)throw new Error('Не удалось доставить сообщение Telegram');return result.result;
}
async function mutateState(env,userId,change){
 const state=await readState(env,userId),next=migrateData(change(structuredClone(state.data)),EMPTY);
 const rows=await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO user_state_backups(user_id,revision,data,created_at) SELECT user_id,revision,data,updated_at FROM user_finance_state WHERE user_id=? AND revision=?').bind(userId,state.revision),
 env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(next),new Date().toISOString(),userId,state.revision)
 ]);
 if(rows[1].meta.changes!==1)throw Error('Данные изменились. Повтори действие.');
 await env.DB.prepare('DELETE FROM user_state_backups WHERE user_id=? AND revision < ?').bind(userId,Math.max(0,state.revision-49)).run();
}
const habitApi={readState,mutateState,telegram};
const lunchChatApi={readState,writeTransaction,telegram,setDayCheck};
async function handleTelegram(update,env) {
  const source=update.callback_query?.from||update.message?.from;
  const chat=update.callback_query?.message?.chat||update.message?.chat;
  if(!source||!Number.isSafeInteger(source.id)||source.id<=0||source.is_bot||chat?.type!=='private'||String(chat.id)!==String(source.id))return;
  const command=(update.message?.text||'').trim();
  if(command.startsWith('/start invite_')){
    await ensureInvites(env);
    const token=command.slice('/start invite_'.length);
    if(!/^[a-f0-9]{32}$/.test(token)){await telegram(env,'sendMessage',{chat_id:chat.id,text:'Приглашение недействительно.'});return;}
    const hash=await hashToken(token);
    const row=await env.DB.prepare('SELECT * FROM user_invites WHERE hash=? AND owner_id=?').bind(hash,String(env.TELEGRAM_OWNER_ID)).first();
    if(!row||row.expires_at<Date.now()||row.claimed_user&&row.claimed_user!==String(source.id)){await telegram(env,'sendMessage',{chat_id:chat.id,text:'Приглашение истекло или уже использовано. Попросите новую ссылку.'});return;}
    if(!await hasAccess(env,source.id)){
      const result=await env.DB.prepare('UPDATE user_invites SET claimed_user=? WHERE hash=? AND claimed_user IS NULL AND expires_at>?').bind(String(source.id),hash,Date.now()).run();
      if(!result.meta.changes){await telegram(env,'sendMessage',{chat_id:chat.id,text:'Приглашение уже использовано.'});return;}
    }
    update.message.text='/start';
  }

  if(command==='/id'||(!await hasAccess(env,source.id)&&command==='/start')){
    await telegram(env,'sendMessage',{chat_id:chat.id,text:command==='/id'?`Ваш Telegram ID: ${source.id}`:'Попросите владельца прислать ссылку-приглашение. Он может создать её командой /invite.'});return;
  }
  if(!await hasAccess(env,source.id))return;
  const userId=String(source.id);
  const send=text=>telegram(env,'sendMessage',{chat_id:chat.id,text});
  const showHome=text=>telegram(env,'sendMessage',{chat_id:userId,text,reply_markup:botKeyboard(env.MINI_APP_URL)});
  const showSummary=async period=>{const state=await readState(env,userId),today=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE).date,start=new Date(today+'T12:00:00Z');if(period==='week')start.setUTCDate(start.getUTCDate()-6);const from=period==='month'?today.slice(0,8)+'01':start.toISOString().slice(0,10);await send(periodSummary(state.data,from,today,{day:'Итог дня',week:'Итог недели',month:'Итог месяца'}[period]));};
  const botApi={readState:async(env,id)=>{const s=await readState(env,id);return {...s,data:migrateData(s.data,EMPTY)};},telegram,periodSummary,navigationCommand,sendFile:sendBotFile,readDocument:(env,doc,max)=>readBotDocument(env,doc,max,telegram),commitAction:(env,id,token,p)=>commitBotAction(env,id,token,p,readState),command:text=>handleTelegram({message:{from:source,chat,text}},env)};
  try {
    if(await botChat(update,env,userId,botApi))return;
    if(update.callback_query) {
      const callback=update.callback_query,data=callback.data||'';
      if(data.startsWith('nav:')){const action=data.slice(4);await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id});if(['day','week','month'].includes(action))await showSummary(action);else if(action==='more')await showBotView(env,userId,botApi,'more');else if(action==='updates')await send(releaseText());else if(action==='help')await showBotView(env,userId,botApi,'help');else if(action==='home')await showHome('Клавиатура Бюрджета\nВыбери действие внизу 👇');return;}
      if(await lunchChatCallback(env,userId,callback,lunchChatApi))return;
      if(data.startsWith('test:')){await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'🧪 Тест пройден: кнопка работает. Данные не изменены.',show_alert:true});return;}
      if(await habitCallback(env,userId,callback,habitApi))return;
      if(data.startsWith('notify:')){
        await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Настройки в чате'});
        await showBotView(env,userId,botApi,'settingGroup',{group:'reminders'});return;
      }
      if(data.startsWith('revoke:')&&userId===String(env.TELEGRAM_OWNER_ID)){
        const id=data.slice(7);
        await ensureInvites(env);
        await env.DB.prepare('DELETE FROM user_invites WHERE claimed_user=? AND owner_id=?').bind(id,userId).run();
        await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Доступ по приглашению закрыт'});
        await send('Доступ по приглашению закрыт. Данные сохранены.');return;
      }
      if(data.startsWith('save:')) {
        const id=data.slice(5),draft=await env.DB.prepare('SELECT * FROM telegram_drafts WHERE id=? AND owner=?').bind(id,userId).first();
        if(!draft||draft.expires_at<Date.now())throw new Error('Карточка устарела — отправьте покупку заново');
        const payload=JSON.parse(draft.payload);
        if(payload._lunchCheckDay){const check=(await dayChecks(env,userId,payload._lunchCheckDay)).find(r=>r.kind==='lunch');if(check?.status==='skipped')throw Error('Обед отмечен как пропущенный. Измени ответ в мини-аппе.');const current=await readState(env,userId);if(payload.type==='lunch'&&current.data.transactions.some(t=>t.date===payload.date&&(t.type==='lunch'||t.cat==='lunch')&&!t._lunchCheckDay))throw Error('Обед за этот день уже записан в приложении.');}
        const result=await writeTransaction(env,userId,payload,payload._lunchCheckDay?'lunch-day:'+payload._lunchCheckDay:'tg-draft:'+id);
        if(payload._lunchCheckDay)await setDayCheck(env,userId,payload._lunchCheckDay,'lunch','recorded');
        await env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=? AND owner=?').bind(id,userId).run();
        await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Записано'});
        await telegram(env,'editMessageText',{chat_id:chat.id,message_id:callback.message.message_id,text:`Записано: ${result.transaction.note} · ${result.transaction.amount} ₽\nID: ${result.transaction.id}`,reply_markup:{inline_keyboard:[]}});
      }
      return;
    }
    const text=navigationCommand((update.message.text||'').trim());
    if(text==='/start'||text==='/help'||text==='/menu'){await readState(env,userId);await showHome(text==='/menu'?'Клавиатура Бюрджета\nВыбери действие внизу 👇':botHelp);return;}
    if(text==='/summary'){await telegram(env,'sendMessage',{chat_id:userId,text:'Сводки\nЗа какой период показать?',reply_markup:summariesMenu()});return;}
    if(text==='/app'){if(env.MINI_APP_URL)await telegram(env,'sendMessage',{chat_id:userId,text:'Открыть Бюрджет',reply_markup:{inline_keyboard:[[{text:'💼 Открыть Бюрджет',web_app:{url:env.MINI_APP_URL}}]]}});else await send('Адрес мини-аппы ещё не настроен');return;}
    if(text==='/updates'){await send(releaseText());return;}
    if(text==='/lunch'){if(!env.MINI_APP_URL){await send('Адрес мини-аппы ещё не настроен');return;}const url=new URL(env.MINI_APP_URL);url.searchParams.set('lunch','1');await telegram(env,'sendMessage',{chat_id:userId,text:'Обеды: месячный лимит, копилка и доплаты.',reply_markup:{inline_keyboard:[[{text:'Открыть обеды',web_app:{url:url.href}}]]}});return;}
    if(text==='/reminders'){await showBotView(env,userId,botApi,'settingGroup',{group:'reminders'});return;}
    if(text==='/invite'){
      if(userId!==String(env.TELEGRAM_OWNER_ID)){await send('Приглашения создаёт владелец приложения.');return;}
      await ensureInvites(env);
      const token=crypto.randomUUID().replaceAll('-',''),bot=await telegram(env,'getMe',{});
      if(!bot.username)throw Error('Не удалось получить адрес бота');
      await env.DB.prepare('INSERT INTO user_invites(hash,owner_id,expires_at) VALUES(?,?,?)').bind(await hashToken(token),userId,Date.now()+86400000).run();
      await send('Отправьте другу эту ссылку:\nhttps://t.me/'+bot.username+'?start=invite_'+token+'\nОдно приглашение для одного человека, действует 24 часа. У друга будет отдельный пустой бюджет.');return;
    }
    if(text==='/friends'){
      if(userId!==String(env.TELEGRAM_OWNER_ID)){await send('Список приглашений доступен владельцу.');return;}
      await ensureInvites(env);
      const rows=await env.DB.prepare('SELECT claimed_user FROM user_invites WHERE claimed_user IS NOT NULL AND owner_id=?').bind(userId).all();
      await telegram(env,'sendMessage',{chat_id:chat.id,text:rows.results.length?'Приглашённые пользователи. Кнопка закрывает доступ, сохраняя данные.':'Пока никто не принял приглашение. Создать ссылку: /invite',reply_markup:{inline_keyboard:rows.results.map((r,i)=>[{text:'Закрыть доступ гостю '+(i+1),callback_data:'revoke:'+r.claimed_user}])}});return;
    }
    if(text==='/web'){const code=await issueWebCode(env,userId);await send('Одноразовый код входа в веб-версию (5 минут):\n'+code+'\nОткройте адрес приложения в браузере и вставьте код. Не передавайте его другим.');return;}
    const state=await readState(env,userId),today=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE).date;
    if(['/today','/week','/month'].includes(text)){await showSummary({'/today':'day','/week':'week','/month':'month'}[text]);return;}
    if(update.message.document){await showBotView(env,userId,botApi,'backup');await send('Для выписки выбери «Ещё → Импорт», для полного бэкапа — «Восстановить из файла», затем отправь файл.');return;}
    if(await lunchChatMessage(env,userId,update.message,lunchChatApi))return;
    if(await habitAmount(env,userId,text,habitApi))return;
    const defaults=state.data.settings.rememberEntryChoices===false?{}:entryDefaults(state.data,/зарплат|аванс|доход/i.test(text)?'income':'expense',today,CATEGORIES.concat(state.data.customCats||[]));
    const draft=parseEntry(text,state.data.accounts,state.data.customCats||[],today,defaults);
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?)').bind(id,userId,JSON.stringify(draft),Date.now()+600000).run();
    const account=state.data.accounts.find(a=>a.id===draft.accountId)?.name||(draft.type==='lunch'?'Оплата компанией':'Без счёта');
    await telegram(env,'sendMessage',{chat_id:chat.id,text:`Проверьте: ${draft.note}\n${draft.amount} ₽ · ${account}\nКатегория: ${draft.cat}\nОплата: ${{sbp:'СБП',card:'Карта',cash:'Наличные',bank:'Банковский перевод',unknown:'Не указана'}[draft.paymentMethod]||'Не указана'}\nДата: ${draft.date}`,reply_markup:{inline_keyboard:[[{text:'Записать',callback_data:'save:'+id}]]}});
  } catch(e){await send(e.message);}
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/v1/releases/announce'){if(request.method!=='POST'||!await equalSecret(request.headers.get('X-Budget-Release-Key'),env.RELEASE_DEPLOY_TOKEN))return json({error:'Unauthorized'},401);let input;try{input=await request.json();}catch{return json({error:'Invalid JSON'},400);}if(input.releaseId!==latestRelease.id)return json({error:'Release mismatch'},409);return json({releaseId:latestRelease.id,...await broadcastRelease(env,telegram)});}
    if(url.pathname==='/telegram/webhook') {
      if(request.method!=='POST'||!await equalSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Unauthorized'},401);
      try {await handleTelegram(await request.json(),env);return json({ok:true});}catch{return json({error:'Delivery failed'},503);}
    }
    if(!url.pathname.startsWith('/api/v1/'))return env.ASSETS?env.ASSETS.fetch(request):json({error:'Not found'},404);
    if(['/api/v1/auth/login','/api/v1/auth/logout'].includes(url.pathname))return webAuthRoute(request,env,url.pathname);
    const auth=request.headers.get('Authorization')||'';
    const telegramUser=auth.startsWith('tma ')?await validateTelegramInitData(auth.slice(4),env.TELEGRAM_BOT_TOKEN,await allAllowedUsers(env)):null;
    const apiAccess=auth.startsWith('Bearer ')&&await equalSecret(auth,env.API_TOKEN?'Bearer '+env.API_TOKEN:null);
    const sessionAccess=!auth&&await webSession(request,env);
    if(sessionAccess&&!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
    if(!telegramUser&&!apiAccess&&!sessionAccess)return json({error:'Откройте приложение заново из меню Telegram-бота'},401);
    const userId=telegramUser?String(telegramUser.id):apiAccess?String(env.API_USER_ID||env.TELEGRAM_OWNER_ID):sessionAccess;
    if(!await hasAccess(env,userId))return json({error:'Нет доступа к этому профилю'},403);
    try {
      if(url.pathname==='/api/v1/admin/lunch-learning'){if(userId!==String(env.TELEGRAM_OWNER_ID))return json({error:'Только для владельца'},403);if(request.method==='GET')return json(await learningQueue(env));if(request.method==='POST')return json(await moderateLearning(env,await request.json()));}
      if(request.method==='GET'&&url.pathname==='/api/v1/admin/telemetry'){if(userId!==String(env.TELEGRAM_OWNER_ID))return json({error:'Только для владельца'},403);return json(await telemetryReport(env));}
      if(request.method==='POST'&&url.pathname==='/api/v1/telemetry'){const current=await readState(env,userId);if(Number(request.headers.get('Content-Length')||0)>16000)return json({error:'Пакет слишком большой'},413);const text=await request.text();if(text.length>16000)return json({error:'Пакет слишком большой'},413);return json(await collectTelemetry(env,userId,JSON.parse(text),current.data.settings.telemetryEnabled!==false));}
      if(request.method==='POST'&&url.pathname==='/api/v1/notifications/test'){const current=await readState(env,userId);return json(await sendTestMessage(env,userId,current.data,await request.json(),telegram,periodSummary));}
      if(request.method==='POST'&&url.pathname==='/api/v1/feedback')return json(await sendFeedback(env,userId,await request.json(),telegram));
      if(request.method==='GET'&&url.pathname==='/api/v1/state')return json(await readState(env,userId));
      if(request.method==='PUT'&&url.pathname==='/api/v1/state') {
        const input=await request.json(),data=migrateData(input.data,EMPTY),current=await readState(env,userId);
        if(current.revision!==input.expectedRevision)return json({error:'Revision conflict'},409);
        delete data._pinHash;
        const rows=await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO user_state_backups(user_id,revision,data,created_at) SELECT user_id,revision,data,updated_at FROM user_finance_state WHERE user_id=? AND revision=?').bind(userId,input.expectedRevision),
          env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(data),new Date().toISOString(),userId,input.expectedRevision)
        ]);
        if(rows[1].meta.changes!==1)return json({error:'Revision conflict'},409);
        await env.DB.prepare('DELETE FROM user_state_backups WHERE user_id=? AND revision < ?').bind(userId,Math.max(0,input.expectedRevision-49)).run();
        return json({revision:input.expectedRevision+1});
      }
      if(request.method==='POST'&&url.pathname==='/api/v1/transactions')return json(await writeTransaction(env,userId,await request.json(),request.headers.get('Idempotency-Key')),201);
      if(request.method==='GET'&&url.pathname==='/api/v1/summary') {
        const state=await readState(env,userId);return json({text:periodSummary(state.data,url.searchParams.get('from')||moscowDate(),url.searchParams.get('to')||moscowDate(),'Расходы')});
      }
      return json({error:'Not found'},404);
    }catch(e){return json({error:e.message},400);}
  },
  async scheduled(event,env,ctx) {
    // Minute wake-up in UTC; each profile uses its own IANA time zone.
    ctx.waitUntil((async()=>{
      const now=new Date(event.scheduledTime);
      if(now.getUTCMinutes()===0&&await hasAccess(env,env.TELEGRAM_OWNER_ID))await readState(env,String(env.TELEGRAM_OWNER_ID));
      if(now.getUTCMinutes()===0&&env.RELEASE_ANNOUNCEMENTS==='on')await broadcastRelease(env,telegram);
      const allowed=await allAllowedUsers(env),profiles=await env.DB.prepare('SELECT user_id,revision,data FROM user_finance_state').all();
      for(const profile of profiles.results){
        const userId=profile.user_id;if(!allowed.includes(String(userId))||profile.revision===0)continue;
        try{
        const data=JSON.parse(profile.data),day=clockAt(now,data.settings?.timeZone||DEFAULT_ZONE).date,responses=await dayChecks(env,userId,day),reports=notificationJobs(data,now,responses);
        await deliverNotifications(env,userId,day,data,reports,responses,telegram,periodSummary,setDayCheck);
        }catch{console.error('Notification processing failed for profile',userId);}
      }
      if(now.getUTCMinutes()===0){
      await pruneTelemetry(env,now);
      await pruneLearning(env);
      await pruneLunchChat(env);
      await env.DB.prepare('DELETE FROM user_web_codes WHERE expires_at<?').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM user_web_sessions WHERE expires_at<?').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM telegram_drafts WHERE expires_at<?').bind(Date.now()).run();
      }
    })());
  }
};
