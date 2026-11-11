import {scheduledEvents} from './finance-events.js';
// One list for reminders and chat. Facts of payment remove items automatically.
export function paymentFromEvent(event){
 const {source:kind,sourceId,paymentId,period,date,name,amount,currency,type}=event;
 return {kind,id:kind==='installment'?paymentId:sourceId,...(kind==='installment'?{planId:sourceId}:{}),
  ...(period?{period}:{}),date,name,amount,currency,...(type==='income'?{income:true}:{})};
}
export function duePayments(data,today){return scheduledEvents(data,today,today).map(paymentFromEvent);}
export function paymentCallback(x){
 const value=x.kind==='plan'?`b:n:p:${x.id}:${x.period}`:`b:n:${x.kind==='installment'?'i':'d'}:${x.id}`;
 // Imported identifiers can be long. Open the current list in that case.
 return !String(x.id).includes(':')&&new TextEncoder().encode(value).length<=64?value:'b:v:due';
}
