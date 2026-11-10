import {money} from '../src/mini-model.js';
import {expenseCheckSummary} from '../src/expense-check.js';
import {budgetState} from '../src/budget-view.js';
import {periodSummaryData} from './period-summary.js';
import {reminderText} from '../src/reminder-settings.js';
import {categoryCatalog} from '../src/categories.js';

const html=`<style>
body{margin:0;color:#e8eff4;font:15px system-ui}
section{padding:12px 14px;border-radius:16px;background:linear-gradient(130deg,#283544,#19242f)}
h3,p{margin:0}
h3{font-size:18px;text-align:center}
time{display:block;text-align:center;color:#b6c5d3;margin-top:4px}
.total{margin:12px 0 8px;padding:12px;text-align:center;border-radius:12px;background:linear-gradient(120deg,#db9e9429,#ffffff07)}
.total strong{display:block;font-size:28px;margin-top:3px}
.row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #ffffff24}
.row span{overflow-wrap:anywhere}.row b{white-space:nowrap}
#foot{color:#b6c5d3;font-size:13px;margin-top:8px}
</style><section hidden id="card"><h3 id="heading"></h3><time id="date"></time>
<div class="total"><span id="label"></span><strong id="sum"></strong></div><div id="rows"></div><p id="foot"></p></section>
<script>
const w=window.TelegramWidget;
if(w?.chatType==='private'&&!w.isForward&&!w.isPreview&&w.chatData){
 const d=JSON.parse(w.chatData);
 const put=(id,value)=>document.getElementById(id).textContent=value;
 put('heading',d.title);put('date',d.date);put('label',d.label);put('sum',d.sum);put('foot',d.foot);
 for(const [label,value] of d.rows){
  const row=document.createElement('div');row.className='row';
  for(const [tag,text] of [['span',label],['b',value]]){
   const part=document.createElement(tag);part.textContent=text;row.appendChild(part);
  }
  document.getElementById('rows').appendChild(row);
 }
 document.getElementById('card').hidden=false;
}
w?.ready();
</script>`;

export function expenseWidget(data,date,attempt){
 const {total,count,entries}=expenseCheckSummary(data,date,3);
 const cats=categoryCatalog(data.customCats);
 const rows=entries.map(t=>[Array.from(t.note||cats.find(cat=>cat.id===t.cat)?.name||'Расход').slice(0,38).join(''),money(t.amount,t.currency)]);
 const countText=count?`Операций · ${count}`:'Расходов за этот день пока нет.';
 return {title:'Проверим расходы',date,label:'Записано за день',sum:money(total),rows,foot:countText+' · '+reminderText(data.settings,date,Math.max(0,attempt))};
}

export function dailyWidget(data,report){
 const r=periodSummaryData(data,report.from,report.to,report.title);
 const rows=[['На обычных счетах',money(r.actual)],[budgetState({free:r.free,balance:r.actual,unknown:r.unknown}).heading,money(Math.abs(r.free))]];
 if(r.savings)rows.push(['В копилках',money(r.savings)]);
 if(r.income)rows.push(['Доходы',money(r.income)]);
 if(r.lunch)rows.push(['Обеды компании',money(r.lunch)]);
 return {title:report.title,date:report.to,label:'Расходы',sum:money(r.expense),rows,foot:`Операций · ${r.count}`};
}

export async function sendNotificationWidget(env,send,body,card){
 const chatId=Number(body.chat_id);
 if(!Number.isSafeInteger(chatId)||chatId<=0)return send(env,'sendMessage',body);
 const chat_data=JSON.stringify(card);
 if(new TextEncoder().encode(chat_data).length>1024)return send(env,'sendMessage',body);
 try{
  return await send(env,'sendWidget',{chat_id:body.chat_id,html,caption:card.title,chat_data,protect_content:true,reply_markup:body.reply_markup});
 }catch(error){
  // Only fall back when Telegram definitely did not accept the widget.
  if(![400,404].includes(error.telegramCode))throw error;
  return send(env,'sendMessage',body);
 }
}
