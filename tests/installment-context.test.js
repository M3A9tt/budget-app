import test from 'node:test';import assert from 'node:assert/strict';import {calendarInstallmentInfo,calendarEventMark} from '../src/calendar-model.js';
test('Installment calendar context uses linked repayments and the original payment ordinal',()=>{
 const data={transactions:[{type:'expense',installmentPaymentId:'p1',currency:'RUB',amount:200},{type:'expense',installmentPaymentId:'p2',currency:'RUB',amount:100}],installments:[{id:'s',cat:'food',currency:'RUB',payments:[{id:'p3',date:'2026-12-01',amount:300},{id:'p1',date:'2026-10-01',amount:200},{id:'p2',date:'2026-11-01',amount:300}]}],customCats:[]};
 const before=structuredClone(data),event={source:'installment',sourceId:'s',paymentId:'p2',type:'expense'};
 const result=calendarInstallmentInfo(data,event);assert.equal(result.number,2);assert.equal(result.total,3);assert.equal(result.remaining,500);assert.equal(result.category.name,'Еда');assert.equal(calendarEventMark(data,event).icon,result.category.icon);assert.deepEqual(data,before);assert.equal(calendarInstallmentInfo(data,{source:'plan'}),null);
});
