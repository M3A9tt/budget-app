import {periodSummary} from './period-summary.js';
export {periodSummary} from './period-summary.js';
import {sendSummary} from './summary-delivery.js';
import {lunchEntryArgs} from './lunch-entry.js';
import {legacyLunchInput,legacySaveCallback} from './legacy-lunch.js';
import {initialProfile} from '../src/home-layout.js';
import {backupBefore,trimBackups,encodeState,requestHash as hashRequest,checkPersistence,readReceipt} from './state-persistence.js';
import {getPicture,pngInfo,pictureParams} from './bot-pictures.js';
import {botChat,showBotView,openQuickEntry,startBotForm,pauseBotForm,cancelBotFlow} from './bot-chat.js';
import {commitBotAction} from './bot-commit.js';
import {sendBotFile,readBotDocument} from './bot-files.js';
import {lunchChatMessage,lunchChatCallback,pruneLunchChat,pauseLunchEdit} from './lunch-chat.js';
import {userSwitchedDialog} from './dialog-focus.js';
import {learningQueue,moderateLearning,pruneLearning} from './lunch-learning.js';
import {botKeyboard,navigationCommand,summariesMenu,botHelp} from './bot-navigation.js';
import {sendTestMessage} from './test-messages.js';
import {telegramPresentation} from '../src/telegram-presentation.js';
import {collectTelemetry,telemetryReport,pruneTelemetry} from './telemetry.js';
import {deliverNotifications} from './notification-outbox.js';
import {sendFeedback} from './feedback.js';
import {clockAt,DEFAULT_ZONE} from '../src/time-settings.js';
import {broadcastRelease} from './releases.js';
import {latestRelease,releaseText} from '../src/release-notes.js';
import {notificationChecks,setDayCheck,pauseLegacyLunchInput,habitCallback} from './habits.js';
import {allAllowedUsers,isAllowedUser,hasAccess,ensureInvites,acceptInvite,invitedUsers,setMemberAccess} from './users.js';
import {EMPTY,demoData,money} from '../src/mini-model.js';
import {issueWebCode,webSession,webAuthRoute,hashToken} from './web-auth.js';
import {notificationJobs} from './notifications.js';
import {validateTelegramInitData} from './telegram-auth.js';
// Separate new D1 database. This Worker never writes to legacy Supabase.
import {putTransaction,migrateData,validateStateChange} from '../src/ledger.js';
import {validDate} from '../src/finance-tools.js';
import {RequestError,parseJsonObject,readJsonObject,readRequestText,validateInput} from './request-errors.js';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function equalSecret(a,b) {
  if(!a||!b)return false;
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [aa,bb]=await Promise.all([digest(a),digest(b)]);let mismatch=0;
  for(let i=0;i<aa.length;i++)mismatch|=aa[i]^bb[i];return mismatch===0;
}
export function moscowDate(date=new Date()) {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(date);}
async function readState(env,userId) {
  if(!await hasAccess(env,userId))throw new RequestError('Нет доступа',403);
  // One-time copy, only for the configured owner; old tables stay untouched.
  if(String(userId)===String(env.TELEGRAM_OWNER_ID)&&!await env.DB.prepare('SELECT user_id FROM legacy_owner_migrations WHERE user_id=?').bind(String(userId)).first())await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO user_finance_state(user_id,revision,data,updated_at) SELECT ?,revision,data,updated_at FROM finance_state WHERE id='owner'").bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,id,request_hash,result,created_at FROM idempotency').bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO user_state_backups(user_id,revision,data,created_at) SELECT ?,revision,data,created_at FROM state_backups').bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO user_reports_sent(user_id,id,created_at) SELECT ?,id,created_at FROM reports_sent').bind(String(userId)),
    env.DB.prepare('INSERT OR IGNORE INTO legacy_owner_migrations(user_id,created_at) VALUES(?,?)').bind(String(userId),Date.now())
  ]);
  await env.DB.prepare('INSERT OR IGNORE INTO user_finance_state(user_id,revision,data,updated_at) VALUES(?,0,?,?)').bind(String(userId),JSON.stringify(initialProfile(EMPTY)),new Date().toISOString()).run();
  const row=await env.DB.prepare('SELECT revision,data FROM user_finance_state WHERE user_id=?').bind(String(userId)).first();
  return {revision:row.revision,data:JSON.parse(row.data),userId:String(userId),isOwner:String(userId)===String(env.TELEGRAM_OWNER_ID),uninitialized:row.revision===0};
}
async function writeTransaction(env,userId,input,key) {
  if(!key||key.length>160)throw new RequestError('Нужен уникальный Idempotency-Key');
  const state=await readState(env,userId);
  const requestHash=await hashRequest(input);
  const stored=async()=>{const prior=await readReceipt(env,userId,key);if(!prior)return null;if(prior.requestHash!==requestHash)throw new RequestError('Ключ уже использован для другой операции',409);return prior.result;};
  const prior=await stored();if(prior)return prior;
  const next=validateInput(()=>migrateData(putTransaction(state.data,input),EMPTY)),tx=next.history[0].after;
  const encoded=validateInput(()=>encodeState(next),413);
  const result={transaction:tx,revision:state.revision+1};
  // SQLite transaction: INSERT result succeeds only for the matching snapshot.
  const rows=await env.DB.batch([
    backupBefore(env,userId,state.revision),
    env.DB.prepare("INSERT INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM user_finance_state WHERE user_id=? AND revision=?)").bind(userId,key,requestHash,JSON.stringify(result),Date.now(),userId,state.revision),
    env.DB.prepare("UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM user_idempotency WHERE user_id=? AND id=?)").bind(encoded,new Date().toISOString(),userId,state.revision,userId,key),
    trimBackups(env,userId)
  ]);
  if(rows[2].meta.changes!==1){const completed=await stored();if(completed)return completed;throw new RequestError('Конфликт обновления. Повторите с тем же ключом',409);}
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
 backupBefore(env,userId,state.revision),
 env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(encodeState(next),new Date().toISOString(),userId,state.revision),
 trimBackups(env,userId)
 ]);
 if(rows[1].meta.changes!==1)throw Error('Данные изменились. Повтори действие.');
}
const habitApi={readState,mutateState,telegram};
const lunchChatApi={readState,telegram};
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
    if(!await acceptInvite(env,hash,source.id)){await telegram(env,'sendMessage',{chat_id:chat.id,text:'Ссылка закрыта, истекла или доступ отозван. Попросите владельца проверить приглашение.'});return;}
    update.message.text='/start';
  }

  if(command==='/id'||(!await hasAccess(env,source.id)&&command==='/start')){
    await telegram(env,'sendMessage',{chat_id:chat.id,text:command==='/id'?`Ваш Telegram ID: ${source.id}`:'Попросите владельца прислать ссылку-приглашение. Он может создать её командой /invite.'});return;
  }
  if(!await hasAccess(env,source.id))return;
  const userId=String(source.id);
  const send=text=>telegram(env,'sendMessage',{chat_id:chat.id,text});
  const showHome=text=>telegram(env,'sendMessage',{chat_id:userId,text,reply_markup:botKeyboard(env.MINI_APP_URL)});
  const showSummary=async period=>{const state=await readState(env,userId),today=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE).date,start=new Date(today+'T12:00:00Z');if(period==='week')start.setUTCDate(start.getUTCDate()-6);const from=period==='month'?today.slice(0,8)+'01':start.toISOString().slice(0,10);const title={day:'Итог дня',week:'Итог недели',month:'Итог месяца'}[period];await sendSummary(env,chat.id,state.data,{from,to:today,title,text:periodSummary(state.data,from,today,title),visual:period!=='month'},telegram);};
  const botApi={readState:async(env,id)=>{const s=await readState(env,id);return {...s,data:migrateData(s.data,EMPTY)};},telegram,periodSummary,navigationCommand,sendFile:sendBotFile,readDocument:(env,doc,max)=>readBotDocument(env,doc,max,telegram),commitAction:(env,id,token,p)=>commitBotAction(env,id,token,p,readState),command:text=>handleTelegram({message:{from:source,chat,text}},env)};
  const formApi={...botApi,openForm:(op,args)=>startBotForm(env,userId,botApi,op,args),openLunch:async(day,type,prefill={},review=false)=>{await pauseLunchEdit(env,userId);await pauseLegacyLunchInput(env,userId);await pauseBotForm(env,userId,botApi);return startBotForm(env,userId,botApi,'tx',{...lunchEntryArgs(day,type,prefill),review});}};
  const recognizedApi={...lunchChatApi,openRecognized:async(sourceId,payload)=>{await pauseBotForm(env,userId,botApi);return startBotForm(env,userId,botApi,'tx',{type:'lunch',prefill:payload.tx,review:!!payload.tx.amount,recognizedLunch:{sourceId,parsed:payload.parsed},returnTo:{name:'lunch',args:{month:payload.tx.date.slice(0,7)}}});}};
  try {
    if(userSwitchedDialog(update)&&!['/cancel','Отмена'].includes(navigationCommand((update.message?.text||'').trim()))){await pauseLunchEdit(env,userId);await pauseLegacyLunchInput(env,userId);}
    // One dispatcher arbitrates typed messages before individual dialog handlers.
    // Explicit meal replies and forwarded orders own their messages; the previous
    // bot form is suspended instead of silently consuming another form's answer.
    if(update.message&&await lunchChatMessage(env,userId,update.message,recognizedApi)){
      if(['/cancel','Отмена'].includes((update.message.text||'').trim()))await cancelBotFlow(env,userId,botApi);
      return;
    }
    if(update.message&&await legacyLunchInput(env,userId,update.message,formApi)){if(['/cancel','Отмена'].includes((update.message.text||'').trim()))await cancelBotFlow(env,userId,botApi);return;}
    if(await botChat(update,env,userId,botApi)){
      return;
    }
    if(update.callback_query) {
      const callback=update.callback_query,data=callback.data||'';
      if(data.startsWith('nav:')){const action=data.slice(4);await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id});if(['day','week','month'].includes(action))await showSummary(action);else if(action==='more')await showBotView(env,userId,botApi,'more');else if(action==='updates')await send(releaseText());else if(action==='help')await showBotView(env,userId,botApi,'help');else if(action==='home')await showHome('Клавиатура Бюрджета\nВыбери действие внизу 👇');return;}
      if(await lunchChatCallback(env,userId,callback,recognizedApi))return;
      if(data.startsWith('test:')){await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'🧪 Тест пройден: кнопка работает. Данные не изменены.',show_alert:true});return;}
      if(await habitCallback(env,userId,callback,{...habitApi,showExpenseHistory:day=>showBotView(env,userId,botApi,'history',{from:day,to:day,type:'expense'}),openLunch:formApi.openLunch,openExpense:async day=>{await pauseLunchEdit(env,userId);await pauseLegacyLunchInput(env,userId);return startBotForm(env,userId,botApi,'tx',{type:'expense',checkDay:day,prefill:{date:day},returnTo:{name:'expenseCheck',args:{day}}});}}))return;
      if(data.startsWith('notify:')){
        await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Настройки в чате'});
        await showBotView(env,userId,botApi,'settingGroup',{group:'reminders'});return;
      }
      if((data.startsWith('revoke:')||data.startsWith('restoreAccess:'))&&userId===String(env.TELEGRAM_OWNER_ID)){
        const enabled=data.startsWith('restoreAccess:'),id=data.split(':')[1];
        if(isAllowedUser(env,id)){await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Этот доступ задан в конфигурации приложения'});return;}
        if(!((await invitedUsers(env)).some(r=>r.user_id===id))){await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:'Пользователь не найден'});return;}
        await setMemberAccess(env,id,enabled);
        await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:enabled?'Доступ восстановлен':'Доступ закрыт'});
        await send(enabled?'Доступ восстановлен. Бюджет сохранён.':'Доступ закрыт. Данные сохранены.');return;
      }
      if(await legacySaveCallback(env,userId,callback,formApi))return;
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
      await env.DB.prepare('INSERT INTO user_join_links(hash,owner_id,created_at) VALUES(?,?,?)').bind(await hashToken(token),userId,Date.now()).run();
      await send('Многоразовая ссылка для всех:\nhttps://t.me/'+bot.username+'?start=invite_'+token+'\nКаждому — отдельный пустой бюджет. Действует до отключения владельцем.\nЗакрыть все ссылки: /invite_close');return;
    }
    if(text==='/invite_close'){
      if(userId!==String(env.TELEGRAM_OWNER_ID)){await send('Ссылками управляет владелец.');return;}
      await ensureInvites(env);await env.DB.batch([env.DB.prepare('UPDATE user_join_links SET revoked=1 WHERE owner_id=?').bind(userId),env.DB.prepare('UPDATE user_invites SET expires_at=0 WHERE owner_id=? AND claimed_user IS NULL').bind(userId)]);
      await send('Ссылки закрыты. Уже приглашённые пользователи сохранили доступ. Новая ссылка: /invite');return;
    }
    if(/^\/friends(?: \d+)?$/.test(text)){
      if(userId!==String(env.TELEGRAM_OWNER_ID)){await send('Список приглашений доступен владельцу.');return;}
      const rows=(await invitedUsers(env)).filter(r=>!isAllowedUser(env,r.user_id)),page=Math.max(0,Math.min((Number(text.split(' ')[1])||1)-1,Math.ceil(rows.length/40)-1));
      await telegram(env,'sendMessage',{chat_id:chat.id,text:rows.length?`Участники · ${rows.length}. Страница ${page+1}. Можно закрыть или восстановить доступ, сохранив бюджет.${(page+1)*40<rows.length?' Ещё: /friends '+(page+2):''}`:'Участников пока нет. Общая ссылка: /invite',reply_markup:{inline_keyboard:rows.slice(page*40,(page+1)*40).map(r=>[{text:(r.status==='active'?'Закрыть доступ · ':'Восстановить · ')+r.user_id,callback_data:(r.status==='active'?'revoke:':'restoreAccess:')+r.user_id}])}});return;
    }
    if(text==='/web'){const code=await issueWebCode(env,userId);await send('Одноразовый код входа в веб-версию (5 минут):\n'+code+'\nОткройте адрес приложения в браузере и вставьте код. Не передавайте его другим.');return;}
    if(['/today','/week','/month'].includes(text)){await showSummary({'/today':'day','/week':'week','/month':'month'}[text]);return;}
    if(update.message.document){await showBotView(env,userId,botApi,'backup');await send('Для выписки выбери «Ещё → Импорт», для полного бэкапа — «Восстановить из файла», затем отправь файл.');return;}
    await openQuickEntry(env,userId,botApi,text);
    await pauseLegacyLunchInput(env,userId);
    await pauseLunchEdit(env,userId);
  } catch(e){await send(e.message);}
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try {
    if(url.pathname==='/api/v1/releases/check-picture'){
      if(request.method!=='POST'||!await equalSecret(request.headers.get('X-Budget-Release-Key'),env.RELEASE_DEPLOY_TOKEN))return json({error:'Unauthorized'},401);
      try{const storage=await checkPersistence(env,latestRelease.id),picture=await getPicture(env,'__fictional_render_check__',{revision:1,data:demoData()},{kind:'budget'});return json({releaseId:latestRelease.id,storage,...pngInfo(picture.bytes)});}catch{return json({error:'Screenshot smoke check failed'},503);}
    }
    if(url.pathname==='/card-demo'){
      const data=demoData();try{const params=pictureParams(Object.fromEntries(url.searchParams),data),{renderReportHtml}=await import('./report-html.jsx');return new Response(renderReportHtml(data,params),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});}catch{return json({error:'Unknown demo card'},400);}
    }
    if(url.pathname==='/api/v1/releases/announce'){if(request.method!=='POST'||!await equalSecret(request.headers.get('X-Budget-Release-Key'),env.RELEASE_DEPLOY_TOKEN))return json({error:'Unauthorized'},401);const input=await readJsonObject(request);if(input.releaseId!==latestRelease.id)return json({error:'Release mismatch'},409);return json({releaseId:latestRelease.id,...await broadcastRelease(env,telegram)});}
    if(url.pathname==='/telegram/webhook') {
      if(request.method!=='POST'||!await equalSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Unauthorized'},401);
      const update=await readJsonObject(request);
      try {await handleTelegram(update,env);return json({ok:true});}catch{return json({error:'Delivery failed'},503);}
    }
    if(!url.pathname.startsWith('/api/v1/'))return env.ASSETS?await env.ASSETS.fetch(request):json({error:'Not found'},404);
    if(['/api/v1/auth/login','/api/v1/auth/logout'].includes(url.pathname))return await webAuthRoute(request,env,url.pathname);
    const auth=request.headers.get('Authorization')||'';
    const telegramUser=auth.startsWith('tma ')?await validateTelegramInitData(auth.slice(4),env.TELEGRAM_BOT_TOKEN,await allAllowedUsers(env)):null;
    const apiAccess=auth.startsWith('Bearer ')&&await equalSecret(auth,env.API_TOKEN?'Bearer '+env.API_TOKEN:null);
    const sessionAccess=!auth&&await webSession(request,env);
    if(sessionAccess&&!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
    if(!telegramUser&&!apiAccess&&!sessionAccess)return json({error:'Откройте приложение заново из меню Telegram-бота'},401);
    const userId=telegramUser?String(telegramUser.id):apiAccess?String(env.API_USER_ID||env.TELEGRAM_OWNER_ID):sessionAccess;
    if(!await hasAccess(env,userId))return json({error:'Нет доступа к этому профилю'},403);
      if(url.pathname==='/api/v1/admin/lunch-learning'){if(userId!==String(env.TELEGRAM_OWNER_ID))return json({error:'Только для владельца'},403);if(request.method==='GET')return json(await learningQueue(env));if(request.method==='POST')return json(await moderateLearning(env,await readJsonObject(request)));}
      if(request.method==='GET'&&url.pathname==='/api/v1/admin/telemetry'){if(userId!==String(env.TELEGRAM_OWNER_ID))return json({error:'Только для владельца'},403);return json(await telemetryReport(env));}
      if(request.method==='POST'&&url.pathname==='/api/v1/telemetry'){const current=await readState(env,userId),text=await readRequestText(request,16000);return json(await collectTelemetry(env,userId,parseJsonObject(text),current.data.settings.telemetryEnabled!==false));}
      if(request.method==='POST'&&url.pathname==='/api/v1/notifications/test'){const current=await readState(env,userId);return json(await sendTestMessage(env,userId,current.data,await readJsonObject(request),telegram,periodSummary));}
      if(request.method==='POST'&&url.pathname==='/api/v1/feedback')return json(await sendFeedback(env,userId,await readJsonObject(request),telegram));
      if(request.method==='GET'&&url.pathname==='/api/v1/state')return json(await readState(env,userId));
      if(request.method==='PUT'&&url.pathname==='/api/v1/state') {
        const text=await readRequestText(request);
        const input=parseJsonObject(text),key=request.headers.get('Idempotency-Key');
        if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw new RequestError('Нужна корректная ревизия данных');
        if(key&&(!/^[a-zA-Z0-9:_-]{1,160}$/.test(key)))return json({error:'Неверный ключ сохранения'},400);
        const receipt=key?'state:'+key:null,hash=receipt?await hashRequest(input):null;
        const stored=async()=>{const prior=await readReceipt(env,userId,receipt);return prior?(prior.requestHash===hash?json(prior.result):json({error:'Ключ сохранения уже использован'},409)):null;};
        const prior=await stored();if(prior)return prior;
        const data=validateInput(()=>migrateData(input.data,EMPTY)),current=await readState(env,userId);
        if(current.revision!==input.expectedRevision)return await stored()||json({error:'Revision conflict'},409);
        validateInput(()=>validateStateChange(current.data,data));delete data._pinHash;const result={revision:input.expectedRevision+1};
        const encoded=validateInput(()=>encodeState(data),413);
        const rows=await env.DB.batch([
          backupBefore(env,userId,input.expectedRevision),
          env.DB.prepare('UPDATE user_finance_state SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(encoded,new Date().toISOString(),userId,input.expectedRevision),
          ...(receipt?[env.DB.prepare('INSERT INTO user_idempotency(user_id,id,request_hash,result,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(userId,receipt,hash,JSON.stringify(result),Date.now())]:[]),
          trimBackups(env,userId)
        ]);
        if(rows[1].meta.changes!==1)return await stored()||json({error:'Revision conflict'},409);
        return json(result);
      }
      if(request.method==='POST'&&url.pathname==='/api/v1/transactions')return json(await writeTransaction(env,userId,await readJsonObject(request),request.headers.get('Idempotency-Key')),201);
      if(request.method==='GET'&&url.pathname==='/api/v1/summary') {
        const state=await readState(env,userId),today=clockAt(new Date(),state.data.settings?.timeZone||DEFAULT_ZONE).date;
        const from=url.searchParams.get('from')||today,to=url.searchParams.get('to')||today;
        if(!validDate(from)||!validDate(to)||from>to)throw new RequestError('Проверьте начало и конец периода');
        return json({text:periodSummary(state.data,from,to,'Расходы')});
      }
      return json({error:'Not found'},404);
    }catch(error){
      if(error instanceof RequestError)return json({error:error.message},error.status);
      // Log route metadata only: database errors can contain financial data.
      console.error(JSON.stringify({event:'request_failed',method:request.method,path:url.pathname}));
      return json({error:'Сервер временно недоступен. Повтори запрос; операцию — с тем же ключом.'},503);
    }
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
        const data=JSON.parse(profile.data),day=clockAt(now,data.settings?.timeZone||DEFAULT_ZONE).date,responses=await notificationChecks(env,userId,day),reports=notificationJobs(data,now,responses,{catchUp:true});
        await deliverNotifications(env,userId,day,data,reports,responses,telegram,periodSummary,setDayCheck,{now:now.getTime()});
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
