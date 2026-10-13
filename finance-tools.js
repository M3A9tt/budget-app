import {parseMoney,roundMoney,putTransaction,transferMoney} from './ledger.js';
const id=()=>crypto.randomUUID();
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
const positive=v=>{const n=parseMoney(v);if(!Number.isFinite(n)||n<=0)throw Error('Нужна положительная сумма');return n;};
export function reconcileAccount(data,{accountId,balance,date,note=''}){
 const a=data.accounts.find(a=>a.id===accountId),actual=parseMoney(balance);if(!a||!Number.isFinite(actual)||!validDate(date))throw Error('Проверьте счёт, остаток и дату');
 return {...data,accounts:data.accounts.map(x=>x.id===a.id?{...x,balance:actual,reconciledAt:date}:x),reconciliations:[...(data.reconciliations||[]),{id:id(),accountId,before:a.balance,after:actual,difference:roundMoney(actual-a.balance),date,note,createdAt:new Date().toISOString()}]};
}
export function createGoal(data,{name,target,accountId,targetDate}){
 if(targetDate&&!validDate(targetDate))throw Error('Неверная дата цели');
 if(!name.trim())throw Error('Введите название цели');const a=data.accounts.find(a=>a.id===accountId);if(!a||a.accType!=='savings')throw Error('Выберите накопительный счёт');
 if(data.goals.some(g=>g.accountId===accountId))throw Error('Этот счёт уже связан с целью');
 return {...data,goals:[...data.goals,{id:id(),name:name.trim(),target:positive(target),saved:0,currency:a.currency||'RUB',accountId,targetDate:targetDate||''}]};
}
export function fundGoal(data,{goalId,from,amount,date}){
 const g=data.goals.find(g=>g.id===goalId);if(!g?.accountId)throw Error('У старой цели нет связанного счёта. Создайте цель со счётом');
 return transferMoney(data,{from,to:g.accountId,amount,date,note:'Накопление: '+g.name});
}
export const goalSaved=(data,g)=>g.accountId?data.accounts.find(a=>a.id===g.accountId)?.balance||0:g.saved||0;
export function createInstallment(data,{name,total,count,firstDate,accountId,cat='other'}){
 const amount=positive(total),n=Number(count),account=data.accounts.find(a=>a.id===accountId);
 if(!name.trim()||!Number.isInteger(n)||n<1||n>120||!validDate(firstDate)||!account)throw Error('Проверьте название, дату, счёт и число платежей (1–120)');
 const cents=Math.round(amount*100);if(cents<n)throw Error('Сумма слишком мала для такого числа платежей');
 const anchor=new Date(firstDate+'T12:00:00Z'),payments=Array.from({length:n},(_,i)=>{const start=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+i,1,12)),day=Math.min(anchor.getUTCDate(),new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate());start.setUTCDate(day);return{id:id(),date:start.toISOString().slice(0,10),amount:(Math.floor(cents/n)+(i<cents%n?1:0))/100};});
 return {...data,installments:[...(data.installments||[]),{id:id(),name:name.trim(),total:amount,currency:account.currency||'RUB',accountId,cat,payments}]};
}
export const paidInstallment=(data,p)=>data.transactions.some(t=>t.installmentPaymentId===p.id&&t.type==='expense');
export function payInstallment(data,{planId,paymentId,date}){
 const plan=(data.installments||[]).find(p=>p.id===planId),payment=plan?.payments.find(p=>p.id===paymentId);
 if(!payment||paidInstallment(data,payment))throw Error('Платёж отсутствует или уже проведён');
 return putTransaction(data,{type:'expense',cat:plan.cat,amount:payment.amount,currency:plan.currency,accountId:plan.accountId,date,note:plan.name,installmentPaymentId:payment.id,tags:['рассрочка']});
}
export function forecast(data,today,days=30){
 const past=new Date(today+'T12:00:00Z');past.setUTCDate(past.getUTCDate()-29);const from=past.toISOString().slice(0,10);
 const rows=data.transactions.filter(t=>t.type==='expense'&&t.cat!=='lunch'&&!t.recurringId&&!t.installmentPaymentId&&t.date>=from&&t.date<=today);
 const daily=rows.reduce((n,t)=>n+(t.amountRub??t.amount*(data.rates[t.currency||'RUB']||1)),0)/30;
 let balance=data.accounts.filter(a=>a.accType!=='savings').reduce((n,a)=>n+a.balance*(data.rates[a.currency||'RUB']||1),0)-(data.settings.reserveRub||0),unknown=0;
 const points=[];
 for(let i=1;i<=days;i++){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);let due=0;
 for(const r of data.recurring.filter(r=>r.active)){const day=Math.min(r.dueDay||1,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate());if(d.getUTCDate()===day&&r.lastCreated!==date.slice(0,7)){if(r.variable)unknown++;else due+=r.amount*(data.rates[r.currency||'RUB']||1);}}
 for(const p of data.installments||[])for(const pay of p.payments)if(pay.date===date&&!paidInstallment(data,pay))due+=pay.amount*(data.rates[p.currency]||1);
 balance=roundMoney(balance-daily-due);points.push({date,balance});}
 return {daily:roundMoney(daily),points,unknown,activeDays:new Set(rows.map(t=>t.date)).size,firstNegative:points.find(p=>p.balance<0)?.date};
}
// RFC-style quoted CSV, semicolon/tab/comma delimiters; no evaluation of formulas.
export function csvRows(text){
 text=text.replace(/^\uFEFF/,'');if(text.length>2_000_000)throw Error('Файл больше 2 МБ');
 const line=text.split(/\r?\n/)[0],sep=line.includes(';')?';':line.includes('\t')?'\t':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Незакрытая кавычка CSV');row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);return rows;
}
const fingerprint=t=>JSON.stringify([t.date,roundMoney(t.amount),t.type,t.currency||'RUB',t.accountId||'',(t.note||'').trim().toLowerCase()]);
export function previewImport(data,text,accountId){
 const account=data.accounts.find(a=>a.id===accountId);if(!account)throw Error('Выберите счёт выписки');const rows=csvRows(text),header=rows.shift()?.map(s=>s.trim().toLowerCase());
 if(!header||!['date','amount','note'].every(k=>header.includes(k)))throw Error('Заголовки CSV: date;amount;note;type;paymentMethod;externalId. Расход — отрицательное amount или type=expense.');
 const seen=new Set(data.transactions.map(fingerprint)),external=new Set(data.transactions.filter(t=>t.externalId&&t.accountId===accountId).map(t=>t.externalId));
 return rows.map((row,i)=>{try{const r=Object.fromEntries(header.map((k,j)=>[k,row[j]||'']));const amount=parseMoney(r.amount);if(!validDate(r.date)||!Number.isFinite(amount)||amount===0)throw Error('Неверная дата или сумма');
 if(r.type&&!['expense','income'].includes(r.type))throw Error('Тип должен быть expense или income');if(!r.type&&amount>0)throw Error('Для положительной суммы укажите type=income или expense');
 const t={date:r.date,type:r.type||'expense',amount:Math.abs(amount),note:r.note.trim(),cat:r.type==='income'?'income':'other',currency:account.currency||'RUB',accountId,paymentMethod:r.paymentmethod||'unknown',externalId:r.externalid||undefined,tags:['импорт']};if(!['card','sbp','cash','bank','unknown'].includes(t.paymentMethod))throw Error('Неизвестный способ оплаты');
 const key=fingerprint(t),duplicate=seen.has(key)||(t.externalId&&external.has(t.externalId));seen.add(key);if(t.externalId)external.add(t.externalId);return{line:i+2,transaction:t,duplicate:!!duplicate};
 }catch(e){return{line:i+2,error:e.message};}});
}
export function commitImport(data,rows,{affectBalances=false}={}){
 if(rows.some(r=>r.error))throw Error('Исправьте ошибки выписки до импорта');let next=data;
 for(const row of rows.filter(r=>!r.duplicate)){if(next.transactions.some(t=>fingerprint(t)===fingerprint(row.transaction)||(t.externalId&&t.externalId===row.transaction.externalId&&t.accountId===row.transaction.accountId)))continue;
 next=putTransaction(next,{...row.transaction,balanceEffect:affectBalances?'normal':'history-only'});}
 return next;
}
