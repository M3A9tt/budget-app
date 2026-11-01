import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {EMPTY,dashboard} from '../src/mini-model.js';
import {transferMoney,deleteTransaction,putTransaction} from '../src/ledger.js';
import {reverseTransfer} from '../src/transfer-actions.js';
import {repayDebt} from '../src/debt-actions.js';
import {debtRemaining} from '../src/debt-state.js';
import {sendFeedback} from '../server/feedback.js';
import {sendSummary} from '../server/summary-delivery.js';
import {createBackupDownload,backupFile} from '../server/backup-download.js';
import {encodeState} from '../server/state-persistence.js';
import {spendingReport} from '../src/analytics-report.js';
import {cashTimeline} from '../src/finance-events.js';
const base=()=>({...structuredClone(EMPTY),accounts:[{id:'a',name:'Карта',balance:1000,currency:'RUB'},{id:'b',name:'Наличные',balance:0,currency:'RUB'}]});
function database(){const db=new DatabaseSync(':memory:');const DB={prepare(sql){let args=[];const s={bind(...a){args=a;return s;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return s;},async batch(rows){db.exec('BEGIN');try{const out=[];for(const s of rows)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};return {db,env:{DB,TELEGRAM_OWNER_ID:'111',API_TOKEN:'fictional-audit-key'}};}
const findings=[];
{
 const d=transferMoney(base(),{id:'move',from:'a',to:'b',amount:100,fee:5,date:'2026-11-01'}),fee=d.transactions.find(t=>t.transferId==='move'),next=deleteTransaction(d,fee.id);let error='';try{reverseTransfer(next,'move');}catch(e){error=e.message;}
 findings.push({id:'G01',scenario:'Delete explicitly linked transfer commission, then cancel transfer',expected:'Transfer remains cancellable or standalone fee deletion is refused before mutation',actual:{balance:next.accounts.map(a=>a.balance),transferFee:next.transfers[0].fee,feeRecords:next.transactions.filter(t=>t.transferId==='move').length,cancellationError:error},violated:!!error});
 const withDebt={...d,debts:[{id:'debt',person:'Вымышленный кредитор',type:'my',amount:5,currency:'RUB',payments:[],closed:false}]};const linked=repayDebt(withDebt,{id:'debt',transactionId:fee.id});
 findings.push({id:'G02',scenario:'Offer a bank commission as an existing debt repayment',expected:'A transfer commission cannot repay a creditor',actual:{remaining:debtRemaining(linked.debts[0],linked),commissionAlsoDebt:linked.transactions.find(t=>t.id===fee.id).debtId==='debt',balancesUnchanged:JSON.stringify(linked.accounts)===JSON.stringify(d.accounts)},violated:debtRemaining(linked.debts[0],linked)===0});
}
{
 const {db,env}=database();let accepted=0;const input={id:'11111111-1111-4111-8111-111111111111',message:'Вымышленная обратная связь'};
 // Prepare table without sending. Inject a failure only after acceptance.
 db.exec('CREATE TABLE user_feedback(user_id TEXT,id TEXT,message TEXT,created_at INTEGER,delivered INTEGER DEFAULT 0,lease_until INTEGER DEFAULT 0,PRIMARY KEY(user_id,id));');db.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON user_feedback WHEN NEW.delivered=1 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");let firstStatus=200;
 try{await sendFeedback(env,'111',input,async()=>{accepted++;});}catch(e){firstStatus=e.status;}
 db.exec('DROP TRIGGER fail_receipt');await sendFeedback(env,'111',input,async()=>{accepted++;});findings.push({id:'G03',scenario:'Feedback accepted externally; database receipt fails; caller retries same ID',expected:'At most one accepted message or explicit uncertain state without blind resend',actual:{firstStatus,acceptedMessages:accepted},violated:accepted>1});db.close();
}
{
 const progress={},report={visual:true,from:'2026-10-01',to:'2026-10-01',title:'Вымышленный итог',text:'Текст'},env={BROWSER:{}},options={progress,picture:async()=>({}),upload:async()=>{photos++;if(photos===1)throw Error('file_id cache failed after photo acceptance');}};let photos=0;
 try{await sendSummary(env,'111',base(),report,async()=>{throw Object.assign(Error('rate limit'),{telegramCode:429,definitelyNotSent:true});},options);}catch{}
 await sendSummary(env,'111',base(),report,async()=>{},options);findings.push({id:'G04',scenario:'Photo accepted then file_id cache fails; full text gets known 429; retry summary',expected:'Do not resend an already accepted photo',actual:{acceptedPhotos:photos},violated:photos>1});
}
{
 const {db,env}=database();db.exec(await readFile('server/schema.sql','utf8'));const data=base(),stamp=Date.now();db.prepare('INSERT INTO user_finance_state VALUES(?,?,?,?)').run('111',1,JSON.stringify(data),'now');const prepared=await createBackupDownload(env,'111',{revision:1,data},{revision:1,beforeRestore:false},'https://fictional.test',stamp);
 // Reproduce the existing 50-snapshot retention after 60 writes, with no elapsed TTL.
 for(let revision=2;revision<=61;revision++){db.prepare('INSERT INTO user_state_backups VALUES(?,?,?,?)').run('111',revision-1,JSON.stringify(data),'now');db.prepare('UPDATE user_finance_state SET revision=? WHERE user_id=?').run(revision,'111');db.prepare('DELETE FROM user_state_backups WHERE user_id=? AND revision NOT IN(SELECT revision FROM user_state_backups WHERE user_id=? ORDER BY revision DESC LIMIT 50)').run('111','111');}
 let status=200;try{await backupFile(new Request(prepared.url),env,stamp+1000);}catch(e){status=e.status;}
 findings.push({id:'G05',scenario:'Prepared download link followed after 60 writes but only one second of five-minute TTL',expected:'Prepared exact-revision download remains available until stated expiry',actual:{status,elapsedMs:1000,ttlMs:prepared.expiresAt-stamp},violated:status!==200});db.close();
}
{
 const source=await readFile('src/MiniApp.jsx','utf8');const condition=source.match(/if\((!busyRef\.current&&next\.revision>=ref\.current\.revision)\)/)?.[1];if(!condition)throw Error('Refresh condition changed; reassess finding');
 const evaluate=new Function('busyRef','next','ref','return '+condition);const current={userId:'fictional-A',revision:10};
 const cases=[{next:{userId:'fictional-B',revision:1},expected:true},{next:{userId:'fictional-A',revision:9},expected:false},{next:{userId:'fictional-A',revision:11},expected:true}].map(c=>({...c,actual:evaluate({current:false},c.next,{current})}));
 findings.push({id:'G06',scenario:'Refresh after login changes to another owner with a lower per-owner revision',method:'Evaluate the exact source guard; browser E2E not claimed',expected:'Compare revision only within one owner',actual:{cases},violated:cases.some(c=>c.expected!==c.actual)});
}
{
 const next=putTransaction(base(),{id:'lunch-expense',type:'expense',cat:'lunch',accountId:'a',amount:100,date:'2026-11-01'});
 findings.push({id:'G07',scenario:'API/domain accepts expense + lunch category + personal account',expected:'Explicit expense must debit its account or conflicting corporate-lunch fields must be rejected',actual:{balance:next.accounts[0].balance,accountId:next.transactions[0].accountId||null,type:next.transactions[0].type,category:next.transactions[0].cat},violated:next.accounts[0].balance!==900});
}
const benchmarks=[];
for(const count of [100,1000,5000,10000]){const data=base();data.transactions=Array.from({length:count},(_,i)=>({id:'tx-'+i,type:i%5?'expense':'income',cat:'food',amount:10,currency:'RUB',amountRub:10,accountAmount:10,accountId:'a',date:'2026-10-'+String(i%28+1).padStart(2,'0'),note:'Вымышленная запись'}));data.recurring=Array.from({length:50},(_,i)=>({id:'r'+i,name:'План '+i,type:'expense',amount:10,currency:'RUB',accountId:'a',frequency:'monthly',startDate:'2026-01-01',dueDay:10,active:true}));const times=[];for(let j=0;j<5;j++){const start=performance.now();dashboard(data,'2026-11-01');spendingReport(data,'2026-11-01');cashTimeline(data,'2026-11-01',30);times.push(performance.now()-start);}let accepted=true;try{encodeState(data);}catch{accepted=false;}benchmarks.push({transactions:count,plans:50,bytes:new TextEncoder().encode(JSON.stringify(data)).length,medianCombinedReadMs:Math.round(times.sort((a,b)=>a-b)[2]*100)/100,stateWritable:accepted});}
const modules=[];for(const folder of ['src','server'])for(const file of await readdir(folder))if(/\.(jsx?|mjs)$/.test(file)){const name=folder+'/'+file,text=await readFile(name,'utf8'),deps=[...text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)].map(m=>path.posix.normalize(path.posix.join(folder,m[1]))).filter(x=>/\.(jsx?|mjs)$/.test(x));modules.push({name,bytes:Buffer.byteLength(text),dependencies:[...new Set(deps)]});}
const result={source:'2123dffc129a7a3e272a6888a0128a4bfee20149',fictional:true,financialProductionReads:0,findings,benchmarks,modules};await writeFile('docs/global-audit-2026-11-01/evidence.json',JSON.stringify(result,null,2));console.log(JSON.stringify({findings,benchmarks,moduleCount:modules.length},null,2));
