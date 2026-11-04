import {ICON_CATALOG} from '../src/icon-catalog.js';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {EMPTY,CATEGORIES,dashboard,todayMoscow,money} from '../src/mini-model.js';
import {orderedAccounts,accountTotals} from '../src/account-balances.js';
import {createPlanned,skipPlanned} from '../src/planned-operations.js';
import {putTransaction} from '../src/ledger.js';
const require=createRequire(import.meta.url),bundle=buildSync({stdin:{contents:"export {default as Icon} from './src/mini-icons.jsx';export {default as SymbolPicker} from './src/SymbolPicker.jsx';export {default as CategorySettings} from './src/CategorySettings.jsx';export {default as AppErrorBoundary} from './src/AppErrorBoundary.jsx';export {default as PlannedOperations} from './src/PlannedOperations.jsx';export {default as PlannedForm} from './src/PlannedForm.jsx';export {default as PaymentsPage} from './src/PaymentsPage.jsx';export {default as LunchPage} from './src/LunchPage.jsx';export {default as AccountsPage} from './src/AccountsPage.jsx';export {default as EntryComposer} from './src/EntryComposer.jsx';export {BudgetHero,HomeAccounts} from './src/Insights.jsx';export {AccountTools,GoalTools} from './src/FinancePanels.jsx';export {default as AnalyticsPage} from './src/AnalyticsPage.jsx';export {default as MoneyCalendar} from './src/MoneyCalendar.jsx';export {default as InstallmentCards} from './src/InstallmentCards.jsx';export {default as TransferForm} from './src/TransferForm.jsx';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom'],define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
const ctx={module:{exports:{}},exports:{},require,Intl,Date,console,structuredClone,window:{scrollTo:()=>{},confirm:()=>true},crypto:globalThis.crypto};ctx.exports=ctx.module.exports;vm.runInNewContext(bundle,ctx);const ui=ctx.module.exports;
const state=()=>({...structuredClone(EMPTY),accounts:[{id:'zero',name:'Пустой счёт',balance:0,currency:'RUB'},{id:'small',name:'Малый счёт',balance:100,currency:'RUB'},{id:'fx',name:'Доллары',balance:20,currency:'USD'},{id:'large',name:'Большой счёт',balance:1000,currency:'RUB'},{id:'reserve',name:'Резервный счёт',balance:3000,currency:'RUB',savingsKind:'deposit'}]});
const text=x=>typeof x==='string'?x:Array.isArray(x)?x.map(text).join(''):x?.children?text(x.children):'';

const labelText=node=>node.findAllByType('span').map(x=>x.children.filter(c=>typeof c==='string').join('')).join(' ')+node.children.filter(c=>typeof c==='string').join('');
function mount(name,props){let view;act(()=>{view=TestRenderer.create(React.createElement(ui[name],props));});return view;}
function click(view,predicate){const target=view.root.findAllByType('button').find(predicate);assert.ok(target,'Expected button');act(()=>target.props.onClick());}
test('Payments use one-level sections, retain the extra calendar, and open shared drafts without changing money',()=>{
 const data=state(),today=todayMoscow();data.recurring=[{id:'due',name:'ЖКХ',frequency:'monthly',startDate:today,dueDay:Number(today.slice(-2)),amount:100,currency:'RUB',accountId:'large',cat:'housing',type:'expense',active:true}];const before=structuredClone(data);let draft;
 const v=mount('PaymentsPage',{data,cats:CATEGORIES,onPrepare:d=>draft=d});
 const nav=v.root.findByProps({'aria-label':'Разделы планирования'});assert.deepEqual(nav.findAllByType('button').map(b=>text(b)),['Ближайшие','Сплиты и кредиты','Регулярные','По необходимости','Разовые','Долги']);assert.equal(v.root.findAllByProps({className:'payment-source-grid'}).length,0);assert.equal(v.root.findAllByProps({className:'money-calendar '}).length,0);
 click(v,b=>b.props.className==='upcoming-payment');assert.equal(draft,undefined);assert.deepEqual(data,before);click(v,b=>text(b)==='Записать оплату');assert.equal(draft.recurringId,'due');assert.equal(draft.amount,'100');assert.deepEqual(data,before);
 click(v,b=>text(b)==='Календарь');assert.deepEqual(v.root.findAllByType('h2').map(text),['Календарь']);click(v,b=>text(b)==='К списку');assert.ok(text(v.toJSON()).includes('На 30 дней и ранее без отметки'));
 click(v,b=>text(b)==='Регулярные');assert.ok(text(v.toJSON()).includes('ЖКХ'));
 for(const label of ['Ближайшие','Сплиты и кредиты','Регулярные','По необходимости','Разовые','Долги','Ближайшие']){click(v,b=>text(b)===label);assert.equal(v.root.findAllByProps({className:'payments-management'}).length,1,'one menu after '+label);}
 v.unmount();
});
test('Monthly editor exposes amount, day and account first, preserves paid constraints and previews before saving',()=>{
 let data=createPlanned(state(),{name:'ЖКХ',amount:'100',frequency:'monthly',startDate:todayMoscow(),accountId:'large',cat:'housing',type:'expense'});const rule=data.recurring[0];data=skipPlanned(data,rule.id,todayMoscow().slice(0,7));let saved;
 const v=mount('PlannedForm',{data,cats:CATEGORIES,initial:data.recurring[0],busy:false,save:async values=>{saved=values;return true;}});
 const details=v.root.findByType('details');assert.equal(details.props.open,undefined);assert.equal(details.findByProps({name:'frequency'}).props.disabled,true);assert.equal(details.findByProps({name:'type'}).props.disabled,true);
 assert.ok(!details.findAllByType('input').some(x=>x.props.name==='amount'||x.props.name==='dueDay'));const before=structuredClone(data);
 act(()=>v.root.findByProps({name:'dueDay'}).props.onChange({target:{value:'28'}}));assert.deepEqual(data,before);assert.ok(text(v.toJSON()).includes('28'));
 const accounts=v.root.findByProps({name:'accountId'}).findAllByType('option').map(o=>o.props.value);assert.ok(!accounts.includes('fx'));
 v.unmount();
});
test('Expected income has its own entry and can be drafted with an unknown amount without changing balances',async()=>{
 const data=state(),before=structuredClone(data);let saved;
 const menu=mount('PaymentsPage',{data,cats:CATEGORIES});click(menu,b=>b.props.className==='payments-income-entry');assert.ok(text(menu.toJSON()).includes('Здесь деньги, которые ещё должны прийти'));menu.unmount();
 const v=mount('PlannedForm',{data,cats:CATEGORIES,incomeOnly:true,initial:{frequency:'once'},save:async values=>{saved=values;return true;}});
 act(()=>v.root.findByProps({name:'name'}).props.onChange({target:{value:'Отпускные'}}));act(()=>v.root.findByProps({name:'accountId'}).props.onChange({target:{value:'large'}}));
 act(()=>v.root.findByProps({name:'variable'}).props.onChange({target:{checked:true}}));assert.equal(v.root.findAllByProps({name:'amount'}).length,0);assert.equal(v.root.findAllByProps({name:'type'}).length,0);
 await act(async()=>v.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(saved.type,'income');assert.equal(saved.variable,true);assert.equal(saved.name,'Отпускные');assert.deepEqual(data,before);v.unmount();
});
test('Calendar month navigation preserves scenario state, exposes actual records and never invents a past balance',()=>{
 const today=todayMoscow(),data=state();data.transactions=[{id:'fact',type:'income',date:today,amount:100,currency:'RUB',accountId:'large',note:'Поступивший аванс'}];let saved,opened;
 const v=mount('MoneyCalendar',{data,onStateChange:x=>saved=x,onEdit:t=>opened=t});click(v,b=>b.props.className==='money-event money-fact');assert.equal(opened.id,'fact');
 const forecast=v.root.findByProps({className:'calendar-forecast'});const toggle={open:true};act(()=>forecast.props.onToggle({target:toggle,currentTarget:toggle}));
 click(v,b=>b.props['aria-label']==='Предыдущий месяц');assert.notEqual(saved.month,today.slice(0,7));assert.equal(saved.forecast,true);assert.ok(!text(v.toJSON()).includes('Прогноз после плановых событий:'));assert.ok(text(v.toJSON()).includes('Записанные операции и неподтверждённые планы'));click(v,b=>text(b)==='Сегодня');assert.equal(saved.date,today);assert.equal(v.root.findByProps({'aria-current':'date'}).props['aria-pressed'],true);v.unmount();
});
test('Shared ordering compares currencies, keeps negative balances and does not mutate storage',()=>{
 const d=state();d.accounts.push({id:'negative',name:'Минус',balance:-20,currency:'RUB'});const before=structuredClone(d);assert.deepEqual(orderedAccounts(d).map(a=>a.id),['reserve','fx','large','small','zero','negative']);assert.deepEqual(d,before);assert.equal(accountTotals(d).spendable,2920);assert.equal(dashboard(d,'2026-10-01').balance,2920);
});
test('Account tiles and home strip append zeros with a supplemental SVG disclosure and retain funded accounts',()=>{
 for(const name of ['AccountsPage','HomeAccounts']){const view=mount(name,{data:state(),mutate:()=>{},onOpen:()=>{}});let output=text(view.toJSON());assert.ok(output.indexOf('Доллары')<output.indexOf('Большой счёт'));assert.ok(output.indexOf('Большой счёт')<output.indexOf('Малый счёт'));assert.ok(!output.includes('Пустой счёт'));assert.ok(!output.includes('Резервный счёт'));
 const listClass=name==='AccountsPage'?'account-grid':'ins-account-strip';assert.deepEqual(view.root.findAll(x=>[listClass,'account-visibility'].includes(x.props.className)).map(x=>x.props.className),[listClass,'account-visibility']);const tab=view.root.findAllByType('button').find(x=>labelText(x).includes('Показать нулевые'));assert.ok(tab.findAllByType('svg').length);act(()=>tab.props.onClick());output=text(view.toJSON());assert.ok(output.includes('Пустой счёт'));assert.ok(output.includes('Малый счёт'));assert.ok(!view.root.findAllByType('button').some(x=>labelText(x).includes('С деньгами')));assert.equal(tab.props['aria-expanded'],true);click(view,x=>labelText(x).includes('Скрыть нулевые'));assert.ok(text(view.toJSON()).includes('Доллары'));view.unmount();}
});
test('Zero-account tab stays escapable after its last account receives money',()=>{
 const d=state(),props={data:d,busy:false,mutate:()=>{}},v=mount('AccountsPage',props);click(v,x=>labelText(x).includes('Показать нулевые'));d.accounts[0].balance=50;act(()=>v.update(React.createElement(ui.AccountsPage,{...props,data:{...d}})));click(v,x=>labelText(x).includes('Скрыть нулевые'));assert.ok(text(v.toJSON()).includes('Пустой счёт'));v.unmount();
});
test('Spendable disclosure shows actual account balances, reserves separately and subtracts commitments once',()=>{
 const d=state();d.recurring=[{id:'plan',name:'Платёж',frequency:'once',startDate:'2026-10-19',amount:500,currency:'RUB',active:true,type:'expense'}];let route='';const v=mount('BudgetHero',{data:d,onMore:x=>route=x});assert.equal(v.root.findAllByProps({id:'spendable-breakdown'}).length,0);click(v,x=>x.props['aria-controls']==='spendable-breakdown');
 const panel=v.root.findByProps({id:'spendable-breakdown'}),output=text(panel.toJSON?.()||v.toJSON());assert.ok(text(v.toJSON()).includes('На повседневных счетах'));assert.ok(text(v.toJSON()).includes('Минус будущие расходы'));assert.ok(output.includes('Доллары'));assert.ok(!panel.findAllByType('button').some(x=>labelText(x).includes('Резервный счёт')));const bars=panel.findByProps({className:'spendable-bar'}).findAllByType('span');assert.ok(Math.abs(bars.reduce((n,b)=>n+parseFloat(b.props.style.width),0)-100)<1e-8);click(v,x=>x.props.className==='spendable-account');assert.equal(route,'accounts');click(v,x=>x.props['aria-controls']==='spendable-breakdown');assert.equal(v.root.findAllByProps({id:'spendable-breakdown'}).length,0);v.unmount();
});
test('Date opens dishes and amounts; top-up targets exact meal; back returns to monthly table',()=>{
 let d=state();for(const [id,amount,note] of [['first',350,'Суп и салат'],['second',200,'Горячее']])d=putTransaction(d,{id,type:'lunch',cat:'lunch',amount,date:'2026-10-01',note});let draft,selected;const v=mount('LunchPage',{data:d,initialMonth:'2026-10',mutate:()=>{},onAdd:x=>draft=x,onEdit:x=>draft=x,onSelectDate:x=>selected=x});act(()=>v.root.findAllByType('tr').find(row=>row.findAllByProps({'aria-label':'2026-10-01 · блюда и стоимость'}).length>0).props.onClick());let output=text(v.toJSON());assert.ok(output.includes('Суп и салат'));assert.ok(output.includes('Горячее'));assert.ok(output.includes('350'));assert.ok(output.includes('200'));assert.equal(selected,'2026-10-01');assert.equal(v.root.findAllByProps({className:'lunch-day-record'}).length,2);
 const first=v.root.findAllByProps({className:'lunch-day-record'})[0];const top=first.findAllByType('button').find(x=>labelText(x).includes('Доплата'));act(()=>top.props.onClick());assert.equal(draft.lunchId,'first');assert.equal(draft.date,'2026-10-01');assert.equal(draft.type,'expense');click(v,x=>x.props['aria-label']==='К таблице');assert.equal(v.root.findAllByType('table').length,1);assert.equal(selected,'');v.unmount();
});
test('Entry account picker orders all regular accounts, makes zero destinations reachable, preserves selected zero',()=>{
 const data=state(),draft={type:'income',amount:'10',date:'2026-10-01',currency:'RUB',accountId:'',note:''};let picked;const props={data,draft,cats:CATEGORIES,busy:false,setDraft:x=>picked=x,onSave:()=>{}};const v=mount('EntryComposer',props);let output=text(v.toJSON());assert.ok(output.indexOf('Доллары')<output.indexOf('Большой счёт'));assert.ok(!output.includes('Пустой счёт'));click(v,x=>labelText(x).includes('Показать нулевые'));click(v,x=>x.props['data-track']==='account_choose'&&labelText(x).includes('Пустой счёт'));assert.equal(picked.accountId,'zero');act(()=>v.update(React.createElement(ui.EntryComposer,{...props,draft:picked})));click(v,x=>labelText(x).includes('Скрыть нулевые'));const selected=v.root.findAllByType('button').find(x=>x.props['data-track']==='account_choose'&&x.props['aria-pressed']);assert.ok(labelText(selected).includes('Пустой счёт'));v.unmount();
});
test('Transfer/reconcile options share ordering and keep zero-balance destinations',()=>{
 const v=mount('AccountTools',{data:state(),action:'transfer',mutate:()=>{}}),selects=v.root.findAllByType('select');for(const select of selects.slice(0,2))assert.deepEqual(select.findAllByType('option').map(x=>x.props.value).filter(Boolean),['reserve','fx','large','small','zero']);v.unmount();
});

test('Readable analytics drills into exact income/category periods and keeps charts secondary',()=>{
 const today=todayMoscow(),data=state();data.transactions=[{id:'food',type:'expense',cat:'food',amount:150,date:today,note:'Продукты'},{id:'salary',type:'income',cat:'income',amount:500,date:today}];let filter,edited;
 const v=mount('AnalyticsPage',{data,onInspect:x=>filter=x,onEdit:x=>edited=x});assert.ok(text(v.toJSON()).includes('Расходы за период'));assert.equal(v.root.findAllByProps({className:'ins-bars'}).length,0);
 click(v,x=>x.props['aria-label']?.startsWith('Расходы '));assert.equal(filter.type,'expense');assert.equal(filter.from,today.slice(0,7)+'-01');assert.equal(filter.to,today);
 const incoming=v.root.findByProps({className:'report-income-row'}).findByType('button');act(()=>incoming.props.onClick());assert.equal(filter.type,'income');
 click(v,x=>labelText(x)==='7 дней');click(v,x=>x.props.className==='report-category');assert.equal(filter.cat,'food');assert.equal(filter.type,'expense');assert.equal(filter.from,new Date(Date.parse(today+'T12:00:00Z')-6*86400000).toISOString().slice(0,10));
 click(v,x=>x.props.className==='report-purchase');assert.equal(edited.id,'food');v.unmount();
});
test('Custom analytics dates and a used zero account persist in every drilldown and after remount',()=>{
 const today=todayMoscow(),date=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10),data=state();
 data.transactions=[{id:'now',type:'expense',cat:'food',amount:120,date:today,accountId:'zero'},{id:'past',type:'expense',cat:'food',amount:80,date:date(-7),accountId:'zero'},{id:'other',type:'expense',cat:'food',amount:800,date:today,accountId:'large'}];const before=structuredClone(data);let query,filter;
 let v=mount('AnalyticsPage',{data,onRangeChange:x=>query=x,onInspect:x=>filter=x});act(()=>v.root.findByProps({'aria-label':'Счёт отчёта'}).props.onChange({target:{value:'zero'}}));
 act(()=>v.root.findByProps({'aria-label':'Начало периода'}).props.onChange({target:{value:date(-8)}}));act(()=>v.root.findByProps({'aria-label':'Конец периода'}).props.onChange({target:{value:date(-5)}}));const form=v.root.findAllByType('form').find(f=>f.findAllByProps({'aria-label':'Начало периода'}).length);act(()=>form.props.onSubmit({preventDefault(){}}));
 assert.equal(query.period,'custom');assert.equal(query.accountId,'zero');click(v,b=>b.props.className==='report-category');assert.equal(filter.from,date(-8));assert.equal(filter.to,date(-5));assert.equal(filter.accountId,'zero');assert.equal(filter.cat,'food');assert.deepEqual(data,before);v.unmount();
 v=mount('AnalyticsPage',{data,initialRange:query});assert.equal(v.root.findByProps({'aria-label':'Счёт отчёта'}).props.value,'zero');assert.equal(v.root.findByProps({'aria-label':'Начало периода'}).props.value,date(-8));const total=v.root.findAllByType('button').find(b=>b.props['aria-label']?.startsWith('Расходы '));assert.ok(total.props['aria-label'].includes(money(80)));v.unmount();
});
test('Negative budget distinguishes shortfall from bank balances and keeps savings outside the equation',()=>{
 const data=state(),today=todayMoscow();data.recurring=[{id:'bill',name:'Платёж',type:'expense',active:true,frequency:'once',startDate:today,amount:3440,currency:'RUB',accountId:'large'}];const before=structuredClone(data);let route;
 const v=mount('BudgetHero',{data,onMore:x=>route=x});assert.ok(text(v.toJSON()).includes('На платежи не хватает'));assert.equal(text(v.root.findByProps({className:'ins-hero-amount ins-danger'})),money(500));assert.equal(v.root.findAllByProps({className:'ins-allocation'}).length,0);assert.ok(text(v.root.findByProps({className:'budget-equation'})).includes(money(2940)));assert.ok(text(v.root.findByProps({className:'home-reserve-compact'})).includes(money(3000)));
 click(v,b=>b.props.className==='home-reserve-compact');assert.equal(route,'savings');click(v,b=>b.props['aria-controls']==='spendable-breakdown');assert.ok(!text(v.root.findByProps({id:'spendable-breakdown'})).includes('Резервный счёт'));assert.deepEqual(data,before);v.unmount();
});
test('Calendar review changes no balance before the common form and expected income is an explicit scenario',()=>{
 const today=todayMoscow(),data=state();data.settings.nextIncomeDate='';data.recurring=[{id:'due',name:'Свет',active:true,frequency:'once',type:'expense',startDate:today,amount:100,accountId:'large',currency:'RUB',cat:'housing'},{id:'salary',name:'Доход',active:true,frequency:'once',type:'income',startDate:today,amount:500,accountId:'large',currency:'RUB'}];const before=structuredClone(data);let draft;
 const v=mount('MoneyCalendar',{data,onPrepare:x=>draft=x});const amount=()=>text(v.root.findByProps({className:'money-forecast-total'}).findByType('strong').toJSON?.()||{children:v.root.findByProps({className:'money-forecast-total'}).findByType('strong').children});assert.equal(amount(),money(2840));
 const toggle=v.root.findByProps({type:'checkbox'});act(()=>toggle.props.onChange({target:{checked:true}}));assert.equal(amount(),money(3340));
 click(v,x=>x.props.className==='money-event'&&text(x).includes('Свет'));assert.deepEqual(data,before);click(v,x=>labelText(x)==='Сумма другая');assert.equal(draft.amount,'');assert.equal(draft.recurringId,'due');assert.equal(draft.date,today);assert.deepEqual(data,before);v.unmount();
});

test('Calendar restores horizon, income scenario and chosen date after leaving for a shared form',()=>{
 const today=todayMoscow(),date=new Date(Date.parse(today+'T12:00:00Z')+10*86400000).toISOString().slice(0,10),data=state();data.settings.nextIncomeDate=new Date(Date.parse(today+'T12:00:00Z')+2*86400000).toISOString().slice(0,10);let saved;
 let v=mount('MoneyCalendar',{data,onStateChange:x=>saved=x});click(v,x=>labelText(x)==='Месяц');act(()=>v.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));if(!v.root.findAllByType('button').some(x=>x.props['aria-label']?.startsWith(date+' ·')))click(v,x=>x.props['aria-label']==='Следующий месяц');click(v,x=>x.props['aria-label']?.startsWith(date+' ·'));
 assert.equal(saved.horizon,'30');assert.equal(saved.income,true);assert.equal(saved.date,date);v.unmount();
 v=mount('MoneyCalendar',{data,initialState:saved});assert.equal(v.root.findByProps({type:'checkbox'}).props.checked,true);assert.equal(v.root.findAllByType('button').find(x=>labelText(x)==='Месяц').props['aria-pressed'],true);assert.equal(v.root.findAllByType('button').find(x=>x.props['aria-label']?.startsWith(date+' ·')).props['aria-pressed'],true);v.unmount();
});
test('Installment review opens the shared draft with the remaining sum; paid rows open their actual transaction',()=>{
 const today=todayMoscow(),data=state();data.installments=[{id:'i',name:'Сплит',accountId:'large',currency:'RUB',cat:'tech',payments:[{id:'p',amount:300,date:today}]}];data.transactions=[{id:'part',type:'expense',cat:'tech',amount:100,date:today,currency:'RUB',accountId:'large',installmentPaymentId:'p'}];let draft,edited;
 const before=structuredClone(data),v=mount('InstallmentCards',{data,onPrepare:x=>draft=x,onEdit:x=>edited=x});click(v,x=>labelText(x)==='Проверить платёж');assert.equal(draft.amount,'200');assert.equal(draft.installmentPaymentId,'p');assert.deepEqual(data,before);click(v,x=>labelText(x).includes('открыть запись'));assert.equal(edited.id,'part');v.unmount();
});

test('Linked payment form keeps the source visible and does not offer unrelated quick repeats',()=>{
 const data=state(),today=todayMoscow(),draft={type:'expense',cat:'tech',amount:'200',date:today,currency:'RUB',accountId:'large',note:'Сплит',installmentPaymentId:'p'};
 const v=mount('EntryComposer',{data,draft,cats:CATEGORIES,busy:false,setDraft:()=>{},onSave:()=>{},suggestions:[{id:'coffee',note:'Кофе',amount:180,currency:'RUB'}]});assert.ok(text(v.toJSON()).includes('Платёж по графику'));assert.equal(v.root.findAllByProps({className:'entry-repeat'}).length,0);v.unmount();
});


test('Skipped periods stay in a supplemental disclosure and returning one preserves balances',async()=>{
 let data=createPlanned(state(),{name:'Возврат пропуска',amount:'10',type:'expense',frequency:'once',startDate:todayMoscow(),accountId:'large',cat:'food'});
 const id=data.recurring[0].id;data=skipPlanned(data,id,'once');const balances=structuredClone(data.accounts);
 let view;const props=()=>({data,cats:CATEGORIES,busy:false,onPrepare:()=>{},mutate:async fn=>{data=fn(data);view.update(React.createElement(ui.PlannedOperations,props()));return true;}});
 view=mount('PlannedOperations',props());assert.ok(text(view.toJSON()).includes('Пропущенные периоды · 1'));
 const disclosure=view.root.findByProps({className:'plan-skipped'});assert.equal(disclosure.type,'details');assert.equal(disclosure.props.open,undefined);
 const restore=disclosure.findAllByType('button').find(b=>text(b)==='Вернуть в план');
 await act(async()=>{await restore.props.onClick();});
 assert.deepEqual(data.accounts,balances);assert.equal(data.transactions.length,0);assert.equal(data.recurring[0].skippedPeriods.length,0);
 assert.ok(!text(view.toJSON()).includes('Пропущенные периоды'));
 assert.ok(text(view.toJSON()).includes('Отметить оплату'));view.unmount();
});


test('Render failure offers reload without clearing financial storage or showing exception details',()=>{
 let reloads=0;ctx.window.location={reload:()=>reloads++};
 const original=console.error;console.error=()=>{};
 let view;try{act(()=>{view=TestRenderer.create(React.createElement(ui.AppErrorBoundary,null,React.createElement(()=>{throw Error('private financial payload');})));});}finally{console.error=original;}
 assert.ok(text(view.toJSON()).includes('Не удалось открыть экран'));assert.ok(!text(view.toJSON()).includes('private financial payload'));
 assert.equal(view.root.findByProps({role:'alert'}).type,'main');
 act(()=>view.root.findByType('button').props.onClick());assert.equal(reloads,1);view.unmount();
 const valid=mount('AppErrorBoundary',{children:React.createElement('span',null,'Рабочий экран')});assert.equal(text(valid.toJSON()),'Рабочий экран');valid.unmount();
});

test('Upcoming payment can link a recorded expense or skip an obsolete period without a second debit',async()=>{
 const today=todayMoscow(),offset=n=>new Date(Date.parse(today+'T12:00Z')+n*86400000).toISOString().slice(0,10);
 let data=createPlanned(state(),{id:'old',name:'ЖКХ',frequency:'once',startDate:offset(-1),type:'expense',amount:100,accountId:'large',cat:'housing'});
 data=createPlanned(data,{id:'stale',name:'Старый расход',frequency:'once',startDate:offset(-2),type:'expense',amount:200,accountId:'large',cat:'other'});
 data=createPlanned(data,{id:'future',name:'Будущий план',frequency:'once',startDate:offset(3),type:'expense',amount:50,accountId:'large',cat:'other'});
 data=putTransaction(data,{id:'manual',type:'expense',amount:100,date:offset(-1),cat:'housing',accountId:'large',note:'ЖКХ внесено раньше'});
 const balances=structuredClone(data.accounts),future=structuredClone(data.recurring.find(r=>r.id==='future'));let v;
 const props=()=>({data,cats:CATEGORIES,busy:false,onPrepare:()=>assert.fail('Linking must not prepare a new payment'),mutate:async fn=>{data=fn(data);v.update(React.createElement(ui.PaymentsPage,props()));return true;}});
 v=mount('PaymentsPage',props());
 const search=value=>act(()=>v.root.findByProps({'aria-label':'Найти платёж'}).props.onChange({target:{value}}));
 search('ЖКХ');click(v,b=>b.props.className==='upcoming-payment');click(v,b=>text(b)==='Уже учтено');
 act(()=>v.root.findByType('select').props.onChange({target:{value:'manual'}}));
 await act(async()=>{await v.root.findAllByType('button').find(b=>text(b)==='Связать без списания').props.onClick();});
 assert.deepEqual(structuredClone(data.accounts),balances);assert.equal(data.transactions.length,1);assert.equal(data.transactions[0].recurringId,'old');
 search('Старый');click(v,b=>b.props.className==='upcoming-payment');click(v,b=>text(b)==='Уже учтено');click(v,b=>text(b)==='Учтено в остатке / не нужно');
 assert.ok(text(v.toJSON()).includes('Запись об оплате не появится'));assert.deepEqual(structuredClone(data.accounts),balances);
 await act(async()=>{await v.root.findAllByType('button').find(b=>text(b)==='Неактуально в этом периоде').props.onClick();});
 assert.ok(data.recurring.find(r=>r.id==='stale').skippedPeriods.includes('once'));assert.equal(data.transactions.length,1);assert.deepEqual(structuredClone(data.accounts),balances);assert.deepEqual(structuredClone(data.recurring.find(r=>r.id==='future')),future);v.unmount();
});

test('Payment search and seven-day scope include their exact boundary and never change money',()=>{
 const today=todayMoscow(),offset=n=>new Date(Date.parse(today+'T12:00Z')+n*86400000).toISOString().slice(0,10);
 let data=state();for(const [id,n] of [['old',-1],['today',0],['edge',6],['later',7]])data=createPlanned(data,{id,name:id,frequency:'once',startDate:offset(n),type:'expense',amount:123.5,accountId:'large',cat:'other'});
 const before=structuredClone(data),v=mount('PaymentsPage',{data,cats:CATEGORIES,onPrepare:()=>assert.fail('Searching cannot prepare payment')});
 click(v,b=>text(b).startsWith('7 дней'));let output=text(v.toJSON());assert.ok(output.includes('today'));assert.ok(output.includes('edge'));assert.ok(!output.includes('later'));assert.ok(!output.includes('old'));
 act(()=>v.root.findByProps({'aria-label':'Найти платёж'}).props.onChange({target:{value:'Большой 123,5'}}));assert.equal(v.root.findAllByProps({className:'upcoming-payment'}).length,2);
 act(()=>v.root.findByProps({'aria-label':'Найти платёж'}).props.onChange({target:{value:'не существует'}}));assert.ok(text(v.toJSON()).includes('Ничего не найдено'));
 click(v,b=>text(b)==='Сбросить поиск и фильтр');assert.equal(v.root.findAllByProps({className:'upcoming-payment'}).length,4);assert.deepEqual(data,before);v.unmount();
});

test('Calendar selected day opens shared forms for every source and saves the actual chosen date without debiting',async()=>{
 const today=todayMoscow(),date=new Date(Date.parse(today+'T12:00Z')+2*86400000).toISOString().slice(0,10),changed=new Date(Date.parse(today+'T12:00Z')+7*86400000).toISOString().slice(0,10);let data=state(),v,saved;
 const props=()=>({data,busy:false,onStateChange:x=>saved=x,mutate:async fn=>{data=fn(data);v.update(React.createElement(ui.MoneyCalendar,props()));return true;}});
 v=mount('MoneyCalendar',props());act(()=>v.root.findByProps({'aria-label':'Перейти к дате'}).props.onChange({target:{value:date}}));click(v,b=>text(b)==='Добавить на этот день');
 const kinds=v.root.findByProps({'aria-label':'Что добавить в календарь'});assert.deepEqual(kinds.findAllByType('button').map(b=>text(b)),['Доход','Расход']);
 const planned=v.root.findByType(ui.PlannedForm);assert.equal(planned.props.initial.startDate,date);const balances=structuredClone(data.accounts);
 await act(async()=>{await planned.props.save({id:'calendar-direct',type:'expense',name:'Покупка из календаря',amount:250,frequency:'once',accountId:'large',startDate:changed});});
 assert.deepEqual(data.accounts,balances);assert.equal(data.transactions.length,0);assert.equal(saved.date,changed);assert.ok(text(v.toJSON()).includes('Покупка из календаря'));assert.equal(data.recurring[0].startDate,changed);v.unmount();
});

test('Calendar moves a debt through its source and displays transfers as editable facts with no duplicate keys',async()=>{
 const today=todayMoscow(),future=new Date(Date.parse(today+'T12:00Z')+3*86400000).toISOString().slice(0,10);let data=state(),v,edited;data.debts=[{id:'friend',person:'Друг',type:'my',amount:100,currency:'RUB',dueDate:today,payments:[]}];data.transfers=[{id:'fact',from:'large',to:'small',amount:50,currency:'RUB',date:today}];
 const props=()=>({data,onEdit:tx=>edited=tx,mutate:async fn=>{data=fn(data);v.update(React.createElement(ui.MoneyCalendar,props()));return true;}});v=mount('MoneyCalendar',props());click(v,b=>b.props.className==='money-event money-fact');assert.equal(edited.type,'transfer');assert.equal(edited.id,'fact');click(v,b=>b.props.className==='money-event'&&text(b).includes('Друг'));click(v,b=>text(b)==='Перенести дату');act(()=>v.root.findByProps({'aria-label':'Новая дата'}).props.onChange({target:{value:future}}));
 await act(async()=>{await v.root.findByProps({className:'mini-form occurrence-date-form'}).props.onSubmit({preventDefault(){}});});assert.equal(data.debts[0].dueDate,future);assert.equal(data.transactions.length,0);assert.equal(data.accounts.find(a=>a.id==='large').balance,1000);v.unmount();
});


test('Calendar can create another irregular template when saved templates already exist',()=>{
 const data=createPlanned(state(),{id:'saved',name:'Сохранённый',type:'expense',frequency:'manual',amount:100,accountId:'large'}),today=todayMoscow(),v=mount('MoneyCalendar',{data,mutate:()=>assert.fail('Choosing a form must not save')});click(v,b=>text(b)==='Добавить на этот день');const kinds=v.root.findByProps({'aria-label':'Что добавить в календарь'});act(()=>v.root.findByProps({label:'Как учесть'}).props.onChange('manual'));assert.ok(v.root.findByProps({'aria-label':'Сохранённая операция'}));click(v,b=>text(b)==='Создать другую операцию');assert.equal(v.root.findByType(ui.PlannedForm).props.initial.frequency,'manual');assert.equal(v.root.findByType(ui.PlannedForm).props.initial.startDate,today);click(v,b=>text(b)==='Выбрать сохранённую операцию');assert.ok(v.root.findByProps({'aria-label':'Сохранённая операция'}));v.unmount();
});

test('Every local gallery symbol renders its SVG; untrusted names cannot reach arbitrary object properties',()=>{
 for(const item of ICON_CATALOG){const v=mount('Icon',{name:item.id});assert.equal(v.root.findByType('svg').props['data-icon'],item.id);v.unmount();}
 for(const name of ['constructor','__proto__','https://example.com/icon.svg','<svg onload=alert(1)>']){const v=mount('Icon',{name});assert.equal(v.root.findByType('svg').props['data-icon'],'other');v.unmount();}
 let chosen;const v=mount('SymbolPicker',{value:{icon:'food',emoji:'🍔'},onChange:value=>chosen=value});click(v,b=>b.props['aria-label']==='Значок: Кофе');assert.equal(chosen.icon,'coffee');assert.equal(chosen.emoji,'');v.unmount();
});
test('An unsuccessful category save retains its name, selected SVG and color for retry',async()=>{
 const data=state(),before=structuredClone(data),v=mount('CategorySettings',{data,busy:false,mutate:async()=>false});
 act(()=>v.root.findByProps({'aria-label':'Название категории'}).props.onChange({target:{value:'Кофе с собой'}}));
 click(v,b=>b.props['aria-label']==='Значок: Кофе');
 act(()=>v.root.findByProps({type:'color'}).props.onChange({target:{value:'#aabbcc'}}));
 await act(async()=>v.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(v.root.findByProps({'aria-label':'Название категории'}).props.value,'Кофе с собой');
 assert.equal(v.root.findByProps({type:'color'}).props.value,'#aabbcc');
 assert.equal(v.root.findAllByType('button').find(b=>b.props['aria-label']==='Значок: Кофе').props['aria-pressed'],true);
 assert.deepEqual(data,before);v.unmount();
});

test('Goal funding appears only for a goal with an existing linked account and never changes money on opening',()=>{
 const data=state(),before=structuredClone(data);let v=mount('GoalTools',{data,mutate:()=>{throw Error('Opening must not save');}});
 assert.equal(v.root.findAllByType('button').some(n=>text(n)==='Отложить на цель'),false);v.unmount();
 const linked={...data,goals:[{id:'g',name:'Камера',accountId:'reserve',target:5000,currency:'RUB'}]};v=mount('GoalTools',{data:linked,mutate:()=>{throw Error('Opening must not save');}});
 assert.equal(v.root.findAllByType('button').some(n=>text(n)==='Отложить на цель'),true);v.unmount();
 const missing={...data,goals:[{id:'g',name:'Старая цель',accountId:'gone',target:5000,currency:'RUB'}]};v=mount('GoalTools',{data:missing,mutate:()=>{throw Error('Opening must not save');}});
 assert.equal(v.root.findAllByType('button').some(n=>text(n)==='Отложить на цель'),false);v.unmount();assert.deepEqual(data,before);
});
