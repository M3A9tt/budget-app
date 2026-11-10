import {moveDate,scheduledEvents} from '../src/finance-events.js';
import {dashboard,money,todayMoscow} from '../src/mini-model.js';
import {activityEntries,filterActivity,transferDetails} from '../src/activity-history.js';
import {categoryCatalog} from '../src/categories.js';
import {botKeyboard,miniAppButton} from './bot-navigation.js';
import {paymentDate} from '../src/payment-copy.js';
import {calendarEventCategory} from '../src/calendar-model.js';

const html=`<style>
body{margin:0;color:#e8eff4;font:15px system-ui,sans-serif}
[hidden]{display:none!important}
.panel{padding:12px;border:1px solid #40505d;border-radius:16px;background:#192430;background:linear-gradient(130deg,#26313e,#18252e 75%)}
h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;text-align:center;font-size:18px;line-height:1.25}
h3:before,h3:after{content:'';flex:1;height:1px;background:#596970}
h4{margin:8px 0}
ol{margin:0;padding:0;list-style:none;border-radius:10px;overflow:hidden}
li{display:flex;align-items:center;gap:8px;padding:9px 7px;background:#ffffff06}
li+li{border-top:1px solid #ffffff22}
.income{background:linear-gradient(90deg,#ffffff06 45%,#94c9b52c)}
.expense{background:linear-gradient(90deg,#ffffff06 45%,#df99952c)}
.event{flex:1;min-width:0;overflow-wrap:anywhere}
.event b,.event small{display:block}
time,small{color:#b6c5d3;font-size:13px}
time{padding-right:8px;border-right:1px solid #ffffff2a}
time,strong{white-space:nowrap;font-variant-numeric:tabular-nums}
.income strong{color:#bde3cb}.expense strong{color:#f1bfbb}
footer{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:7px}
button{min-height:44px;padding:0 9px;border:1px solid #657c7b;border-radius:10px;background:#b7d5ca14;color:#c8e2d8;font:inherit;transition:background-color .18s ease,transform .18s ease}
button:active{transform:scale(.96);background-color:#b7d5ca38}
button:focus-visible{outline:2px solid #c8e2d8;outline-offset:1px}
nav{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
nav button{flex:1;padding:0 6px;font-size:13px}
nav button[aria-pressed=true]{background:#b7d5ca30;color:#eff8f3}
.balance{display:block;text-align:center;font-size:30px;margin:12px 0}
.transfer strong{color:#b9d5ef}
.event button{border:0;background:transparent;padding:0;color:inherit;text-align:left;min-height:30px;font-weight:700;overflow-wrap:anywhere}
@media(max-width:245px){li{flex-wrap:wrap}strong{margin-left:auto}}
@media(prefers-reduced-motion:reduce){button{transition:none}button:active{transform:none}}
</style>
<section class="panel"><h3>Бюрджет</h3>
<nav id="nav" aria-label="Разделы Бюрджета" hidden>
<button type="button" data-page="home">Главная</button><button type="button" data-page="calendar">Календарь</button><button type="button" data-page="history">Операции</button><button type="button" data-page="add" aria-label="Записать">＋</button>
</nav><h4 id="title"></h4><strong id="balance" class="balance" hidden></strong><ol id="payments"></ol>
<footer><small id="status" aria-live="polite">Открой меню командой /menu.</small>
<button type="button" id="refresh" hidden>Обновить</button></footer></section>
<script>
const widget=window.TelegramWidget;
const payments=document.getElementById('payments');
const status=document.getElementById('status');
const nav=document.getElementById('nav'),title=document.getElementById('title'),balance=document.getElementById('balance'),refresh=document.getElementById('refresh');
const buttons=Array.from(nav.querySelectorAll('button'));
let view=null,pending=false;
const privateChat=widget&&widget.chatType==='private'&&!widget.isForward&&!widget.isPreview;
function render(){
 payments.textContent='';
 nav.hidden=refresh.hidden=!view;
 if(!view)return;
 title.textContent=view.title;
 balance.textContent=view.balance||'';
 balance.hidden=!view.balance;
 status.textContent=view.rows.length?'На момент запроса':view.empty;
 for(const button of buttons)if(button.dataset.page!=='add')button.setAttribute('aria-pressed',String(button.dataset.page===view.page));
 for(const [date,label,amount,category,direction,detail] of view.rows){
  const row=document.createElement('li');
  row.className=direction==='income'?'income':direction==='transfer'?'transfer':'expense';
  const day=document.createElement('time'),event=document.createElement('span'),name=document.createElement(detail?'button':'b'),sum=document.createElement('strong');
  day.textContent=date;
  event.className='event';
  name.textContent=label;
  event.appendChild(name);
  if(category&&category!==label){const kind=document.createElement('small');kind.textContent=category;event.appendChild(kind);}
  if(detail){
   const info=document.createElement('small');
   info.hidden=true;
   info.textContent=detail;
   name.type='button';
   name.setAttribute('aria-expanded','false');
   name.addEventListener('click',()=>{info.hidden=!info.hidden;name.setAttribute('aria-expanded',String(!info.hidden));});
   event.appendChild(info);
  }
  sum.textContent=amount;
  row.appendChild(day);
  row.appendChild(event);
  row.appendChild(sum);
  payments.appendChild(row);
 }
}
async function request(page){
 if(!privateChat||pending)return;
 pending=true;
 status.textContent='Загрузка…';
 try{
  const result=JSON.parse((await widget.request('budget-menu:'+page)).result);
  if(result.error){status.textContent=result.error;return;}
  if(page==='add'){status.textContent='Форма открыта в чате';return;}
  view=result;
  render();
 }catch{status.textContent='Не удалось обновить. Попробуй ещё раз или открой /menu.';}
 finally{pending=false;}
}
for(const button of buttons)button.addEventListener('click',()=>request(button.dataset.page));
refresh.addEventListener('click',()=>request(view.page));
if(privateChat&&widget.chatData){try{view=JSON.parse(widget.chatData)}catch{}}
render();
widget?.ready();
</script>`;

