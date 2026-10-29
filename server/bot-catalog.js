import {changeInstallmentPayment,installmentReturnStatus,refundInstallment} from '../src/installment-actions.js';
import {setPaymentReminder} from '../src/payment-reminders.js';
import {reschedulePlanned} from '../src/planned-operations.js';
import {setLunchAnswer} from '../src/lunch-day-state.js';
import {updateTransfer,reverseTransfer} from '../src/transfer-actions.js';
import {orderedAccounts} from '../src/account-balances.js';
import {validateLunchEntry} from './lunch-entry.js';
import {customizeHome} from '../src/home-layout.js';
import {repeatEntry} from '../src/entry-assist.js';
import {EMPTY,CATEGORIES,todayMoscow} from '../src/mini-model.js';
import {parseMoney,putTransaction,deleteTransaction,undoTransaction,transferMoney,migrateData} from '../src/ledger.js';
import {accountInput} from '../src/account-input.js';
import {reconcileAccount,createGoal,fundGoal,createInstallment,payInstallment,installmentRemaining,validDate} from '../src/finance-tools.js';
import {createSavings,classifySavings,moveSavings,isSavings} from '../src/savings.js';
import {saveWish,completeWish,availableWishAccounts} from '../src/wishes.js';
import {createDebt,repayDebt,setDebtDueDate} from '../src/debt-actions.js';
import {debtRemaining,canLinkDebtTransaction} from '../src/debt-state.js';
import {createPlanned,preparePlanned,skipPlanned,updatePlanned,deletePlanned} from '../src/planned-operations.js';
import {parseImportJson,previewJsonImport,commitJsonImport} from '../src/json-import.js';
import {previewImport,commitImport} from '../src/finance-tools.js';
import {prepareImportAccounts,importAccountSources,resolveImportAccount} from '../src/import-accounts.js';
import {reminderSettingsFromDraft} from '../src/reminder-settings.js';
import {MODULES,setModule} from '../src/modules.js';
import {validZone} from '../src/time-settings.js';
import {setLunchWorkday} from '../src/lunch-schedule.js';
const text=(key,label,extra={})=>({key,label,type:'text',...extra}),num=(key,label,extra={})=>text(key,label,{type:'money',...extra}),date=(key,label,extra={})=>text(key,label,{type:'date',...extra}),choice=(key,label,choices,extra={})=>text(key,label,{type:'choice',choices,...extra});
const yesno=[[true,'Да'],[false,'Нет']],currencies=d=>Object.keys(d.rates).map(x=>[x,x]),accounts=(d,filter=()=>true)=>orderedAccounts(d).filter(filter).map(a=>[a.id,a.name+' · '+a.currency]),cats=d=>CATEGORIES.concat(d.customCats||[]).map(c=>[c.id,c.name]);
const source=(d,a,key,list)=>{const row=list.find(x=>x.id===a[key]);if(!row)throw Error('Запись больше не существует');return row;};
export const SETTING_GROUPS={
 reminders:[['expenseCheckEnabled','Проверка расходов','bool'],['checkTime','Время проверки','time'],['checkRepeats','Повторы (0–3)','integer'],['checkInterval','Интервал в часах (1–4)','integer'],['checkEscalation','Усиление при пропусках','bool'],['checkEscalationDays','После скольких дней (1–7)','integer'],['reminderStyle','Стиль текста','style'],['reminderText','Свой текст','text'],['lunchAskEnabled','Вопрос об обеде','bool'],['lunchAskTime','Время вопроса об обеде','time'],['lunchAskDays','Дни вопроса: 1,2,3,4,5 (вс=0)','days'],['plannedReminders','Напоминания о платежах','bool'],['plannedReminderTime','Время напоминания о платежах','time'],['reportTime','Время сводок','time'],['dailyReport','Сводка дня','bool'],['weeklyReport','Сводка недели','bool'],['monthlyReport','Сводка месяца','bool'],['timeZone','Часовой пояс','zone']],
 lunch:[['lunchEmployer','Работодатель','text'],['lunchDaily','Компенсация в день, ₽','money'],['lunchCalendar','Календарь','calendar'],['lunchWorkDays','Рабочие дни: 1,2,3,4,5 (вс=0)','days'],['lunchEmployeeId','Номер сотрудника','text'],['lunchLearningEnabled','Учиться на исправлениях','bool']],
 general:[['nextIncomeDate','Дата дохода без плана (запасная)','date'],['rememberEntryChoices','Помнить выбор полей','bool'],['telemetryEnabled','Статистика нажатий','bool']]
};
export function fieldsFor(d,op,args={},values={}){
 const today=todayMoscow(d.settings.timeZone),common=[date('date','Дата',{default:today,advanced:true}),text('note','Комментарий',{optional:true,default:'',advanced:true})];
 if(op==='installmentChange'){const p=source(d,args,'id',d.installments),payment=p.payments.find(x=>x.id===values.paymentId)||p.payments.find(x=>installmentRemaining(d,x)>0);return [choice('paymentId','Какой неоплаченный взнос?',p.payments.filter(x=>installmentRemaining(d,x)>0).map(x=>[x.id,x.date+' · '+installmentRemaining(d,x)])),date('date','Новая дата по графику',{default:payment?.date||today}),num('remainingAmount','Неоплаченная часть',{default:payment?installmentRemaining(d,payment):0})];}
 if(op==='installmentReturn')return [choice('status','Состояние возврата',[['awaiting','Ожидается возврат / перерасчёт'],['recalculated','График пересчитан'],['none','Отменить отметку ожидания']])];
 if(op==='installmentRefund'){const p=source(d,args,'id',d.installments);return [num('amount','Фактически получено'),choice('accountId','Куда пришёл возврат',accounts(d,a=>(a.currency||'RUB')===p.currency)),date('date','Фактическая дата возврата',{default:today})];}
 if(op==='editTransfer')return [...fieldsFor(d,'transfer',args,values),...fieldsFor(d,'reverseTransfer',args,values)];
 if(op==='reverseTransfer'){const t=source(d,args,'id',d.transfers);return t.fee&&!d.transactions.some(x=>x.transferId===t.id)?[choice('legacyFeeId','Явно выбрать старую комиссию',d.transactions.filter(x=>x.type==='expense'&&!x.transferId&&x.accountId===t.from&&x.amount===t.fee).map(x=>[x.id,`${x.date} · ${x.note} · ${x.amount}`]))]:[];}
 if(op==='reschedulePlan')return [date('date','Новый день оплаты',{default:today})];
 if(op==='paymentReminder')return [date('date','Напомнить в дату',{default:today}),text('time','Время ЧЧ:ММ',{type:'time',default:'18:00'})];
 if(op==='tx'){const old=args.id?source(d,args,'id',d.transactions):null,type=args.type||old?.type||'expense';return [num('amount',type==='lunch'?'Стоимость обеда':'Сумма'),...(type==='lunch'?[]:[choice('accountId',type==='income'?'Куда поступили':'Откуда оплатили',[...(args.requireAccount?[]:[['','Без счёта']]),...accounts(d,a=>args.accountCurrency?(a.currency||'RUB')===args.accountCurrency:!args.quickInput||(a.currency||'RUB')===(values.currency||'RUB'))]),...(type==='expense'?[choice('cat','Категория',cats(d))]:[]),choice('currency','Валюта суммы',currencies(d),{default:old?.currency||d.accounts.find(a=>a.id===values.accountId)?.currency||'RUB',advanced:true}),choice('paymentMethod','Способ оплаты',[['card','Карта'],['sbp','СБП'],['cash','Наличные'],['bank','Перевод'],['unknown','Не указан']],{default:old?.paymentMethod||'unknown',advanced:true})]),...common.map(f=>f.key==='note'?{...f,default:type==='lunch'?'Обед компании':type==='income'?'Доход':'Покупка'}:f)];}
 if(op==='account')return [text('name','Название'),choice('kind','Тип',[['regular','Повседневный счёт'],['savings','Накопления'],['deposit','Вклад']],{default:args.savings?'savings':'regular'}),choice('currency','Валюта',currencies(d),{default:'RUB'}),...(values.kind&&values.kind!=='regular'?[choice('funding','Откуда накопления',[['existing','Уже отложено — указать остаток'],['transfer','Отложить с моего счёта']],{default:'existing'})]:[]),...(values.kind!=='regular'&&values.funding==='transfer'?[choice('from','Откуда отложить',accounts(d,a=>!isSavings(a)&&(a.currency||'RUB')===(values.currency||'RUB'))),num('amount','Сколько отложить'),date('date','Дата перевода',{default:today})]:[num('balance','Уже имеющийся остаток',{default:0})]),choice('storageKind','Где хранятся деньги',[['bank','В банке'],['cash','Наличными'],['other','Другое']],{default:'bank'}),...(values.kind==='deposit'?[num('annualRate','Годовая ставка, %',{optional:true,default:''}),date('maturityDate','Дата окончания',{optional:true,default:''})]:[])];
 if(op==='rename')return [text('name','Новое название')];
 if(op==='classify')return [choice('kind','Тип накоплений',[['savings','Накопления'],['deposit','Вклад']]),choice('storageKind','Где хранятся деньги',[['bank','В банке'],['cash','Наличными'],['other','Другое']],{default:'bank'}),num('annualRate','Годовая ставка, %',{optional:true,default:''}),date('maturityDate','Дата окончания',{optional:true,default:''})];
 if(op==='reconcile')return [num('balance','Остаток сейчас'),text('note','Комментарий',{optional:true,default:''})];
 if(op==='transfer')return [choice('from','Откуда',accounts(d)),choice('to','Куда',accounts(d)),num('amount','Сумма'),num('fee','Комиссия',{default:0}),...common];
 if(op==='moveSavings')return [choice('accountId',args.direction==='save'?'Откуда отложить':'Куда вернуть',accounts(d,a=>!isSavings(a))),num('amount','Сумма'),date('date','Дата',{default:today})];
 if(op==='goal')return [text('name','На что копим'),num('target','Нужно накопить'),choice('accountId','Где отложено',accounts(d,a=>isSavings(a)&&!d.goals.some(g=>g.accountId===a.id)&&!(d.wishes||[]).some(w=>!w.done&&w.accountId===a.id))),date('targetDate','К какой дате',{optional:true,default:''})];
 if(op==='fundGoal')return [choice('from','Откуда',accounts(d)),num('amount','Сумма'),date('date','Дата',{default:today})];
 if(op==='wish')return [text('name','Что хочется купить'),choice('priority','Приоритет',[['main','Основной'],['secondary','Второстепенный']],{default:'main'}),num('target','Сумма (0 — решу позже)',{default:0}),choice('currency','Валюта',currencies(d),{default:'RUB'}),choice('accountId','Связать с накоплениями',[['','Пока без привязки'],...availableWishAccounts(d,args.id).map(a=>[a.id,a.name])],{default:''}),text('note','Заметка',{optional:true,default:''})];
 if(op==='debt')return [text('person','Кому / кто должен'),choice('type','Направление',[['my','Я должен'],['tome','Мне должны'],['transit','Передать дальше']]),num('amount','Уже существующий долг'),choice('currency','Валюта',currencies(d),{default:'RUB'}),date('dueDate','Вернуть до',{optional:true,default:''}),text('note','Комментарий',{optional:true,default:''})];
 if(op==='debtDate')return [date('dueDate','Срок возврата',{optional:true,default:''})];
 if(op==='repay'){const debt=source(d,args,'id',d.debts);return [num('amount','Сумма возврата',{default:debtRemaining(debt,d)}),choice('accountId',debt.type==='tome'?'Куда поступили':'Откуда вернул',accounts(d,a=>(a.currency||'RUB')===(debt.currency||'RUB'))),date('date','Дата',{default:today})];}
 if(op==='linkDebt'){const debt=source(d,args,'id',d.debts);return [choice('transactionId','Уже записанная операция',d.transactions.filter(t=>canLinkDebtTransaction(t,debt)&&t.amount<=debtRemaining(debt,d)&&t.date<=today).sort((a,b)=>b.date.localeCompare(a.date)).map(t=>[t.id,`${t.date} · ${t.amount} · ${t.note||''}`]))];}
 if(op==='plan')return [text('name','Название'),choice('type','Направление',[['expense','Расход'],['income','Доход']],{default:'expense'}),...(values.type==='income'?[choice('variable','Сумма пока неизвестна?',yesno,{default:false})]:[]),...(values.type==='income'&&values.variable?[]:[num('amount','Сумма')]),choice('accountId','Счёт',accounts(d)),choice('cat','Категория',cats(d),{default:'other'}),choice('frequency','Как часто',[['monthly','Каждый месяц'],['once','Один раз'],['weekly','Каждую неделю'],['daily','Каждый день']],{default:args.once?'once':'monthly'}),date('startDate','Первая дата',{default:today}),...(values.frequency==='monthly'&&values.type!=='income'?[choice('billingMonthOffset','За какой месяц оплата?',[[0,'За месяц выбранной даты'],[-1,'За предыдущий месяц']],{default:0,advanced:true})]:[])];
 if(op==='confirmPlan'){const r=source(d,args,'id',d.recurring);return [choice('changed','Изменилась ли сумма?',yesno,{default:!!r.variable}),...(values.changed||r.variable?[num('amount','Фактическая сумма'),choice('saveRecurringAmount','Использовать сумму в будущем?',yesno,{default:false})]:[]),...(r.type==='income'?[choice('recurringPartial','Это часть дохода, остальное ещё ожидается?',yesno,{default:false})]:[]),date('date','Дата фактической оплаты',{default:today})];}
 if(op==='installment')return [text('name','За что платишь?',{hint:'Например: телефон или заказ в Маркете. Добавим только будущие платежи — деньги сейчас не спишутся.'}),choice('obligationKind','Тип графика',[['installment','Рассрочка'],['split','Сплит'],['loan','Кредит'],['mortgage','Ипотека']]),choice('cadence','Как часто списывают деньги?',[['monthly','Раз в месяц'],['biweekly','Каждые 2 недели'],['weekly','Каждую неделю']],{default:'monthly',hint:'Частоту возьми из графика банка или сервиса.'}),num('total','Сколько ещё осталось заплатить?',{hint:'Только неоплаченная часть, включая известные проценты и комиссии. Например: из 12 000 уже оплатил 3 000 — введи 9 000.'}),text('count','Сколько платежей ещё осталось? (1–600)',{type:'integer',hint:'Уже оплаченные части не считай. Остаток разделим поровну.'}),date('firstDate','Дата ближайшего неоплаченного платежа',{default:today,hint:'Следующее списание по графику банка, а не дата покупки.'}),choice('accountId','С какого счёта платить?',accounts(d)),choice('cat','Категория расходов',cats(d),{default:'other',advanced:true})];
 if(op==='payInstallment'){const plan=source(d,args,'id',d.installments||[]),payment=plan.payments.find(p=>p.id===args.paymentId);return [num('amount','Фактическая сумма (можно частично)',{default:installmentRemaining(d,payment),advanced:true}),choice('accountId','Откуда оплатил',accounts(d,a=>(a.currency||'RUB')===plan.currency),{default:plan.accountId,advanced:true}),date('date','Фактическая дата оплаты',{default:today,hint:payment.date>today?'Досрочная оплата. По графику: '+payment.date:''})];}
 if(op==='limit')return [choice('cat','Категория',cats(d)),num('amount','Лимит, ₽ (0 — убрать)')];
 if(op==='category')return [text('name','Название категории')];
 if(op==='rate')return [choice('currency','Валюта',currencies(d).filter(([c])=>c!=='RUB')),num('rate','Рублей за единицу валюты')];
 if(op==='dayOff')return [date('date','Дата',{default:today}),choice('ratio','Работал в этот день?',[[1,'Да · полный день'],[0.5,'Да · полдня'],[0,'Нет · выходной / отпуск'],['reset','Как в обычном графике']],{hint:'Можно отметить работу в выходной или праздник. Лимит на обед добавится один раз за эту дату.'})];
 if(op==='calculator')return [text('items','Блюда: каждое с новой строки, например Суп;150;1',{type:'items'})];
 if(op==='setting'){const s=Object.values(SETTING_GROUPS).flat().find(([k])=>k===args.key);if(!s)throw Error('Настройка не найдена');let options=s[2]==='bool'?yesno:s[2]==='style'?[['calm','Спокойный'],['funny','С юмором'],['rough','Пожёстче'],['custom','Свой текст']]:s[2]==='calendar'?[['ru-production','Производственный РФ'],['weekly','Свой недельный график']]:null;return [text('value',s[1],{type:options?'choice':s[2],...(options?{choices:options}:{}),optional:['text','date'].includes(s[2]),default:d.settings[args.key]??''})];}
 if(op==='importRow'){const type=values.type||'expense';return [choice('type','Тип',[['expense','Расход'],['income','Доход'],['transfer','Перевод'],['lunch','Обед компании']]),date('date','Дата'),num('amount','Сумма'),choice('currency','Валюта',currencies(d)),...(type==='lunch'?[]:type==='transfer'?[choice('from','Откуда',accounts(d)),choice('to','Куда',accounts(d)),num('fee','Комиссия',{default:0})]:[choice('account','Счёт',accounts(d)),...(type==='expense'?[choice('category','Категория',cats(d))]:[])]),text('note','Описание',{optional:true,default:''})];}
 if(op==='search')return [text('query','Название, дата ГГГГ-ММ-ДД или сумма')];
 if(op==='feedback')return [text('message','Что исправить или улучшить?',{max:2000})];
 if(op==='import'){
  let mapping=[];const json=values.content?.trim().startsWith('{')||values.content?.trim().startsWith('```');
  if(json){try{const doc=parseImportJson(values.content),sources=importAccountSources(doc).filter(x=>!resolveImportAccount(d,x.name));mapping=sources.flatMap((x,i)=>[choice('map_'+i,'Счёт в файле: '+x.name,[...accounts(d),['new-regular','Создать повседневный'],['new-savings','Создать накопления'],['new-deposit','Создать вклад']]),...(String(values['map_'+i]||'').startsWith('new-')?[num('map_balance_'+i,'Текущий остаток '+x.name,{default:0})]:[])]);}catch{}}
  return [text('content','Пришли JSON/CSV файлом или текстом',{type:'document',max:2_000_000}),...(json?mapping:[choice('accountId','Счёт выписки',accounts(d))]),choice('affectBalances','Изменять текущие остатки?',[[false,'Нет, это старая история'],[true,'Да, изменить остатки']],{default:false})];
 }
 if(op==='restore')return [text('content','Пришли полный JSON-бэкап файлом',{type:'document',max:5_000_000}),text('ack','Для замены бюджета напиши ВОССТАНОВИТЬ')];
 return [];
}
export function parseField(field,value){
 if(field.type==='choice'){const hit=field.choices.find(([v])=>String(v)===String(value));if(!hit)throw Error('Выбери вариант кнопкой');return hit[0];}
 const s=String(value??'').trim();if(!s&&field.optional)return field.default??'';if(!s)throw Error('Поле не может быть пустым');if(s.length>(field.max||1000))throw Error('Слишком длинный текст');
 if(field.type==='money'){const n=parseMoney(s);if(!Number.isFinite(n))throw Error('Сумма: число, не больше двух знаков после запятой');return n;}
 if(field.type==='integer'){if(!/^\d{1,6}$/.test(s))throw Error('Нужно целое число');return Number(s);}
 if(field.type==='date'){if(!validDate(s))throw Error('Дата в формате ГГГГ-ММ-ДД');}
 if(field.type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Время в формате ЧЧ:ММ');
 if(field.type==='zone'&&!validZone(s))throw Error('Нужен часовой пояс, например Europe/Moscow');
 if(field.type==='days'){const days=s.split(/[,\s]+/).map(Number);if(!days.length||new Set(days).size!==days.length||days.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('Дни от 0 до 6 через запятую');return days;}
 return s;
}
export function applyBotAction(d,op,args={},v={}){
 const today=todayMoscow(d.settings.timeZone);
 if(op==='tx'){validateLunchEntry(d,args,v);if(v.date>today)throw Error('Будущую операцию запиши как план');const old=args.id?source(d,args,'id',d.transactions):null,type=old?.type||args.type||'expense',a=d.accounts.find(a=>a.id===v.accountId);return putTransaction(d,{...old,...v,...(args.lunchCheckDay?{_lunchCheckDay:args.lunchCheckDay}:{}),type,cat:type==='lunch'?'lunch':type==='income'?'income':v.cat||'other',currency:type==='lunch'?'RUB':v.currency||old?.currency||a?.currency||'RUB',tags:old?.tags||v.tags||(args.ownLunch?['обед-за-свои']:[]),accountId:type==='lunch'?undefined:v.accountId});}
 if(op==='installmentChange')return changeInstallmentPayment(d,args.id,v.paymentId,v);
 if(op==='installmentReturn')return installmentReturnStatus(d,args.id,v.status);
 if(op==='installmentRefund')return refundInstallment(d,args.id,{...v,id:args.newId});
 if(op==='notificationMode')return {...d,settings:{...d.settings,notificationMode:args.mode}};
 if(op==='lunchAnswer')return setLunchAnswer(d,args.day,args.status);
 if(op==='reschedulePlan')return reschedulePlanned(d,args.id,args.period,v.date,today);
 if(op==='paymentReminder')return setPaymentReminder(d,'plan:'+args.id+':'+args.period,v.date,v.time);
 if(op==='editTransfer')return updateTransfer(d,{...v,id:args.id});
 if(op==='reverseTransfer')return reverseTransfer(d,args.id,v);
 if(op==='deleteTx')return deleteTransaction(d,args.id);
 if(op==='repeat'){const t=source(d,args,'id',d.transactions);return putTransaction(d,repeatEntry(d,t,today,CATEGORIES.concat(d.customCats||[])));}
 if(op==='undo')return undoTransaction(d,source(d,args,'id',d.history));
 if(op==='account')return v.kind==='regular'?{...d,accounts:[...d.accounts,{id:args.newId,...accountInput(v)}]}:createSavings(d,{...v,id:args.newId,from:v.funding==='transfer'?v.from:''});
 if(op==='rename'){if(!v.name?.trim())throw Error('Введите название');source(d,args,'id',d.accounts);return {...d,accounts:d.accounts.map(a=>a.id===args.id?{...a,name:v.name.trim()}:a)};}
 if(op==='classify')return classifySavings(d,{id:args.id,...v});
 if(op==='reconcile')return reconcileAccount(d,{accountId:args.id,...v,date:today});
 if(op==='transfer')return transferMoney(d,v);
 if(op==='moveSavings')return moveSavings(d,{savingsId:args.id,direction:args.direction,...v});
 if(op==='goal')return createGoal(d,v);
 if(op==='fundGoal')return fundGoal(d,{goalId:args.id,...v});
 if(op==='wish')return saveWish(d,{...v,...(args.id?{id:args.id}:{})});
 if(op==='wishDone')return completeWish(d,args.id,args.done);
 if(op==='debt')return createDebt(d,v);
 if(op==='repay'||op==='linkDebt')return repayDebt(d,{id:args.id,...v});
 if(op==='debtDate')return setDebtDueDate(d,{id:args.id,...v});
 if(op==='plan'){const {dueDay,...input}=v;return args.id?updatePlanned(d,args.id,input):createPlanned(d,input);}
 if(op==='confirmPlan'){const tx=preparePlanned(d,args.id,args.period,today,v.changed);return putTransaction(d,{...tx,...v,amount:v.changed||d.recurring.find(r=>r.id===args.id)?.variable?v.amount:tx.amount});}
 if(op==='skipPlan')return skipPlanned(d,args.id,args.period);
 if(op==='pausePlan'){source(d,args,'id',d.recurring);return {...d,recurring:d.recurring.map(r=>r.id===args.id?{...r,active:!r.active}:r)};}
 if(op==='deletePlan')return deletePlanned(d,args.id);
 if(op==='installment')return createInstallment(d,v);
 if(op==='payInstallment'&&v.date>today)throw Error('Подтверди платёж после фактической оплаты');
 if(op==='payInstallment')return payInstallment(d,{planId:args.id,paymentId:args.paymentId,...v});
 if(op==='limit'){if(v.amount<0)throw Error('Лимит не может быть отрицательным');return {...d,categoryBudgets:{...d.categoryBudgets,[v.cat]:v.amount}};}
 if(op==='category'){if(!v.name?.trim())throw Error('Введите название');return {...d,customCats:[...d.customCats,{id:args.newId,name:v.name.trim(),icon:'other',color:'#b8dec4'}]};}
 if(op==='rate'){if(v.currency==='RUB')throw Error('Базовый курс рубля всегда 1');if(v.rate<=0)throw Error('Курс должен быть положительным');return {...d,rates:{...d.rates,[v.currency]:v.rate}};}
 if(op==='module')return setModule(d,args.key,args.enabled);
 if(op==='homeLayout')return customizeHome(d,args);
 if(op==='setting'){const settings=reminderSettingsFromDraft({...d.settings,[args.key]:v.value});return {...d,settings:{...settings,...(args.key==='expenseCheckEnabled'&&v.value?{checkStartedDate:today}:{}),reminders:false}};}
 if(op==='dayOff')return setLunchWorkday(d,v.date,v.ratio==='reset'?'calendar':v.ratio);
 if(op==='import')return commitBotImport(d,v,args);
 if(op==='restore'){if(v.ack!=='ВОССТАНОВИТЬ')throw Error('Напиши ВОССТАНОВИТЬ для подтверждения');const b=JSON.parse(v.content);if(!b.settings||!b.rates||!Array.isArray(b.accounts)||!Array.isArray(b.transactions))throw Error('Нужен полный бэкап');return migrateData(b,EMPTY);}
 throw Error('Действие не найдено');
}
export function botImportPreview(d,v,args={}){
 const content=v.content.trim();if(content.startsWith('{')||content.startsWith('```')){const original=parseImportJson(content),bindings={...args.bindings},sources=importAccountSources(original).filter(x=>!resolveImportAccount(d,x.name));sources.forEach((source,i)=>{const value=v['map_'+i];if(!value)return;bindings[source.key]=String(value).startsWith('new-')?{create:{id:crypto.randomUUID(),name:source.name,kind:value.slice(4),balance:v['map_balance_'+i]??0}}:{existing:value};});const bound=prepareImportAccounts(d,original,bindings,args),rows=previewJsonImport(bound.data,bound.doc,args);return {...bound,original,rows,json:true,sources:importAccountSources(original).filter(s=>!bindings[s.key]&&!resolveImportAccount(d,s.name))};}
 return {data:d,rows:previewImport(d,content,v.accountId),json:false,sources:[]};
}
export function commitBotImport(d,v,args={}){const p=botImportPreview(d,v,args);if(p.sources.length)throw Error('Сначала сопоставь счета');if(p.json)return commitJsonImport(p.data,p.doc,{affectBalances:v.affectBalances,excluded:args.excluded||[],forced:args.forced||[]});return commitImport(d,p.rows.map(r=>({...r,force:args.forced?.includes(r.line)})).filter(r=>!args.excluded?.includes(r.line)),{affectBalances:v.affectBalances});}
export function initialValues(d,op,args){let old;if(op==='tx'&&args.id)old=d.transactions.find(t=>t.id===args.id);if(op==='wish'&&args.id)old=(d.wishes||[]).find(t=>t.id===args.id);if(op==='editTransfer'&&args.id)old=d.transfers.find(t=>t.id===args.id);if(op==='plan'&&args.id)old=d.recurring.find(t=>t.id===args.id);return old?{...old}:{};}
