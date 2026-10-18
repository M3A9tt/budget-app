import {commitBotAction} from '../server/bot-commit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../server/worker.js';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
  const DB={prepare(sql){let args=[];const stmt={bind(...a){args=a;return stmt;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};return stmt;},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={DB,TELEGRAM_OWNER_ID:'111',API_TOKEN:'test-only-secret'};
  const call=(path,method='GET',body,headers={})=>worker.fetch(new Request('https://test.invalid/api/v1/'+path,{method,headers:{Authorization:'Bearer test-only-secret','Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);
  const data={transactions:[],accounts:[{id:'rub',name:'Сбер',currency:'RUB',balance:10000}],rates:{RUB:1,USD:92}};
  return {call,data,sqlite,env};
}
test('D1 SQL import preserves account balance and rejects conflicting revision',async()=>{const {call,data}=fixture();assert.equal((await call('state','PUT',{expectedRevision:0,data})).status,200);const snapshot=await (await call('state')).json();assert.equal(snapshot.data.accounts[0].balance,10000);assert.equal(snapshot.revision,1);assert.equal((await call('state','PUT',{expectedRevision:0,data})).status,409);});
test('D1 SQL idempotent purchase atomically changes balance once',async()=>{const {call,data}=fixture();await call('state','PUT',{expectedRevision:0,data});const tx={type:'expense',cat:'food',currency:'USD',amount:10,date:'2026-10-12',accountId:'rub'};const first=await (await call('transactions','POST',tx,{'Idempotency-Key':'same-request'})).json();const second=await (await call('transactions','POST',tx,{'Idempotency-Key':'same-request'})).json();assert.equal(first.transaction.id,second.transaction.id);const snapshot=await (await call('state')).json();assert.equal(snapshot.data.transactions.length,1);assert.equal(snapshot.data.accounts[0].balance,9080);assert.equal(snapshot.revision,2);});
test('Idempotency key cannot be reused with different payload',async()=>{const {call,data}=fixture();await call('state','PUT',{expectedRevision:0,data});const tx={type:'expense',cat:'food',currency:'RUB',amount:10,date:'2026-10-12',accountId:'rub'};await call('transactions','POST',tx,{'Idempotency-Key':'key'});assert.equal((await call('transactions','POST',{...tx,amount:100},{'Idempotency-Key':'key'})).status,400);const snapshot=await (await call('state')).json();assert.equal(snapshot.data.accounts[0].balance,9990);});
test('Invalid imports and invalid writes do not mutate stored snapshot',async()=>{const {call,data}=fixture();await call('state','PUT',{expectedRevision:0,data});assert.equal((await call('state','PUT',{expectedRevision:1,data:{transactions:null}})).status,400);assert.equal((await call('transactions','POST',{amount:-10},{'Idempotency-Key':'invalid'})).status,400);const snapshot=await (await call('state')).json();assert.equal(snapshot.revision,1);assert.equal(snapshot.data.accounts[0].balance,10000);});
test('State receipts survive lost replies; API and bot share bounded, recoverable snapshots',async()=>{
 const {call,data,sqlite,env}=fixture(),body={expectedRevision:0,data},headers={'Idempotency-Key':'stable-state'};
 assert.equal((await call('state','PUT',body,headers)).status,200);
 assert.equal((await(await call('state','PUT',body,headers)).json()).revision,1);
 assert.equal((await call('state','PUT',{...body,data:{...data,accounts:[]} },headers)).status,409);
 assert.equal((await(await call('state')).json()).revision,1);
 const tx={type:'expense',cat:'food',amount:100,currency:'RUB',date:'2026-10-12',accountId:'rub'};
 assert.equal((await call('transactions','POST',tx,{'Idempotency-Key':'purchase-with-backup'})).status,201);
 assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM user_state_backups WHERE user_id='111' AND revision=1").get().data).accounts[0].balance,10000);
 const invalid={...(await(await call('state')).json()).data,transactions:[{...tx,id:'future',date:'2099-01-01'}]};assert.equal((await call('state','PUT',{expectedRevision:2,data:invalid})).status,400);
 const read=async()=>await(await call('state')).json();
 for(let i=0;i<60;i++){const state=await read(),id='retention-'+i,p={kind:'bot-form',op:'rename',args:{id:'rub'},values:{name:'Bank '+i},revision:state.revision};sqlite.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?)').run(id,'111',JSON.stringify(p),Date.now()+60000);await commitBotAction(env,'111',id,p,read);}
 assert.equal(sqlite.prepare("SELECT count(*) n FROM user_state_backups WHERE user_id='111'").get().n,50);
 const state=await read();assert.equal(state.data.accounts[0].balance,9900);assert.equal(state.data.transactions.length,1);
 assert.equal((await(await call('state','PUT',body,headers)).json()).revision,1);assert.equal((await read()).revision,state.revision);
 sqlite.close();
});

function interleaveOnce(env,sqlToIntercept,winner){
 const prepare=env.DB.prepare.bind(env.DB);let ran=false;
 env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql===sqlToIntercept){const first=stmt.first.bind(stmt);stmt.first=async()=>{const row=await first();if(!ran){ran=true;await winner();}return row;};}return stmt;};
}
test('A bot confirmation that loses the write race returns the winning receipt without a second debit',async()=>{
 const {call,data,sqlite,env}=fixture();await call('state','PUT',{expectedRevision:0,data});const read=async()=>await(await call('state')).json(),state=await read();
 const p={kind:'bot-form',op:'tx',args:{type:'expense'},values:{amount:100,currency:'RUB',accountId:'rub',cat:'food',date:'2026-10-12'},revision:state.revision},id='bf_race';
 sqlite.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?)').run(id,'111',JSON.stringify(p),Date.now()+60000);
 const result=await commitBotAction(env,'111',id,p,async()=>{await commitBotAction(env,'111',id,p,read);return state;});
 assert.equal(result.duplicate,true);assert.equal(result.revision,2);assert.equal((await read()).data.accounts[0].balance,9900);assert.equal((await read()).data.transactions.length,1);sqlite.close();
});
test('Concurrent whole-state retries with the same key return the stored success rather than a false conflict',async()=>{
 const {call,data,sqlite,env}=fixture();await call('state','PUT',{expectedRevision:0,data});
 const d=(await(await call('state')).json()).data;d.settings.budget=3000;const body={expectedRevision:1,data:d},headers={'Idempotency-Key':'raced-state'};
 interleaveOnce(env,'SELECT revision,data FROM user_finance_state WHERE user_id=?',async()=>assert.equal((await call('state','PUT',body,headers)).status,200));
 const response=await call('state','PUT',body,headers);assert.equal(response.status,200);assert.equal((await response.json()).revision,2);assert.equal((await(await call('state')).json()).revision,2);sqlite.close();
});
test('Concurrent transaction retries reuse the winner receipt and still reject a changed request',async()=>{
 const {call,data,sqlite,env}=fixture();await call('state','PUT',{expectedRevision:0,data});
 const input={type:'expense',cat:'food',amount:100,currency:'RUB',date:'2026-10-12',accountId:'rub'},headers={'Idempotency-Key':'raced-tx'};
 interleaveOnce(env,'SELECT result,request_hash FROM user_idempotency WHERE user_id=? AND id=?',async()=>assert.equal((await call('transactions','POST',input,headers)).status,201));
 const result=await call('transactions','POST',input,headers);assert.equal(result.status,201);assert.equal((await(await call('state')).json()).data.accounts[0].balance,9900);
 assert.equal((await call('transactions','POST',{...input,amount:200},headers)).status,400);sqlite.close();
});
