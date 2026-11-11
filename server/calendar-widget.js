import {moveDate,scheduledEvents} from '../src/finance-events.js';
import {money,todayMoscow} from '../src/mini-model.js';
import {accountTotals} from '../src/account-balances.js';
import {activityEntries,filterActivity,transferDetails} from '../src/activity-history.js';
import {categoryCatalog} from '../src/categories.js';
import {botKeyboard,miniAppButton,navigationCommand} from './bot-navigation.js';
import {parseMoney} from '../src/ledger.js';
import {applyBotAction} from './bot-catalog.js';
import {create,load} from './bot-drafts.js';
import {commitBotAction} from './bot-commit.js';
import {readReceipt} from './state-persistence.js';
import {paymentDate} from '../src/payment-copy.js';
import {calendarEventCategory} from '../src/calendar-model.js';
import {accountBackground,appearanceColors} from '../src/appearance.js';
import {iconShape} from '../src/mini-icon-shapes.js';
import {isIcon} from '../src/icon-catalog.js';
import {hasAccess} from './users.js';
import {widgetGlass} from './widget-glass.js';
import {widgetBrand} from './widget-brand.js';
import {accountWidgetData} from './accounts-widget-data.js';
import {accountsWidgetHtml} from './notification-widget.js';

const html=String.raw`<style>
${widgetGlass}
body{margin:0;color:#e8eff4;font:15px system-ui}
[hidden]{display:none!important}
.panel{padding:13px}
h3{display:flex;align-items:center;gap:8px;margin:0 0 10px}
h3:before,h3:after{content:'';flex:1;height:1px;background:#ffffff25}
h4{text-align:center}
ol{margin:0;padding:0;list-style:none}
li{display:flex;align-items:center;gap:8px;padding:5px 7px}
li+li{border-top:1px solid #ffffff22}
.event{flex:1;min-width:0;overflow-wrap:anywhere}
small{display:block}
time,small{color:#b6c5d3;font-size:13px}
time{padding-right:8px;border-right:1px solid #ffffff2a}
time,strong{white-space:nowrap}
.income strong{color:#bde3cb}.expense strong{color:#f1bfbb}
footer,.picker-nav{display:flex;justify-content:space-between}
footer{margin-top:8px}
button{min-height:44px;padding:0 8px;border:1px solid #ffffff24;border-radius:10px;background:#ffffff09;color:#d6e4e8;font:inherit}
button:active{opacity:.8}
nav{display:flex;margin-bottom:12px;border-bottom:1px solid #ffffff24}
nav button{flex:1;padding:0;border:0;border-radius:0;background:none;font-size:12px}
nav button+button{border-left:1px solid #ffffff24}
nav button[aria-pressed=true]{background:linear-gradient(#b7d5ca26,transparent)}
nav button:last-child{flex:none;width:32px;font-size:20px}
.balance{display:block;text-align:center;font-size:30px;margin:12px 0}
#balance:before{content:'На обычных счетах';display:block;font:13px system-ui;color:#b6c5d3}
.event summary{font-weight:bold}
.entry{display:grid;gap:8px}
.entry-tools,.keypad{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.entry-tools{grid-template-columns:repeat(2,minmax(0,1fr))}
.entry-tools.picker button:last-child:nth-child(odd){grid-column:span 2}
.keypad button{text-align:center;font-size:19px}
.review:enabled{background:#c5e4d4;color:#182b28}
.choice svg{width:16px;margin-right:5px}
.out{color:#f1bfbb}.in{color:#bde3cb}
.out[aria-pressed=true]{background:#ed999533}
.in[aria-pressed=true]{background:#92c9ac33}
@media(max-width:245px){li,nav{flex-wrap:wrap}}
@media(prefers-reduced-motion:no-preference){
li,.entry>*,.event small{animation:appear .22s}
@keyframes appear{from{opacity:0}}
}
</style>
<section class="panel widget-glass"><h3><img width="96" height="28" alt="Бюрджет"></h3>
<nav id="nav" hidden>
<button type="button" data-page="home">Главная</button><button type="button" data-page="calendar">Календарь</button><button type="button" data-page="history">Операции</button><button type="button" data-page="add" aria-label="Записать">＋</button>
</nav><strong id="balance" class="balance" hidden></strong><h4 id="title"></h4><ol id="payments"></ol><div id="entry" class="entry" hidden></div>
<footer><small id="status" aria-live="polite"></small>
<button type="button" id="refresh" hidden>Обновить</button></footer></section>
<script>
const widget=window.TelegramWidget;
const payments=document.getElementById('payments');
const status=document.getElementById('status');
const nav=document.getElementById('nav'),title=document.getElementById('title'),balance=document.getElementById('balance'),refresh=document.getElementById('refresh');
const entry=document.getElementById('entry');
const buttons=Array.from(nav.querySelectorAll('button'));
const visited=new Map();
let view,pending=false,saving=false,selected,draft;
const privateChat=widget&&widget.chatType==='private'&&!widget.isForward&&!widget.isPreview;
function render(){
 payments.textContent='';
 entry.hidden=true;
 payments.hidden=false;
 nav.hidden=refresh.hidden=!view;
 if(!view)return;
 title.textContent=view.title;
 balance.textContent=view.balance||'';
 balance.hidden=!view.balance;
 status.textContent=view.rows.length?'':view.empty;
 for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.page===view.page));
 for(const [date,label,amount,category,direction,detail,icon,color] of view.rows){
  const row=document.createElement('li');
  row.className=direction||'expense';
  node(row,'time',date);
  const event=node(row,'span','','event');
  const content=detail?node(event,'details'):event;
  const name=node(content,detail?'summary':'b','','choice');
  if(icon)name.innerHTML=svg(icon,color);
  node(name,'span',label);
  if(detail)node(content,'small',detail);
  if(category&&category!==label)node(event,'small',category);
  node(row,'strong',amount);
  payments.appendChild(row);
 }
}
function request(page,force=false){
 if(!privateChat||saving)return;
 if(!force&&visited.has(page)){
  selected=page;
  view=visited.get(page);
  render();
  return;
 }
 if(pending)return;
 selected=page;
 query('budget-menu:'+page,result=>{
  visited.set(page,result);
  if(selected===page){view=result;render();}
 });
}
function node(parent,tag,text='',className=''){
 const el=document.createElement(tag);
 el.className=className;el.textContent=text;parent.appendChild(el);return el;
}
function svg(shape,color='currentColor'){
 return '<svg viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shape+'</svg>';
}
function control(parent,label,action,icon='',colors=[],background=''){
 const button=node(parent,'button',label);
 button.type='button';
 if(icon){
  button.className='choice';
  button.innerHTML=svg(icon,colors[0]);
  node(button,'span',label);
  if(colors.length){
   button.style.borderColor=colors[0]+'66';
  }
 }
 if(background)button.style.background='linear-gradient(#17242da6,#17242da6),'+background;
 button.addEventListener('click',action);
 return button;
}
function group(className){
 return node(entry,'div','',className);
}
async function query(command,then){
 const page=selected;
 pending=true;saving=command.startsWith('budget-entry:s:');status.textContent='Загрузка…';
 try{
  const result=JSON.parse((await widget.request(command)).result);
  if(result.error){if(selected===page)status.textContent=result.error;}
  else if(page!=='add'||selected===page)then(result);
 }catch{if(selected===page)status.textContent='Повтори запрос.';}
 finally{pending=saving=false;}
}
function ask(command,then){
 if(!privateChat||pending)return;
 selected='add';query('budget-entry:'+command,then);
}
function startEntry(){
 if(pending)return;
 if(draft){selected='add';if(draft.preview)showPreview(draft.preview);else entryForm();return;}
 ask('form',result=>{
  draft={...result,type:'e',amount:'',account:null,category:null};
  entryForm();
 });
}
function entryPanel(label){
 entry.hidden=false;entry.textContent='';
 title.textContent=label;payments.hidden=balance.hidden=refresh.hidden=true;
 status.textContent='';
 for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.page==='add'));
}
function entryForm(){
 entryPanel('Новая запись');
 const types=group('entry-tools');
 for(const [type,label,icon,tone] of [['e','Расход','<path d="M12 4v16m-6-6 6 6 6-6"/>','out'],['i','Доход','<path d="M12 20V4m-6 6 6-6 6 6"/>','in']]){
  const button=control(types,label,()=>{draft.type=type;entryForm();},icon);
  button.classList.add(tone);button.setAttribute('aria-pressed',String(draft.type===type));
 }
 const amount=node(entry,'strong','','balance');
 const fields=group('entry-tools picker');
 control(fields,draft.account?.[1]||'Выбрать счёт',()=>pick('A',0),draft.account?.[4],draft.account?.[3],draft.account?.[5]);
 if(draft.type==='e')control(fields,draft.category?.[1]||'Выбрать категорию',()=>pick('C',0),draft.category?.[4],draft.category?.[3]);
 const keypad=group('picker keypad');
 for(const key of ['1','2','3','4','5','6','7','8','9',',','0','⌫'])control(keypad,key,()=>{
  const value=key==='⌫'?draft.amount.slice(0,-1):draft.amount+(key===','?'.':key);
  if(/^\d{0,10}(?:\.\d{0,2})?$/.test(value)){draft.amount=value.startsWith('.')?'0'+value:value;updateAmount();}
 });
 const review=control(entry,'Проверить запись',()=>ask(['p',draft.type,draft.revision,draft.account[0],draft.category?.[0]||0,draft.amount.replace(/\.$/,'')].join(':'),showPreview));
 review.className='review';
 function updateAmount(){
  amount.textContent=(draft.amount||'0').replace('.',',')+' '+(draft.account?.[2]||'');
  review.disabled=!(Number(draft.amount)>0&&draft.account&&(draft.type==='i'||draft.category));
 }
 updateAmount();
}
function pick(kind,offset){
 ask(kind+':'+offset,result=>{
  if(result.revision!==draft.revision){draft=null;entryPanel('Данные изменились');control(entry,'К записи',startEntry);return;}
  entryPanel(kind==='A'?'Счёт':'Категория');
  const choices=group('entry-tools picker');
  for(const option of result.options)control(choices,option[1]+(option[2]?' · '+option[2]:''),()=>{
   draft[kind==='A'?'account':'category']=option;entryForm();
  },option[4],option[3],option[5]);
  const links=group('picker-nav');
  control(links,'К записи',entryForm);
  if(offset)control(links,'← Назад',()=>pick(kind,offset-1));
  if(result.more)control(links,'Дальше →',()=>pick(kind,offset+1));
 });
}
function showPreview(preview){
 draft.preview=preview;
 entryPanel('Проверь запись');
 node(entry,'strong',preview.amount,'balance');
 node(entry,'small',[preview.account,preview.category,preview.date].join(' · '));
 const save=control(entry,draft.confirming?'Проверить сохранение':'Записать',()=>{
  draft.confirming=true;save.textContent='Проверить сохранение';edit.disabled=true;
  ask('s:'+preview.token,()=>{
   draft=null;visited.clear();entryPanel('Запись сохранена');control(entry,'На Главную',()=>request('home',true));
  });
 });
 const edit=control(entry,'Изменить',()=>{draft.preview=null;entryForm();});
 edit.disabled=Boolean(draft.confirming);
}
for(const button of buttons)button.addEventListener('click',()=>button.dataset.page==='add'?startEntry():request(button.dataset.page));
refresh.addEventListener('click',()=>request(view.page,true));
if(privateChat&&widget.chatData){try{view=JSON.parse(widget.chatData);draft=view.draft;selected=view.page;visited.set(view.page,view);document.querySelector('h3 img').src=view.brand;}catch{}}
render();
if(draft)startEntry();
widget?.ready();
</script>`.replace(/^ +/gm,'');

