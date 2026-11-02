import test from 'node:test';import assert from 'node:assert/strict';import {calendarDayMarks} from '../src/calendar-model.js';
test('Month markers describe directions consistently for plans and actual facts',()=>{assert.deepEqual(calendarDayMarks({events:[],transactions:[]}),[]);assert.deepEqual(calendarDayMarks({events:[{type:'expense'},{type:'expense'}],transactions:[{type:'expense'},{type:'income'}]}).map(m=>m.type),['expense','income']);assert.deepEqual(calendarDayMarks({transactions:[{type:'income'}]}).map(m=>m.label),['Доход']);assert.deepEqual(calendarDayMarks({transactions:[{type:'transfer'},{type:'lunch'}]}).map(m=>m.type),['transfer','lunch']);});

import {calendarEventMark,calendarDaySymbols} from '../src/calendar-model.js';
test('Calendar symbols follow exact source categories and bound crowded dates',()=>{
 const data={recurring:[{id:'rent',cat:'housing'},{id:'unknown',cat:'other',name:'Дом',frequency:'once'}]};
 assert.equal(calendarEventMark(data,{type:'expense',source:'plan',sourceId:'rent'}).icon,'home');
 assert.equal(calendarEventMark(data,{type:'expense',source:'plan',sourceId:'unknown'}).icon,null);
 assert.equal(calendarEventMark(data,{type:'expense',cat:'transport'}).icon,'transport');
 assert.equal(calendarEventMark(data,{type:'income'}).icon,'wallet');
 const marks=calendarDaySymbols(data,{events:[{id:'a',type:'expense'},{id:'b',type:'income'},{id:'c',type:'expense'}],transactions:[{id:'d',type:'expense'}]});
 assert.equal(marks.marks.length,2);assert.equal(marks.remaining,2);
 assert.deepEqual(calendarDaySymbols(data,{}),{marks:[],remaining:0});
});
