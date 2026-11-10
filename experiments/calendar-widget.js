import {moveDate,scheduledEvents} from '../src/finance-events.js';
import {money,todayMoscow} from '../src/mini-model.js';
import {paymentDate} from '../src/payment-copy.js';

const html=`<style>
body{margin:0;padding:12px;color:var(--tg-theme-text-color,#e6eef1);font:15px system-ui,sans-serif}
h3{margin:0 0 8px;font-size:18px}
ol{margin:0;padding:0;list-style:none}
li{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--tg-theme-hint-color,#8496a4)}
li span{flex:1;min-width:0;overflow-wrap:anywhere}
time,small{color:var(--tg-theme-hint-color,#8496a4)}
time,strong{white-space:nowrap;font-variant-numeric:tabular-nums}
button{min-height:44px;border:0;background:transparent;color:var(--tg-theme-link-color,#bce0ce);font:inherit}
</style>
<h3>Ближайшие платежи</h3><ol id="payments"></ol>
<small id="status">Актуальные события доступны в календаре.</small>
<button type="button" id="more" aria-controls="payments" aria-expanded="false" hidden>Ещё событие</button>
<script>
const widget=window.TelegramWidget;
const payments=document.getElementById('payments');
const status=document.getElementById('status');
const more=document.getElementById('more');
let expanded=false;
function render(){
 payments.textContent='';
 more.hidden=true;
 if(!widget||widget.chatType!=='private'||widget.isForward||widget.isPreview||!widget.chatData)return;
 let rows;
 try{rows=JSON.parse(widget.chatData)}catch{return}
 if(!Array.isArray(rows))return;
 status.textContent=rows.length?'На момент отправки':'На ближайшие 7 дней событий нет.';
 for(const [date,label,amount] of rows.slice(0,expanded?3:2)){
  const row=document.createElement('li');
  for(const [tag,value] of [['time',date],['span',label],['strong',amount]]){
   const cell=document.createElement(tag);
   cell.textContent=value;
   row.appendChild(cell);
  }
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

// Isolated Bot API 10.4 experiment. Call only after verifying the Telegram webhook.
export async function calendarWidget(message,{env,readState,telegram}){
 const chatId=message?.chat?.id;
 if(message?.chat?.type!=='private'||!Number.isSafeInteger(chatId)||chatId<=0||message.from?.id!==chatId)return null;

 const calendar=new URL(env.MINI_APP_URL);
 if(calendar.protocol!=='https:')throw new Error('The Mini App URL must use HTTPS');
 calendar.searchParams.set('calendar','1');

 const {data}=await readState(env,String(chatId));
 const today=todayMoscow(data.settings.timeZone);
 const rows=scheduledEvents(data,today,moveDate(today,7),today).slice(0,3);
 const events=rows.map(event=>{
  const label=Array.from(event.name.replace(/[\u0000-\u001f]/g,' ')).slice(0,48).join('');
  const amount=event.amount===null?'Уточнить':(event.type==='income'?'+':'−')+money(event.amount,event.currency);
  return [paymentDate(event.date),label,amount];
 });
 const encoder=new TextEncoder();
 while(encoder.encode(JSON.stringify(events)).length>1024)events.pop();
 return telegram(env,'sendWidget',{
  chat_id:chatId,html,caption:'Ближайшие события Бюрджета · данные на момент отправки',
  chat_data:JSON.stringify(events),
  allow_queries:false,is_shared:false,protect_content:true,
  reply_markup:{inline_keyboard:[[{text:'Открыть календарь',web_app:{url:calendar.href}}]]}
 });
}
