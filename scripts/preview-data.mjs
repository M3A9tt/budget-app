import {demoData,todayMoscow} from '../src/mini-model.js';
import {moveDate} from '../src/finance-events.js';
import {createPlanned} from '../src/planned-operations.js';
import {createInstallment,payInstallment,createGoal} from '../src/finance-tools.js';
import {createDebt,repayDebt} from '../src/debt-actions.js';
import {putTransaction,transferMoney,migrateData} from '../src/ledger.js';
import {EMPTY} from '../src/mini-model.js';
export function reviewData(today=todayMoscow()){
 const date=n=>moveDate(today,n);let d=demoData(today);
 d.settings={...d.settings,interfaceVersion:2,interfaceGuideSeen:true,interfaceInviteDismissed:true,notificationMode:'manual',telemetryEnabled:false,nextIncomeDate:date(18),modules:{lunch:true,goals:true,plans:true,installments:true,debts:true,forecast:true,limits:true}};
 d.accounts=d.accounts.map((a,i)=>({...a,icon:['bank','card','shield'][i],colors:[['#779eaa','#706b95'],['#799c87'],['#9a87ad','#698d9c']][i]}));
 d.accounts.push({id:'review-cash',name:'Наличные',currency:'RUB',balance:3500,storageKind:'cash',icon:'cash',colors:['#a18c64']},{id:'review-trip',name:'На путешествие',currency:'RUB',balance:12000,accType:'savings',icon:'travel',colors:['#799ba7','#9586a4']},{id:'review-empty',name:'Запасная карта',currency:'RUB',balance:0,icon:'card'});
 d=putTransaction(d,{id:'review-salary',type:'income',date:date(-6),amount:85000,currency:'RUB',accountId:'demo-bank',cat:'income',note:'Зарплата за прошлый месяц'});
 for(const [i,cat,amount,note] of [[1,'housing',6800,'Квартплата'],[2,'health',3200,'Приём врача'],[3,'tech',4500,'Аксессуары для ноутбука'],[4,'food',1850,'Продукты на неделю'],[5,'transport',780,'Такси после работы']])d=putTransaction(d,{id:'review-spend-'+i,type:'expense',date:date(-i),amount,currency:'RUB',accountId:'demo-bank',cat,note});
 d=transferMoney(d,{id:'review-save',from:'demo-bank',to:'demo-savings',amount:2500,date:date(-2),note:'На образование'});
 d=createGoal(d,{name:'Путешествие',target:'60000',accountId:'review-trip',targetDate:date(120)});
 for(const [id,name,amount,offset,frequency,type,cat] of [['review-rent','Аренда квартиры',95000,7,'once','expense','housing'],['review-manual','Занятие с преподавателем',2500,3,'manual','expense','education'],['review-past','Интернет — ждёт отметки',850,-2,'once','expense','subs'],['review-income','Ближайшая зарплата',85000,18,'once','income','income'],['review-project','Оплата проекта',18000,10,'once','income','income']])d=createPlanned(d,{id,name,amount,accountId:'demo-bank',currency:'RUB',startDate:date(offset),frequency,type,cat});
 d=createInstallment(d,{id:'review-coffee',name:'Кофемашина',total:'24000',count:6,firstDate:date(-20),accountId:'demo-bank',cat:'tech',obligationKind:'split'});
 let plan=d.installments.find(p=>p.id==='review-coffee');d=payInstallment(d,{planId:plan.id,paymentId:plan.payments[0].id,date:date(-20)});d=payInstallment(d,{planId:plan.id,paymentId:plan.payments[1].id,date:date(-1),amount:1000});
 d=createInstallment(d,{id:'review-bike',name:'Велосипед',total:'18000',count:3,firstDate:date(2),accountId:'demo-bank',cat:'transport'});
 d=createInstallment(d,{id:'review-closed',name:'Наушники — выплачено',total:'3000',count:1,firstDate:date(-10),accountId:'demo-bank',cat:'tech'});plan=d.installments.find(p=>p.id==='review-closed');d=payInstallment(d,{planId:plan.id,paymentId:plan.payments[0].id,date:date(-10)});
 d=createDebt(d,{id:'review-debt',person:'Саша',type:'my',amount:'9000',currency:'RUB',dueDate:date(5),note:'Билеты на поезд'});d=repayDebt(d,{id:'review-debt',amount:'3000',date:date(-1),accountId:'demo-bank'});
 d=createDebt(d,{id:'review-owed',person:'Миша',type:'tome',amount:'4500',currency:'RUB',dueDate:date(4),note:'Совместная покупка'});
 for(let i=1;i<=8;i++){const day=date(-i);if([0,6].includes(new Date(day+'T12:00:00Z').getUTCDay()))continue;d=putTransaction(d,{id:'review-meal-'+i,type:'lunch',cat:'lunch',date:day,amount:320+i*8,currency:'RUB',note:i%2?'Суп и горячее':'Салат и паста'});}
 return migrateData(d,EMPTY);
}
