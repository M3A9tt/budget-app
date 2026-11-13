import {createServer} from 'vite';
import {reviewData} from './preview-data.mjs';
import {todayMoscow} from '../src/mini-model.js';
import {moveDate} from '../src/finance-events.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const data=reviewData();
const previewDay=todayMoscow(data.settings.timeZone);
data.transactions=data.transactions.filter(entry=>entry.date!==previewDay||entry.type!=='lunch');
const state={data,revision:1};
const paymentState={...state,data:{...data,recurring:[{
 id:'preview-internet',name:'Интернет',type:'expense',amount:800,currency:'RUB',accountId:'demo-bank',
 cat:'housing',frequency:'once',startDate:previewDay,active:true,
},...data.recurring]}};
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
const previewEnv={DB:{prepare(sql){
 const statement=sqlite.prepare(sql);
 return {bind(...values){return {
  first:async()=>statement.get(...values),
  run:async()=>({meta:{changes:Number(statement.run(...values).changes)}}),
 };}};
}}};
const from={id:1},chat={id:1,type:'private'};
const port=Number(process.env.WIDGET_PREVIEW_PORT||5189);
const notifications=[
 ['accounts','Счета'],
 ['expense','Проверка расходов'],['day','Итог дня'],['week','Итог недели'],
 ['month','Итог месяца'],['payments','Платежи'],['lunch','Обед'],['digest','Сводка'],['release','Обновление'],
];

