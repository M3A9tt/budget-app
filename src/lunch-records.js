// The same records power the calendar, history, deletion and bot views.
export const companyLunch=t=>t.type==='lunch'||t.cat==='lunch';
export const personalLunch=t=>t.type==='expense'&&!companyLunch(t)&&((t.tags||[]).includes('обед-за-свои')||t._lunchCheckDay||t.lunchId||/обед.*(?:сво|доплат)/i.test(t.note||''));
export const lunchDayRecords=(data,date)=>data.transactions.filter(t=>t.date===date&&(companyLunch(t)||personalLunch(t)));
export function lunchDeletionRecords(data,id){
 const tx=data.transactions.find(t=>t.id===id);if(!tx)return [];
 if(!companyLunch(tx))return [tx];
 // Legacy top-ups had no parent ID. Only an explicitly named top-up with a
 // single possible company order is unambiguous; full personal meals stay.
 const onlyOrder=data.transactions.filter(t=>t.date===tx.date&&companyLunch(t)).length===1;
 return data.transactions.filter(t=>t.id===id||t.lunchId===id||
  (onlyOrder&&!t.lunchId&&t.date===tx.date&&personalLunch(t)&&/доплат/i.test(t.note||'')));
}

export function validateLunchLinks(data){
 const meals=new Map(data.transactions.filter(companyLunch).map(t=>[t.id,t]));
 for(const tx of data.transactions){if(!tx.lunchId)continue;const meal=meals.get(tx.lunchId);if(typeof tx.lunchId!=='string'||!meal||tx.type!=='expense'||companyLunch(tx)||tx.date!==meal.date)throw Error('Доплата должна относиться к существующему обеду той же даты');}
 return data;
}
// A previous deletion is evidence for a repair suggestion, never an automatic debit reversal.
export function orphanedLunchTopups(data){
 const deletedDays=new Set((data.history||[]).filter(h=>h.type==='delete_tx'&&h.before&&companyLunch(h.before)).map(h=>h.before.date));
 return data.transactions.filter(t=>personalLunch(t)&&deletedDays.has(t.date)&&!data.transactions.some(m=>m.date===t.date&&companyLunch(m)));
}
