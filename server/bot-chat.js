import {accountMentions} from '../src/input-intent.js';
import {load,create,replace,pendingForm} from './bot-drafts.js';
import {moduleEnabled} from '../src/modules.js';
import {parseEntry,parseOwnTransfer,entryType} from '../src/quick-entry.js';
import {entryDefaults} from '../src/entry-assist.js';
import {homeBlocks,HOME_BLOCKS} from '../src/home-layout.js';
import {duePayments} from '../src/due-payments.js';
import {quickDefaults,compactTransaction,actionOutcome,actionDestination} from './bot-dialog.js';
import {repeatEntry} from '../src/entry-assist.js';
import {CATEGORIES} from '../src/mini-model.js';
import {isSavings} from '../src/savings.js';
import {getPicture,originalPicture,uploadPicture,PICTURE_ERROR,pictureErrorCode} from './bot-pictures.js';
import {collectTelemetry} from './telemetry.js';
import {lunchReminder} from './notifications.js';
import {setDayCheck} from './habits.js';
import {botView,view,act} from './bot-views.js';
import {fieldsFor,parseField,applyBotAction,initialValues,botImportPreview} from './bot-catalog.js';
import {botKeyboard,BOT_SECTIONS} from './bot-navigation.js';
import {EMPTY,money,todayMoscow} from '../src/mini-model.js';
import {migrateData} from '../src/ledger.js';
import {lunchCalculator} from '../src/lunch-budget.js';
import {importPrompt,IMPORT_EXAMPLE,parseImportJson} from '../src/json-import.js';
import {telemetryReport} from './telemetry.js';
import {learningQueue,moderateLearning} from './lunch-learning.js';
import {sendTestMessage} from './test-messages.js';
import {sendFeedback} from './feedback.js';
const short=(s,n=58)=>String(s).slice(0,n),send=(api,env,userId,text,markup)=>api.telegram(env,'sendMessage',{chat_id:userId,text,...(markup?{reply_markup:markup}:{})});
export async function cancelBotFlow(env,userId,api){
 const rows=(await env.DB.prepare("SELECT payload FROM telegram_drafts WHERE owner=? AND id GLOB 'bf_*' AND consumed=0").bind(userId).all()).results;
 await env.DB.prepare("UPDATE telegram_drafts SET consumed=1 WHERE owner=? AND id GLOB 'bf_*' AND consumed=0").bind(userId).run();
 if(api)for(const row of rows){const cardId=JSON.parse(row.payload).cardId;if(cardId)try{
  await api.telegram(env,'editMessageReplyMarkup',{chat_id:userId,message_id:cardId,reply_markup:{inline_keyboard:[]}});
 }catch{/* Telegram may have deleted the old message; the draft is already closed. */}}
}
async function retireMenu(env,userId,api,message,result){
 if(!message?.message_id||message.message_id===result?.message_id)return;
 try{await api.telegram(env,'editMessageReplyMarkup',{chat_id:userId,message_id:message.message_id,reply_markup:{inline_keyboard:[]}});}catch{/* Deleted messages do not block the next screen. */}
}
export function compactMenuRows(buttons,routes,name){
 if(!['home','add'].includes(name))return buttons;
 const rows=[];
 for(let i=0;i<buttons.length;i++){
  const route=routes[i],last=rows.at(-1),previous=routes[i-1];
  const short=route.command!=='/app'&&[...route.label].length<=22;
  if(short&&last?.length===1&&previous?.command!=='/app'&&[...previous.label].length<=22&&[...route.label,...previous.label].length<=40)last.push(buttons[i][0]);
  else rows.push([...buttons[i]]);
 }
 return rows;
}
async function latestView(env,userId){
 const row=await env.DB.prepare("SELECT payload FROM telegram_drafts WHERE owner=? AND id GLOB 'bv_*' AND consumed=0 AND expires_at>? ORDER BY rowid DESC LIMIT 1").bind(userId,Date.now()).first();
 if(!row)return null;
 const p=JSON.parse(row.payload);
 return p.cardId?{message_id:p.cardId,...(p.cardPhoto?{photo:true}:{})}:null;
}
async function rememberView(env,userId,id,messageId,photo=false){
 if(!messageId)return;
 const current=await load(env,userId,id);
 await replace(env,userId,current.row,{...current.p,cardId:messageId,cardPhoto:photo});
}
async function menu(env,userId,screen){
 const routes=screen.actions||[],id=await create(env,userId,{kind:'bot-view',routes,origin:screen.origin});
 const buttons=routes.map((x,i)=>[x.command==='/app'&&env.MINI_APP_URL?{text:short(x.label),web_app:{url:env.MINI_APP_URL}}:{text:short(x.label),callback_data:x.special==='dayCheck'?`check:${x.args.day}:${x.args.action}`:`b:r:${id}:${i}`}]);
 if(screen.origin?.name==='transaction'&&buttons.length===4)return {id,reply_markup:{inline_keyboard:[buttons[0],[...buttons[1],...buttons[2]],buttons[3]]}};
 if(screen.origin?.name==='lunchMonths'&&buttons.length>=12)return {id,reply_markup:{inline_keyboard:[...Array.from({length:6},(_,i)=>[buttons[i*2][0],buttons[i*2+1][0]]),...buttons.slice(12)]}};
 return {id,reply_markup:{inline_keyboard:compactMenuRows(buttons,routes,screen.origin?.name)}};
}
async function render(env,userId,api,screen){
 const previous=api.viewMessage?.message_id?api.viewMessage:await latestView(env,userId);
 const text=[screen.title,'',...(screen.lines||[])].join('\n').slice(0,3700),{id,reply_markup}=await menu(env,userId,screen);
 if(previous?.message_id&&!previous.photo)try{
  const result=await api.telegram(env,'editMessageText',{chat_id:userId,message_id:previous.message_id,text,reply_markup});
  await rememberView(env,userId,id,result?.message_id||previous.message_id);
  return result||{message_id:previous.message_id};
 }catch{/* Deleted/expired/unedittable message: send a new screen. */}
 const result=await send(api,env,userId,text,reply_markup);
 await rememberView(env,userId,id,result?.message_id);
 await retireMenu(env,userId,api,previous,result);
 return result;
}
export async function showBotView(env,userId,api,name='home',args={}){
 const s=await api.readState(env,userId);try{const screen=({home:'overview',allocation:'overview',add:'add',accounts:'accounts',account:'accounts',savings:'savings',movements:'accounts',movement:'accounts',history:'history',transaction:'history',activity:'history',goals:'goals',goal:'goals',wishes:'goals',wish:'goals',payments:'payments',plans:'payments',due:'payments',dueItem:'payments',installments:'payments',installment:'payments',schedule:'payments',debts:'payments',debt:'payments',debtHistory:'payments',lunch:'lunch',lunchDays:'lunch',lunchMonths:'lunch',analytics:'stats',limits:'stats',updates:'updates'})[name]||'settings';await collectTelemetry(env,userId,{id:crypto.randomUUID(),events:[{event:'page_view',screen,device:'bot'}]},s.data.settings.telemetryEnabled!==false);}catch{}
 if(name==='backups'){const page=Math.max(0,Number(args.page)||0),rows=(await env.DB.prepare('SELECT revision,created_at FROM user_state_backups WHERE user_id=? ORDER BY revision DESC LIMIT 50').bind(userId).all()).results;return render(env,userId,api,{title:'Серверные резервные копии',lines:['Восстановление только после проверки.'],actions:[...rows.slice(page*8,page*8+8).map(r=>({label:`${r.created_at} · версия ${r.revision}`,special:'backup',args:{revision:r.revision}})),...(page>0?[view('← Копии','backups',{page:page-1})]:[]),...((page+1)*8<rows.length?[view('Копии →','backups',{page:page+1})]:[]),view('Меню копий','backup')]});}
 const screen=botView(s.data,name,args,s.isOwner);screen.origin={name,args};if(name==='transaction'&&args.backTo)screen.actions=screen.actions.map(r=>r.view==='history'?{...r,args:args.backTo.args}:r);
 if(screen.picture&&(env.BROWSER||api.capturePicture)){
  try{
   try{await api.telegram(env,'sendChatAction',{chat_id:userId,action:'upload_photo'});}catch{}
   const picture=await getPicture(env,userId,s,screen.picture,api.capturePicture);
   const actions=[...screen.actions,{label:'📄 Скачать PNG',special:'pictureOriginal',args:{...picture.params,key:picture.cache_key}},view('📝 Текстом',name,{...args,textOnly:true})];
   const previous=api.viewMessage?.message_id?api.viewMessage:await latestView(env,userId),{id,reply_markup}=await menu(env,userId,{actions,origin:screen.origin});
    const result=await uploadPicture(env,userId,picture,reply_markup,false,[screen.title,'',...screen.lines].join('\n'),previous?.photo?previous.message_id:undefined);
    await rememberView(env,userId,id,result?.message_id||previous?.message_id,true);
    await retireMenu(env,userId,api,previous,result);return result;
  }catch(error){console.warn('Picture fallback',pictureErrorCode(error));}
 }
 return render(env,userId,api,screen);
}
async function formCard(env,userId,api,id,text,markup,expectedValues){
 const loaded=await load(env,userId,id),p=loaded.p,version=(p.cardVersion||0)+1;
 if(expectedValues&&JSON.stringify(expectedValues)!==JSON.stringify(p.values))throw Error('Карточка изменилась. Открой последний шаг.');
 await replace(env,userId,loaded.row,{...p,cardVersion:version});
 const reply_markup={...markup,inline_keyboard:markup.inline_keyboard.map(row=>row.map(b=>b.callback_data?{...b,callback_data:b.callback_data+':g'+version}:b))};
 let message;if(p.cardId)try{message=await api.telegram(env,'editMessageText',{chat_id:userId,message_id:p.cardId,text,reply_markup});}catch{}
 if(!message)message=await send(api,env,userId,text,reply_markup);
 const fresh=await load(env,userId,id);if(fresh.p.cardVersion===version)await replace(env,userId,fresh.row,{...fresh.p,cardId:message?.message_id||p.cardId});return message;
}
export async function pauseBotForm(env,userId,api){const active=await pendingForm(env,userId);if(active&&!active.p.paused){await replace(env,userId,active.row,{...active.p,paused:true});if(active.p.cardId&&api)try{await api.telegram(env,'editMessageReplyMarkup',{chat_id:userId,message_id:active.p.cardId,reply_markup:{inline_keyboard:[]}});}catch{/* Old or deleted message: draft remains safely paused. */}}}
async function resumeMenu(env,userId,api,active,op,args){return render(env,userId,api,{title:'✍️ Есть незавершённая запись',lines:[active.p.values.amount?money(active.p.values.amount,active.p.values.currency||'RUB'):'Можно продолжить с последнего поля.'],actions:[{label:'▶️ Продолжить запись',special:'resumeForm',args:{id:active.row.id}},{label:'Начать заново',special:'restartForm',args:{op,args}},view('Главная','home')]});}
async function start(env,userId,api,op,args={}){
 const active=await pendingForm(env,userId);if(active&&!args.forceNew)return resumeMenu(env,userId,api,active,op,args);
 await cancelBotFlow(env,userId,api);const s=await api.readState(env,userId),p={kind:'bot-form',op,args:{newId:crypto.randomUUID(),...args},values:{...(op==='tx'&&!args.id?quickDefaults(s.data,args):{}),...initialValues(s.data,op,args),...args.prefill},step:args.quickInput?1:0,status:'form',revision:s.revision,...(api.viewMessage?.message_id&&!api.viewMessage.photo?{cardId:api.viewMessage.message_id}:{})};
 if(args.ownLunch){p.values.note=p.values.note||'Обед за свои';p.values.cat='food';p.values.tags=['обед-за-свои'];}
 const id=await create(env,userId,p,'bf_');if(args.review)return preview(env,userId,api,id,p);if(op==='restore')await api.sendFile(env,userId,s.data,'byurdzhet-before-restore.json');return prompt(env,userId,api,id,p);
}
async function prompt(env,userId,api,id,p,page=0){
 const expectedPayload=JSON.stringify(p),s=await api.readState(env,userId);let fields=fieldsFor(s.data,p.op,p.args,p.values),changed=false;
 while(fields[p.step]?.advanced&&!p.editing){const f=fields[p.step],value=Object.hasOwn(p.values,f.key)?p.values[f.key]:f.default;p={...p,values:{...p.values,[f.key]:value??''},step:p.step+1};fields=fieldsFor(s.data,p.op,p.args,p.values);changed=true;}
 if(changed){const loaded=await load(env,userId,id);if(loaded.row.payload!==expectedPayload)throw Error('Шаг уже изменился. Используй последнее сообщение.');await replace(env,userId,loaded.row,p);}
 if(p.op==='tx'&&!p.editing&&p.values.amount&&p.values.amount>0&&(p.args.type==='lunch'||s.data.accounts.some(a=>a.id===p.values.accountId))&&p.step>0)return preview(env,userId,api,id,p);
 const f=fields[p.step];if(!f)return preview(env,userId,api,id,p);
 const items=f.choices||[],part=items.slice(page*8,page*8+8),rows=part.map(([value,label],i)=>[{text:short(label),callback_data:`b:p:${id}:${p.step}:${page*8+i}`}]);
 if(items.length>8)rows.push([...(page>0?[{text:'← Варианты',callback_data:`b:q:${id}:${p.step}:${page-1}`}]:[]),...((page+1)*8<items.length?[{text:'Варианты →',callback_data:`b:q:${id}:${p.step}:${page+1}`}]:[])]);
 const current=Object.hasOwn(p.values,f.key)?p.values[f.key]:f.default;
 if(f.optional||(current!==undefined&&current!==''&&(f.type!=='choice'||items.some(([v])=>String(v)===String(current)))))rows.push([{text:f.optional&&current===''?'Пропустить':`Оставить: ${short(items.find(([v])=>String(v)===String(current))?.[1]??(current===''?'пусто':f.type==='document'?'выбранный файл':current),35)}`,callback_data:`b:k:${id}:${p.step}`}]);
 if(p.step>0)rows.push([{text:'← Назад',callback_data:'b:b:'+id}]);rows.push([{text:'✕ Отмена',callback_data:'b:x:'+id}]);
 const message=await formCard(env,userId,api,id,`✍️ ${f.label}\n${p.args.lunchCheckDay?'Обед за '+p.args.lunchCheckDay+'\n':''}\n${f.type==='choice'?(items.length?'Выбери вариант кнопкой.':'Подходящих записей нет. Создай их в соответствующем разделе.'):f.type==='document'?'Отправь файл или вставь содержимое.':'Напиши ответ сообщением.'}`,{inline_keyboard:rows},p.values);
 // A reply to an old prompt must never become the answer to a later field.
 const loaded=await load(env,userId,id);if(loaded.p.step===p.step&&loaded.p.status==='form')await replace(env,userId,loaded.row,{...loaded.p,promptId:message?.message_id});
}
const actionTitles={tx:'Запись операции',account:'Новый счёт',transfer:'Перевод своим',reconcile:'Сверка остатка',wish:'Заметка о покупке',debt:'Существующий долг',repay:'Возврат долга',linkDebt:'Связать возврат',plan:'План операции',installment:'График обязательства',restore:'Замена бюджета',import:'Импорт операций',feedback:'Обратная связь'};
export async function preview(env,userId,api,id,p){
 const s=await api.readState(env,userId),fields=fieldsFor(s.data,p.op,p.args,p.values);let lines=[],error='';
 try{
  if(p.op==='importRow'){const parent=p.importParent,doc=parseImportJson(parent.values.content),row={...p.values};if(row.type==='lunch')for(const key of ['account','category','paymentMethod','from','to','fee'])delete row[key];else if(row.type==='transfer')for(const key of ['account','category','paymentMethod'])delete row[key];else {for(const key of ['from','to','fee'])delete row[key];if(row.type==='income')delete row.category;}
   doc.operations[p.args.index]=row;const values={...parent.values,content:JSON.stringify(doc)};if(['account','from','to','type'].some(k=>row[k]!==parent.row[k]))for(const key of Object.keys(values))if(key.startsWith('map_'))delete values[key];
   const next={...parent,values,status:'confirm',cardId:p.cardId,cardVersion:p.cardVersion,args:{...parent.args,excluded:(parent.args.excluded||[]).filter(x=>x!==p.args.index)}};delete next.row;const loaded=await load(env,userId,id);await replace(env,userId,loaded.row,next);return importPreview(env,userId,api,id,next,next.importPage||0);
  }
  if(p.op==='search'){await cancelBotFlow(env,userId,api);return showBotView(env,userId,api,'history',{query:p.values.query});}
  if(p.op==='calculator'){const items=p.values.items.split('\n').filter(Boolean).map(line=>{const [name,price,count='1']=line.split(';');return {name,price,count:Number(count)};});const total=lunchCalculator(items);await cancelBotFlow(env,userId,api);return render(env,userId,api,{title:'🍽 Калькулятор',lines:[...items.map(i=>`${i.name} × ${i.count} · ${i.price}`),`Итого: ${money(total)}`],actions:[act('Записать обед компании','tx',{type:'lunch',prefill:{amount:total,note:items.map(i=>i.name+' × '+i.count).join(', ')}}),view('Обеды','lunch')]});}
  if(p.op==='moderate'){if(!s.isOwner)throw Error('Только владелец');lines=[p.args.action==='approve'?'Одобрить правило распознавания':p.args.action==='reject'?'Отклонить пример':'Отключить правило'];}
  else if(p.op==='feedback'){if(p.values.message.length<5)throw Error('Опиши проблему подробнее');lines=[p.values.message,'Будет отправлено владельцу Бюрджета.'];}
  else if(p.op==='import')return importPreview(env,userId,api,id,p);
  else {const next=migrateData(applyBotAction(structuredClone(s.data),p.op,p.args,p.values),EMPTY);lines=fields.filter(f=>f.key!=='content').map(f=>{const v=p.values[f.key]??f.default;return `${f.label}: ${f.choices?.find(([x])=>String(x)===String(v))?.[1]??v??''}`;});if(p.op==='restore')lines=[`Счета: ${s.data.accounts.length} → ${next.accounts.length}`,`Операции: ${s.data.transactions.length} → ${next.transactions.length}`,'Нынешний бюджет будет заменён. Копия перед заменой отправлена файлом.'];else if(p.op==='homeLayout')lines=['На главной:',...homeBlocks(next).map(id=>'• '+HOME_BLOCKS.find(([key])=>key===id)[1])];else if(!fields.length){const tx=s.data.transactions.find(t=>t.id===p.args.id),plan=s.data.recurring.find(t=>t.id===p.args.id),wish=(s.data.wishes||[]).find(t=>t.id===p.args.id);lines=[tx?`${tx.note||'Операция'} · ${money(tx.amount,tx.currency)} · ${tx.date}`:plan?.name||wish?.name||p.args.key||'Подтверди действие.',p.op==='repeat'?'Будет создана новая операция на сегодня.':p.op==='deleteTx'?'Запись будет удалена. Итоги пересчитаются по правилам операции.':''];if(p.op==='deleteTx'){const related=next.history[0]?.relatedBefore||[];if(related.length)lines.push(`Связанных доплат: ${related.length}. Они тоже будут удалены.`,...related.map(t=>`• ${t.note||'Доплата'} · ${money(t.amount,t.currency)}`));for(const after of next.accounts){const before=s.data.accounts.find(a=>a.id===after.id);if(before&&before.balance!==after.balance)lines.push(`${after.name}: ${money(before.balance,after.currency)} → ${money(after.balance,after.currency)}`);}}}}
 }catch(e){error=e.message;lines=[error];}
 if(!error&&p.op==='tx')lines=compactTransaction(s.data,p);
 const loaded=await load(env,userId,id);if(loaded.row.payload!==JSON.stringify(p))throw Error('Карточка изменилась. Открой последний шаг.');const updated={...loaded.p,status:'confirm',revision:s.revision};await replace(env,userId,loaded.row,updated);
 const quickFields=p.op==='tx'?fields.map((f,i)=>['accountId','cat','note'].includes(f.key)?{text:{accountId:'💳 Счёт',cat:'🏷 Категория',note:'💬 Комментарий'}[f.key],callback_data:`b:j:${id}:${i}`}:null).filter(Boolean):[];
 return formCard(env,userId,api,id,`${error?'⚠️ Проверь поля':'🔎 '+(actionTitles[p.op]||'Проверь действие')}\n\n${lines.join('\n').slice(0,3200)}\n\n${error?'Исправь поля перед записью.':p.op==='tx'?'':'Изменения применятся после подтверждения.'}`,{inline_keyboard:[...(!error?[ [{text:'✅ Подтвердить',callback_data:'b:c:'+id}] ]:[]),...(quickFields.length?[quickFields]:[]),[{text:'✏️ Изменить поля',callback_data:'b:z:'+id},{text:'✕ Отмена',callback_data:'b:x:'+id}]]},p.values);
}
async function importPreview(env,userId,api,id,p,page=0){
 const s=await api.readState(env,userId),preview=botImportPreview(s.data,p.values,p.args),rows=preview.rows,pageRows=rows.slice(page*6,page*6+6),included=rows.filter(r=>!r.excluded&&!p.args.excluded?.includes(r.index??r.line)),errors=included.filter(r=>r.error),fresh=included.filter(r=>!r.error&&(!r.duplicate||r.force||p.args.forced?.includes(r.line))),buttons=[];
 const detail=pageRows.map(r=>{const index=r.index??r.line,key=preview.json?index+1:index,excluded=p.args.excluded?.includes(index),t=r.transaction||r.transfer;if(preview.json)buttons.push([{text:`✏️ Исправить строку ${key}`,callback_data:`b:u:${id}:${index}`}]);buttons.push([{text:`${excluded?'Вернуть':'Исключить'} строку ${key}`,callback_data:`b:e:${id}:${index}`}]);if(r.duplicate&&!r.referenceDuplicate)buttons.push([{text:`${p.args.forced?.includes(index)?'Не импортировать дубль':'Это другая операция'} · ${key}`,callback_data:`b:d:${id}:${index}`}]);return `${key}. ${excluded?'⏸':r.error?'⚠️':r.duplicate?'≈':'✓'} ${r.error||`${t?.date} · ${t?.amount} · ${t?.note||''}`}`;});
 if(page>0)buttons.push([{text:'← Строки',callback_data:`b:i:${id}:${page-1}`}]);if((page+1)*6<rows.length)buttons.push([{text:'Строки →',callback_data:`b:i:${id}:${page+1}`}]);
 if(!errors.length&&fresh.length&&!preview.sources.length)buttons.push([{text:`✅ Импортировать ${fresh.length}`,callback_data:'b:c:'+id}]);buttons.push([{text:'Изменить поля / файл',callback_data:'b:z:'+id},{text:'Отмена',callback_data:'b:x:'+id}]);
 const loaded=await load(env,userId,id);await replace(env,userId,loaded.row,{...loaded.p,status:'confirm',revision:s.revision,importPage:page});
 return formCard(env,userId,api,id,`📥 Предпросмотр импорта\nНовых: ${fresh.length} · похожих: ${rows.filter(r=>r.duplicate).length} · ошибок: ${errors.length}\n${p.values.affectBalances?'Остатки изменятся':'История без изменения остатков'}\n\n${detail.join('\n').slice(0,2700)}${preview.sources.length?'\nСчета не сопоставлены — вернись к полям.':''}`,{inline_keyboard:buttons});
}
async function route(env,userId,api,r){
 if(r.special==='resumeForm'){const active=await load(env,userId,r.args.id);const next={...active.p,paused:false,cardId:undefined};await replace(env,userId,active.row,next);return next.status==='confirm'?preview(env,userId,api,r.args.id,next):prompt(env,userId,api,r.args.id,next);}
 if(r.special==='restartForm')return start(env,userId,api,r.args.op,{...r.args.args,forceNew:true});
 if(r.view){await pauseBotForm(env,userId,api);return showBotView(env,userId,api,r.view,r.args);}
 if(r.op==='repeat'){
  const state=await api.readState(env,userId),tx=state.data.transactions.find(t=>t.id===r.args.id);if(!tx)throw Error('Запись больше не существует');
  const prefill=repeatEntry(state.data,tx,todayMoscow(state.data.settings.timeZone),CATEGORIES.concat(state.data.customCats||[]));
  return start(env,userId,api,'tx',{type:tx.type,prefill,review:true,returnTo:r.args.returnTo});
 }
 if(r.op)return start(env,userId,api,r.op,r.args);
 if(r.command)return api.command(r.command);
 const s=await api.readState(env,userId);
 if(r.special==='picture'||r.special==='pictureOriginal'){
  try{
   try{await api.telegram(env,'sendChatAction',{chat_id:userId,action:'upload_photo'});}catch{/* Optional typing indicator. */}
   const picture=r.special==='pictureOriginal'?await originalPicture(env,userId,r.args.key):await getPicture(env,userId,s,r.args,api.capturePicture),p=picture.params;
   const actions=[{label:'📄 Скачать PNG',special:'pictureOriginal',args:{...p,key:picture.cache_key}},view('🖼 Другие картинки','pictures')];
   if(['analytics','categories'].includes(p.kind))actions.unshift(...[7,30].map(days=>({label:`${days} дней`,special:'picture',args:{...p,days}})));
   if(p.kind==='lunch')actions.unshift(view('Выбрать месяц','lunchMonths'));
   if(p.kind==='savings'){if(p.page>0)actions.unshift({label:'← Накопления',special:'picture',args:{...p,page:p.page-1}});if((p.page+1)*6<Math.max(s.data.accounts.filter(isSavings).length,s.data.goals.length))actions.unshift({label:'Накопления →',special:'picture',args:{...p,page:p.page+1}});}
   actions.push(view('Открыть раздел',p.kind==='budget'?'home':['categories','forecast'].includes(p.kind)?'analytics':p.kind,p.kind==='lunch'?{month:p.month}:{}));
   return await uploadPicture(env,userId,picture,(await menu(env,userId,{actions})).reply_markup,r.special==='pictureOriginal',undefined,api.viewMessage?.photo?api.viewMessage.message_id:undefined);
  }catch{return render(env,userId,api,{title:'🖼 Снимок миниаппы',lines:[PICTURE_ERROR],actions:[{label:'Повторить',special:'picture',args:r.args},view('Картинки','pictures'),view('Главная','home')]});}
 }
 if(r.special==='lunchQuestion'){const day=todayMoscow(s.data.settings.timeZone);await setDayCheck(env,userId,day,'lunch','open');const body=lunchReminder(day);return send(api,env,userId,body.text,body.reply_markup);}
 if(r.special==='example')return api.sendFile(env,userId,IMPORT_EXAMPLE,'byurdzhet-operations-example.json');
 if(r.special==='export')return api.sendFile(env,userId,s.data,'byurdzhet-backup-'+todayMoscow(s.data.settings.timeZone)+'.json');
 if(r.special==='prompt')return api.sendFile(env,userId,importPrompt(s.data),'byurdzhet-import-prompt.txt');
 if(r.special==='test')return sendTestMessage(env,userId,s.data,{id:crypto.randomUUID(),type:r.args.type},api.telegram,api.periodSummary);
 if(r.special==='backup'){const row=await env.DB.prepare('SELECT data FROM user_state_backups WHERE user_id=? AND revision=?').bind(userId,r.args.revision).first();if(!row)throw Error('Копия отсутствует');await start(env,userId,api,'restore',{prefill:{content:row.data}});return;}
 if(r.special==='telemetry'){if(!s.isOwner)throw Error('Только владелец');return api.sendFile(env,userId,await telemetryReport(env),'byurdzhet-telemetry.json');}
 if(r.special==='moderation'){if(!s.isOwner)throw Error('Только владелец');const queue=await learningQueue(env),page=Math.max(0,Number(r.args?.page)||0);return render(env,userId,api,{title:'Модерация обедов',lines:[`Ожидают: ${queue.examples.filter(x=>x.status==='pending').length} · правил: ${queue.rules.length}`],actions:[...queue.examples.slice(page*8,page*8+8).map(x=>({label:`${x.status} · ${x.parsed.amount} → ${x.corrected.amount}`,special:'learning',args:{id:x.id}})),...(page>0?[{label:'← Примеры',special:'moderation',args:{page:page-1}}]:[]),...((page+1)*8<queue.examples.length?[{label:'Примеры →',special:'moderation',args:{page:page+1}}]:[]),view('Главная','home')]});}
 if(r.special==='learning'){if(!s.isOwner)throw Error('Только владелец');const x=(await learningQueue(env)).examples.find(x=>x.id===r.args.id);if(!x)throw Error('Пример отсутствует');return render(env,userId,api,{title:'Пример распознавания',lines:[x.source,`Было: ${x.parsed.amount} → исправлено: ${x.corrected.amount}`,x.status],actions:(x.status==='pending'?['approve','reject']:['disable']).map(action=>act({approve:'Одобрить',reject:'Отклонить',disable:'Отключить правило'}[action],'moderate',{id:x.id,action}))});}
}
export async function botChat(update,env,userId,api){
 const callback=update.callback_query,message=update.message;
 if(callback?.data?.startsWith('b:')){
  await api.telegram(env,'answerCallbackQuery',{callback_query_id:callback.id});const [,action,id,arg,extra]=callback.data.split(':');
  if(action==='n'){
   const state=await api.readState(env,userId),today=todayMoscow(state.data.settings.timeZone);
   const item=duePayments(state.data,today).find(x=>x.id===arg&&(id==='p'?x.kind==='plan'&&x.period===extra:id==='i'?x.kind==='installment':id==='d'&&x.kind==='debt'));
   if(!item){await send(api,env,userId,'Этот платёж уже закрыт или изменён. Показываю актуальный список.');await showBotView(env,userId,api,'due');return true;}
   await pauseBotForm(env,userId,api);
   const returnTo={name:'due',args:{}};
   await start(env,userId,api,item.kind==='plan'?'confirmPlan':item.kind==='installment'?'payInstallment':'repay',{...(item.kind==='plan'?{id:item.id,period:item.period}:item.kind==='installment'?{id:item.planId,paymentId:item.id}:{id:item.id}),returnTo});return true;
  }
  if(action==='v'&&id==='app'){await api.command('/app');return true;}
  if(action==='v'){await pauseBotForm(env,userId,api);await showBotView(env,userId,{...api,viewMessage:callback.message},id);return true;}
  let loaded;try{loaded=await load(env,userId,id);}catch{const receipt=await env.DB.prepare('SELECT result FROM user_idempotency WHERE user_id=? AND id=?').bind(userId,'bot:'+id).first();return render(env,userId,api,{title:receipt?'✅ Это действие уже выполнено':'Эта карточка уже закрыта',lines:[receipt?'Повторной записи не будет. Открой историю, чтобы посмотреть результат.':'Открой актуальный раздел.'],actions:[view('✍️ Записать','add'),view('История','history'),view('Главная','home')]});}const {p}=loaded;
  if(action==='r'){if(p.kind!=='bot-view'||!p.routes[Number(arg)])throw Error('Кнопка устарела');let r=p.routes[Number(arg)];if(r.op)r={...r,args:{...r.args,returnTo:p.origin}};if(r.view==='transaction'&&p.origin?.name==='history')r={...r,args:{...r.args,backTo:p.origin}};const result=await route(env,userId,{...api,viewMessage:callback.message},r);if(r.op)await retireMenu(env,userId,api,callback.message,result);return true;}
  if(p.kind!=='bot-form')throw Error('Карточка устарела');
  const generation=callback.data.split(':').at(-1);if(/^g\d+$/.test(generation)&&Number(generation.slice(1))!==p.cardVersion){await send(api,env,userId,'Используй кнопки последнего шага.');return true;}
  if(p.paused){await resumeMenu(env,userId,api,loaded,'tx',{type:'expense'});return true;}
  if(action==='x'){await cancelBotFlow(env,userId,api);const dest=actionDestination(p);await showBotView(env,userId,api,dest.name,dest.args);return true;}
  if(action==='c'){
   if(p.status!=='confirm')throw Error('Сначала проверь карточку');const current=await api.readState(env,userId);if(current.revision!==p.revision){await send(api,env,userId,'Данные изменились в другом окне. Обновил предпросмотр — проверь и подтверди ещё раз.');await preview(env,userId,api,id,p);return true;}
   if(p.op==='moderate'){if(!current.isOwner)throw Error('Только владелец');await moderateLearning(env,p.args);await cancelBotFlow(env,userId,api);await send(api,env,userId,'✅ Решение сохранено');return true;}
   if(p.op==='feedback'){await sendFeedback(env,userId,{id:p.args.newId,message:p.values.message},api.telegram);await cancelBotFlow(env,userId,api);await send(api,env,userId,'✅ Отправлено владельцу');return true;}
   const result=await api.commitAction(env,userId,id,p),fresh=await api.readState(env,userId),outcome=actionOutcome(fresh.data,p,result);
   const dest=outcome.destination,repeatType=p.args.type||fresh.data.transactions.find(t=>t.id===p.args.id)?.type||p.values.type||'expense',actions=[view('↩️ Вернуться в раздел',dest.name,dest.args),...(outcome.undoId?[act('↩️ Отменить изменение','undo',{id:outcome.undoId,returnTo:dest})]:[]),...(p.op==='tx'?[act(repeatType==='lunch'?'＋ Ещё обед':repeatType==='income'?'＋ Ещё доход':'＋ Ещё расход','tx',{type:repeatType,returnTo:dest,...(p.args.checkDay?{checkDay:p.args.checkDay,prefill:{date:p.args.checkDay}}:{})})]:[])];
   if(p.args.checkDay)actions.push({label:'✅ Всё записал за '+p.args.checkDay,special:'dayCheck',args:{day:p.args.checkDay,action:'done'}},{label:'Напомнить через час',special:'dayCheck',args:{day:p.args.checkDay,action:'later'}});
   await render(env,userId,{...api,viewMessage:p.cardId?{message_id:p.cardId}:undefined},{title:outcome.title,lines:outcome.lines,actions,origin:dest});return true;
  }
  if(action==='u'&&p.op==='import'){const index=Number(arg),doc=parseImportJson(p.values.content);if(!Number.isInteger(index)||!doc.operations[index])throw Error('Строка отсутствует');const next={kind:'bot-form',cardId:p.cardId,cardVersion:p.cardVersion,op:'importRow',args:{index},values:{...doc.operations[index]},step:0,status:'confirm',revision:p.revision,importParent:{...p,row:doc.operations[index]}};await replace(env,userId,loaded.row,next);return botChat({callback_query:{...callback,data:'b:z:'+id}},env,userId,api);}
  if(action==='z'||action==='l'){const s=await api.readState(env,userId),fields=fieldsFor(s.data,p.op,p.args,p.values),page=action==='l'?Math.max(0,Number(arg)||0):0;await formCard(env,userId,api,id,'✏️ Что изменить?',{inline_keyboard:[...fields.slice(page*8,page*8+8).map((f,i)=>[{text:short(f.label),callback_data:`b:j:${id}:${page*8+i}`}]),...(page>0?[[{text:'← Поля',callback_data:`b:l:${id}:${page-1}`}]]:[]),...((page+1)*8<fields.length?[[{text:'Поля →',callback_data:`b:l:${id}:${page+1}`}]]:[]),[{text:'К проверке',callback_data:'b:t:'+id},{text:'Отмена',callback_data:'b:x:'+id}]]});return true;}
  if(action==='j'){const s=await api.readState(env,userId),fields=fieldsFor(s.data,p.op,p.args,p.values),step=Number(arg);if(!Number.isInteger(step)||!fields[step])throw Error('Поле не найдено');const next={...p,step,status:'form',editing:true};await replace(env,userId,loaded.row,next);await prompt(env,userId,api,id,next);return true;}
  if(action==='t'){await preview(env,userId,api,id,p);return true;}
  if(action==='b'){const next={...p,step:action==='z'?0:Math.max(0,p.step-1),status:'form'};await replace(env,userId,loaded.row,next);await prompt(env,userId,api,id,next);return true;}
  if(['e','d','i'].includes(action)&&p.op==='import'){const next={...p,args:{...p.args}};if(action!=='i'){const key=action==='e'?'excluded':'forced',n=Number(arg);if(!Number.isInteger(n)||n<0||n>2001)throw Error('Неверная строка');const old=next.args[key]||[];next.args[key]=old.includes(n)?old.filter(x=>x!==n):[...old,n];await replace(env,userId,loaded.row,next);}await importPreview(env,userId,api,id,next,action==='i'?Math.max(0,Number(arg)||0):p.importPage||0);return true;}
  if(p.status!=='form'||Number(arg)!==p.step)throw Error('Используй кнопки последнего шага');
  if(action==='q'){await prompt(env,userId,api,id,p,Math.max(0,Number(extra)||0));return true;}
  const s=await api.readState(env,userId),f=fieldsFor(s.data,p.op,p.args,p.values)[p.step];if(!f)throw Error('Поле уже заполнено');
  const value=action==='k'?(Object.hasOwn(p.values,f.key)?p.values[f.key]:f.default??''):action==='p'?f.choices?.[Number(extra)]?.[0]:undefined;if(value===undefined)throw Error('Выбери вариант');const parsed=value===''&&f.optional?'':parseField(f,value);const next={...p,values:{...p.values,[f.key]:parsed,...(p.op==='tx'&&f.key==='accountId'&&!p.args.id&&!p.args.prefill?.currency?{currency:s.data.accounts.find(a=>a.id===parsed)?.currency||'RUB'}:{})},step:p.editing?fieldsFor(s.data,p.op,p.args,{...p.values,[f.key]:parsed}).length:p.step+1,editing:false};await replace(env,userId,loaded.row,next);await prompt(env,userId,api,id,next);return true;
 }
 if(!message)return false;const text=api.navigationCommand((message.text||'').trim());
 if(['/cancel','Отмена'].includes(text)){const active=await pendingForm(env,userId);if(!active)return false;await cancelBotFlow(env,userId,api);if(active.p.args.checkDay)await showBotView(env,userId,api,'expenseCheck',{day:active.p.args.checkDay});else await send(api,env,userId,'Ввод отменён. Ничего не записано.');return true;}
 if(['/start','/menu'].includes(text)){await pauseBotForm(env,userId,api);await send(api,env,userId,'💼 Бюрджет\nВесь бюджет теперь доступен прямо в чате 👇',botKeyboard(env.MINI_APP_URL,(await api.readState(env,userId)).data));await showBotView(env,userId,api,'home');return true;}
 if(text==='/add'){const active=await pendingForm(env,userId);if(active){await resumeMenu(env,userId,api,active,'tx',{type:'expense'});return true;}}
 if(text==='/add'||text==='/import'){await (text==='/add'?showBotView(env,userId,api,'add'):start(env,userId,api,'import'));return true;}
 if(BOT_SECTIONS[text]){await pauseBotForm(env,userId,api);await showBotView(env,userId,api,BOT_SECTIONS[text]==='reminders'?'settingGroup':BOT_SECTIONS[text],text==='/reminders'?{group:'reminders'}:{});return true;}
 if(text.startsWith('/'))return false;
 const active=await pendingForm(env,userId);if(!active)return false;const {row,p}=active;if(p.paused)return false;if(p.status!=='form'){await send(api,env,userId,'Карточка ждёт подтверждения. Нажми «Подтвердить», «Изменить поля» или /cancel.');return true;}
 if(update.update_id!==undefined&&p.lastUpdate!==undefined&&update.update_id<=p.lastUpdate)return true;
 if(message.reply_to_message&&p.promptId&&message.reply_to_message.message_id!==p.promptId){await send(api,env,userId,'Это ответ на старый шаг. Ответь на последнее сообщение или /cancel.');return true;}
 const s=await api.readState(env,userId),f=fieldsFor(s.data,p.op,p.args,p.values)[p.step];if(message.reply_to_message?.text&&f&&!message.reply_to_message.text.split('\n')[0].includes(f.label)){await send(api,env,userId,'Это ответ на старый шаг. Ответь на последнее сообщение или /cancel.');return true;}if(!f){await preview(env,userId,api,row.id,p);return true;}
 if(f.key==='amount'&&!message.reply_to_message&&accountMentions(text,s.data.accounts).length){let intent;try{intent=parseEntry(text,s.data.accounts,CATEGORIES.concat(s.data.customCats||[]),todayMoscow(s.data.settings.timeZone),{allowMissingAccount:true,companyLunchEnabled:moduleEnabled(s.data,'lunch')});}catch{}if(intent){await pauseBotForm(env,userId,api);await openQuickEntry(env,userId,api,text);return true;}}
 if(f.type==='choice'){await prompt(env,userId,api,row.id,p);return true;}
 if(message.document&&f.type!=='document')throw Error('Сейчас нужен ответ на поле, а не файл');
 const value=message.document?await api.readDocument(env,message.document,f.max):text;const parsed=parseField(f,value);const next={...p,values:{...p.values,[f.key]:parsed},step:p.editing?fieldsFor(s.data,p.op,p.args,{...p.values,[f.key]:parsed}).length:p.step+1,editing:false,lastUpdate:update.update_id};await replace(env,userId,row,next);await prompt(env,userId,api,row.id,next);return true;
}

export async function openQuickEntry(env,userId,api,text){
 const state=await api.readState(env,userId),data=state.data,today=todayMoscow(data.settings.timeZone),transfer=parseOwnTransfer(text,data.accounts,today);
 if(transfer)return start(env,userId,api,'transfer',{prefill:transfer,review:true,returnTo:{name:'accounts',args:{}}});
 const defaults=data.settings.rememberEntryChoices===false?{}:entryDefaults(data,entryType(text),today,CATEGORIES.concat(data.customCats||[]));
 const draft=parseEntry(text,data.accounts,CATEGORIES.concat(data.customCats||[]),today,{...defaults,allowMissingAccount:true,companyLunchEnabled:moduleEnabled(data,'lunch')});
 if(draft.accountId){const account=data.accounts.find(a=>a.id===draft.accountId);if(draft.currency!==(account.currency||'RUB'))throw Error('Для валютной покупки выбери форму записи и укажи фактическое списание со счёта');}
 return start(env,userId,api,'tx',{type:draft.type,prefill:draft,quickInput:true,review:draft.type==='lunch'||!!draft.accountId||!data.accounts.length,returnTo:{name:'history',args:{}}});
}

export {start as startBotForm};