function shell(requestedCard,telegramLogo){
 const cards=[['menu','Меню бота'],['entry','Запись'],['expense-entry','Расход из проверки'],...notifications,
  ['lunch-company','Обед компании'],['lunch-own','Обед за свои']];
 const active=cards.some(([id])=>id===requestedCard)?requestedCard:'menu';
 const links=cards.map(([id,label])=>
  `<a href="/?card=${id}${telegramLogo?'&amp;logo=telegram':''}"${id===active?' aria-current="page"':''}>${label}</a>`).join('');
 return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Виджеты Бюрджета</title><style>
 body{margin:0;padding:20px;background:#111823;color:#e8eff4;font:16px system-ui}
 main{max-width:720px;margin:auto}h1{margin:0}p{color:#b6c5d3}
 nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
 a{padding:8px 11px;border:1px solid #405160;border-radius:9px;color:#c5e4d4;text-decoration:none}
 a[aria-current]{background:#b7d5ca22;border-color:#698b83}
 iframe{display:block;width:min(100%,420px);height:660px;border:0;margin:auto}
 </style><main><h1>Виджеты Бюрджета</h1><p>Вымышленный бюджет · запись отключена</p>
 <nav>${links}</nav><p><a href="/?card=${active}${telegramLogo?'':'&amp;logo=telegram'}">${telegramLogo?'Показать оригинал из мини-аппы':'Показать логотип для Telegram'}</a></p>
 <iframe title="Виджет" src="/card/${active}${telegramLogo?'':'?original=1'}"></iframe></main>
 <script type="module" src="/@vite/client"></script></html>`;
}

const server=await createServer({
 configFile:false,
 optimizeDeps:{noDiscovery:true,include:[]},
 server:{host:'127.0.0.1',port,strictPort:true},
 plugins:[{name:'widget-preview',configureServer(vite){
  vite.watcher.on('change',file=>{
   if(/[\\/]server[\\/](?:calendar-widget|notification-widget|notifications|widget-(?:glass|brand))\.js$/.test(file)){
    vite.ws.send({type:'full-reload',path:'*'});
   }
  });
  vite.middlewares.use(async(req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname!=='/'&&url.pathname!=='/query'&&!url.pathname.startsWith('/card/'))return next();
   res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Type','text/html; charset=utf-8');
   try{
    if(url.pathname==='/'){res.end(shell(url.searchParams.get('card'),url.searchParams.get('logo')==='telegram'));return;}
    const {calendarWidget,answerCalendarWidget,sendDatedEntryWidget}=await vite.ssrLoadModule('/server/calendar-widget.js');
    let payload;
    const telegram=async(_env,_method,body)=>{payload=body;};
    const accountsRoute=url.pathname==='/card/accounts'||url.searchParams.get('data')?.startsWith('budget-account:');
    const dataForRoute=accountsRoute?previewAccounts(state.data):state.data;
    const deps={env:{},access:async()=>true,readState:async()=>({...state,data:dataForRoute}),telegram,previewOnly:true};
    if(url.pathname==='/query'){
     const data=url.searchParams.get('data')||'';
     const cards=await vite.ssrLoadModule('/server/notification-widget.js');
     const summary=cards.summaryWidgetCommand.exec(data);
     const releasePage=/^r:([a-zA-Z0-9._-]+):(-1|\d{1,4})$/.exec(data);
     const payment=/^b:n:([pid]):([^:]+)(?::([^:]+))?$/.exec(data);
     const digest=/^(?:b:v:attention|da:(?:(\d{1,5})|(\d{4}-\d{2}-\d{2}):(check|lunch)))$/.exec(data);
     if(summary){
      const period=summary[1],today=todayMoscow(state.data.settings.timeZone);
      payload={data:JSON.stringify(cards.interactiveSummaryWidget(state.data,cards.summaryPeriodReport(today,period),period))};
     }else if(data==='b:v:reminders'||data.startsWith('rw:')){
      const {answerReminderWidget,reminderWidgetCommand}=await vite.ssrLoadModule('/server/reminder-widget.js');
      const {applyBotAction}=await vite.ssrLoadModule('/server/bot-catalog.js');
      let shown=state;
      try{
       const match=reminderWidgetCommand.exec(data);
       if(!match)throw Error('Проверь время.');
       const card=await answerReminderWidget(previewEnv,'1',state,1,match,async()=>shown,async(_env,_id,_token,draft)=>{
        shown={...state,data:applyBotAction(structuredClone(state.data),draft.op,draft.args,draft.values)};
       });
       payload={data:JSON.stringify(card.status?{...card,status:'Настройки проверены · предпросмотр'}:card)};
      }catch(error){payload={data:JSON.stringify({error:error.message})};}
     }else if(digest){
      const [,page,day,kind]=digest;
      const {expenseReminder,lunchReminder}=await vite.ssrLoadModule('/server/notifications.js');
      const card=kind==='check'?{...cards.expenseWidget(state.data,day),controls:cards.notificationControls(expenseReminder(state.data,day))}
       :kind==='lunch'?cards.lunchWidget(lunchReminder(day),day):cards.digestWidget(state.data,previewDay,[],Number(page)||0);
      if(kind)card.controls.push(['К списку','back']);
      payload={data:JSON.stringify(card)};
     }else if(payment||data.startsWith('pf:')||data==='b:v:due'||data.startsWith('pd:')){
      const {duePaymentsWidget,openPaymentWidget,paymentFormCommand,paymentListCommand,stepPaymentWidget}=await vite.ssrLoadModule('/server/payment-widget.js');
      try{
       const list=paymentListCommand.exec(data);
       const card=list?duePaymentsWidget(paymentState.data,Number(list[1])||0):
        payment?await openPaymentWidget(previewEnv,'1',paymentState,1,...payment.slice(1)):
        await stepPaymentWidget(previewEnv,'1',paymentState,1,paymentFormCommand.exec(data),async()=>paymentState,async()=>{});
       payload={data:JSON.stringify(card?.done?{...card,status:'Платёж проверен · предпросмотр'}:card||{error:'Открой ближайший платёж.'})};
      }catch(error){payload={data:JSON.stringify({error:error.message})};}
     }else if(releasePage){
      const {latestRelease}=await vite.ssrLoadModule('/src/release-notes.js');
      const {releaseWidget}=await vite.ssrLoadModule('/server/notification-widget.js');
      const page=Number(releasePage[2]);
      payload={data:JSON.stringify(releasePage[1]===latestRelease.id&&page<latestRelease.changes.length
       ?releaseWidget(latestRelease,page):{error:'Страница обновления недоступна.'})};
     }else if(/^lunch:\d{4}-\d{2}-\d{2}:skip$/.test(data)){
      const {lunchReasonControls}=await vite.ssrLoadModule('/server/habits.js');
      payload={data:JSON.stringify({status:'Почему не заказал?',controls:lunchReasonControls(data.split(':')[1])})};
     }else if(/^lunch:\d{4}-\d{2}-\d{2}:reason:/.test(data)){
      payload={data:JSON.stringify({status:'Обед отмечен · предпросмотр',done:true})};
     }else if(/^check:\d{4}-\d{2}-\d{2}:history(?::\d{1,6})?$/.test(data)){
      const {expenseHistoryWidget}=await vite.ssrLoadModule('/server/notification-widget.js');
      const [,day,,page]=data.split(':');
      payload={data:JSON.stringify(expenseHistoryWidget(state.data,day,Number(page)||0))};
     }else if(/^check:\d{4}-\d{2}-\d{2}:pending$/.test(data)){
      payload={data:JSON.stringify({status:'Форма расхода открыта.'})};
     }else if(/^(?:lunch:|check:|b:)/.test(data))payload={data:JSON.stringify({status:'Предпросмотр. Данные не изменились.'})};
     else await answerCalendarWidget({id:'preview',chat,from,message_id:1,type:{type:'data'},data},deps);
     res.setHeader('Content-Type','application/json; charset=utf-8');
     res.end(JSON.stringify({result:payload?.data||'{}'}));return;
    }
    const kind=url.pathname.slice(6);
    if(['expense-entry','lunch-company','lunch-own'].includes(kind)){
     const lunch=kind.startsWith('lunch-')?kind.slice(6):undefined,today=todayMoscow(state.data.settings.timeZone);
     await sendDatedEntryWidget({},1,state,lunch?today:moveDate(today,-1),telegram,lunch);
    }else if(['menu','entry','accounts'].includes(kind)){
     await calendarWidget({chat,from,text:kind==='accounts'?'/accounts':kind==='entry'?'/add':'/menu'},{...deps,readState:async()=>({...state,data:{...dataForRoute,settings:{...dataForRoute.settings,calendarWidgetMenuEnabled:true}}})});
    }else if(notifications.some(([id])=>id===kind)){
     const cards=await vite.ssrLoadModule('/server/notification-widget.js');
     const {expenseReminder,lunchReminder}=await vite.ssrLoadModule('/server/notifications.js');
     const {attentionMessage}=await vite.ssrLoadModule('/server/attention-message.js');
     const {latestRelease}=await vite.ssrLoadModule('/src/release-notes.js');
     const {scheduledEvents}=await vite.ssrLoadModule('/src/finance-events.js');
     const {paymentFromEvent}=await vite.ssrLoadModule('/src/due-payments.js');
     const {data}=state,today=todayMoscow(data.settings.timeZone);
     const report=['day','week','month'].includes(kind)?cards.summaryPeriodReport(today,kind):null;
     const expenseDay=moveDate(today,-1);
     const {duePayments}=await vite.ssrLoadModule('/src/due-payments.js');
     const due=kind==='payments'?duePayments(paymentState.data,today):[];
     const payments=kind==='payments'?[...due,...scheduledEvents(data,today,moveDate(today,7),moveDate(today,1)).map(paymentFromEvent)].slice(0,3):[];
     const card=kind==='release'?cards.releaseWidget(latestRelease)
      :report?cards.interactiveSummaryWidget(data,report,kind)
      :kind==='expense'?{...cards.expenseWidget(data,expenseDay),
       controls:cards.notificationControls(expenseReminder(data,expenseDay))}
      :kind==='payments'?cards.paymentsWidget(payments,today)
      :kind==='lunch'?cards.lunchWidget(lunchReminder(today),today)
      :{...cards.digestWidget(data,today),controls:cards.notificationControls(attentionMessage(data,today))};
     await cards.sendNotificationWidget({},telegram,{chat_id:1},card);

    }
    if(!payload?.html){res.statusCode=404;res.end('Виджет недоступен');return;}
    const chatData=JSON.stringify(payload.chat_data).replaceAll('<','\\u003c');
    const originalBrand=url.searchParams.has('original')?`<script>
     const originalLogo=document.querySelector('img[alt="Бюрджет"]');
     originalLogo.src='/brand/lockup-refined-b.webp';
     if(originalLogo.closest('h3')){originalLogo.width=144;originalLogo.height=42;}
     </script>`:'';
    res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>
     window.TelegramWidget={chatType:'private',chatData:${chatData},ready(){},request(data){
      const lunch=/^lunch:\\d{4}-\\d{2}-\\d{2}:(company|own)$/.exec(data);
      const page=lunch?'lunch-'+lunch[1]:/^check:\\d{4}-\\d{2}-\\d{2}:pending$/.test(data)?'expense-entry':'';
      if(page)parent.location.href='/?card='+page+(location.search?'':'&logo=telegram');
      return fetch('/query?data='+encodeURIComponent(data)).then(r=>r.json());
     }};
     </script>${payload.html}${originalBrand}</html>`);
   }catch(error){vite.config.logger.error(error.stack);res.statusCode=500;res.end('Ошибка предпросмотра');}
  });
 }}],
});

function previewAccounts(data){
 const accounts=data.accounts.map(account=>{
  if(account.id==='review-empty')return {...account,name:'Валютная карта',balance:140,currency:'USD'};
  if(account.id==='demo-savings')return {...account,name:'Срочный вклад',savingsKind:'deposit'};
  return account;
 });
 return {...data,accounts};
}

await server.listen();
console.log(`Виджеты Бюрджета: http://127.0.0.1:${port}/`);
