import {moveDate,scheduledEvents} from '../src/finance-events.js';
import {money,todayMoscow} from '../src/mini-model.js';
import {paymentDate} from '../src/payment-copy.js';

const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>entities[char]);

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
  const label=escapeHtml(event.name.slice(0,80));
  const amount=event.amount===null?'Уточнить':(event.type==='income'?'+':'−')+money(event.amount,event.currency);
  return '<li><time datetime="'+event.date+'">'+paymentDate(event.date)+'</time> · '+label+' · '+escapeHtml(amount)+'</li>';
 }).join('');
 const html='<h3>Ближайшие события</h3>'+(events?'<ul>'+events+'</ul>':'<p>На ближайшую неделю событий нет.</p>');
 return telegram(env,'sendWidget',{
  chat_id:chatId,html,caption:'Ближайшие события Бюрджета · данные на момент отправки',
  allow_queries:false,is_shared:false,protect_content:true,
  reply_markup:{inline_keyboard:[[{text:'Открыть календарь',web_app:{url:calendar.href}}]]}
 });
}
