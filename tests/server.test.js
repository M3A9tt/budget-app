import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{moscowDate,periodSummary} from '../server/worker.js';
test('Telegram and report dates use Moscow across UTC midnight',()=>assert.equal(moscowDate(new Date('2026-10-12T22:00:00Z')),'2026-10-13'));
test('API fails closed without a token or secrets',async()=>{const r=await worker.fetch(new Request('https://example.org/api/v1/state'),{});assert.equal(r.status,401);});
test('Telegram webhook fails closed without its secret',async()=>{const r=await worker.fetch(new Request('https://example.org/telegram/webhook',{method:'POST',body:'{}'}),{});assert.equal(r.status,401);});
test('Reports separate lunches and real expenses',()=>{const text=periodSummary({transactions:[{type:'expense',cat:'food',date:'2026-10-12',amount:100,amountRub:100},{type:'lunch',cat:'lunch',date:'2026-10-12',amount:379,amountRub:379}],accounts:[{balance:500,currency:'RUB'}],rates:{RUB:1},customCats:[]},'2026-10-12','2026-10-12','Итог');assert.match(text,/Расходы: 100 ₽/);assert.match(text,/компании: 379 ₽/);assert.match(text,/счетах: 500 ₽/);});

test('Authentication storage failures return a safe retryable response',async t=>{
 const logs=[];t.mock.method(console,'error',message=>logs.push(message));
 const env={DB:{prepare(){throw Error('PRIVATE_DATABASE_DETAIL bearer-secret');}}};
 const r=await worker.fetch(new Request('https://example.org/api/v1/state',{headers:{Cookie:'__Host-budget_session=secret-session'}}),env);
 assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');
 const text=await r.text();assert.ok(!text.includes('PRIVATE_DATABASE_DETAIL'));assert.ok(!text.includes('secret'));
 assert.equal(logs.length,1);assert.deepEqual(JSON.parse(logs[0]),{event:'request_failed',method:'GET',path:'/api/v1/state'});
});

test('Invalid webhook and release JSON has a structured client error',async()=>{
 const env={TELEGRAM_WEBHOOK_SECRET:'hook-secret',RELEASE_DEPLOY_TOKEN:'release-secret'};
 for(const [path,header,value] of [['telegram/webhook','X-Telegram-Bot-Api-Secret-Token','hook-secret'],['api/v1/releases/announce','X-Budget-Release-Key','release-secret']]){
  for(const body of ['null','[]','{']){
   const r=await worker.fetch(new Request('https://example.org/'+path,{method:'POST',headers:{[header]:value},body}),env);
   assert.equal(r.status,400);assert.equal(typeof(await r.json()).error,'string');
  }
 }
});
