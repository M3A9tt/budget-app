import {createServer} from 'vite';
import {reviewData} from './preview-data.mjs';
import {accountTotals,isSavingAccount,orderedAccounts} from '../src/account-balances.js';
import {money} from '../src/mini-model.js';
import {activityEntries,filterActivity,transferDetails} from '../src/activity-history.js';
import {categoryCatalog} from '../src/categories.js';

const state={data:reviewData(),revision:1};
const from={id:1},chat={id:1,type:'private'};
const port=Number(process.env.WIDGET_PREVIEW_PORT||5189);
const notifications=[
 ['accounts','Счета'],
 ['expense','Проверка расходов'],['day','Итог дня'],['week','Итог недели'],
 ['month','Итог месяца'],['payments','Платежи'],['lunch','Обед'],['digest','Сводка'],
];

function shell(requestedCard,telegramLogo){
 const cards=[['menu','Меню бота'],['entry','Запись'],...notifications];
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
   if(/[\\/]server[\\/](?:calendar-widget|notification-widget|widget-(?:glass|brand))\.js$/.test(file)){
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
    const {calendarWidget,answerCalendarWidget}=await vite.ssrLoadModule('/server/calendar-widget.js');
    let payload;
    const telegram=async(_env,_method,body)=>{payload=body;};
    const deps={env:{},access:async()=>true,readState:async()=>state,telegram};
    if(url.pathname==='/query'){
     const data=url.searchParams.get('data')||'';
     if(/^budget-entry:[ps]:/.test(data))payload={data:JSON.stringify({error:'Сохранение доступно только в Telegram.'})};
     else await answerCalendarWidget({id:'preview',chat,from,message_id:1,type:{type:'data'},data},deps);
     res.setHeader('Content-Type','application/json; charset=utf-8');
     res.end(JSON.stringify({result:payload?.data||'{}'}));return;
    }
    const kind=url.pathname.slice(6);
    let accountLinks='';
    if(kind==='menu'||kind==='entry'){
     await calendarWidget({chat,from,text:kind==='entry'?'/add':'/menu'},{...deps,readState:async()=>({...state,data:{...state.data,settings:{...state.data.settings,calendarWidgetMenuEnabled:true}}})});
    }else if(notifications.some(([id])=>id===kind)){
     const cards=await vite.ssrLoadModule('/server/notification-widget.js');
     const {todayMoscow}=await vite.ssrLoadModule('/src/mini-model.js');
     const {moveDate,scheduledEvents}=await vite.ssrLoadModule('/src/finance-events.js');
     const {data}=state,today=todayMoscow(data.settings.timeZone);
     const reports={day:[0,'Итог дня'],week:[-6,'Итог недели'],month:[-29,'Итог месяца']};
     const report=reports[kind];
     const accountId=url.searchParams.get('account');
     const accounts=kind==='accounts'?previewAccounts(data):[];
     const account=accounts.find(item=>item.id===accountId);
     const card=kind==='accounts'?accountsCard(data,accounts,account)
      :report?cards.summaryWidget(data,{from:moveDate(today,report[0]),to:today,title:report[1]})
      :kind==='expense'?cards.expenseWidget(data,moveDate(today,-1),0)
      :kind==='payments'?cards.paymentsWidget(scheduledEvents(data,today,moveDate(today,7),today).slice(0,3),today)
      :kind==='lunch'?cards.lunchWidget({text:'Обед сегодня?'},today)
      :cards.digestWidget(data,today);
     await cards.sendNotificationWidget({},telegram,{chat_id:1},card);
     if(kind==='accounts')accountLinks=account
      ?'<p><a href="?'+(url.searchParams.has('original')?'original=1':'')+'">← К счетам</a></p>'
      :`<script>
       const accountIds=${JSON.stringify(accounts.slice(0,6).map(item=>item.id))};
       document.querySelectorAll('.row span').forEach((label,index)=>{
        const link=document.createElement('a'),query=new URLSearchParams(location.search);
        query.set('account',accountIds[index]);link.href='?'+query;link.textContent=label.textContent;
        label.replaceChildren(link);
       });
       </script><style>a{color:#c5e4d4;text-underline-offset:3px}</style>`;
    }
    if(!payload?.html){res.statusCode=404;res.end('Виджет недоступен');return;}
    const chatData=JSON.stringify(payload.chat_data).replaceAll('<','\\u003c');
    const originalBrand=url.searchParams.has('original')?
     '<script>document.querySelector(\'img[alt="Бюрджет"]\').src="/brand/lockup-refined-b.webp";</script>':'';
    res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>
     window.TelegramWidget={chatType:'private',chatData:${chatData},ready(){},request(data){return fetch('/query?data='+encodeURIComponent(data)).then(r=>r.json());}};
     </script>${payload.html}${originalBrand}${accountLinks}</html>`);
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
 const visible=orderedAccounts(data,accounts).filter(account=>!account.archived);
 return [...visible.filter(account=>!isSavingAccount(account)),...visible.filter(isSavingAccount)];
}

function accountsCard(data,visible,account){
 if(account){
  const categories=categoryCatalog(data.customCats);
  const recent=filterActivity(activityEntries(data),data,categories,{accountId:account.id,includeCompanyLunch:false});
  const rows=recent.slice(0,5).map(item=>{
   const transfer=item.type==='transfer';
   const outgoing=transfer?item.from===account.id:item.type==='expense';
   const incoming=transfer?item.to===account.id:item.type==='income';
   const label=transfer?transferDetails({...data,accounts:visible},item).route:
    item.note||categories.find(category=>category.id===item.cat)?.name||'Операция';
   return [label,(outgoing?'−':incoming?'+':'')+money(item.amount,item.currency),
    outgoing?'expense':incoming?'income':''];
  });
  return {title:account.name,mark:'chart',dateLabel:'Последние операции',label:'Остаток',
   sum:money(account.balance,account.currency),rows,count:'',foot:rows.length?'':'Операций пока нет'};
 }
 const {spendable,savings}=accountTotals({...data,accounts:visible});
 const rows=visible.slice(0,6).map(account=>[
  isSavingAccount(account)?`${account.name} · ${account.savingsKind==='deposit'?'вклад':'накопления'}`:account.name,
  money(account.balance,account.currency),account.balance<0?'expense':'',
 ]);
 return {
  title:'Счета',mark:'chart',dateLabel:'',label:'На обычных счетах',
  sum:money(spendable),rows,count:visible.length>rows.length?`Показано ${rows.length} из ${visible.length}`:'',
  foot:savings?`Отложено отдельно · ${money(savings)}`:'',
 };
}

await server.listen();
console.log(`Виджеты Бюрджета: http://127.0.0.1:${port}/`);
