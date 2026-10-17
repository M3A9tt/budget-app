import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {duePayments,paymentCallback} from '../src/due-payments.js';
import {notificationJobs,paymentReminder} from '../server/notifications.js';
import {testMessage} from '../server/test-messages.js';
import {botView} from '../server/bot-views.js';
const today='2026-10-17';
test('Due reminders use unpaid amounts, include debt, retain unknown sums, bound callbacks and sandbox test messages',()=>{
 const d=structuredClone(EMPTY);d.accounts=[{id:'a',name:'Банк',currency:'RUB',balance:1000}];d.settings={...d.settings,plannedReminders:true,dailyReport:false,weeklyReport:false,monthlyReport:false};
 d.recurring=[{id:'variable',name:'ЖКХ',active:true,variable:true,amount:1,type:'expense',frequency:'once',startDate:today,accountId:'a',currency:'RUB'}];
 d.installments=[{id:'s',name:'Сплит',total:300,accountId:'a',currency:'RUB',payments:[{id:'payment',date:today,amount:300},{id:'future',date:'2026-10-20',amount:100}]}];
 d.transactions=[{id:'partial',type:'expense',amount:100,currency:'RUB',installmentPaymentId:'payment',date:today,accountId:'a'}];
 d.debts=[{id:'debt',person:'Мама',amount:400,type:'iowe',dueDate:today,currency:'RUB',payments:[{amount:50}]}];
 const items=duePayments(d,today);assert.equal(items.length,3);assert.equal(items.find(x=>x.kind==='installment').amount,200);assert.equal(items.find(x=>x.kind==='debt').amount,350);assert.equal(items.find(x=>x.kind==='plan').amount,null);
 const jobs=notificationJobs(d,new Date(today+'T15:00:00Z'));assert.equal(jobs.length,1);assert.match(jobs[0].text,/Сплит/);assert.match(jobs[0].text,/Мама/);assert.match(jobs[0].text,/уточнить сумму/);assert.equal(jobs[0].reply_markup.inline_keyboard.length,4);
 for(const id of ['я'.repeat(80),'contains:colon'])assert.equal(paymentCallback({...items[0],id}),'b:v:due');
 const sample=testMessage(d,'planned',()=>'',new Date(today+'T15:00:00Z'));assert.ok(sample.reply_markup.inline_keyboard.flat().every(x=>x.callback_data==='test:planned'));
 assert.equal(paymentReminder(Array.from({length:9},(_,i)=>({...items[0],id:'x'+i}))).reply_markup.inline_keyboard.length,6);
});
test('Allocation lists precisely dashboard deductions and links to existing sources, reserve never subtracted twice',()=>{
 const d=structuredClone(EMPTY);d.accounts=[{id:'a',name:'Банк',balance:1000,currency:'RUB'},{id:'cash',name:'Резерв наличными',balance:500,accType:'savings',currency:'RUB'}];
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
 d.recurring=[{id:'rent',name:'ЖКХ',active:true,amount:200,type:'expense',frequency:'once',startDate:now,accountId:'a',currency:'RUB'},{id:'unknown',name:'Свет',active:true,variable:true,type:'expense',amount:1,frequency:'once',startDate:now,accountId:'a',currency:'RUB'}];
 const sum=dashboard(d,now),screen=botView(d,'allocation');assert.equal(sum.free,800);assert.equal(sum.reserve,500);assert.ok(screen.lines.some(x=>x.includes('неизвестной суммой')));assert.ok(screen.lines.some(x=>x.includes('ближайшие 30 дней')));
 const rows=botView(d,'allocationItems').actions.filter(x=>x.view==='dueItem');assert.equal(rows.length,sum.obligationItems.length);assert.deepEqual(rows.map(x=>x.args),[{id:'rent',period:'once'},{id:'unknown',period:'once'}]);
});