function widgetData(data,page,brand,revision){
 const draft=page==='add'?{revision,type:'e',amount:'',account:null,category:null}:undefined;
 if(draft)page='home';
 const today=todayMoscow(data.settings.timeZone);
 const clip=(value,length)=>Array.from(String(value||'').replace(/[\u0000-\u001f]/g,' ')).slice(0,length).join('');
 const cats=categoryCatalog(data.customCats);
 const account=id=>data.accounts.find(item=>item.id===id)?.name;
 const history=page==='history';
 const source=history?filterActivity(activityEntries(data),data,cats,{includeCompanyLunch:false}).filter(item=>item.date<=today):scheduledEvents(data,today,moveDate(today,6),today);
 const rows=source.slice(0,page==='home'?2:4).map(item=>{
  const transfer=item.type==='transfer';
  const appearance=history?cats.find(cat=>cat.id===item.cat):calendarEventCategory(data,item);
  const category=appearance?.name;
  const label=history?item.note||(transfer?transferDetails(data,item).route:category||(item.type==='income'?'Доход':'Расход')):item.name;
  const amount=item.amount===null?'Уточнить':(transfer?'↔ ':item.type==='income'?'+':'−')+money(item.amount,item.currency);
  const detail=transfer?transferDetails(data,item).route:account(item.accountId);
  const icon=transfer?'transfer':appearance?.icon;
  return [paymentDate(item.date),clip(label,44),amount,clip(category,22),item.type,clip(detail,32),isIcon(icon)?iconShape(icon):'',appearanceColors([appearance?.color])[0]];
 });
 const view={page,title:history?'Последние операции':'Ближайшие платежи',empty:history?'Операций пока нет':'На ближайшие 7 дней событий нет',rows,brand,draft};
 if(page==='home')view.balance=money(accountTotals(data).spendable);
 const encoder=new TextEncoder();
 const exceedsBudget=()=>encoder.encode(JSON.stringify(view)).length>1024;
 for(let i=rows.length-1;i>=0&&exceedsBudget();i--)rows[i].length=6;
 for(let i=rows.length-1;i>=0&&exceedsBudget();i--)rows[i].pop();
 while(exceedsBudget())rows.pop();
 return JSON.stringify(view);
}

