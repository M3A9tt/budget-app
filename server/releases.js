import {botKeyboard,configureMiniAppMenu} from './bot-navigation.js';
import {hasAccess} from './users.js';
import {latestRelease,releaseText} from '../src/release-notes.js';
import {failedDelivery,telegramFailureCode} from './delivery-state.js';
import {recordOperation} from './operations.js';
const quiet=data=>['manual','digest'].includes(data?.settings?.notificationMode);
async function ensureOutbox(env){await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_release_outbox(user_id TEXT NOT NULL,release_id TEXT NOT NULL,payload TEXT NOT NULL,queued_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,release_id))').run();}
async function finalize(env,item){await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO user_reports_sent(user_id,id,created_at) VALUES(?,?,?)').bind(item.user_id,'release:'+item.release_id,Date.now()),
 env.DB.prepare('DELETE FROM user_release_outbox WHERE user_id=? AND release_id=?').bind(item.user_id,item.release_id)
]);}
export async function broadcastRelease(env,send){
 await ensureOutbox(env);const stats={sent:0,failed:0,alreadySent:0,excluded:0,pending:0};let cursor='';
 for(;;){
  const profiles=(await env.DB.prepare('SELECT user_id,data FROM user_finance_state WHERE user_id>? ORDER BY user_id LIMIT 25').bind(cursor).all()).results;
  for(const {user_id:userId,data} of profiles){
   const profile=data?JSON.parse(data):null;
   if(quiet(profile)||!await hasAccess(env,userId)){stats.excluded++;continue;}
   const key='release:'+latestRelease.id;
   if(await env.DB.prepare('SELECT id FROM user_reports_sent WHERE user_id=? AND id=?').bind(userId,key).first()){stats.alreadySent++;continue;}
   const payload=JSON.stringify({text:releaseText(),reply_markup:botKeyboard(env.MINI_APP_URL,profile)});
   await env.DB.prepare('INSERT OR IGNORE INTO user_release_outbox(user_id,release_id,payload,queued_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM user_reports_sent WHERE user_id=? AND id=?)').bind(userId,latestRelease.id,payload,Date.now(),userId,key).run();
  }
  if(profiles.length<25)break;cursor=profiles.at(-1).user_id;
 }
 const pending=await env.DB.prepare("SELECT * FROM user_release_outbox WHERE COALESCE(json_extract(payload,'$.delivery.phase'),'queued') NOT IN ('blocked','uncertain') ORDER BY queued_at,release_id LIMIT 50").all();
 for(const item of pending.results){
  const payload=JSON.parse(item.payload),now=Date.now();
  if(payload.delivery?.phase==='delivered'){await finalize(env,item);continue;}
  if(item.lease_until>now)continue;
  if(payload.delivery?.phase==='sending'){
   payload.delivery.phase='uncertain';await env.DB.prepare('UPDATE user_release_outbox SET payload=? WHERE user_id=? AND release_id=?').bind(JSON.stringify(payload),item.user_id,item.release_id).run();await recordOperation(env,'delivery','uncertain');continue;
  }
  const profile=await env.DB.prepare('SELECT data FROM user_finance_state WHERE user_id=?').bind(item.user_id).first();
  // Unsent older releases are superseded instead of being dumped into a chat.
  if(!profile||quiet(JSON.parse(profile.data))||!await hasAccess(env,item.user_id)||item.release_id!==latestRelease.id){await env.DB.prepare('DELETE FROM user_release_outbox WHERE user_id=? AND release_id=?').bind(item.user_id,item.release_id).run();continue;}
  const claim=await env.DB.prepare('UPDATE user_release_outbox SET lease_until=? WHERE user_id=? AND release_id=? AND lease_until<=?').bind(now+120000,item.user_id,item.release_id,now).run();if(!claim.meta.changes)continue;
  let messageStarted=false;
  try{
   await configureMiniAppMenu(env,item.user_id,send);
   payload.delivery={phase:'sending',startedAt:Date.now()};await env.DB.prepare('UPDATE user_release_outbox SET payload=? WHERE user_id=? AND release_id=?').bind(JSON.stringify(payload),item.user_id,item.release_id).run();messageStarted=true;
   const sent=await send(env,'sendMessage',{chat_id:item.user_id,text:payload.text,reply_markup:payload.reply_markup});
   payload.delivery={...payload.delivery,phase:'delivered',messageId:sent?.message_id};await env.DB.prepare('UPDATE user_release_outbox SET payload=? WHERE user_id=? AND release_id=?').bind(JSON.stringify(payload),item.user_id,item.release_id).run();
   await finalize(env,item);stats.sent++;await recordOperation(env,'delivery','delivered',Date.now()-payload.delivery.startedAt);
  }catch(error){
   stats.failed++;
   // Menu setup is idempotent; failure here cannot have sent the release text.
   payload.delivery=failedDelivery(payload.delivery,messageStarted?error:{telegramCode:error.telegramCode,retryAfter:error.retryAfter,definitelyNotSent:true});
   await env.DB.prepare('UPDATE user_release_outbox SET payload=?,lease_until=? WHERE user_id=? AND release_id=?').bind(JSON.stringify(payload),payload.delivery.retryAt,item.user_id,item.release_id).run();
   await recordOperation(env,'delivery',payload.delivery.phase);if(messageStarted)await recordOperation(env,'telegram',telegramFailureCode(error));
  }
 }
 stats.pending=(await env.DB.prepare('SELECT COUNT(*) n FROM user_release_outbox').first()).n;return stats;
}
