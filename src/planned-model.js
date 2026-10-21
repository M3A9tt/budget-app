export const planType=r=>r.type||'expense';
export const planPeriod=(r,date)=>r.frequency==='once'?'once':['daily','weekly'].includes(r.frequency)?date:date.slice(0,7);
function paymentPeriods(data){
 const rules=new Map(data.recurring.map(r=>[r.id,r])),index=new Map();
 for(const t of data.transactions){const r=rules.get(t.recurringId);if(!r||t.type!==planType(r))continue;let periods=index.get(r.id);if(!periods){periods=new Set();index.set(r.id,periods);}periods.add(t.recurringPeriod||planPeriod(r,t.date));}
 return index;
}
export function plannedPaid(data,r,period,index){
 if(index){const periods=index.get(r.id);return !!periods?.has(period)||(!periods?.size&&r.lastCreated===period);}
 const linked=data.transactions.filter(t=>t.recurringId===r.id&&t.type===planType(r));return linked.some(t=>(t.recurringPeriod||planPeriod(r,t.date))===period)||(!linked.length&&r.lastCreated===period);
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
export function validatePlannedLinks(data){
 const rules=new Map((data.recurring||[]).map(r=>[r.id,r])),seen=new Set();
 for(const r of rules.values())if((r.skippedPeriods||[]).some(period=>!validPlannedPeriod(r,period,false)))throw Error('Неверный пропущенный период плана');
 for(const tx of data.transactions){
  if(!tx.recurringId)continue;
  const rule=rules.get(tx.recurringId);if(!rule)continue; // Deleted plans retain their financial history.
  const period=tx.recurringPeriod||planPeriod(rule,tx.date);
  // A changed future schedule must not invalidate the already recorded dates.
  if(!validPlannedPeriod(rule,period,false)||tx.type!==planType(rule)||(rule.skippedPeriods||[]).includes(period))throw Error('Неверный или пропущенный период плана');
  const key=JSON.stringify([rule.id,period]);if(seen.has(key))throw Error('Этот период уже подтверждён. Сначала проверьте существующую оплату');seen.add(key);
 }
 return data;
}
export function plannedOccurrences(data,today,end=today){
 const items=[],paid=paymentPeriods(data);
 for(const r of data.recurring.filter(r=>r.active)){
  const skipped=new Set(r.skippedPeriods||[]);
  const add=date=>{const period=planPeriod(r,date);if(!plannedPaid(data,r,period,paid)&&!skipped.has(period))items.push({rule:r,period,date,overdue:date<today});};
  if(r.frequency==='once'){if(r.startDate&&r.startDate<=end)add(r.startDate);continue;}
  const start=r.startDate||today.slice(0,7)+'-01';
  if(['daily','weekly'].includes(r.frequency)){
   const step=r.frequency==='daily'?1:7,anchor=Date.parse(start+'T12:00:00Z'),count=Math.floor((Date.parse(end+'T12:00:00Z')-anchor)/86400000/step)+1;
   if(count>10000)throw Error('Слишком много периодов плана. Уточните дату начала');
   for(let i=0;i<count;i++)add(new Date(anchor+i*step*86400000).toISOString().slice(0,10));continue;
  }
  const cursor=new Date(start.slice(0,7)+'-01T12:00:00Z');
  for(let i=0;i<1200;i++,cursor.setUTCMonth(cursor.getUTCMonth()+1)){
   const period=cursor.toISOString().slice(0,7),day=Math.min(r.dueDay||Number(start.slice(-2)),new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).getUTCDate()),date=period+'-'+String(day).padStart(2,'0');if(date>end)break;if(date>=start)add(date);
  }
 }
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.rule.name.localeCompare(b.rule.name));
}
