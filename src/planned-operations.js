import {parseMoney} from './ledger.js';
import {plannedOccurrences,planType,plannedPaid} from './planned-model.js';
export function createPlanned(data,values){
 const account=data.accounts.find(a=>a.id===values.accountId),amount=parseMoney(values.amount),date=values.startDate;
 if(!account||!values.name?.trim()||!Number.isFinite(amount)||amount<=0||!['expense','income'].includes(values.type)||!['daily','weekly','monthly','once'].includes(values.frequency)||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||Number.isNaN(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Проверь название, сумму, счёт и дату плана');
 if(['daily','weekly'].includes(values.frequency)&&Math.floor((Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:data.settings?.timeZone||'Europe/Moscow'}).format(new Date())+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000)/(values.frequency==='daily'?1:7)>9900)throw Error('Уточните начало плана: слишком много прошлых периодов');
 return {...data,recurring:[...data.recurring,{id:crypto.randomUUID(),name:values.name.trim(),amount,currency:account.currency||'RUB',accountId:account.id,cat:values.type==='income'?'income':values.cat||'other',type:values.type,frequency:values.frequency,startDate:date,dueDay:Number(date.slice(-2)),active:true,variable:false,skippedPeriods:[]}]};
}
export function preparePlanned(data,ruleId,period,today,changed){
 const r=data.recurring.find(r=>r.id===ruleId),item=plannedOccurrences(data,today,r?.frequency==='once'?r.startDate:['daily','weekly'].includes(r?.frequency)?period:period+'-31').find(i=>i.rule.id===ruleId&&i.period===period);
 if(!r?.active||!item||plannedPaid(data,r,period))throw Error('План изменился, уже подтверждён или пропущен');
 return{type:planType(r),cat:planType(r)==='income'?'income':r.cat,amount:changed||r.variable?'':String(r.amount),currency:r.currency||'RUB',accountId:r.accountId,date:today,note:r.name,paymentMethod:'unknown',tags:['постоянный'],recurringId:r.id,recurringPeriod:period,plannedDueDate:item.date,saveRecurringAmount:false};
}
export function skipPlanned(data,id,period){const r=data.recurring.find(x=>x.id===id);if(!r||plannedPaid(data,r,period))throw Error('План отсутствует или уже подтверждён');return {...data,recurring:data.recurring.map(x=>x.id===id?{...x,skippedPeriods:[...new Set([...(x.skippedPeriods||[]),period])]}:x)};}

export function updatePlanned(data,id,values){const old=data.recurring.find(r=>r.id===id);if(!old)throw Error('План отсутствует');const added=createPlanned({...data,recurring:data.recurring.filter(r=>r.id!==id)},values);return {...added,recurring:added.recurring.map(r=>r.id===added.recurring.at(-1).id?{...r,active:old.active}:r)};}
export function deletePlanned(data,id){return {...data,recurring:data.recurring.filter(r=>r.id!==id)};}
