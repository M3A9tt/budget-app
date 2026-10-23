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
const require=createRequire(import.meta.url),bundle=buildSync({stdin:{contents:"export {default as AppErrorBoundary} from './src/AppErrorBoundary.jsx';export {default as PlannedOperations} from './src/PlannedOperations.jsx';export {default as PlannedForm} from './src/PlannedForm.jsx';export {default as PaymentsPage} from './src/PaymentsPage.jsx';export {default as LunchPage} from './src/LunchPage.jsx';export {default as AccountsPage} from './src/AccountsPage.jsx';export {default as EntryComposer} from './src/EntryComposer.jsx';export {BudgetHero,HomeAccounts} from './src/Insights.jsx';export {AccountTools} from './src/FinancePanels.jsx';export {default as AnalyticsPage} from './src/AnalyticsPage.jsx';export {default as MoneyCalendar} from './src/MoneyCalendar.jsx';export {default as InstallmentCards} from './src/InstallmentCards.jsx';export {default as TransferForm} from './src/TransferForm.jsx';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom'],define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
const ctx={module:{exports:{}},exports:{},require,Intl,Date,console,structuredClone,window:{scrollTo:()=>{}},crypto:globalThis.crypto};ctx.exports=ctx.module.exports;vm.runInNewContext(bundle,ctx);const ui=ctx.module.exports;
const state=()=>({...structuredClone(EMPTY),accounts:[{id:'zero',name:'Пустой счёт',balance:0,currency:'RUB'},{id:'small',name:'Малый счёт',balance:100,currency:'RUB'},{id:'fx',name:'Доллары',balance:20,currency:'USD'},{id:'large',name:'Большой счёт',balance:1000,currency:'RUB'},{id:'reserve',name:'Резервный счёт',balance:3000,currency:'RUB',savingsKind:'deposit'}]});
const text=x=>typeof x==='string'?x:Array.isArray(x)?x.map(text).join(''):x?.children?text(x.children):'';

const labelText=node=>node.findAllByType('span').map(x=>x.children.filter(c=>typeof c==='string').join('')).join(' ')+node.children.filter(c=>typeof c==='string').join('');
function mount(name,props){let view;act(()=>{view=TestRenderer.create(React.createElement(ui[name],props));});return view;}
function click(view,predicate){const target=view.root.findAllByType('button').find(predicate);assert.ok(target,'Expected button');act(()=>target.props.onClick());}
test('Payments use one-level sections, retain the extra calendar, and open shared drafts without changing money',()=>{
 const data=state(),today=todayMoscow();data.recurring=[{id:'due',name:'ЖКХ',frequency:'monthly',startDate:today,dueDay:Number(today.slice(-2)),amount:100,currency:'RUB',accountId:'large',cat:'housing',type:'expense',active:true}];const before=structuredClone(data);let draft;
 const v=mount('PaymentsPage',{data,cats:CATEGORIES,onPrepare:d=>draft=d});
 const nav=v.root.findByProps({'aria-label':'Разделы платежей'});assert.deepEqual(nav.findAllByType('button').map(b=>text(b)),['Ближайшие','Сплиты и кредиты','Регулярные','Разовые','Долги']);assert.equal(v.root.findAllByProps({className:'payment-source-grid'}).length,0);assert.equal(v.root.findAllByProps({className:'money-calendar '}).length,0);
 click(v,b=>b.props.className==='upcoming-payment');assert.equal(draft.recurringId,'due');assert.equal(draft.amount,'100');assert.deepEqual(data,before);
 click(v,b=>text(b)==='Календарь');assert.ok(text(v.toJSON()).includes('Хватит ли до дохода?'));click(v,b=>text(b)==='К списку');assert.ok(text(v.toJSON()).includes('Ближайшие 30 дней'));
 click(v,b=>text(b)==='Регулярные');assert.ok(text(v.toJSON()).includes('ЖКХ'));v.unmount();
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
 const panel=v.root.findByProps({id:'spendable-breakdown'}),output=text(panel.toJSON?.()||v.toJSON());assert.ok(output.includes('Всего на этих счетах'));assert.ok(output.includes('Минус предстоящие платежи'));assert.ok(output.includes('Доллары'));assert.ok(!panel.findAllByType('button').some(x=>labelText(x).includes('Резервный счёт')));const bars=panel.findByProps({className:'spendable-bar'}).findAllByType('span');assert.ok(Math.abs(bars.reduce((n,b)=>n+parseFloat(b.props.style.width),0)-100)<1e-8);click(v,x=>x.props.className==='spendable-account');assert.equal(route,'accounts');click(v,x=>x.props['aria-controls']==='spendable-breakdown');assert.equal(v.root.findAllByProps({id:'spendable-breakdown'}).length,0);v.unmount();
});
test('Date opens dishes and amounts; top-up targets exact meal; back returns to monthly table',()=>{
 let d=state();for(const [id,amount,note] of [['first',350,'Суп и салат'],['second',200,'Горячее']])d=putTransaction(d,{id,type:'lunch',cat:'lunch',amount,date:'2026-10-01',note});let draft,selected;const v=mount('LunchPage',{data:d,initialMonth:'2026-10',mutate:()=>{},onAdd:x=>draft=x,onEdit:x=>draft=x,onSelectDate:x=>selected=x});click(v,x=>x.props['aria-label']==='2026-10-01 · блюда и стоимость');let output=text(v.toJSON());assert.ok(output.includes('Суп и салат'));assert.ok(output.includes('Горячее'));assert.ok(output.includes('350'));assert.ok(output.includes('200'));assert.equal(selected,'2026-10-01');assert.equal(v.root.findAllByProps({className:'lunch-day-record'}).length,2);
 const first=v.root.findAllByProps({className:'lunch-day-record'})[0];const top=first.findAllByType('button').find(x=>labelText(x).includes('Доплата'));act(()=>top.props.onClick());assert.equal(draft.lunchId,'first');assert.equal(draft.date,'2026-10-01');assert.equal(draft.type,'expense');click(v,x=>labelText(x).includes('К таблице'));assert.equal(v.root.findAllByType('table').length,1);assert.equal(selected,'');v.unmount();
});
test('Entry account picker orders all regular accounts, makes zero destinations reachable, preserves selected zero',()=>{
 const data=state(),draft={type:'income',amount:'10',date:'2026-10-01',currency:'RUB',accountId:'',note:''};let picked;const props={data,draft,cats:CATEGORIES,busy:false,setDraft:x=>picked=x,onSave:()=>{}};const v=mount('EntryComposer',props);let output=text(v.toJSON());assert.ok(output.indexOf('Доллары')<output.indexOf('Большой счёт'));assert.ok(!output.includes('Пустой счёт'));click(v,x=>labelText(x).includes('Показать нулевые'));click(v,x=>x.props['data-track']==='account_choose'&&labelText(x).includes('Пустой счёт'));assert.equal(picked.accountId,'zero');act(()=>v.update(React.createElement(ui.EntryComposer,{...props,draft:picked})));click(v,x=>labelText(x).includes('Скрыть нулевые'));const selected=v.root.findAllByType('button').find(x=>x.props['data-track']==='account_choose'&&x.props['aria-pressed']);assert.ok(labelText(selected).includes('Пустой счёт'));v.unmount();
});
test('Transfer/reconcile options share ordering and keep zero-balance destinations',()=>{
 const v=mount('AccountTools',{data:state(),action:'transfer',mutate:()=>{}}),selects=v.root.findAllByType('select');for(const select of selects.slice(0,2))assert.deepEqual(select.findAllByType('option').map(x=>x.props.value).filter(Boolean),['reserve','fx','large','small','zero']);v.unmount();
});

test('Readable analytics drills into exact income/category periods and keeps charts secondary',()=>{
 const today=todayMoscow(),data=state();data.transactions=[{id:'food',type:'expense',cat:'food',amount:150,date:today,note:'Продукты'},{id:'salary',type:'income',cat:'income',amount:500,date:today}];let filter,edited;
 const v=mount('AnalyticsPage',{data,onInspect:x=>filter=x,onEdit:x=>edited=x});assert.ok(text(v.toJSON()).includes('Ты потратил'));assert.equal(v.root.findAllByProps({className:'ins-bars'}).length,0);
 click(v,x=>x.props['aria-label']?.startsWith('Расходы '));assert.equal(filter.type,'expense');assert.equal(filter.from,today.slice(0,7)+'-01');assert.equal(filter.to,today);
 const incoming=v.root.findByProps({className:'report-income-row'}).findByType('button');act(()=>incoming.props.onClick());assert.equal(filter.type,'income');
 click(v,x=>labelText(x)==='7 дней');click(v,x=>x.props.className==='report-category');assert.equal(filter.cat,'food');assert.equal(filter.type,'expense');assert.equal(filter.from,new Date(Date.parse(today+'T12:00:00Z')-6*86400000).toISOString().slice(0,10));
 click(v,x=>x.props.className==='report-purchase');assert.equal(edited.id,'food');v.unmount();
});
test('Calendar review changes no balance before the common form and expected income is an explicit scenario',()=>{
 const today=todayMoscow(),data=state();data.settings.nextIncomeDate='';data.recurring=[{id:'due',name:'Свет',active:true,frequency:'once',type:'expense',startDate:today,amount:100,accountId:'large',currency:'RUB',cat:'housing'},{id:'salary',name:'Доход',active:true,frequency:'once',type:'income',startDate:today,amount:500,accountId:'large',currency:'RUB'}];const before=structuredClone(data);let draft;
 const v=mount('MoneyCalendar',{data,onPrepare:x=>draft=x});const amount=()=>text(v.root.findByProps({className:'money-forecast-total'}).findByType('strong').toJSON?.()||{children:v.root.findByProps({className:'money-forecast-total'}).findByType('strong').children});assert.equal(amount(),money(2840));
 const toggle=v.root.findByType('input');act(()=>toggle.props.onChange({target:{checked:true}}));assert.equal(amount(),money(3340));
 click(v,x=>x.props.className==='money-event'&&text(x).includes('Свет'));assert.deepEqual(data,before);click(v,x=>labelText(x)==='Сумма другая');assert.equal(draft.amount,'');assert.equal(draft.recurringId,'due');assert.equal(draft.date,today);assert.deepEqual(data,before);v.unmount();
});

test('Calendar restores horizon, income scenario and chosen date after leaving for a shared form',()=>{
 const today=todayMoscow(),date=new Date(Date.parse(today+'T12:00:00Z')+10*86400000).toISOString().slice(0,10),data=state();data.settings.nextIncomeDate=new Date(Date.parse(today+'T12:00:00Z')+2*86400000).toISOString().slice(0,10);let saved;
 let v=mount('MoneyCalendar',{data,onStateChange:x=>saved=x});click(v,x=>labelText(x)==='Месяц');act(()=>v.root.findByType('input').props.onChange({target:{checked:true}}));click(v,x=>x.props['aria-label']?.startsWith(date+' ·'));
 assert.equal(saved.horizon,'30');assert.equal(saved.income,true);assert.equal(saved.date,date);v.unmount();
 v=mount('MoneyCalendar',{data,initialState:saved});assert.equal(v.root.findByType('input').props.checked,true);assert.equal(v.root.findAllByType('button').find(x=>labelText(x)==='Месяц').props['aria-pressed'],true);assert.equal(v.root.findAllByType('button').find(x=>x.props['aria-label']?.startsWith(date+' ·')).props['aria-pressed'],true);v.unmount();
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
