import test from 'node:test';
import assert from 'node:assert/strict';
import {readRequestText,readJsonObject} from '../server/request-errors.js';

test('Request size is enforced while reading streams even without Content-Length',async()=>{
 let pulls=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(10000));},cancel(){cancelled=true;}});
 const request=new Request('https://test.invalid',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(readRequestText(request,16000),error=>error.status===413);
 assert.equal(cancelled,true);assert.ok(pulls<=3);
});

test('Bounded request reading preserves UTF-8 split across byte chunks',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify({note:'Обед 🍲'}));let offset=0;
 const stream=new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}controller.enqueue(bytes.subarray(offset,++offset));}});
 const request=new Request('https://test.invalid',{method:'POST',body:stream,duplex:'half'});
 assert.deepEqual(await readJsonObject(request),{note:'Обед 🍲'});
});

test('Declared oversize and non-object JSON are structured input errors',async()=>{
 await assert.rejects(readRequestText(new Request('https://test.invalid',{method:'POST',headers:{'Content-Length':'20000'},body:'{}'}),16000),error=>error.status===413);
 for(const body of ['null','[]','42','{'])await assert.rejects(readJsonObject(new Request('https://test.invalid',{method:'POST',body})),error=>error.status===400);
});
