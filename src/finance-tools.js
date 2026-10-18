import {cashTimeline} from './finance-events.js';
import {installmentRemaining,paidInstallment,installmentRemainders} from './installment-state.js';
export {installmentRemaining,paidInstallment,installmentRemainders} from './installment-state.js';
import {parseMoney,roundMoney,putTransaction,transferMoney} from './ledger.js';
const id=()=>crypto.randomUUID();
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
const positive=v=>{const n=parseMoney(v);if(!Number.isFinite(n)||n<=0)throw Error('Нужна положительная сумма');return n;};
export function reconcileAccount(data,{accountId,balance,date,note=''}){
 if(date>new Intl.DateTimeFormat('sv-SE',{timeZone:data.settings?.timeZone||'Europe/Moscow'}).format(new Date()))throw Error('Сверка — фактический остаток, выбери сегодняшнюю или прошлую дату');
 const a=data.accounts.find(a=>a.id===accountId),actual=parseMoney(balance);if(!a||!Number.isFinite(actual)||!validDate(date))throw Error('Проверьте счёт, остаток и дату');
 return {...data,accounts:data.accounts.map(x=>x.id===a.id?{...x,balance:actual,reconciledAt:date}:x),reconciliations:[...(data.reconciliations||[]),{id:id(),accountId,before:a.balance,after:actual,difference:roundMoney(actual-a.balance),date,note,createdAt:new Date().toISOString()}]};
}
export function createGoal(data,{name,target,accountId,targetDate}){
 if(targetDate&&!validDate(targetDate))throw Error('Неверная дата цели');
 if(!name.trim())throw Error('Введите название цели');const a=data.accounts.find(a=>a.id===accountId);if(!a||a.accType!=='savings')throw Error('Выберите накопительный счёт');
 if(data.goals.some(g=>g.accountId===accountId)||(data.wishes||[]).some(w=>!w.done&&w.accountId===accountId))throw Error('Этот счёт уже связан с целью');
 return {...data,goals:[...data.goals,{id:id(),name:name.trim(),target:positive(target),saved:0,currency:a.currency||'RUB',accountId,targetDate:targetDate||''}]};
}
export function fundGoal(data,{goalId,from,amount,date}){
 const g=data.goals.find(g=>g.id===goalId);if(!g?.accountId)throw Error('У старой цели нет связанного счёта. Создайте цель со счётом');
 return transferMoney(data,{from,to:g.accountId,amount,date,note:'Накопление: '+g.name});
}
export const goalSaved=(data,g)=>g.accountId?data.accounts.find(a=>a.id===g.accountId)?.balance||0:g.saved||0;
export function createInstallment(data,{name,total,count,firstDate,accountId,cat='other',obligationKind='installment',cadence='monthly'}){
 if(!['installment','split','loan','mortgage'].includes(obligationKind)||!['monthly','weekly','biweekly'].includes(cadence))throw Error('Выберите вид и период платежей');
 const amount=positive(total),n=Number(count),account=data.accounts.find(a=>a.id===accountId);
 if(!name.trim()||!Number.isInteger(n)||n<1||n>600||!validDate(firstDate)||!account)throw Error('Проверьте название, дату, счёт и число платежей (1–600)');
 const cents=Math.round(amount*100);if(cents<n)throw Error('Сумма слишком мала для такого числа платежей');
 const anchor=new Date(firstDate+'T12:00:00Z'),payments=Array.from({length:n},(_,i)=>{const start=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+i,1,12)),day=Math.min(anchor.getUTCDate(),new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate());start.setUTCDate(day);if(cadence!=='monthly')start.setTime(Date.parse(firstDate+'T12:00:00Z')+i*(cadence==='weekly'?7:14)*86400000);return{id:id(),date:start.toISOString().slice(0,10),amount:(Math.floor(cents/n)+(i<cents%n?1:0))/100};});
 return {...data,installments:[...(data.installments||[]),{id:id(),name:name.trim(),obligationKind,cadence,total:amount,currency:account.currency||'RUB',accountId,cat,payments}]};
}
export function payInstallment(data,{planId,paymentId,date}){
 const plan=(data.installments||[]).find(p=>p.id===planId),payment=plan?.payments.find(p=>p.id===paymentId);
 if(!payment||paidInstallment(data,payment))throw Error('Платёж отсутствует или уже проведён');
 return putTransaction(data,{type:'expense',cat:plan.cat,amount:installmentRemaining(data,payment),currency:plan.currency,accountId:plan.accountId,date,note:plan.name,installmentPaymentId:payment.id,tags:['рассрочка']});
}
export function forecast(data,today,days=30){
 if(!Number.isInteger(days)||days<1||days>366)throw Error('Прогноз — от 1 до 366 дней');
 const past=new Date(today+'T12:00:00Z');past.setUTCDate(past.getUTCDate()-29);const from=past.toISOString().slice(0,10);
 const rows=data.transactions.filter(t=>t.type==='expense'&&t.cat!=='lunch'&&!t.recurringId&&!t.installmentPaymentId&&!t.debtId&&t.date>=from&&t.date<=today),daily=rows.reduce((n,t)=>n+(t.amountRub??t.amount*(data.rates[t.currency||'RUB']||1)),0)/30;
 const timeline=cashTimeline(data,today,days,daily),overdue=timeline.points[0].due;
 return {...timeline,points:timeline.points.slice(1),plannedIncome:timeline.plannedIncome,plannedExpense:roundMoney(timeline.points.slice(1).reduce((n,p)=>n+p.due,0)),overdue,daily:roundMoney(daily),activeDays:new Set(rows.map(t=>t.date)).size};
}
// RFC-style quoted CSV, semicolon/tab/comma delimiters; no evaluation of formulas.
export function csvRows(text){
 text=text.replace(/^\uFEFF/,'');if(text.length>2_000_000)throw Error('Файл больше 2 МБ');
 const line=text.split(/\r?\n/)[0],sep=line.includes(';')?';':line.includes('\t')?'\t':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Незакрытая кавычка CSV');row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);return rows;
}
const transferKey=t=>JSON.stringify([t.date,roundMoney(t.amount),t.from,t.to]);
const resolveAccount=(data,value)=>{const hits=data.accounts.filter(a=>a.id===value||a.name.toLocaleLowerCase('ru')===String(value).trim().toLocaleLowerCase('ru'));if(hits.length!==1)throw Error('Укажите точный ID или уникальное название второго счёта');return hits[0];};
const fingerprint=t=>JSON.stringify([t.date,roundMoney(t.amount),t.type,t.currency||'RUB',t.accountId||'',(t.note||'').trim().toLowerCase()]);
export function previewImport(data,text,accountId){
 const account=data.accounts.find(a=>a.id===accountId);if(!account)throw Error('Выберите счёт выписки');const rows=csvRows(text),header=rows.shift()?.map(s=>s.trim().toLowerCase());
 if(!header||!['date','amount','note'].every(k=>header.includes(k)))throw Error('Заголовки CSV: date;amount;note;type;paymentMethod;externalId. Расход — отрицательное amount или type=expense.');
 const transferFees=new Map();const seen=new Set(data.transactions.map(fingerprint)),external=new Set(data.transactions.filter(t=>t.externalId&&t.accountId===accountId).map(t=>t.externalId));
 return rows.map((row,i)=>{try{const r=Object.fromEntries(header.map((k,j)=>[k,row[j]||'']));const amount=parseMoney(r.amount);if(!validDate(r.date)||!Number.isFinite(amount)||amount===0)throw Error('Неверная дата или сумма');
 if(r.type==='transfer'){
  const other=resolveAccount(data,amount<0?(r.toaccountid||r.toaccount):(r.fromaccountid||r.fromaccount));
  if(other.id===accountId||(other.currency||'RUB')!==(account.currency||'RUB'))throw Error('Для перевода нужны разные счета в одной валюте');
  const fee=r.fee?parseMoney(r.fee):0;if(!Number.isFinite(fee)||fee<0)throw Error('Неверная комиссия перевода');
  const transfer={from:amount<0?accountId:other.id,to:amount<0?other.id:accountId,amount:Math.abs(amount),fee,date:r.date,note:r.note.trim(),externalId:r.externalid||undefined};
  const key=transferKey(transfer),existing=(data.transfers||[]).find(t=>transferKey(t)===key);
  if((existing&&(existing.fee||0)!==fee)||(transferFees.has(key)&&transferFees.get(key)!==fee))throw Error('Похожий перевод уже есть с другой комиссией. Сверьте его вручную');
  const duplicate=!!existing||seen.has('transfer:'+key);seen.add('transfer:'+key);transferFees.set(key,fee);
  return{line:i+2,transfer,duplicate,referenceDuplicate:false};
 }
 if(r.type&&!['expense','income'].includes(r.type))throw Error('Тип должен быть expense, income или transfer');if(!r.type&&amount>0)throw Error('Для положительной суммы укажите type=income или expense');
 const t={date:r.date,type:r.type||'expense',amount:Math.abs(amount),note:r.note.trim(),cat:r.type==='income'?'income':'other',currency:account.currency||'RUB',accountId,paymentMethod:r.paymentmethod||'unknown',externalId:r.externalid||undefined,tags:['импорт']};if(!['card','sbp','cash','bank','unknown'].includes(t.paymentMethod))throw Error('Неизвестный способ оплаты');
 const key=fingerprint(t),referenceDuplicate=!!(t.externalId&&external.has(t.externalId)),duplicate=seen.has(key)||referenceDuplicate;seen.add(key);if(t.externalId)external.add(t.externalId);return{line:i+2,transaction:t,duplicate:!!duplicate,referenceDuplicate};
 }catch(e){return{line:i+2,error:e.message};}});
}
export function commitImport(data,rows,{affectBalances=false}={}){
 if(rows.some(r=>r.error))throw Error('Исправьте ошибки выписки до импорта');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:data.settings?.timeZone||'Europe/Moscow'}).format(new Date());
 if(affectBalances&&rows.some(r=>(!r.duplicate||r.force)&&(r.transfer||r.transaction)?.date>today))throw Error('Будущие операции оставьте планами; они не должны менять текущие остатки');
 let next=data;
 for(const row of rows.filter(r=>!r.duplicate||r.force&&!r.referenceDuplicate)){if(row.transfer){if(!row.force&&(next.transfers||[]).some(t=>transferKey(t)===transferKey(row.transfer)))continue;next=transferMoney(next,{...row.transfer,balanceEffect:affectBalances?'normal':'history-only'});continue;}if(next.transactions.some(t=>!row.force&&fingerprint(t)===fingerprint(row.transaction)||(t.externalId&&t.externalId===row.transaction.externalId&&t.accountId===row.transaction.accountId)))continue;
 next=putTransaction(next,{...row.transaction,balanceEffect:affectBalances?'normal':'history-only'});}
 return next;
}
