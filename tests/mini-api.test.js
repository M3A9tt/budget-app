import test from 'node:test';import assert from 'node:assert/strict';import {apiRequest} from '../src/mini-api.js';
test('Concurrent state reads share a request, return independent objects, and do not cache finished data',async()=>{const original=globalThis.fetch;let count=0,release;globalThis.fetch=async()=>{count++;if(count===1)await new Promise(r=>release=r);return Response.json({revision:count,data:{value:count}});};try{const a=apiRequest('state'),b=apiRequest('state');release();const [aa,bb]=await Promise.all([a,b]);assert.equal(count,1);aa.data.value=99;assert.equal(bb.data.value,1);assert.equal((await apiRequest('state')).revision,2);}finally{globalThis.fetch=original;}});
test('Failed state read can retry and writes are never merged',async()=>{const original=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;return count===1?Response.json({error:'try again'},{status:503}):Response.json({revision:count});};try{await assert.rejects(apiRequest('state'));assert.equal((await apiRequest('state')).revision,2);await Promise.all([apiRequest('state',{method:'PUT',body:'{}'}),apiRequest('state',{method:'PUT',body:'{}'})]);assert.equal(count,4);const attempts=[];globalThis.fetch=async(_url,options)=>{attempts.push(options);if(attempts.length===1)throw new TypeError('reply lost');return Response.json({revision:1});};const payload=JSON.stringify({expectedRevision:0,data:{accounts:[]}});assert.equal((await apiRequest('state',{method:'PUT',body:payload})).revision,1);assert.equal(attempts.length,2);assert.equal(attempts[0].body,attempts[1].body);assert.equal(attempts[0].headers['Idempotency-Key'],attempts[1].headers['Idempotency-Key']);assert.ok(attempts[0].headers['Idempotency-Key']);}finally{globalThis.fetch=original;}});

test('Timed-out writes retry once with the same receipt and remain uncertain until state reconciliation',async t=>{
 const original=globalThis.fetch,attempts=[];t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=(_url,options)=>{attempts.push(options);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));};
 try{
  const pending=apiRequest('state',{method:'PUT',body:'{"expectedRevision":0}'}).catch(e=>e);
  t.mock.timers.tick(15000);await new Promise(setImmediate);
  assert.equal(attempts.length,2);assert.equal(attempts[0].headers['Idempotency-Key'],attempts[1].headers['Idempotency-Key']);
  t.mock.timers.tick(15000);const error=await pending;
  assert.match(error.message,/15 секунд/);assert.equal(error.uncertain,true);assert.ok(attempts.every(a=>a.signal.aborted));
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});

test('A malformed success response cannot hide an uncertain state write; HTML authentication errors do not retry',async()=>{
 const original=globalThis.fetch;let count=0;
 try{
  globalThis.fetch=async()=>{count++;return new Response('<html>gateway</html>',{status:200});};
  await assert.rejects(apiRequest('state',{method:'PUT',body:'{}'}),e=>e.uncertain===true&&/нечитаемый/.test(e.message));assert.equal(count,2);
  count=0;globalThis.fetch=async()=>{count++;return new Response('<html>login</html>',{status:401});};
  await assert.rejects(apiRequest('state',{method:'PUT',body:'{}'}),e=>e.status===401);assert.equal(count,1);
 }finally{globalThis.fetch=original;}
});

test('Offline read reports connectivity and the next state read is not stuck behind its failed promise',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(apiRequest('state'),/Проверьте интернет/);
  globalThis.fetch=async()=>Response.json({revision:9});assert.equal((await apiRequest('state')).revision,9);
 }finally{globalThis.fetch=original;}
});