function widgetData(data,page){
 const today=todayMoscow(data.settings.timeZone);
 const clip=(value,length)=>Array.from(String(value||'').replace(/[\u0000-\u001f]/g,' ')).slice(0,length).join('');
 const cats=categoryCatalog(data.customCats);
 const account=id=>data.accounts.find(item=>item.id===id)?.name;
 const history=page==='history';
 const source=history?filterActivity(activityEntries(data),data,cats,{includeCompanyLunch:false}).filter(item=>item.date<=today):scheduledEvents(data,today,moveDate(today,6),today);
 const rows=source.slice(0,page==='home'?2:4).map(item=>{
  const transfer=item.type==='transfer';
  const category=history?cats.find(cat=>cat.id===item.cat)?.name:calendarEventCategory(data,item)?.name;
  const label=history?item.note||(transfer?transferDetails(data,item).route:category||(item.type==='income'?'Доход':'Расход')):item.name;
  const amount=item.amount===null?'Уточнить':(transfer?'↔ ':item.type==='income'?'+':'−')+money(item.amount,item.currency);
  const detail=transfer?transferDetails(data,item).route:account(item.accountId);
  return [paymentDate(item.date),clip(label,44),amount,clip(category,22),item.type,clip(detail,32)];
 });
 const view={page,title:history?'Последние операции':'Ближайшие платежи',empty:history?'Операций пока нет':'На ближайшие 7 дней событий нет',rows};
 if(page==='home')view.balance=money(dashboard(data,today).balance);
 const encoder=new TextEncoder();
 while(encoder.encode(JSON.stringify(view)).length>1024)rows.pop();
 return JSON.stringify(view);
}

function ownerChat(env,chat,from){
 return chat?.type==='private'&&Number.isSafeInteger(chat.id)&&chat.id>0&&from?.id===chat.id&&!from.is_bot&&String(chat.id)===String(env.TELEGRAM_OWNER_ID);
}

// Both entry points run after authentication of the Telegram webhook.
export async function calendarWidget(message,{env,readState,mutateState,telegram}){
 const text=message?.text?.trim(),command=/^\/widget(?: (on|off))?$/.exec(text);
 if(!command&&text!=='/menu')return false;
 if(!ownerChat(env,message.chat,message.from))return Boolean(command);
 const chatId=message.chat.id,id=String(chatId);
 if(command?.[1]){
  const enabled=command[1]==='on';
  await mutateState(env,id,data=>({...data,settings:{...data.settings,calendarWidgetEnabled:enabled,calendarWidgetMenuEnabled:enabled}}));
  if(enabled)return calendarWidget({...message,text:'/menu'},{env,readState,mutateState,telegram});
  const {data}=await readState(env,id);
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Виджет отключён. Включить: /widget on',reply_markup:botKeyboard(env.MINI_APP_URL,data)});
  return true;
 }
 const {data}=await readState(env,id);
 const replaceKeyboard=data.settings.calendarWidgetMenuEnabled===true;
 if(!command&&!replaceKeyboard)return false;
 if(data.settings.calendarWidgetEnabled===false){
  if(!command)return false;
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Виджет отключён. Включить: /widget on'});
  return true;
 }
 try{
  await telegram(env,'sendWidget',{
   chat_id:chatId,html,caption:'Меню Бюрджета · /menu  |  Клавиатура · /widget off',
   chat_data:widgetData(data,command?'calendar':'home'),
   allow_queries:true,is_shared:false,protect_content:true,
   ...(replaceKeyboard?{reply_markup:{remove_keyboard:true}}:{})
  });
 }catch(error){
  if(![400,404].includes(error.telegramCode))throw error;
  const app=miniAppButton(env.MINI_APP_URL,'Открыть Бюрджет');
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Виджет недоступен. Можно открыть обычное меню или миниаппу.',reply_markup:{inline_keyboard:[[{text:'Обычное меню',callback_data:'b:v:home'},...(app?[app]:[])]]}});
 }
 return true;
}

export async function answerCalendarWidget(query,{env,readState,telegram,openAdd}){
 if(typeof query.id!=='string'||!ownerChat(env,query.chat,query.from)||query.inline_message_id||query.widget_id||
  !Number.isSafeInteger(query.message_id)||query.message_id<=0||query.type?.type!=='data')return;
 const match=/^budget-menu:(home|calendar|history|add)$/.exec(query.data);
 if(!match)return;
 const {data}=await readState(env,String(query.from.id)),page=match[1];
 let result;
 if(data.settings.calendarWidgetEnabled===false)result=JSON.stringify({error:'Виджет отключён. Включить: /widget on'});
 else if(page==='add'){
  // Answer first so a replay of the same expired/answered query cannot open another form.
  await telegram(env,'answerWidgetQuery',{widget_query_id:query.id,data:'{}'});
  await openAdd(String(query.from.id));
  return;
 }else result=widgetData(data,page);
 await telegram(env,'answerWidgetQuery',{widget_query_id:query.id,data:result});
}
