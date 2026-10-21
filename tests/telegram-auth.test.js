import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateTelegramInitData} from '../server/telegram-auth.js';
const token='123:test-only-token',owner='123456',now=1770000000;
function signed(extra={}){const params=new URLSearchParams({auth_date:String(now),user:JSON.stringify({id:Number(owner),first_name:'Test'}),query_id:'query',...extra});const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();params.set('hash',createHmac('sha256',secret).update(check).digest('hex'));return params.toString();}
test('Telegram HMAC accepted for configured owner',async()=>assert.equal((await validateTelegramInitData(signed(),token,owner,now)).id,Number(owner)));
test('Tampered Telegram identity is rejected',async()=>assert.equal(await validateTelegramInitData(signed().replace('Test','Fake'),token,owner,now),null));
test('Valid signed data belonging to another person is rejected',async()=>assert.equal(await validateTelegramInitData(signed({user:JSON.stringify({id:999})}),token,owner,now),null));
test('Expired, future, malformed and duplicate init fields are rejected',async()=>{assert.equal(await validateTelegramInitData(signed({auth_date:String(now-3601)}),token,owner,now),null);assert.equal(await validateTelegramInitData(signed({auth_date:String(now+60)}),token,owner,now),null);assert.equal(await validateTelegramInitData(signed()+'&auth_date=1',token,owner,now),null);assert.equal(await validateTelegramInitData('user=123',token,owner,now),null);});
test('Incorrect bot token and missing secrets fail closed',async()=>{assert.equal(await validateTelegramInitData(signed(),'wrong',owner,now),null);assert.equal(await validateTelegramInitData(signed(),undefined,owner,now),null);});
