import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {answerCalendarWidget,calendarWidget} from '../server/calendar-widget.js';
import {EMPTY,todayMoscow} from '../src/mini-model.js';

test('calendar widget is private, access-controlled and reversible',async()=>{
 const data=structuredClone(EMPTY);
 const name='Проверка <b>ЖКХ</b>';
 data.recurring=[{id:'example',name,cat:'transport',type:'expense',amount:850,currency:'RUB',frequency:'once',startDate:todayMoscow(),active:true}];
 const calls=[];
 let reads=0,rejectWidget=false;
 const deps={
  env:{MINI_APP_URL:'https://example.com/',TELEGRAM_OWNER_ID:'1'},
  access:async(_env,id)=>id===1,
  readState:async()=>{reads++;return {data};},
  mutateState:async(_env,id,change)=>{assert.equal(id,'1');Object.assign(data,change(data));},
  telegram:async(_env,method,payload)=>{
   calls.push({method,payload});
   if(rejectWidget&&method==='sendWidget')throw Object.assign(new Error('Unsupported'),{telegramCode:400});
  },
 };
 const owner={chat:{id:1,type:'private'},from:{id:1}};
 const command=text=>calendarWidget({...owner,text},deps);
 assert.equal(await command('/calendar'),false);
 assert.equal(reads,1);
 await calendarWidget({chat:{id:2,type:'private'},from:{id:2},text:'/widget'},deps);
 await calendarWidget({...owner,chat:{id:1,type:'group'},text:'/widget off'},deps);
 assert.equal(reads,1);
 assert.equal(calls.length,0);

 await command('/widget');
 const {method,payload}=calls.at(-1);
 assert.equal(method,'sendWidget');
 assert.match(payload.chat_data,/Проверка/);
 assert.deepEqual(JSON.parse(payload.chat_data).rows[0].slice(3,5),['Транспорт','expense']);
 assert(!payload.html.includes(name)&&!payload.caption.includes(name));
 assert.equal(payload.public_data,undefined);
 assert.equal(payload.allow_queries,true);
 assert.equal(payload.reply_markup,undefined);
 assert.equal(await command('/menu'),false);
 assert.equal(payload.protect_content,true);
 assert(Buffer.byteLength(payload.chat_data)<=1024);
 assert(deflateSync(payload.html,{level:9}).length<=4096);

 await command('/widget off');
 assert(calls.at(-1).payload.reply_markup.keyboard.length);
 await command('/widget');
 assert.equal(data.settings.calendarWidgetEnabled,false);
 assert.equal(calls.filter(call=>call.method==='sendWidget').length,1);
 await command('/widget on');
 assert.equal(data.settings.calendarWidgetEnabled,true);
 assert.deepEqual(calls.at(-1).payload.reply_markup,{remove_keyboard:true});
 await command('/menu');
 assert.equal(JSON.parse(calls.at(-1).payload.chat_data).page,'home');
 for(const [text,page] of [['/budget','home'],['/calendar','calendar'],['/history','history']]){
  assert.equal(await command(text),true);
  assert.equal(JSON.parse(calls.at(-1).payload.chat_data).page,page);
 }
 rejectWidget=true;
 assert.equal(await command('/history'),false);
 await command('/widget');
 assert.equal(calls.at(-1).method,'sendMessage');
 assert.equal(calls.at(-1).payload.reply_markup.inline_keyboard[0][1].web_app.url,'https://example.com/');
 assert(!JSON.stringify(calls.at(-1)).includes(name));

 const query={...owner,id:'query',message_id:20,type:{type:'data'},data:'budget-menu:history'};
 let adds=0;
 const answer=overrides=>answerCalendarWidget({...query,...overrides},{...deps,openAdd:async()=>{adds++;}});
 const before=calls.length;
 await answer({chat:{id:1,type:'group'}});
 await answer({from:{id:2}});
 await answer({inline_message_id:'inline'});
 await answer({data:'budget-menu:unexpected'});
 assert.equal(calls.length,before);
 await answer({});
 assert.equal(calls.at(-1).method,'answerWidgetQuery');
 assert.equal(JSON.parse(calls.at(-1).payload.data).page,'history');
 await answer({data:'budget-menu:add'});
 assert.equal(adds,1);
 await command('/widget off');
 await answer({data:'budget-menu:add'});
 assert.equal(adds,1);
 assert.match(JSON.parse(calls.at(-1).payload.data).error,/отключён/);
});
