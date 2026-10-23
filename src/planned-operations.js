import {parseMoney} from './ledger.js';
import {plannedOccurrences,planType,plannedPaid,validPlannedPeriod} from './planned-model.js';
function plannedValues(data,values){
 const account=data.accounts.find(a=>a.id===values.accountId),amount=parseMoney(values.amount),date=values.startDate;
 if(!account||!values.name?.trim()||!Number.isFinite(amount)||amount<=0||!['expense','income'].includes(values.type)||!['daily','weekly','monthly','once'].includes(values.frequency)||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||Number.isNaN(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Проверь название, сумму, счёт и дату плана');
 if(['daily','weekly'].includes(values.frequency)&&Math.floor((Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:data.settings?.timeZone||'Europe/Moscow'}).format(new Date())+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000)/(values.frequency==='daily'?1:7)>9900)throw Error('Уточните начало плана: слишком много прошлых периодов');
 const dueDay=values.frequency==='monthly'?Number(values.dueDay??date.slice(-2)):Number(date.slice(-2));
 if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw Error('Число ежемесячного платежа — от 1 до 31');
 return {name:values.name.trim(),amount,currency:account.currency||'RUB',accountId:account.id,cat:values.type==='income'?'income':values.cat||'other',type:values.type,frequency:values.frequency,startDate:date,dueDay,variable:values.variable===true};
}
export function createPlanned(data,values){
 const checked=plannedValues(data,values),id=values.id||crypto.randomUUID();
 if(typeof id!=='string'||!/^[-\w]{1,80}$/.test(id))throw Error('Некорректный номер плана');
 if(data.recurring.some(r=>r.id===id))throw Error('Этот план уже создан. Закрой форму и проверь список.');
 return {...data,recurring:[...data.recurring,{...checked,id,active:true,skippedPeriods:[]}]};
}
export function preparePlanned(data,ruleId,period,today,changed){
 const r=data.recurring.find(r=>r.id===ruleId),item=plannedOccurrences(data,today,r?.frequency==='once'?r.startDate:['daily','weekly'].includes(r?.frequency)?period:period+'-31').find(i=>i.rule.id===ruleId&&i.period===period);
 if(!r?.active||!item||plannedPaid(data,r,period))throw Error('План изменился, уже подтверждён или пропущен');
 return{type:planType(r),cat:planType(r)==='income'?'income':r.cat,amount:changed||r.variable?'':String(r.amount),currency:r.currency||'RUB',accountId:r.accountId,date:today,note:r.name,paymentMethod:'unknown',tags:['постоянный'],recurringId:r.id,recurringPeriod:period,plannedDueDate:item.date,saveRecurringAmount:false};
}
export function skipPlanned(data,id,period){
 const r=data.recurring.find(x=>x.id===id);
 if(!r?.active||!validPlannedPeriod(r,period)||plannedPaid(data,r,period))throw Error('План отсутствует, приостановлен, уже подтверждён или период не входит в график');
 if((r.skippedPeriods||[]).includes(period))return data;
 return {...data,recurring:data.recurring.map(x=>x.id===id?{...x,skippedPeriods:[...(x.skippedPeriods||[]),period]}:x)};
}
export function restorePlanned(data,id,period){
 const r=data.recurring.find(x=>x.id===id);
 if(!r||!validPlannedPeriod(r,period,false)||plannedPaid(data,r,period))throw Error('План отсутствует, период неверен или уже подтверждён');
 if(!(r.skippedPeriods||[]).includes(period))return data;
 return {...data,recurring:data.recurring.map(x=>x.id===id?{...x,skippedPeriods:x.skippedPeriods.filter(p=>p!==period)}:x)};
}

export const hasPlannedHistory=(data,rule)=>data.transactions.some(t=>t.recurringId===rule.id)||!!rule.lastCreated||(rule.skippedPeriods||[]).length>0;
export function updatePlanned(data,id,values){
 const old=data.recurring.find(r=>r.id===id);if(!old)throw Error('План отсутствует');
 const checked=plannedValues(data,{...values,dueDay:values.dueDay??(values.startDate===old.startDate?old.dueDay:undefined),variable:values.variable??old.variable});
 const hasFacts=hasPlannedHistory(data,old);
 if(hasFacts&&(planType(old)!==checked.type||(old.currency||'RUB')!==checked.currency||(old.frequency||'monthly')!==checked.frequency))throw Error('У плана уже есть оплаченные или пропущенные периоды. Для другого типа, валюты или периодичности создай отдельный план');
 const next={...old,...checked,id:old.id,active:old.active!==false,lastCreated:old.lastCreated||'',skippedPeriods:old.skippedPeriods||[]};
 return {...data,recurring:data.recurring.map(r=>r.id===id?next:r)};
}
export function previewPlanned(data,values,today,id){
 const next=id?updatePlanned(data,id,values):createPlanned(data,values),rule=id?next.recurring.find(r=>r.id===id):next.recurring.at(-1),end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+93);
 return {rule,items:plannedOccurrences(next,today,end.toISOString().slice(0,10)).filter(p=>p.rule.id===rule.id).slice(0,3)};
}
export function deletePlanned(data,id){return {...data,recurring:data.recurring.filter(r=>r.id!==id)};}
