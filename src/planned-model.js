export const planType=r=>r.type||'expense';
export const planPeriod=(r,date)=>r.frequency==='once'?'once':date.slice(0,7);
export function plannedPaid(data,r,period){
 const linked=data.transactions.filter(t=>t.recurringId===r.id&&t.type===planType(r));
 return linked.some(t=>(t.recurringPeriod||planPeriod(r,t.date))===period)||(!linked.length&&r.lastCreated===period);
}
export function plannedOccurrences(data,today,end=today){
 const items=[];
 for(const r of data.recurring.filter(r=>r.active)){
  if(r.frequency==='once'){
   const date=r.startDate;if(date&&date<=end&&!plannedPaid(data,r,'once')&&!(r.skippedPeriods||[]).includes('once'))items.push({rule:r,period:'once',date,overdue:date<today});continue;
  }
  const start=r.startDate||today.slice(0,7)+'-01',cursor=new Date(start.slice(0,7)+'-01T12:00:00Z');
  for(let i=0;i<120;i++,cursor.setUTCMonth(cursor.getUTCMonth()+1)){
   const period=cursor.toISOString().slice(0,7),day=Math.min(r.dueDay||Number(start.slice(-2)),new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).getUTCDate()),date=period+'-'+String(day).padStart(2,'0');
   if(date>end)break;if(date<start||plannedPaid(data,r,period)||(r.skippedPeriods||[]).includes(period))continue;
   items.push({rule:r,period,date,overdue:date<today});
  }
 }
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.rule.name.localeCompare(b.rule.name));
}
