import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
const beforeRoot=resolve(process.argv[2]||''),afterRoot=process.cwd();
if(!process.argv[2]||beforeRoot===afterRoot)throw Error('Pass an isolated checkout of the baseline revision');
async function scenario(root,kind){
 const {broadcastRelease}=await import(pathToFileURL(join(root,'server/releases.js'))),{latestRelease}=await import(pathToFileURL(join(root,'src/release-notes.js')));
 const db=new DatabaseSync(':memory:');db.exec(await readFile(join(root,'server/schema.sql'),'utf8'));
 const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return q;},async batch(rows){db.exec('BEGIN');try{const result=[];for(const r of rows)result.push(await r.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const profile={settings:{notificationMode:kind==='manual'?'manual':'legacy'},accounts:[{id:'fictional-card',currency:'RUB',balance:1000}],transactions:[]};
 db.prepare('INSERT INTO user_finance_state VALUES(?,?,?,?)').run('111',3,JSON.stringify(profile),'2026-10-29');
 const env={DB,TELEGRAM_OWNER_ID:'111',MINI_APP_URL:'https://example.test'},output={sendAttempts:0,accepted:0};
 if(kind==='crash')db.prepare('INSERT INTO user_release_outbox VALUES(?,?,?,?,?)').run('111',latestRelease.id,JSON.stringify({text:'Fictional release',delivery:{phase:'sending',startedAt:1}}),1,0);
 if(kind==='receipt')db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON user_reports_sent BEGIN SELECT RAISE(ABORT,'fixture error'); END");
 const send=async(e,method)=>{if(method!=='sendMessage')return;output.sendAttempts++;if(kind==='forbidden')throw Object.assign(Error('forbidden'),{telegramCode:403,definitelyNotSent:true});output.accepted++;return {message_id:42};};
 try{
  await broadcastRelease(env,send);db.exec('UPDATE user_release_outbox SET lease_until=0');if(kind==='receipt')db.exec('DROP TRIGGER fail_receipt');await broadcastRelease(env,send);
  const row=db.prepare('SELECT payload FROM user_release_outbox').get();output.delivery=row?(JSON.parse(row.payload).delivery?.phase||'queued'):'finalized';output.financialStateUnchanged=db.prepare("SELECT data FROM user_finance_state WHERE user_id='111'").get().data===JSON.stringify(profile);
  return output;
 }finally{db.close();}
}
const result={baseline:'7e2905ddd5458fb5dbac1b117b1f0700f4daa35e',fixture:'isolated SQLite, fictional 1000 RUB, no transactions',scenarios:{}};
for(const kind of ['manual','forbidden','crash','receipt'])result.scenarios[kind]={before:await scenario(beforeRoot,kind),after:await scenario(afterRoot,kind)};
const directory=join(afterRoot,'docs/audit-4.8.0');await mkdir(directory,{recursive:true});await writeFile(join(directory,'before-after.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
