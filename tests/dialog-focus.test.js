import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionBelongsToDraft,userSwitchedDialog} from '../server/dialog-focus.js';

test('Only an explicit reply may replace free-form meal descriptions',()=>{
 assert.equal(correctionBelongsToDraft({text:'Суп и гречка',reply_to_message:{message_id:10}},'note',10),true);
 assert.equal(correctionBelongsToDraft({text:'Суп и гречка',reply_to_message:{message_id:9}},'note',10),false);
 assert.equal(correctionBelongsToDraft({text:'Суп и гречка'},'note',10),false);
 assert.equal(correctionBelongsToDraft({text:'Суп и гречка'},'note',null),false);
 assert.equal(correctionBelongsToDraft({text:'/history'},'note',10),false);
});
test('Bare amounts and dates remain easy, unrelated financial text is not stolen',()=>{
 assert.equal(correctionBelongsToDraft({text:'340,50'},'amount',10),true);
 assert.equal(correctionBelongsToDraft({text:'340 р.'},'amount',10),true);
 assert.equal(correctionBelongsToDraft({text:'кофе 180 Альфа'},'amount',10),false);
 assert.equal(correctionBelongsToDraft({text:'2026-10-17'},'date',10),true);
 assert.equal(correctionBelongsToDraft({text:'вчера кофе 180'},'date',10),false);
 assert.equal(correctionBelongsToDraft({text:'340',reply_to_message:{message_id:22}},'amount',10),false);
});
test('Known navigation and bot callbacks switch dialog ownership',()=>{
 assert.equal(userSwitchedDialog({message:{text:'/menu'}}),true);
 assert.equal(userSwitchedDialog({message:{text:'/add'}}),true);
 assert.equal(userSwitchedDialog({callback_query:{data:'b:r:abc:0'}}),true);
 assert.equal(userSwitchedDialog({callback_query:{data:'lc:edit:id'}}),false);
 assert.equal(userSwitchedDialog({message:{text:'кофе 180'}}),false);
});

test('Every section command and keyboard alias shares navigation ownership',async()=>{
 const {BOT_SECTIONS,BOT_BUTTONS}=await import('../server/bot-navigation.js');
 for(const text of [...Object.keys(BOT_SECTIONS),...Object.values(BOT_BUTTONS),'/app','/summary','Отмена']){
  assert.equal(userSwitchedDialog({message:{text}}),true,text);
  assert.equal(correctionBelongsToDraft({text,reply_to_message:{message_id:10}},'note',10),false,text);
 }
 assert.equal(userSwitchedDialog({message:{text:'/unknown'}}),false);
});
