import {money} from '../src/mini-model.js';
import {moveDate} from '../src/finance-events.js';
import {expenseCheckSummary} from '../src/expense-check.js';
import {budgetState} from '../src/budget-view.js';
import {periodSummaryData} from './period-summary.js';
import {categoryCatalog} from '../src/categories.js';
import {iconShape} from '../src/mini-icon-shapes.js';
import {paymentDate} from '../src/payment-copy.js';
import {attentionItems} from '../src/attention.js';
import {widgetGlass,widgetPrimary} from './widget-glass.js';
import {notificationBrand,widgetBrand} from './widget-brand.js';
import {brandText} from '../src/release-notes.js';
import {roundMoney} from '../src/ledger.js';
import {paymentCallback,paymentFromEvent} from '../src/due-payments.js';

const icon=name=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconShape(name)+'</svg>';

const cardHtml=(interactive=false)=>`<style>
${widgetGlass}
body{margin:0;color:#e8eff4;font:15px system-ui}
section{padding:14px 15px}
h3,p{margin:0}
header{display:flex;align-items:center;gap:9px}
.brand{display:block;width:110px;margin-left:auto;flex:none}
@media(max-width:280px){header{flex-wrap:wrap}.brand{margin-left:0}}
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
#foot{color:#c6d1dd;font-size:13px;line-height:1.45;margin-top:8px}
#foot:empty,#count:empty{display:none}
@media(max-width:240px){.row{flex-wrap:wrap}}
${interactive?`button{font:inherit;color:#c5e4d4;background:none;border:0;text-align:left;padding:6px 0;cursor:pointer}
#controls:not(:empty){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:12px}
#controls button{min-height:44px;border:1px solid #ffffff29;border-radius:10px;padding:8px;background:linear-gradient(145deg,#ffffff0e,#ffffff04);text-align:center;transition:background-color .22s,border-color .22s,transform .18s}
#controls button:hover{background-color:#ffffff10;border-color:#ffffff55}
#controls button:active{transform:scale(.97)}
#controls button:only-child,#controls .primary,#controls .quiet{grid-column:1/-1}
#controls .primary{${widgetPrimary};border-color:#d7ede299;border-radius:13px;min-height:48px;box-shadow:inset 0 1px #f0fff550,0 4px 12px #071c181f;font-weight:650}
#controls :focus-visible{outline:2px solid #c4decf;outline-offset:2px}
#controls .quiet{justify-self:center;border-color:transparent;background:none;color:#b6c5d3;font-size:13px}
#status:not(:empty){display:block;margin-top:10px;color:#c6d1dd}
#controls form{grid-column:1/-1;display:flex;gap:8px}
#controls input{min-width:0;flex:1;padding:8px;color:inherit;background:#152431;border:1px solid #ffffff34;border-radius:9px;font:inherit}
@media(prefers-reduced-motion:reduce){#controls button,.row.action{transition:none}#controls button:active{transform:none}}
.row.action{position:relative;padding:5px 6px;border-radius:5px;transition:background-color .2s}
.row.action:focus-within,.row.action:hover{background-color:#ffffff0b}
.row.action button{min-height:44px;color:inherit;font-weight:600}
.row.action button::after{content:'';position:absolute;inset:0}
.row.action b::after{content:'›';margin-left:8px;color:#b6c5d3}
.row time{margin-top:2px}`:''}
</style><section hidden id="card" class="widget-glass"><header><span class="mark" id="mark"></span><div><h3 id="heading"></h3><time id="date"></time></div><img class="brand" src="${interactive?widgetBrand:notificationBrand}" alt="Бюрджет"></header>
<div class="total"><span id="label"></span><strong id="sum"></strong></div><div id="rows"></div><small id="count"></small><p id="foot"></p>${interactive?'<div id="controls"></div><small id="status" aria-live="polite"></small>':''}</section>
<script>
const w=window.TelegramWidget;
const get=id=>document.getElementById(id),put=(id,value)=>get(id).textContent=value??'';
function render(d){
 ${interactive?'current=d;':''}
 put('heading',d.title);put('date',d.dateLabel);put('label',d.label);put('sum',d.sum);put('foot',d.foot);put('count',d.count);
 const marks=${JSON.stringify(Object.fromEntries(['check','chart','calendar','lunch','bell'].map(name=>[name,icon(name)])))};
 get('mark').innerHTML=marks[d.mark]||marks.chart;
 put('rows','');
 for(const [label,value,tone,action,date] of d.rows){
  const row=document.createElement('div');row.className='row '+(tone||'');
  for(const [tag,text] of [['span',label],['b',value]]){
   const part=document.createElement(tag);part.textContent=text;row.appendChild(part);
  }
  ${interactive?"if(action){row.classList.add('action');const title=row.firstChild;title.textContent='';addAction(title,label,action);}":''}
  ${interactive?"if(date){const time=document.createElement('time');time.textContent=date;row.firstChild.appendChild(time);}":''}
  document.getElementById('rows').appendChild(row);
 }
 const card=get('card');card.className='widget-glass '+(d.expense?'expense':d.mark||'chart');card.hidden=false;
 ${interactive?"put('controls','');if(d.input)addInput(d.input);for(const [label,action] of d.controls||[])addAction(get('controls'),label,action);":''}
}
${interactive?`let pending=false,current,trail=[],refreshBack=false;
function addInput(field){
 const form=document.createElement('form'),input=document.createElement('input'),button=document.createElement('button');
 input.type=['date','time'].includes(field.type)?field.type:'text';input.inputMode=field.type==='money'?'decimal':'';
 input.required=true;input.maxLength=16;input.value=field.value;
 input.setAttribute('aria-label',field.label);button.textContent='Дальше';
 form.append(input,button);get('controls').appendChild(form);
 form.addEventListener('submit',event=>{event.preventDefault();request(field.command+input.value.trim());});
}
function addAction(parent,label,action){
 const button=document.createElement('button');button.type='button';button.textContent=label;parent.appendChild(button);
 if(action.startsWith('lunch:')){
  if(action.endsWith(':company'))button.className='primary';
  if(action.endsWith(':off'))button.className='quiet';
 }
 if(action.startsWith('check:')||action==='test:expense'){
  if(action.endsWith(':done')||label==='Всё записал ✅'){button.className='primary';button.textContent='Всё записал';}
  if(action.endsWith(':off')||label==='Отключить проверки')button.className='quiet';
 }
 if(action.startsWith('rw:save:')||action.startsWith('pf:')&&action.endsWith(':c'))button.className='primary';
 button.addEventListener('click',()=>request(action));
}
async function request(action){
  if(pending)return;
  if(action==='back'&&trail.length){
   const target=trail.at(-1);
   if(refreshBack&&target.refresh){
    pending=true;put('status','Обновляю список…');
    try{
     const updated=JSON.parse((await w.request(target.refresh)).result);
     if(!updated.rows)throw Error();
     trail.pop();render(updated);put('status','');
    }catch{put('status','Не удалось обновить список. Повтори нажатие.');return;}
    finally{pending=false;}
   }else{render(trail.pop());put('status','');}
   refreshBack=false;return;
  }
  pending=true;put('status','Загрузка…');
  try{
   const data=JSON.parse((await w.request(action)).result);
   put('status',data.error||data.status||'');
   if(data.rows){
    if(data.scope&&trail.at(-1)?.scope===data.scope)trail.pop();
    else if((data.scope||data.title)!==(current.scope||current.title))trail.push(current);
    render(data);
   }
   if(data.done||data.controls&&!data.rows){
    put('controls','');
    for(const [label,action] of data.controls||[])addAction(get('controls'),label,action);
    if(data.done&&trail.length){refreshBack=true;addAction(get('controls'),'← Назад','back');}
   }
  }catch{put('status','Повтори запрос.');}
  finally{pending=false;}
}`:''}
if(w?.chatType==='private'&&!w.isForward&&!w.isPreview&&w.chatData)render(JSON.parse(w.chatData));
w?.ready();
</script>`;
const html=cardHtml();
export const accountsWidgetHtml=cardHtml(true);

export function expenseWidget(data,date,offset=0){
 const {total,count,entries}=expenseCheckSummary(data,date,3,offset);
 const cats=categoryCatalog(data.customCats);
 const rows=entries.map(t=>[Array.from(t.note||cats.find(cat=>cat.id===t.cat)?.name||'Расход').slice(0,38).join(''),money(t.amount,t.currency),'expense']);
 const countText=count?`Операций · ${count}`:'Расходов за этот день пока нет.';
 return {title:'Проверим расходы',date,dateLabel:paymentDate(date),mark:'check',expense:true,label:'Записано за день',sum:money(total),rows,count:countText,foot:data.settings?.reminderStyle==='custom'?data.settings.reminderText?.trim()||'':''};
}

export function expenseHistoryWidget(data,date,page=0){
 const size=3,{count}=expenseCheckSummary(data,date,0),pages=Math.max(1,Math.ceil(count/size));
 page=Math.max(0,Math.min(page,pages-1));
 const action=n=>'check:'+date+':history:'+n;
 return {...expenseWidget(data,date,page*size),title:'Записи за день',foot:'',
  count:pages>1?`Страница ${page+1} из ${pages} · Операций ${count}`:undefined,
  controls:[...(page>0?[['← Назад',action(page-1)]]:[]),
   ...(page+1<pages?[['Дальше →',action(page+1)]]:[]),['← К проверке','back']]};
}

export const summaryWidgetCommand=/^summary:(day|week|month)$/;
const summaryPeriods={
 day:{label:'Сегодня',title:'Итог дня',from:today=>today},
 week:{label:'Неделя',title:'Итог недели',from:today=>moveDate(today,-6)},
 month:{label:'Месяц',title:'Итог месяца',from:today=>today.slice(0,8)+'01'},
};

export function summaryPeriodReport(today,period){
 const {title,from}=summaryPeriods[period];
 return {from:from(today),to:today,title,visual:period!=='month',daily:period==='day'};
}

export function interactiveSummaryWidget(data,report,period){
 const controls=Object.entries(summaryPeriods).filter(([key])=>key!==period)
  .map(([key,{label}])=>[label,'summary:'+key]);
 return summaryWidget(data,report,controls);
}

export function summaryWidget(data,report,controls){
 const r=periodSummaryData(data,report.from,report.to,report.title);
 const daily=report.daily??(report.from===report.to);
 const rows=[daily?['Расходы за день',money(r.expense),'expense']:['На обычных счетах сейчас',money(r.actual)],[budgetState({free:r.free,balance:r.actual,unknown:r.unknown}).heading,money(Math.abs(r.free)),r.free<0?'short':'']];
 if(r.savings)rows.push(['В копилках',money(r.savings)]);
 if(r.income)rows.push(['Доходы',money(r.income),'income']);
 if(r.lunch)rows.push(['Обеды компании',money(r.lunch)]);
 const categoryRows=r.categories.map(category=>[shortName(category.name),money(category.value),'expense']);
 if(r.previous){
  const change=roundMoney(r.expense-r.previous);
  rows.push(['К прошлому периоду',(change>0?'+':'')+money(change)]);
 }
 const dateLabel=report.from===report.to?paymentDate(report.to):paymentDate(report.from)+' — '+paymentDate(report.to);
 const card={title:report.title,date:report.to,dateLabel,expense:!daily,label:daily?'На обычных счетах':'Расходы за период',sum:money(daily?r.actual:r.expense),rows,count:`Операций · ${r.count}`,controls};
 // Keep financial totals and period controls ahead of optional category rows.
 const encoder=new TextEncoder();
 for(const row of categoryRows){
  const nextRows=[...card.rows,row];
  if(encoder.encode(JSON.stringify({...card,rows:nextRows})).length>1024)break;
  card.rows=nextRows;
 }
 return card;
}

const shortName=value=>Array.from(value||'').slice(0,48).join('');
const dateCard=(title,date,mark,label,sum,rows,foot='')=>({title,date,dateLabel:paymentDate(date),mark,label,sum,rows,count:'',foot});
export function paymentsWidget(items,date,{test=false}={}){
 const rows=items.slice(0,5).map(item=>{
  const income=item.income||item.type==='income';
  return [shortName(item.name),item.amount==null?'Уточнить сумму':(income?'+':'−')+money(item.amount,item.currency),income?'income':'expense',test?'test:planned':paymentCallback(item)];
 });
 return {...dateCard('Напоминание о платежах',date,'calendar','Событий к проверке',String(items.length),rows),
  controls:[['Все платежи',test?'test:planned':'b:v:due']]};
}
export function lunchWidget(body,date){
 return {...dateCard('Обед сегодня?',date,'lunch','Рабочий день','Отметь обед',[]),
  controls:notificationControls(body)};
}
export function notificationControls(body){
 return (body.reply_markup?.inline_keyboard||[]).flat().filter(button=>button.callback_data)
  .map(button=>[button.text,button.callback_data]);
}
export function digestWidget(data,date,responses,page){
 const items=attentionItems(data,date,{responses});
 const details=page!==undefined,size=details?3:5,pages=Math.max(1,Math.ceil(items.length/size));
 const index=details?Math.min(page,pages-1):0;
 const rows=items.slice(index*size,(index+1)*size).map(item=>[
  shortName(item.name),item.amount==null?paymentDate(item.date):money(item.amount,item.currency),'',
  details&&(item.kind==='check'||item.kind==='lunch')?'da:'+item.date+':'+item.kind:
   details&&item.kind==='payment'&&item.date<=date?paymentCallback(paymentFromEvent(item)):undefined,
 ]);
 const card=dateCard('Что требует внимания',date,'bell','Дел в сводке',String(items.length),rows);
 if(!details)return card;
 return {...card,scope:'attention',refresh:'da:'+index,count:pages>1?`${index+1} из ${pages}`:'',
  foot:items.length?'':'Всё разобрано.',
  controls:[...(index>0?[['← Назад','da:'+(index-1)]]:[]),
   ...(index+1<pages?[['Дальше →','da:'+(index+1)]]:[]),['К сводке','back']]};
}

export function releaseWidget(release,page=-1,{test=false}={}){
 const prefix=(test?'tr:':'r:')+release.id+':';
 const controls=page<0?[['Что нового',prefix+'0']]:[
  ...(page>0?[['← Назад',prefix+(page-1)]]:[]),
  ...(page+1<release.changes.length?[['Дальше →',prefix+(page+1)]]:[]),
  ['К обновлению',prefix+'-1'],
 ];
 return {...dateCard(test?'Обновление · Тест':'Обновление',release.date,'bell',
  page<0?'Версия':`Изменение ${page+1} из ${release.changes.length}`,release.version||release.id,[],
  brandText(page<0?release.title:release.changes[page])),controls};
}

export async function sendNotificationWidget(env,send,body,card){
 const chatId=Number(body.chat_id);
 if(!Number.isSafeInteger(chatId)||chatId<=0)return send(env,'sendMessage',body);
 const actions=[...(card.controls||[]).map(([,action])=>action),
  ...card.rows.map(([, , ,action])=>action).filter(Boolean)];
 const encoder=new TextEncoder(),interactive=actions.length>0;
 if(actions.some(action=>encoder.encode(action).length>64))return send(env,'sendMessage',body);
 const chat_data=JSON.stringify(card,(_key,value)=>value===''?undefined:value);
 if(encoder.encode(chat_data).length>1024)return send(env,'sendMessage',body);
 try{
  return await send(env,'sendWidget',{chat_id:body.chat_id,html:interactive?accountsWidgetHtml:html,chat_data,protect_content:true,
   ...(interactive?{allow_queries:true}:{})});
 }catch(error){
  // Only fall back when Telegram definitely did not accept the widget.
  if(![400,404].includes(error.telegramCode))throw error;
  return send(env,'sendMessage',body);
 }
}
