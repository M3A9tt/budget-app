import test from 'node:test';import assert from 'node:assert/strict';
import {notificationJobs,checkSchedule} from '../server/notifications.js';
import {validateReminderSettings,reminderText} from '../src/reminder-settings.js';
const day='2026-10-13',time=hour=>new Date(day+'T'+String(hour-3).padStart(2,'0')+':00:00Z');
const data=()=>({transactions:[{type:'expense',cat:'food',date:day,amount:100}],lunchDayOff:[],settings:{reminders:false,dailyReport:false,weeklyReport:false,monthlyReport:false}});
test('Expense check is opt-in, repeats despite recorded transactions, stops after explicit confirmation',()=>{let d=data();assert.equal(notificationJobs(d,time(20)).length,0);d.settings={...d.settings,expenseCheckEnabled:true,checkHour:20,checkRepeats:2,checkInterval:1};for(const h of [20,21,22])assert.equal(notificationJobs(d,time(h)).filter(x=>x.kind==='expense').length,1);for(const status of ['done','none'])assert.equal(notificationJobs(d,time(21),[{day,kind:'expense',status,payload:'{}'}]).length,0);});
test('Snooze persists and sends once at the next hour, pending keeps normal schedule',()=>{const d=data();d.settings={...d.settings,expenseCheckEnabled:true,checkHour:20,checkRepeats:0};const response={day,kind:'expense',status:'pending',payload:JSON.stringify({nextHour:22})};assert.equal(notificationJobs(d,time(20),[response]).length,0);assert.equal(notificationJobs(d,time(22),[response]).length,1);assert.equal(notificationJobs(d,time(23),[response]).length,0);});
test('Optional inactivity escalation adds one question after the chosen number of days, resets on a real expense',()=>{const d=data();d.transactions=[];d.settings={...d.settings,checkStartedDate:'2026-10-10',checkHour:20,checkEscalation:true,checkEscalationDays:3};assert.deepEqual(checkSchedule(d,day),[20,21]);d.settings.checkEscalation=false;assert.deepEqual(checkSchedule(d,day),[20]);d.settings.checkEscalation=true;d.transactions=[{type:'lunch',date:day}];assert.deepEqual(checkSchedule(d,day),[20,21]);d.transactions=[{type:'expense',cat:'food',date:day}];assert.deepEqual(checkSchedule(d,day),[20]);});
test('Lunch question honors weekdays, marked absence, existing lunch and prior answer',()=>{const d=data();d.settings.lunchAskEnabled=true;assert.equal(notificationJobs(d,time(11)).filter(x=>x.kind==='lunch').length,1);d.lunchDayOff=[day];assert.equal(notificationJobs(d,time(11)).length,0);d.lunchDayOff=[];d.transactions.push({type:'lunch',date:day});assert.equal(notificationJobs(d,time(11)).length,0);d.transactions=[];assert.equal(notificationJobs(d,time(11),[{day,kind:'lunch',status:'skipped',payload:'{}'}]).length,0);d.settings.lunchAskDays=[0];assert.equal(notificationJobs(d,time(11)).length,0);});
test('Reminder text uses custom copy or rotating prewritten style without API calls',()=>{assert.equal(reminderText({reminderStyle:'custom',reminderText:'Мой текст'},day,0),'Мой текст');assert.notEqual(reminderText({reminderStyle:'rough'},day,0),reminderText({reminderStyle:'rough'},day,1));assert.throws(()=>validateReminderSettings({reminderStyle:'custom',reminderText:''}));assert.throws(()=>validateReminderSettings({checkHour:23,checkEscalation:true}));assert.throws(()=>validateReminderSettings({lunchAskDays:[]}));});

test('Editing or completing a day stops automatic repeats; an explicit delay replaces all normal slots',()=>{
 const d=data();d.settings={...d.settings,expenseCheckEnabled:true,checkTime:'20:00',checkRepeats:3};
 for(const status of ['editing','done','none','off'])assert.equal(notificationJobs(d,time(21),[{day,kind:'expense',status,payload:'{}'}]).length,0,status);
 const nextAt=time(22).getTime(),row={day,kind:'expense',status:'pending',payload:JSON.stringify({nextAt})};
 assert.equal(notificationJobs(d,time(21),[row]).length,0);
 assert.equal(notificationJobs(d,time(22),[row]).filter(x=>x.kind==='expense').length,1);
 assert.equal(notificationJobs(d,time(23),[row]).length,0);
});
test('Snooze crosses midnight in the profile timezone, preserves original day and respects catch-up limits',()=>{
 const d=data();d.settings={...d.settings,expenseCheckEnabled:true,checkTime:'22:00',timeZone:'Asia/Vladivostok'};
 const nextAt=Date.parse('2026-10-13T14:45:00Z'); // 00:45 on October 14.
 const row={day,kind:'expense',status:'pending',payload:JSON.stringify({nextAt})};
 assert.equal(notificationJobs(d,new Date(nextAt-60000),[row]).length,0);
 const jobs=notificationJobs(d,new Date(nextAt),[row]);assert.equal(jobs.length,1);assert.equal(jobs[0].day,day);
 assert.ok(jobs[0].reply_markup.inline_keyboard.flat().every(b=>b.callback_data.startsWith('check:'+day+':')));
 assert.equal(notificationJobs(d,new Date(nextAt+15*60000),[row],{catchUp:true}).length,1);
 assert.equal(notificationJobs(d,new Date(nextAt+16*60000),[row],{catchUp:true}).length,0);
 d.settings.expenseCheckEnabled=false;assert.equal(notificationJobs(d,new Date(nextAt),[row]).length,0);
});
