import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {recordOperation,operationsReport,operationsLines,pruneOperations} from '../server/operations.js';
import {getPicture,ensurePictures} from '../server/bot-pictures.js';
import {failedDelivery} from '../server/delivery-state.js';
import {broadcastRelease} from '../server/releases.js';
import {latestRelease} from '../src/release-notes.js';
import {EMPTY,demoData} from '../src/mini-model.js';
import worker from '../server/worker.js';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let args=[];const q={bind(...a){args=a.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return q;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return q;},async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,TELEGRAM_OWNER_ID:'111',TELEGRAM_ALLOWED_IDS:'222',API_TOKEN:'test',PICTURE_QUEUE_MS:'1500',MINI_APP_URL:'https://budget.test'};
 const call=(route,method='GET',body)=>worker.fetch(new Request('https://budget.test/api/v1/'+route,{method,headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);
 const add=(id,mode='legacy')=>db.prepare('INSERT INTO user_finance_state VALUES(?,?,?,?)').run(id,1,JSON.stringify({...structuredClone(EMPTY),settings:{...EMPTY.settings,notificationMode:mode}}),'now');
 return {db,env,call,add,close:()=>db.close()};
}
const png=()=>{const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(16,1280);v.setUint32(20,1800);return b;};
async function until(check){const start=Date.now();while(!check()){if(Date.now()-start>2000)throw Error('Queue test timeout');await new Promise(r=>setTimeout(r,2));}}
async function hold(f){await ensurePictures(f.env);f.db.prepare('INSERT INTO bot_picture_lock VALUES(1,?)').run(Date.now()+10000);}
test('Render queue gives another user a turn before repeated requests, releases leases, and never double renders a shared capture',async()=>{
 const f=fixture(),state={data:demoData()},order=[];try{
  await hold(f);f.db.prepare('INSERT INTO bot_picture_turns VALUES(?,?)').run('111',Date.now());
  const capture=id=>async()=>{order.push(id);return png();};
  const tasks=[getPicture(f.env,'111',state,{kind:'budget'},capture('A1')),getPicture(f.env,'111',state,{kind:'analytics'},capture('A2')),getPicture(f.env,'222',state,{kind:'budget'},capture('B'))];
  await until(()=>f.db.prepare('SELECT COUNT(*) n FROM bot_picture_queue').get().n===3);f.db.exec('UPDATE bot_picture_lock SET lease_until=0');await Promise.all(tasks);
  assert.equal(order[0],'B');assert.equal(order.length,3);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bot_picture_queue').get().n,0);assert.equal(f.db.prepare('SELECT lease_until FROM bot_picture_lock').get().lease_until,0);
  let renders=0;const second={...f.env,DB:{...f.env.DB}},data={data:demoData()};data.data.accounts[0].balance++;
  const once=async()=>{renders++;await new Promise(r=>setTimeout(r,20));return png();};await Promise.all([getPicture(f.env,'111',data,{kind:'budget'},once),getPicture(second,'111',data,{kind:'budget'},once)]);assert.equal(renders,1);
 }finally{f.close();}
});
test('Interactive captures precede new background reports; aging prevents a background report from starving',async()=>{
 for(const aged of [false,true]){const f=fixture(),state={data:demoData()},order=[];try{
  await hold(f);const bg=getPicture(f.env,'111',state,{kind:'budget'},async()=>{order.push('background');return png();},{priority:'background'});
  await until(()=>f.db.prepare('SELECT COUNT(*) n FROM bot_picture_queue').get().n===1);
  if(aged)f.db.prepare('UPDATE bot_picture_queue SET queued_at=?').run(Date.now()-3000);
  const manual=getPicture(f.env,'222',state,{kind:'budget'},async()=>{order.push('interactive');return png();});await until(()=>f.db.prepare('SELECT COUNT(*) n FROM bot_picture_queue').get().n===2);
  f.db.exec('UPDATE bot_picture_lock SET lease_until=0');await Promise.all([bg,manual]);assert.equal(order[0],aged?'background':'interactive');
 }finally{f.close();}}
});
test('Diagnostics aggregate duration and delivery states without identities; retention leaves financial receipts untouched',async()=>{
 const f=fixture(),now=Date.parse('2026-10-29T10:00:00Z');try{
  f.add('111');await recordOperation(f.env,'save','ok',100,now);await recordOperation(f.env,'save','ok',300,now);await recordOperation(f.env,'save','conflict',25,now);assert.equal(await recordOperation(f.env,'save','private payment'),false);
  f.db.prepare('INSERT INTO user_notification_outbox VALUES(?,?,?,?,?)').run('111','secret-purchase','2026-10-29',JSON.stringify({queuedAt:now-120000,body:{text:'private note'},delivery:{phase:'uncertain'}}),0);
  f.db.prepare('INSERT INTO user_idempotency VALUES(?,?,?,?,?)').run('111','old-key','hash','{}',1);
  const report=await operationsReport(f.env,now),row=report.metrics.find(r=>r.code==='ok');assert.equal(row.averageMs,200);assert.equal(row.maxMs,300);assert.equal(report.queues.notifications[0].oldestAgeMs,120000);
  for(const privateValue of ['111','secret-purchase','private note'])assert.ok(!JSON.stringify(report).includes(privateValue));assert.ok(operationsLines(report).join('\n').includes('неизвестным результатом'));
  await pruneOperations(f.env,now+31*86400000);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM service_metrics').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM user_idempotency').get().n,1);
 }finally{f.close();}
});
test('Only owner can read service health; failed diagnostics cannot change a successful financial write',async()=>{
 const f=fixture();try{
  assert.equal((await worker.fetch(new Request('https://budget.test/api/v1/admin/operations'),f.env)).status,401);
  f.env.API_USER_ID='222';assert.equal((await f.call('admin/operations?userId=111')).status,403);delete f.env.API_USER_ID;
  const data={...structuredClone(EMPTY),accounts:[{id:'a',name:'Bank',balance:1000,currency:'RUB'}]};assert.equal((await f.call('state','PUT',{expectedRevision:0,data})).status,200);
  assert.equal((await f.call('state','PUT',{expectedRevision:0,data})).status,409);const report=await(await f.call('admin/operations')).json();assert.ok(report.metrics.some(r=>r.metric==='save'&&r.code==='conflict'));
  const prepare=f.env.DB.prepare;f.env.DB.prepare=sql=>{if(sql.includes('service_metrics'))throw Error('private database failure');return prepare(sql);};
  assert.equal((await f.call('state','PUT',{expectedRevision:1,data})).status,200);assert.equal((await(await f.call('state')).json()).revision,2);
 }finally{f.close();}
});
test('Forbidden and malformed Telegram requests stay blocked even when known not sent; 429 waits and ambiguous outcome is not retried',()=>{
 for(const code of [400,403])assert.equal(failedDelivery({phase:'sending'},{telegramCode:code,definitelyNotSent:true},1000).phase,'blocked');
 const limited=failedDelivery({phase:'sending'},{telegramCode:429,retryAfter:120},1000);assert.equal(limited.phase,'queued');assert.equal(limited.retryAt,121000);
 assert.equal(failedDelivery({phase:'sending'},Error('connection lost')).phase,'uncertain');assert.equal(failedDelivery({phase:'delivered'},Error('receipt failed')).phase,'delivered');
});
test('Release messages respect manual/digest modes and a Telegram acceptance with failed receipt is finalized without another send',async()=>{
 const f=fixture(),sent=[];try{
  f.add('111','manual');f.add('222','digest');let result=await broadcastRelease(f.env,async(e,m,b)=>sent.push(b));assert.equal(result.sent,0);assert.equal(sent.length,0);
  f.db.exec("UPDATE user_finance_state SET data=json_set(data,'$.settings.notificationMode','legacy') WHERE user_id='111'");
  f.db.exec("CREATE TRIGGER fail_release_receipt BEFORE INSERT ON user_reports_sent BEGIN SELECT RAISE(ABORT,'receipt failure'); END");
  const send=async(e,m,b)=>{if(m==='sendMessage')sent.push(b);return {message_id:42};};result=await broadcastRelease(f.env,send);assert.equal(sent.length,1);assert.equal(result.failed,1);
  f.db.exec('DROP TRIGGER fail_release_receipt');await broadcastRelease(f.env,send);assert.equal(sent.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM user_release_outbox').get().n,0);
 }finally{f.close();}
});
test('Ambiguous release sends and a worker crash remain uncertain; a permanent Telegram rejection is never retried hourly',async()=>{
 for(const kind of ['ambiguous','forbidden','menu-forbidden','crash']){const f=fixture();try{
  f.add('111');let calls=0;
  if(kind==='crash')f.db.prepare('INSERT INTO user_release_outbox VALUES(?,?,?,?,?)').run('111',latestRelease.id,JSON.stringify({text:'Release',delivery:{phase:'sending',startedAt:1}}),1,0);
  const send=async(e,m)=>{if(m!=='sendMessage'&&kind!=='menu-forbidden')return;calls++;throw kind.endsWith('forbidden')?Object.assign(Error('forbidden'),{telegramCode:403,definitelyNotSent:true}):Error('lost response');};
  await broadcastRelease(f.env,send);f.db.exec('UPDATE user_release_outbox SET lease_until=0');await broadcastRelease(f.env,send);assert.equal(calls,kind==='crash'?0:1);
  const payload=JSON.parse(f.db.prepare('SELECT payload FROM user_release_outbox').get().payload);assert.equal(payload.delivery.phase,kind.endsWith('forbidden')?'blocked':'uncertain');
 }finally{f.close();}}
});
