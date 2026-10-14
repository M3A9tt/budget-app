export const planType=r=>r.type||'expense';
export const planPeriod=(r,date)=>r.frequency==='once'?'once':['daily','weekly'].includes(r.frequency)?date:date.slice(0,7);
export function plannedPaid(data,r,period){const linked=data.transactions.filter(t=>t.recurringId===r.id&&t.type===planType(r));return linked.some(t=>(t.recurringPeriod||planPeriod(r,t.date))===period)||(!linked.length&&r.lastCreated===period);}
export function plannedOccurrences(data,today,end=today){
 const items=[];
 for(const r of data.recurring.filter(r=>r.active)){
  const add=date=>{const period=planPeriod(r,date);if(!plannedPaid(data,r,period)&&!(r.skippedPeriods||[]).includes(period))items.push({rule:r,period,date,overdue:date<today});};
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
