import {moveDate,scheduledEvents} from '../src/finance-events.js';
import {money,todayMoscow} from '../src/mini-model.js';
import {paymentDate} from '../src/payment-copy.js';
import {calendarEventCategory} from '../src/calendar-model.js';

const html=`<style>
body{margin:0;color:#e8eff4;font:15px system-ui,sans-serif}
.panel{padding:12px;border:1px solid #40505d;border-radius:16px;background:#192430;background:linear-gradient(130deg,#26313e,#18252e 75%)}
h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;text-align:center;font-size:18px;line-height:1.25}
h3:before,h3:after{content:'';flex:1;height:1px;background:#596970}
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
@media(max-width:245px){li{flex-wrap:wrap}strong{margin-left:auto}}
@media(prefers-reduced-motion:reduce){button{transition:none}button:active{transform:none}}
</style>
<section class="panel"><h3>Ближайшие платежи</h3><ol id="payments"></ol>
<footer><small id="status">Актуальные события доступны в календаре.</small>
<button type="button" id="more" aria-controls="payments" aria-expanded="false" hidden>Ещё событие</button></footer></section>
<script>
const widget=window.TelegramWidget;
const payments=document.getElementById('payments');
const status=document.getElementById('status');
const more=document.getElementById('more');
let expanded=false;
function render(){
 payments.textContent='';
 more.hidden=true;
 status.textContent='Актуальные события доступны в календаре.';
 if(!widget||widget.chatType!=='private'||widget.isForward||widget.isPreview||!widget.chatData)return;
 let rows;
 try{rows=JSON.parse(widget.chatData)}catch{return}
 if(!Array.isArray(rows))return;
 status.textContent=rows.length?'На момент отправки':'На ближайшие 7 дней событий нет.';
 for(const [date,label,amount,category,direction] of rows.slice(0,expanded?3:2)){
  const row=document.createElement('li');
  row.className=direction==='income'?'income':'expense';
  const day=document.createElement('time'),event=document.createElement('span'),name=document.createElement('b'),sum=document.createElement('strong');
  day.textContent=date;
  event.className='event';
  name.textContent=label;
  event.appendChild(name);
  if(category&&category!==label){const kind=document.createElement('small');kind.textContent=category;event.appendChild(kind);}
  sum.textContent=amount;
  row.appendChild(day);
  row.appendChild(event);
  row.appendChild(sum);
  payments.appendChild(row);
 }
 more.hidden=rows.length<=2;
 more.textContent=expanded?'Свернуть':'Ещё событие';
 more.setAttribute('aria-expanded',String(expanded));
}
more.addEventListener('click',()=>{expanded=!expanded;render()});
widget?.onEvent('chatDataChanged',render);
render();
widget?.ready();
</script>`;

// Call only after authenticating the Telegram webhook and checking chat access.
export async function calendarWidget(message,{env,readState,mutateState,telegram}){
 const command=/^\/widget(?: (on|off))?$/.exec(message?.text?.trim());
 if(!command)return false;
 const chatId=message?.chat?.id;
 if(message.chat?.type!=='private'||!Number.isSafeInteger(chatId)||chatId<=0||message.from?.id!==chatId||String(chatId)!==String(env.TELEGRAM_OWNER_ID))return true;
 const send=text=>telegram(env,'sendMessage',{chat_id:chatId,text});
 if(command[1]){
  const enabled=command[1]==='on';
  await mutateState(env,String(chatId),data=>{
   data.settings.calendarWidgetEnabled=enabled;
   return data;
  });
  await send(enabled?'Виджет включён. Открыть: /widget':'Виджет отключён. Включить: /widget on');
  return true;
 }

 const {data}=await readState(env,String(chatId));
 if(data.settings.calendarWidgetEnabled===false){
  await send('Виджет отключён. Включить: /widget on');
  return true;
 }

 const calendar=new URL(env.MINI_APP_URL);
 if(calendar.protocol!=='https:')throw new Error('The Mini App URL must use HTTPS');
 calendar.searchParams.set('calendar','1');

 const today=todayMoscow(data.settings.timeZone);
 const rows=scheduledEvents(data,today,moveDate(today,6),today).slice(0,3);
 const events=rows.map(event=>{
  const label=Array.from(event.name.replace(/[\u0000-\u001f]/g,' ')).slice(0,48).join('');
  const amount=event.amount===null?'Уточнить':(event.type==='income'?'+':'−')+money(event.amount,event.currency);
  const category=Array.from(calendarEventCategory(data,event)?.name||event.kind||'').slice(0,24).join('');
  return [paymentDate(event.date),label,amount,category,event.type];
 });
 const encoder=new TextEncoder();
 while(encoder.encode(JSON.stringify(events)).length>1024)events.pop();
 const reply_markup={inline_keyboard:[[{text:'Открыть календарь',web_app:{url:calendar.href}}]]};
 try{
  await telegram(env,'sendWidget',{
  chat_id:chatId,html,caption:'Ближайшие события Бюрджета · данные на момент отправки',
  chat_data:JSON.stringify(events),
  allow_queries:false,is_shared:false,protect_content:true,reply_markup
  });
 }catch(error){
  if(![400,404].includes(error.telegramCode))throw error;
  await telegram(env,'sendMessage',{chat_id:chatId,text:'Telegram не открыл виджет. Ближайшие события доступны в календаре.',reply_markup});
 }
 return true;
}
