import test from 'node:test';
import assert from 'node:assert/strict';
import {readMiniAppLink} from '../src/mini-app-link.js';
import {withNotificationLink,withWidgetLink,readWidgetLink} from '../server/notification-links.js';

const env={MINI_APP_URL:'https://budget.test/'};
const date='2026-11-19';
const target={section:'calendar',date,eventId:'plan:internet:2026-11'};

test('Only navigation context is carried in a native Mini App button',()=>{
 const body={text:'Напоминание',reply_markup:{inline_keyboard:[[{text:'Подтвердить',callback_data:'existing'}]]}};
 const result=withNotificationLink(env,body,{...target,amount:800,userId:'42',accountId:'hidden'});
 const link=new URL(result.reply_markup.inline_keyboard[1][0].web_app.url);
 assert.deepEqual([...link.searchParams],[['calendar','1'],['date',date],['event',target.eventId]]);
 assert.deepEqual(readMiniAppLink(link.search),{...target,range:null});
 assert.deepEqual(result.reply_markup.inline_keyboard[0],body.reply_markup.inline_keyboard[0]);
 assert.equal(withNotificationLink({MINI_APP_URL:'ftp://invalid.test/'},body,target),body);
 assert.equal(body.reply_markup.inline_keyboard.length,1);
});

test('Context links fail closed on ambiguous routes and invalid dates',()=>{
 assert.equal(readMiniAppLink('?calendar=1&history=1'),null);
 assert.equal(readMiniAppLink('?calendar=1&date=2026-02-31&event=plan:a:once').eventId,null);
 assert.equal(readMiniAppLink('?calendar=1&date=2026-11-19&event=https://invalid.test/').eventId,null);
 assert.equal(readMiniAppLink('?history=1&date=2026-11-19&event=plan:a:once').eventId,null);
 assert.equal(readMiniAppLink('?analytics=1&from=2024-01-01&to=2026-11-19').range,null);
});

test('Widget actions preserve existing controls and fall back to the selected day for long IDs',()=>{
 const card={title:'Платежи',rows:[['Интернет','800 ₽']]};
 const controls=[['Подтвердить','existing']];
 const normal=withWidgetLink(env,card,controls,target);
 assert.deepEqual(readWidgetLink(normal.controls[1][1]),{...target,range:null});
 const long=withWidgetLink(env,card,controls,{...target,eventId:'plan:'+'а'.repeat(30)+':once'});
 assert.deepEqual(readWidgetLink(long.controls[1][1]),{...target,eventId:null,range:null});
 assert.deepEqual(withWidgetLink(env,{...card,foot:'я'.repeat(500)},controls,target).controls,controls);
 assert.equal(readWidgetLink('app:c:2026-13-01:plan:internet:once'),null);
});
