import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {sendFeedback} from '../server/feedback.js';import {createBackupDownload,backupFile,pruneBackupDownloads} from '../server/backup-download.js';import {uploadPicture} from '../server/bot-pictures.js';import {sendSummary} from '../server/summary-delivery.js';import {EMPTY} from '../src/mini-model.js';
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));const env={API_TOKEN:'test-secret',TELEGRAM_OWNER_ID:'111',TELEGRAM_BOT_TOKEN:'test-secret',DB:{prepare(query){let args=[];const stmt={bind(...values){args=values;return stmt;},async first(){return sql.prepare(query).get(...args)||null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return stmt;}}};return {env,sql};}
const input={id:'00000000-0000-4000-8000-000000000001',message:'Не работает кнопка'};
test('G03 accepted feedback survives a lost durable receipt without sending twice',async()=>{const {env,sql}=fixture();try{let sent=0;const send=async()=>{sent++;sql.exec("CREATE TRIGGER fail_feedback_receipt BEFORE UPDATE OF delivered ON user_feedback WHEN NEW.delivered=1 BEGIN SELECT RAISE(ABORT,'lost receipt'); END");};assert.deepEqual(await sendFeedback(env,'111',input,send),{ok:true,receiptPending:true});await assert.rejects(sendFeedback(env,'111',input,send),e=>e.status===409);assert.equal(sent,1);assert.equal(sql.prepare('SELECT delivered FROM user_feedback').get().delivered,2);}finally{sql.close();}});
test('G03 uncertain delivery is not retried; a known rejection can retry the same key',async()=>{const {env,sql}=fixture();try{let attempts=0;await assert.rejects(sendFeedback(env,'111',input,async()=>{attempts++;throw Error('Network lost');}),e=>e.status===409);await assert.rejects(sendFeedback(env,'111',input,async()=>{attempts++;}),e=>e.status===409);assert.equal(attempts,1);sql.exec('DELETE FROM user_feedback');await assert.rejects(sendFeedback(env,'111',input,async()=>{throw Object.assign(Error('Rejected'),{definitelyNotSent:true});}),e=>e.status===503);assert.deepEqual(await sendFeedback(env,'111',input,async()=>{attempts++;}),{ok:true});assert.deepEqual(await sendFeedback(env,'111',input,async()=>{attempts++;}),{ok:true});assert.equal(attempts,2);}finally{sql.close();}});
test('G04 actual upload acceptance survives cache failure and a later text retry',async t=>{let photos=0,texts=0;t.mock.method(globalThis,'fetch',async()=>{photos++;return Response.json({ok:true,result:{message_id:1,photo:[{file_id:'accepted'}]}});});t.mock.method(console,'warn',()=>{});const env={BROWSER:{},TELEGRAM_BOT_TOKEN:'test-only',DB:{prepare(){return {bind(){return this;},async run(){throw Error('Cache unavailable');}};}}};const picture={created_at:Date.now(),cache_key:'test',params:{kind:'summary'},bytes:new Uint8Array([1])},progress={},report={visual:true,from:'2026-11-01',to:'2026-11-01',title:'Сводка',text:'Итог'};const send=async()=>{if(++texts===1)throw Error('429');};const opts={progress,picture:async()=>picture,upload:uploadPicture};await assert.rejects(sendSummary(env,'111',EMPTY,report,send,opts));assert.equal(progress.photoSent,true);await sendSummary(env,'111',EMPTY,report,send,opts);assert.equal(photos,1);assert.equal(texts,2);});
test('G05 issued download survives 60 revisions and snapshot retention until the exact TTL',async()=>{const {env,sql}=fixture();try{const now=Date.now(),data=structuredClone(EMPTY),state={revision:1,data},ticket=await createBackupDownload(env,'111',state,{revision:1,beforeRestore:false},'https://test.invalid',now);for(let i=2;i<=61;i++)sql.prepare('INSERT OR REPLACE INTO user_finance_state(user_id,revision,data,updated_at) VALUES(?,?,?,?)').run('111',i,JSON.stringify({...data,settings:{...data.settings,budget:i}}),now);sql.exec('DELETE FROM user_state_backups');const response=await backupFile(new Request(ticket.url),env,now+1);assert.deepEqual(await response.json(),data);await assert.rejects(backupFile(new Request(ticket.url),env,ticket.expiresAt),e=>e.status===410);await pruneBackupDownloads(env,ticket.expiresAt);assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_backup_exports').get().n,0);}finally{sql.close();}});
test('G05 exports are bounded to three revisions per owner; existing tickets extend safely',async()=>{const {env,sql}=fixture();try{const now=Date.now();for(let revision=1;revision<=3;revision++)await createBackupDownload(env,'111',{revision,data:EMPTY},{revision,beforeRestore:false},'https://test.invalid',now);await assert.rejects(createBackupDownload(env,'111',{revision:4,data:EMPTY},{revision:4,beforeRestore:false},'https://test.invalid',now),e=>e.status===429);await createBackupDownload(env,'111',{revision:3,data:EMPTY},{revision:3,beforeRestore:true},'https://test.invalid',now+1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_backup_exports').get().n,3);await pruneBackupDownloads(env,now+300001);await createBackupDownload(env,'111',{revision:4,data:EMPTY},{revision:4,beforeRestore:false},'https://test.invalid',now+300001);assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_backup_exports').get().n,1);}finally{sql.close();}});
import {sendBotFile} from '../server/bot-files.js';
function largeBackupProfile(){
 const data=structuredClone(EMPTY);
 data.transactions=Array.from({length:4500},(_,i)=>({id:'backup-'+i,type:'expense',date:i===4499?'2026-11-04':'2026-04-01',amount:i+1,currency:'RUB',accountId:'main',cat:'food',note:'Проверка полной истории — '+i+' · '+ 'Покупка '.repeat(20)}));
 data.accounts=[{id:'main',name:'Основная карта',currency:'RUB',balance:12345.67,icon:'wallet',colors:['#abcdef','#123456']},{id:'mei',name:'МЭИ',currency:'RUB',balance:42000,accType:'savings'}];
 data.settings={...data.settings,interfaceVersion:2,notificationMode:'manual',homeOrder:['accounts','recent']};
 data.installments=[{id:'split',name:'Проверка рассрочки',payments:[{id:'payment',date:'2026-11-04',amount:8000,paid:true}]}];
 data.recurring=[{id:'therapy',name:'Психотерапевт',amount:8000}];
 data.history=[{id:'history',after:{note:'Последняя история'}}];
 data.backupTail={marker:'Последнее поле должно сохраниться',unicode:'₽ 🐈'};
 return data;
}
test('Large downloaded JSON retains the final transaction and every profile field byte-for-byte',async()=>{
 const {env,sql}=fixture();try{const data=largeBackupProfile(),expected=JSON.stringify(data,null,2);assert(Buffer.byteLength(expected)>1000000);
 const ticket=await createBackupDownload(env,'111',{revision:9,data},{revision:9,beforeRestore:false},'https://test.invalid');
 const response=await backupFile(new Request(ticket.url),env);const bytes=new Uint8Array(await response.arrayBuffer());
 assert.equal(response.headers.get('X-Burget-Backup-Bytes'),String(bytes.length));assert.equal(response.headers.get('Content-Encoding'),'identity');assert.match(response.headers.get('Cache-Control'),/no-transform/);assert.equal(response.headers.get('X-Burget-Backup-SHA256'),Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'));assert.equal(bytes.length,Buffer.byteLength(expected));assert.equal(new TextDecoder().decode(bytes),expected);assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),data);
 }finally{sql.close();}
});
test('Large bot backup uploads the complete JSON document including its closing bytes',async()=>{
 const previous=globalThis.fetch,data=largeBackupProfile(),expected=JSON.stringify(data,null,2);let calls=0;
 globalThis.fetch=async(url,request)=>{calls++;assert(url.endsWith('/sendDocument'));const file=request.body.get('document');assert.equal(file.size,Buffer.byteLength(expected));assert.equal(await file.text(),expected);assert.deepEqual(JSON.parse(await file.text()),data);return Response.json({ok:true,result:{message_id:1}});};
 try{await sendBotFile({TELEGRAM_BOT_TOKEN:'test-only'},'111',data,'backup.json');assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('Backup download HEAD and resumed byte ranges describe and reconstruct the exact UTF-8 file',async()=>{
 const {env,sql}=fixture();try{
 const data=largeBackupProfile(),ticket=await createBackupDownload(env,'111',{revision:10,data},{revision:10,beforeRestore:false},'https://test.invalid');
 const expected=Buffer.from(JSON.stringify(data,null,2));
 const head=await backupFile(new Request(ticket.url,{method:'HEAD'}),env);
 assert.equal(head.headers.get('Content-Length'),String(expected.length));assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('Accept-Ranges'),'bytes');
 const chunks=[];
 for(const [start,end] of [[0,7693],[7694,108670],[108671,expected.length-1]]){
 const response=await backupFile(new Request(ticket.url,{headers:{Range:`bytes=${start}-${end}`}}),env);
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),`bytes ${start}-${end}/${expected.length}`);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(Number(response.headers.get('Content-Length')),bytes.length);chunks.push(bytes);
 }
 assert.deepEqual(Buffer.concat(chunks),expected);assert.deepEqual(JSON.parse(Buffer.concat(chunks)),data);
 const tail=await backupFile(new Request(ticket.url,{headers:{Range:'bytes=-10'}}),env);assert.deepEqual(Buffer.from(await tail.arrayBuffer()),expected.subarray(-10));
 for(const range of ['bytes=999999999-','bytes=10-1','bytes=-0','bytes=0-1,4-5']){const r=await backupFile(new Request(ticket.url,{headers:{Range:range}}),env);assert.equal(r.status,416);assert.equal(r.headers.get('Content-Range'),`bytes */${expected.length}`);}
 }finally{sql.close();}
});
