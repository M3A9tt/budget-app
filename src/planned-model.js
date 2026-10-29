export function billingPeriod(rule,period){if((rule.frequency||'monthly')!=='monthly'||!/^\d{4}-\d{2}$/.test(period||''))return period;const date=new Date(period+'-01T12:00Z');date.setUTCMonth(date.getUTCMonth()+(rule.billingMonthOffset||0));return date.toISOString().slice(0,7);}
export const planType=r=>r.type||'expense';
export const planPeriod=(r,date)=>r.frequency==='once'?'once':['daily','weekly'].includes(r.frequency)?date:date.slice(0,7);
function paymentPeriods(data){
 const rules=new Map(data.recurring.map(r=>[r.id,r])),index=new Map();
 for(const t of data.transactions){const r=rules.get(t.recurringId);if(!r||t.type!==planType(r))continue;let periods=index.get(r.id);if(!periods){periods=new Map();index.set(r.id,periods);}const key=t.recurringPeriod||planPeriod(r,t.date),state=periods.get(key)||{amount:0,final:false};state.amount+=Math.round(t.amount*100);state.final ||= t.recurringPartial!==true;periods.set(key,state);}
 return index;
}
export function plannedRemaining(data,r,period,index=paymentPeriods(data)){
 const state=index.get(r.id)?.get(period);if(state?.final)return 0;return r.variable?null:Math.max(0,(Math.round(r.amount*100)-(state?.amount||0))/100);
}
export function plannedPaid(data,r,period,index=paymentPeriods(data)){
 const periods=index.get(r.id),state=periods?.get(period);return !!state&&(state.final||!r.variable&&state.amount>=Math.round(r.amount*100))||!periods?.size&&r.lastCreated===period;
}
export function validPlannedPeriod(rule,period,checkSchedule=true){
 const frequency=rule.frequency||'monthly';
 let valid=frequency==='once'?period==='once':frequency==='monthly'?/^\d{4}-(0[1-9]|1[0-2])$/.test(period):
  typeof period==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(period)&&Number.isFinite(Date.parse(period+'T12:00:00Z'))&&new Date(period+'T12:00:00Z').toISOString().slice(0,10)===period;
 if(valid&&checkSchedule&&rule.startDate){
  if(frequency==='monthly')valid=period>=rule.startDate.slice(0,7);
  else if(frequency!=='once'){const days=(Date.parse(period+'T12:00:00Z')-Date.parse(rule.startDate+'T12:00:00Z'))/86400000;valid=Number.isInteger(days)&&days>=0&&(frequency!=='weekly'||days%7===0);}
 }
 return valid;
}
// A confirmation belongs to an occurrence, independently of its payment date.
// Run this after every ledger transition, including restores and backup imports.
export function validatePlannedOverrides(rule){
 const dates=rule.dateOverrides;
 if(dates===undefined)return;
 if(!dates||typeof dates!=='object'||Array.isArray(dates)||Object.keys(dates).length>2000)throw Error('Неверные переносы дат плана');
 for(const [period,date] of Object.entries(dates))if(!validPlannedPeriod(rule,period,false)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Неверная дата переноса плана');
}
export function validatePlannedLinks(data){
 const rules=new Map((data.recurring||[]).map(r=>[r.id,r])),seen=new Map();
 for(const r of rules.values()){validatePlannedOverrides(r);if((r.skippedPeriods||[]).some(period=>!validPlannedPeriod(r,period,false)))throw Error('Неверный пропущенный период плана');}
 for(const tx of data.transactions){
  if(!tx.recurringId)continue;
  const rule=rules.get(tx.recurringId);if(!rule)continue; // Deleted plans retain their financial history.
  const period=tx.recurringPeriod||planPeriod(rule,tx.date);
  // A changed future schedule must not invalidate the already recorded dates.
  if(!validPlannedPeriod(rule,period,false)||tx.type!==planType(rule)||(rule.skippedPeriods||[]).includes(period))throw Error('Неверный или пропущенный период плана');
  const key=JSON.stringify([rule.id,period]),prior=seen.get(key)||{final:0,partial:0};
  if(tx.recurringPartial!==undefined&&typeof tx.recurringPartial!=='boolean')throw Error('Неверная отметка частичного дохода');
  if(tx.recurringPartial===true&&(tx.type!=='income'||(tx.currency||'RUB')!==(rule.currency||'RUB')))throw Error('Частичное поступление должно быть доходом в валюте плана');
  if(tx.recurringPartial===true)prior.partial+=Math.round(tx.amount*100);else prior.final++;
  if(prior.final>1||planType(rule)!=='income'&&seen.has(key))throw Error('Этот период уже подтверждён. Сначала проверьте существующую оплату');
  if(!rule.variable&&prior.partial>Math.round(rule.amount*100))throw Error('Части дохода превышают ожидаемую сумму. Подтверди новую окончательную сумму отдельно');seen.set(key,prior);
 }
 return data;
}
export function plannedOccurrences(data,today,end=today,from=''){
 const items=[],paid=paymentPeriods(data);
 for(const r of data.recurring.filter(r=>r.active)){
  const skipped=new Set(r.skippedPeriods||[]),seen=new Set();
  const add=originalDate=>{const period=planPeriod(r,originalDate),date=r.dateOverrides?.[period]||originalDate;if(seen.has(period))return;seen.add(period);if(date<=end&&(!from||date>=from)&&!plannedPaid(data,r,period,paid)&&!skipped.has(period))items.push({rule:r,period,date,originalDate,remaining:plannedRemaining(data,r,period,paid),overdue:date<today});};
  // Moved occurrences can enter the visible range from a later original period.
  for(const period of Object.keys(r.dateOverrides||{}))if(validPlannedPeriod(r,period)){
   const original=r.frequency==='once'?r.startDate:['daily','weekly'].includes(r.frequency)?period:period+'-'+String(Math.min(r.dueDay||Number((r.startDate||today).slice(-2)),new Date(Number(period.slice(0,4)),Number(period.slice(5,7)),0).getDate())).padStart(2,'0');
   if(original&&(!r.startDate||original>=r.startDate))add(original);
  }
  if(r.frequency==='once'){if(r.startDate)add(r.startDate);continue;}
  const start=r.startDate||today.slice(0,7)+'-01';
  if(['daily','weekly'].includes(r.frequency)){
   const step=r.frequency==='daily'?1:7,anchor=Date.parse(start+'T12:00:00Z'),count=Math.floor((Date.parse(end+'T12:00:00Z')-anchor)/86400000/step)+1;
   const begin=from?Math.max(0,Math.ceil((Date.parse(from+'T12:00:00Z')-anchor)/86400000/step)):0;
   if(count-begin>10000)throw Error('Слишком много периодов плана. Уточните дату начала');
   for(let i=begin;i<count;i++)add(new Date(anchor+i*step*86400000).toISOString().slice(0,10));continue;
  }
  const cursor=new Date((from&&from.slice(0,7)>start.slice(0,7)?from.slice(0,7):start.slice(0,7))+'-01T12:00:00Z');
  for(let i=0;i<1200;i++,cursor.setUTCMonth(cursor.getUTCMonth()+1)){
   const period=cursor.toISOString().slice(0,7),day=Math.min(r.dueDay||Number(start.slice(-2)),new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).getUTCDate()),date=period+'-'+String(day).padStart(2,'0');if(date>end)break;if(date>=start)add(date);
  }
 }
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.rule.name.localeCompare(b.rule.name));
}
