import {plannedOccurrences,planType} from './planned-model.js';
import {paidInstallment} from './finance-tools.js';
export const CATEGORIES=[{id:'food',name:'Еда',icon:'food',color:'#b8dec4'},{id:'transport',name:'Транспорт',icon:'transport',color:'#a6b7e8'},{id:'housing',name:'ЖКХ',icon:'home',color:'#d6b499'},{id:'health',name:'Здоровье',icon:'health',color:'#c2ace1'},{id:'fun',name:'Развлечения',icon:'play',color:'#d7bd79'},{id:'subs',name:'Подписки',icon:'repeat',color:'#a7cbd8'},{id:'clothes',name:'Одежда',icon:'other',color:'#c1bacd'},{id:'comm',name:'Связь',icon:'other',color:'#a6c2bc'},{id:'tech',name:'Техника',icon:'other',color:'#9eacc7'},{id:'other',name:'Другое',icon:'other',color:'#a2a8b7'}];
export const EMPTY={schemaVersion:2,transactions:[],accounts:[],debts:[],goals:[],customCats:[],transfers:[],recurring:[],history:[],lunchDayOff:[],lunchDayMod:{},categoryBudgets:{},settings:{budget:0,lunchDaily:400,workDays:22,reserveRub:0,nextIncomeDate:''},rates:{RUB:1,USD:92,EUR:100,GBP:117,CNY:12.7,TRY:2.8}};
export const todayMoscow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
export const money=(n,currency='RUB')=>new Intl.NumberFormat('ru-RU',{style:'currency',currency,maximumFractionDigits:2,minimumFractionDigits:0}).format(n||0);
export function dashboard(data,today=todayMoscow()) {
  const rub=t=>Number.isFinite(t.amountRub)?t.amountRub:t.amount*(data.rates[t.currency||'RUB']||1);
  const month=today.slice(0,7),txs=data.transactions.filter(t=>t.date.startsWith(month)&&t.date<=today);
  const expenses=txs.filter(t=>t.type==='expense'&&t.cat!=='lunch'),income=txs.filter(t=>t.type==='income').reduce((n,t)=>n+rub(t),0);
  const spent=expenses.reduce((n,t)=>n+rub(t),0),balance=data.accounts.filter(a=>a.accType!=='savings').reduce((n,a)=>n+a.balance*(data.rates[a.currency||'RUB']||1),0);
  const payday=data.settings.nextIncomeDate,hasPayday=/^\d{4}-\d{2}-\d{2}$/.test(payday||'')&&payday>today;
  const end=hasPayday?payday:today;
  let obligations=0,unknown=0;
  for(const {rule:r} of plannedOccurrences(data,today,end).filter(i=>i.date<end)){if(planType(r)!=='expense')continue;if(r.variable)unknown++;else obligations+=r.amount*(data.rates[r.currency||'RUB']||1);}
  for(const p of data.installments||[])for(const x of p.payments)if(x.date<end&&!paidInstallment(data,x))obligations+=x.amount*(data.rates[p.currency]||1);
  const reserve=data.settings.reserveRub||0,free=balance-reserve-obligations;
  const days=hasPayday?Math.round((new Date(payday+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000):null;
  const categories=CATEGORIES.concat(data.customCats||[]).map(c=>({...c,value:expenses.filter(t=>t.cat===c.id).reduce((n,t)=>n+rub(t),0)})).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
  const daily=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6+i);const date=d.toISOString().slice(0,10);return{date,label:new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:'UTC'}).format(d),amount:data.transactions.filter(t=>t.date===date&&t.type==='expense'&&t.cat!=='lunch').reduce((n,t)=>n+rub(t),0)};});
  return {balance,spent,income,free,reserve,obligations,unknown,days,daily,categories};
}
export function demoData(today=todayMoscow()) {
  const d=structuredClone(EMPTY),date=days=>{const value=new Date(today+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);};
  d.accounts=[{id:'demo-bank',name:'Основной счёт',currency:'RUB',balance:38420,accType:'regular'},{id:'demo-card',name:'Повседневные',currency:'RUB',balance:8260,accType:'regular'},{id:'demo-savings',name:'Копилка',currency:'RUB',balance:20000,accType:'savings'}];
  d.settings={...d.settings,nextIncomeDate:date(12),reserveRub:12000};
  d.goals=[{id:'demo-goal',name:'На образование',target:98000,saved:20000,currency:'RUB'}];
  const samples=[['Продукты',1260,'food',0],['Кофе',180,'food',0],['Проезд',350,'transport',-1],['Подписка',499,'subs',-2],['Аптека',730,'health',-3],['Продукты',1640,'food',-4],['Кино',650,'fun',-5],['Обед',379,'lunch',0]];
  d.transactions=samples.map(([note,amount,cat,offset],i)=>({id:'demo-tx-'+i,type:cat==='lunch'?'lunch':'expense',cat,amount,currency:'RUB',amountRub:amount,accountAmount:cat==='lunch'?0:amount,accountId:cat==='lunch'?undefined:'demo-bank',note,date:date(offset),revision:1,tags:[]}));
  d.categoryBudgets={food:18000,transport:5000,subs:3000};
  d.goals[0]={...d.goals[0],accountId:'demo-savings',targetDate:date(120)};
  d.recurring=[{id:'demo-rent',name:'ЖКХ',amount:6780,currency:'RUB',dueDay:Number(date(3).slice(-2)),active:true,cat:'housing',accountId:'demo-bank'},{id:'demo-sub',name:'Подписки',amount:990,currency:'RUB',dueDay:Number(date(8).slice(-2)),active:true,cat:'subs',accountId:'demo-bank'}];
  for(let i=6;i<100;i+=2){const cats=['food','transport','health','fun','food'],cat=cats[i%5],amount=[420,780,350,1250,580,990,310][i%7];d.transactions.push({id:'demo-past-'+i,type:'expense',cat,amount,currency:'RUB',amountRub:amount,accountAmount:amount,accountId:'demo-bank',date:date(-i),note:{food:'Продукты',transport:'Поездка',health:'Аптека',fun:'Выходные'}[cat],paymentMethod:i%3?'card':'sbp',revision:1,tags:[]});}
  return d;
}