function privateChat(chat,from){
 return chat?.type==='private'&&Number.isSafeInteger(chat.id)&&chat.id>0&&from?.id===chat.id&&!from.is_bot;
}

const entryAccounts=data=>data.accounts.filter(account=>!account.archived);
const entryCategories=data=>categoryCatalog(data.customCats).filter(category=>!['lunch','income'].includes(category.id));

async function widgetEntry(env,id,query,readState,state){
 const {data,revision}=state;
 const text=query.data;
 if(text==='budget-entry:form'){
  return {revision,accounts:entryAccounts(data).length,categories:entryCategories(data).length};
 }
 const choices=/^budget-entry:([aAcC]):(\d{1,6})$/.exec(text);
 if(choices){
  const kind=choices[1],accounts=kind.toLowerCase()==='a',rows=accounts?entryAccounts(data):entryCategories(data),target=Number(choices[2]);
  const rowFor=(item,i)=>{
   const saved=appearanceColors(accounts?item.colors:[item.color]);
   const colors=accounts&&!saved.length?['#648fa2','#8e7aab']:saved;
   return [i,Array.from(item.name).slice(0,24).join(''),item.currency||'',colors];
  };
  if(kind===kind.toLowerCase())return {revision,options:rows.slice(target,target+6).map((item,i)=>rowFor(item,target+i))};
  const encoder=new TextEncoder(),page={revision,options:[],more:true};
  let index=0;
  for(const [i,item] of rows.entries()){
   const row=rowFor(item,i);
   const icon=iconShape(isIcon(item.icon)?item.icon:accounts?'wallet':'other');
   row.push(icon,accounts?accountBackground(row[3])?.background:'');
   page.options.push(row);
   if(page.options.length>6||encoder.encode(JSON.stringify(page)).length>1023){
    page.options.pop();
    if(index===target)return page;
    page.options=[row];index++;
   }
  }
  return {...page,options:index===target?page.options:[],more:false};
 }
 const preview=/^budget-entry:p:([ei]):(\d{1,16}):(\d{1,6}):(\d{1,6}):(\d{1,13}(?:\.\d{1,2})?)$/.exec(text);
 if(preview){
  const [,direction,version,accountIndex,categoryIndex,raw]=preview;
  if(Number(version)!==revision)throw Error('Данные изменились. Открой запись заново.');
  const account=entryAccounts(data)[Number(accountIndex)],category=entryCategories(data)[Number(categoryIndex)];
  const amount=parseMoney(raw),type=direction==='i'?'income':'expense';
  if(!account||type==='expense'&&!category||!Number.isFinite(amount)||amount<=0)throw Error('Проверь сумму, счёт и категорию.');
  const values={amount,accountId:account.id,cat:type==='income'?'income':category.id,currency:account.currency||'RUB',date:todayMoscow(data.settings.timeZone)};
  const draft={kind:'widget-entry',messageId:query.message_id,op:'tx',args:{type,requireAccount:true},values,revision};
  applyBotAction(structuredClone(data),draft.op,draft.args,values);
  const token=await create(env,id,draft,'bw_');
  return {token,amount:(type==='income'?'+':'−')+money(amount,values.currency),date:paymentDate(values.date),account:Array.from(account.name).slice(0,60).join(''),category:type==='income'?'Доход':Array.from(category.name).slice(0,60).join('')};
 }
 const confirm=/^budget-entry:s:(bw_[a-f0-9]{32})$/.exec(text);
 if(confirm){
  const token=confirm[1];
  if(await readReceipt(env,id,'bot:'+token))return {saved:true};
  const {p}=await load(env,id,token);
  if(p.kind!=='widget-entry'||p.messageId!==query.message_id)throw Error('Открой запись в исходной карточке.');
  await commitBotAction(env,id,token,p,readState);
  return {saved:true};
 }
 return {error:'Действие не поддерживается.'};
}

