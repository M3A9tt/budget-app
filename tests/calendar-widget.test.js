import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {calendarWidget} from '../server/calendar-widget.js';
import {EMPTY,todayMoscow} from '../src/mini-model.js';

test('calendar widget is an owner-only, private and reversible pilot',async()=>{
 const data=structuredClone(EMPTY);
 const name='Проверка <b>ЖКХ</b>';
 data.recurring=[{id:'example',name,type:'expense',amount:850,currency:'RUB',frequency:'once',startDate:todayMoscow(),active:true}];
 const calls=[];
 let reads=0,rejectWidget=false;
 const deps={
  env:{MINI_APP_URL:'https://example.com/',TELEGRAM_OWNER_ID:'1'},
  readState:async()=>{reads++;return {data};},
  mutateState:async(_env,id,change)=>{assert.equal(id,'1');change(data);},
  telegram:async(_env,method,payload)=>{
   calls.push({method,payload});
   if(rejectWidget&&method==='sendWidget')throw Object.assign(new Error('Unsupported'),{telegramCode:400});
  },
 };
 const owner={chat:{id:1,type:'private'},from:{id:1}};
 const command=text=>calendarWidget({...owner,text},deps);
 assert.equal(await command('/calendar'),false);
 await calendarWidget({chat:{id:2,type:'private'},from:{id:2},text:'/widget'},deps);
 await calendarWidget({...owner,chat:{id:1,type:'group'},text:'/widget off'},deps);
 assert.equal(reads,0);
 assert.equal(calls.length,0);

 await command('/widget');
 const {method,payload}=calls.at(-1);
 assert.equal(method,'sendWidget');
 assert.match(payload.chat_data,/Проверка/);
 assert(!payload.html.includes(name)&&!payload.caption.includes(name));
 assert.equal(payload.public_data,undefined);
 assert.equal(payload.allow_queries,false);
 assert.equal(payload.protect_content,true);
 assert(Buffer.byteLength(payload.chat_data)<=1024);
 assert(deflateSync(payload.html,{level:9}).length<=4096);

 await command('/widget off');
 await command('/widget');
 assert.equal(data.settings.calendarWidgetEnabled,false);
 assert.equal(calls.filter(call=>call.method==='sendWidget').length,1);
 await command('/widget on');
 assert.equal(data.settings.calendarWidgetEnabled,true);
 rejectWidget=true;
 await command('/widget');
 assert.equal(calls.at(-1).method,'sendMessage');
 assert.equal(calls.at(-1).payload.reply_markup.inline_keyboard[0][0].web_app.url,'https://example.com/?calendar=1');
 assert(!JSON.stringify(calls.at(-1)).includes(name));
});
