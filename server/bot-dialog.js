import {lunchBudget} from '../src/lunch-budget.js';
import {CATEGORIES,money,todayMoscow} from '../src/mini-model.js';
import {entryDefaults} from '../src/entry-assist.js';
import {debtRemaining} from '../src/debt-state.js';
import {goalSaved,installmentRemaining} from '../src/finance-tools.js';
export function quickDefaults(data,args){
 const type=args.type||'expense';
 const source=args.accountCurrency?{...data,accounts:data.accounts.filter(a=>(a.currency||'RUB')===args.accountCurrency)}:data;
 return entryDefaults(source,type,todayMoscow(data.settings.timeZone),CATEGORIES.concat(data.customCats||[]));
}
export function compactTransaction(data,p){
 const v=p.values,type=p.values.type||p.args.type||'expense',account=data.accounts.find(a=>a.id===v.accountId),cat=CATEGORIES.concat(data.customCats||[]).find(c=>c.id===v.cat);
 const extra=[];if(type==='lunch'){const day=lunchBudget(data,v.date.slice(0,7),todayMoscow(data.settings.timeZone)).days.find(d=>d.date===v.date);extra.push(...(p.args.recognizedLunch?.parsed?.warning||[]));if(day&&p.args.recognizedLunch)extra.push(`Остаток лимита дня после записи: ${money(day.limit-day.company-Number(v.amount||0))}`);if(day?.ratio===0)extra.push('За эту дату лимит 0 ₽. Если работал, отметь дату: Обеды → Рабочий день / выходной.');}
 return [`${type==='income'?'+':type==='expense'?'−':''}${money(v.amount,v.currency||'RUB')} · ${type==='lunch'?'Обед компании':type==='income'?'Доход':cat?.name||'Другое'}`,
  type==='lunch'?'Оплачивает компания':account?`${account.name} · ${money(account.balance,account.currency)}`:'Без счёта — остатки счетов не изменятся',
  v.note||'',...extra,`${v.date===todayMoscow(data.settings.timeZone)?'Сегодня':v.date}${v.paymentMethod==='sbp'?' · СБП':''}`].filter(Boolean);
}
export function actionDestination(p){if(p.op==='homeLayout')return {name:'homeLayout',args:{}};if(p.op==='module')return {name:'modules',args:{}};
 const id=p.args.id;
 if(p.op==='payInstallment')return {name:'installment',args:{id}};
 if(['repay','linkDebt','debtDate'].includes(p.op))return {name:'debt',args:{id}};
 if(p.op==='fundGoal')return {name:'goal',args:{id}};
 if(['confirmPlan','skipPlan'].includes(p.op))return {name:'plan',args:{id}};
 const origin=p.args.returnTo;
 if(p.op==='deleteTx'&&origin?.name==='transaction')return origin.args?.backTo||{name:'history',args:{}};
 return origin||{name:p.op==='tx'?'history':'home',args:{}};
}
export function actionOutcome(data,p,receipt){
 const entry=receipt.historyId&&data.history.find(h=>h.id===receipt.historyId),tx=entry?.after||entry?.before,lines=[];
 let title=p.op==='undo'?'↩️ Изменение отменено':'✅ Сохранено';
 if(p.op==='dayOff'){const b=lunchBudget(data,p.values.date.slice(0,7),todayMoscow(data.settings.timeZone)),day=b.days.find(d=>d.date===p.values.date);title='✅ Рабочий день обновлён';lines.push(p.values.date,`Лимит на обед: ${money(day.limit)}`,`Лимит месяца: ${money(b.budget)}`);if(day.calendarRatio===0&&day.ratio>0)lines.push('Дополнительный выход включён в лимит один раз.');}
 if(tx){title=`✅ ${tx.note||'Операция'} · ${tx.type==='income'?'+':tx.type==='expense'?'−':''}${money(tx.amount,tx.currency)}`;if(p.op==='deleteTx')title='✅ Операция удалена';const a=data.accounts.find(a=>a.id===tx.accountId);lines.push(a?`${a.name}: ${money(a.balance,a.currency)}`:tx.type==='lunch'?'Оплачивает компания':'Запись без счёта');}
 if(p.op==='deleteTx'&&entry?.relatedBefore?.length){lines.push(`Удалено связанных доплат: ${entry.relatedBefore.length}`);for(const id of new Set(entry.relatedBefore.map(t=>t.accountId).filter(Boolean))){const a=data.accounts.find(x=>x.id===id);if(a)lines.push(`${a.name}: ${money(a.balance,a.currency)}`);}}
 if(p.op==='transfer')for(const id of [p.values.from,p.values.to]){const account=data.accounts.find(a=>a.id===id);if(account)lines.push(`${account.name}: ${money(account.balance,account.currency)}`);}
 if(tx?.balanceEffect==='history-only')lines.push('История · остатки счетов не менялись');
 const debt=data.debts.find(d=>d.id===(tx?.debtId||(['repay','linkDebt'].includes(p.op)?p.args.id:undefined)));if(debt)lines.push(`Осталось ${debt.type==='tome'?'получить':'вернуть'}: ${money(debtRemaining(debt,data),debt.currency)}`);
 const plan=(data.installments||[]).find(i=>i.id===(p.op==='payInstallment'?p.args.id:undefined)||i.payments.some(x=>x.id===tx?.installmentPaymentId));
 if(plan){const remaining=plan.payments.map(x=>({...x,left:installmentRemaining(data,x)}));lines.push(`${plan.name} · осталось ${money(remaining.reduce((n,x)=>n+x.left,0),plan.currency)}`,...remaining.filter(x=>x.left>0).slice(0,3).map(x=>`${x.date} · ${money(x.left,plan.currency)}`));}
 const goal=p.op==='fundGoal'&&data.goals.find(g=>g.id===p.args.id);if(goal)lines.push(`${goal.name}: ${money(goalSaved(data,goal),goal.currency)} из ${money(goal.target,goal.currency)}`);
 return {title,lines,destination:actionDestination(p),undoId:entry?.id};
}