// Both entry points run after authentication of the Telegram webhook.
const widgetPages=new Map([['/menu','home'],['/budget','home'],['/calendar','calendar'],['/history','history'],['/add','add'],['/accounts','accounts']]);
export async function calendarWidget(message,{env,readState,mutateState,telegram,access=hasAccess}){
 const text=message?.text?.trim(),command=/^\/widget(?: (on|off))?$/.exec(text);
 const page=widgetPages.get(navigationCommand(text));
 if(!command&&!page)return false;
 if(!privateChat(message.chat,message.from)||!await access(env,message.from.id))return Boolean(command);
 const chatId=message.chat.id,id=String(chatId);
 if(command?.[1]){
  const enabled=command[1]==='on';
  await mutateState(env,id,data=>({...data,settings:{...data.settings,calendarWidgetEnabled:enabled,calendarWidgetMenuEnabled:enabled}}));
  if(enabled)return calendarWidget({...message,text:'/menu'},{env,readState,mutateState,telegram,access});
  const {data}=await readState(env,id);
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Виджет отключён. Включить: /widget on',reply_markup:botKeyboard(env.MINI_APP_URL,data)});
  return true;
 }
 const {data,revision}=await readState(env,id);
 const replaceKeyboard=data.settings.calendarWidgetMenuEnabled===true;
 if(!command&&!replaceKeyboard)return false;
 if(data.settings.calendarWidgetEnabled===false){
  if(!command)return false;
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Виджет отключён. Включить: /widget on'});
  return true;
 }
 try{
  await telegram(env,'sendWidget',{
   chat_id:chatId,html:page==='accounts'?accountsWidgetHtml:html,caption:'Меню Бюрджета · /menu  |  Клавиатура · /widget off',
   chat_data:page==='accounts'?accountWidgetData(data,revision):widgetData(data,command?'calendar':page,widgetBrand,revision),
   allow_queries:true,is_shared:false,protect_content:true,
   ...(replaceKeyboard?{reply_markup:{remove_keyboard:true}}:{})
  });
 }catch(error){
  if(![400,404].includes(error.telegramCode))throw error;
  if(page&&text!=='/menu')return false;
  const app=miniAppButton(env.MINI_APP_URL,'Открыть Бюрджет');
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Виджет недоступен. Можно открыть обычное меню или миниаппу.',reply_markup:{inline_keyboard:[[{text:'Обычное меню',callback_data:'b:v:home'},...(app?[app]:[])]]}});
 }
 return true;
}

