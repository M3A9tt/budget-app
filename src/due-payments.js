import {scheduledEvents} from './finance-events.js';
// One list for reminders and chat. Facts of payment remove items automatically.
export function duePayments(data,today){return scheduledEvents(data,today,today).map(e=>({kind:e.source,id:e.source==='installment'?e.paymentId:e.sourceId,...(e.source==='installment'?{planId:e.sourceId}:{}),...(e.period?{period:e.period}:{}),date:e.date,name:e.name,amount:e.amount,currency:e.currency,...(e.type==='income'?{income:true}:{})}));}
export function paymentCallback(x){
 const value=x.kind==='plan'?`b:n:p:${x.id}:${x.period}`:`b:n:${x.kind==='installment'?'i':'d'}:${x.id}`;
 // Imported identifiers can be long. Open the current list in that case.
 return !String(x.id).includes(':')&&new TextEncoder().encode(value).length<=64?value:'b:v:due';
}
