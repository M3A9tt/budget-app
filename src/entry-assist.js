export const sortedEntries=transactions=>[...transactions].sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt||b.id||'').localeCompare(a.updatedAt||a.id||''));
export function entryDefaults(data,type,today,categories){
 const regular=data.accounts.filter(a=>a.accType!=='savings'),validCat=id=>categories.some(c=>c.id===id);
 const prior=data.settings?.rememberEntryChoices===false?undefined:sortedEntries(data.transactions).find(t=>t.type===type&&t.date<=today&&!t.recurringId&&!t.installmentPaymentId&&!t.debtId&&t.balanceEffect!=='history-only'&&regular.some(a=>a.id===t.accountId));
 const account=regular.find(a=>a.id===prior?.accountId)||(regular.length===1?regular[0]:undefined);
 return {type,cat:type==='lunch'?'lunch':type==='income'?'income':validCat(prior?.cat)?prior.cat:'food',amount:'',note:'',currency:type==='lunch'?'RUB':account?.currency||'RUB',date:today,accountId:type==='lunch'?undefined:account?.id||'',paymentMethod:type==='lunch'?'unknown':prior?.paymentMethod||'unknown',tags:[]};
}
export function repeatEntry(data,tx,today,categories){
 const validCat=categories.some(c=>c.id===tx.cat),account=data.accounts.find(a=>a.id===tx.accountId);
 return {...(tx.debtId?{debtId:tx.debtId}:{}),type:tx.type,cat:tx.type==='lunch'?'lunch':tx.type==='income'?'income':validCat?tx.cat:'other',amount:String(tx.amount),note:tx.note||'',currency:tx.currency||'RUB',date:today,accountId:tx.type==='lunch'?undefined:account?.id||'',paymentMethod:tx.paymentMethod||'unknown',tags:[]};
}
export function repeatSuggestions(data,today,limit=6){
 const seen=new Set(),out=[];
 for(const tx of sortedEntries(data.transactions)){
  if(tx.date>today||tx.type!=='expense'||tx.recurringId||tx.installmentPaymentId||tx.debtId||tx.balanceEffect==='history-only'||tx.cat==='lunch')continue;
  if(tx.accountId&&!data.accounts.some(a=>a.id===tx.accountId))continue;
  const key=JSON.stringify([tx.note,tx.cat,tx.accountId,tx.currency,tx.paymentMethod]);
  if(seen.has(key))continue;seen.add(key);out.push(tx);if(out.length===limit)break;
 }
 return out;
}
