import {money} from '../src/mini-model.js';
import {expenseCheckSummary} from '../src/expense-check.js';
import {budgetState} from '../src/budget-view.js';
import {periodSummaryData} from './period-summary.js';
import {reminderText} from '../src/reminder-settings.js';
import {categoryCatalog} from '../src/categories.js';
import {iconShape} from '../src/mini-icon-shapes.js';
import {paymentDate} from '../src/payment-copy.js';
import {attentionItems} from '../src/attention.js';
import {widgetGlass} from './widget-glass.js';

const icon=name=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconShape(name)+'</svg>';

const html=`<style>
${widgetGlass}
body{margin:0;color:#e8eff4;font:15px system-ui}
section{padding:14px 15px}
h3,p{margin:0}
header{display:flex;align-items:center;gap:9px}
.mark{width:34px;height:34px;display:grid;place-items:center;flex:none;border:1px solid #d6e0f332;border-radius:10px;color:#c6bbef;background:#c6bbef14}
h3{font-size:18px;line-height:1.2}
time{display:block;color:#b6c5d3;font-size:13px;margin-top:3px}
.total{margin:12px 0 8px;padding:11px 12px;border:1px solid #bde3cb29;border-radius:11px;background:linear-gradient(110deg,#a6d8c21c,transparent)}
.expense .total,.calendar .total{background:linear-gradient(110deg,#df99951c,transparent)}
.lunch .total,.bell .total{background:linear-gradient(110deg,#c6bbef21,transparent)}
.total span,#count{font-size:13px;color:#b8c9d6}
.total strong{display:block;font-size:clamp(26px,8vw,36px);color:#c5e4d4;font-variant-numeric:tabular-nums}
.expense .total strong,.row.expense b,.row.short b{color:#edbdb7}
.lunch .total strong,.bell .total strong{color:#d7ccf7}
.row.income b{color:#bde3cb}
.row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-top:1px solid #ffffff24}
.row span{overflow-wrap:anywhere}.row b{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}
#count{display:block;margin-top:6px}
#foot{color:#c6d1dd;font-size:13px;margin-top:8px}
@media(max-width:240px){.row{flex-wrap:wrap}}
</style><section hidden id="card" class="widget-glass"><header><span class="mark" id="mark"></span><div><h3 id="heading"></h3><time id="date"></time></div></header>
<div class="total"><span id="label"></span><strong id="sum"></strong></div><div id="rows"></div><small id="count"></small><p id="foot"></p></section>
<script>
const w=window.TelegramWidget;
if(w?.chatType==='private'&&!w.isForward&&!w.isPreview&&w.chatData){
 const d=JSON.parse(w.chatData);
 const get=id=>document.getElementById(id),put=(id,value)=>get(id).textContent=value;
 put('heading',d.title);put('date',d.dateLabel);put('label',d.label);put('sum',d.sum);put('foot',d.foot);put('count',d.count);
 const marks=${JSON.stringify(Object.fromEntries(['check','chart','calendar','lunch','bell'].map(name=>[name,icon(name)])))};
 get('mark').innerHTML=marks[d.mark]||marks.chart;
 for(const [label,value,tone] of d.rows){
  const row=document.createElement('div');row.className='row '+(tone||'');
  for(const [tag,text] of [['span',label],['b',value]]){
   const part=document.createElement(tag);part.textContent=text;row.appendChild(part);
  }
  document.getElementById('rows').appendChild(row);
 }
 const card=get('card');card.classList.add(d.expense?'expense':d.mark||'chart');card.hidden=false;
}
w?.ready();
</script>`;

export function expenseWidget(data,date,attempt){
 const {total,count,entries}=expenseCheckSummary(data,date,3);
 const cats=categoryCatalog(data.customCats);
 const rows=entries.map(t=>[Array.from(t.note||cats.find(cat=>cat.id===t.cat)?.name||'Расход').slice(0,38).join(''),money(t.amount,t.currency),'expense']);
 const countText=count?`Операций · ${count}`:'Расходов за этот день пока нет.';
 return {title:'Проверим расходы',date,dateLabel:paymentDate(date),mark:'check',expense:true,label:'Записано за день',sum:money(total),rows,count:countText,foot:reminderText(data.settings,date,Math.max(0,attempt))};
}

export function summaryWidget(data,report){
 const r=periodSummaryData(data,report.from,report.to,report.title);
 const daily=report.from===report.to;
 const rows=[daily?['Расходы за день',money(r.expense),'expense']:['На обычных счетах сейчас',money(r.actual)],[budgetState({free:r.free,balance:r.actual,unknown:r.unknown}).heading,money(Math.abs(r.free)),r.free<0?'short':'']];
 if(r.savings)rows.push(['В копилках',money(r.savings)]);
 if(r.income)rows.push(['Доходы',money(r.income),'income']);
 if(r.lunch)rows.push(['Обеды компании',money(r.lunch)]);
 const dateLabel=daily?paymentDate(report.to):paymentDate(report.from)+' — '+paymentDate(report.to);
 return {title:report.title,date:report.to,dateLabel,expense:!daily,label:daily?'На обычных счетах':'Расходы за период',sum:money(daily?r.actual:r.expense),rows,count:`Операций · ${r.count}`,foot:''};
}

const shortName=value=>Array.from(value||'').slice(0,48).join('');
const dateCard=(title,date,mark,label,sum,rows,foot='')=>({title,date,dateLabel:paymentDate(date),mark,label,sum,rows,count:'',foot});
export function paymentsWidget(items,date){
 const rows=items.slice(0,5).map(item=>{
  const income=item.income||item.type==='income';
  return [shortName(item.name),item.amount==null?'Уточнить сумму':(income?'+':'−')+money(item.amount,item.currency),income?'income':'expense'];
 });
 return dateCard('Напоминание о платежах',date,'calendar','Событий к проверке',String(items.length),rows,'Подтверди, когда деньги действительно переданы.');
}
export function lunchWidget(body,date){
 return dateCard('Обед сегодня?',date,'lunch','Рабочий день','Отметь обед',[],body.text.split('\n').slice(1).join('\n'));
}
export function digestWidget(data,date,responses){
 const items=attentionItems(data,date,{responses});
 const rows=items.slice(0,5).map(item=>[shortName(item.name),item.amount==null?paymentDate(item.date):money(item.amount,item.currency)]);
 return dateCard('Что требует внимания',date,'bell','Дел в сводке',String(items.length),rows);
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