export async function answerCalendarWidget(query,{env,readState,telegram,openAdd,access=hasAccess}){
 if(typeof query.id!=='string'||!privateChat(query.chat,query.from)||query.inline_message_id||query.widget_id||
  !Number.isSafeInteger(query.message_id)||query.message_id<=0||query.type?.type!=='data')return;
 const match=/^budget-menu:(home|calendar|history|add)$/.exec(query.data),entry=typeof query.data==='string'&&query.data.startsWith('budget-entry:');
 const account=/^budget-account:(list|\d{1,16}):(\d{1,6})(?::(\d{1,6}))?$/.exec(query.data);
 if((!match&&!entry&&!account)||!await access(env,query.from.id))return;
 const id=String(query.from.id),state=await readState(env,id),{data}=state,page=match?.[1];
 let result;
 if(data.settings.calendarWidgetEnabled===false)result=JSON.stringify({error:'Виджет отключён. Включить: /widget on'});
 else if(account){
  const [,version,position,offset]=account;
  result=version==='list'?accountWidgetData(data,state.revision,{offset:Number(position)}):
   Number(version)===state.revision?accountWidgetData(data,state.revision,{index:Number(position),offset:Number(offset||0)}):
   accountWidgetData(data,state.revision);
 }
 else if(entry){
  try{result=JSON.stringify(await widgetEntry(env,id,query,readState,state));}
  catch{result=JSON.stringify({error:'Запись не подтверждена. Проверь данные или повтори подтверждение.'});}
 }
 else if(page==='add'){
  // Answer first so a replay of the same expired/answered query cannot open another form.
  await telegram(env,'answerWidgetQuery',{widget_query_id:query.id,data:'{}'});
  await openAdd(String(query.from.id));
  return;
 }else result=widgetData(data,page);
 await telegram(env,'answerWidgetQuery',{widget_query_id:query.id,data:result});
}
