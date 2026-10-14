import {botKeyboard} from './bot-navigation.js';
import {hasAccess} from './users.js';
import {latestRelease,releaseText} from '../src/release-notes.js';
async function ensureOutbox(env){await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_release_outbox(user_id TEXT NOT NULL,release_id TEXT NOT NULL,payload TEXT NOT NULL,queued_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,release_id))').run();}
export async function broadcastRelease(env,send){
 await ensureOutbox(env);
 const profiles=await env.DB.prepare('SELECT user_id FROM user_finance_state').all(),stats={sent:0,failed:0,alreadySent:0,excluded:0,pending:0};
 const payload=JSON.stringify({text:releaseText(),reply_markup:botKeyboard(env.MINI_APP_URL)});
 for(const {user_id:userId} of profiles.results){
  if(!await hasAccess(env,userId)){stats.excluded++;continue;}
  const key='release:'+latestRelease.id;
  const sent=await env.DB.prepare('SELECT id FROM user_reports_sent WHERE user_id=? AND id=?').bind(userId,key).first();
  if(sent){stats.alreadySent++;continue;}
  await env.DB.prepare('INSERT OR IGNORE INTO user_release_outbox(user_id,release_id,payload,queued_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM user_reports_sent WHERE user_id=? AND id=?)').bind(userId,latestRelease.id,payload,Date.now(),userId,key).run();
 }
 // Retain failed older releases even if a newer version has already been deployed.
 const pending=await env.DB.prepare('SELECT * FROM user_release_outbox ORDER BY queued_at,release_id').all();
 for(const item of pending.results){
  if(!await hasAccess(env,item.user_id)){await env.DB.prepare('DELETE FROM user_release_outbox WHERE user_id=? AND release_id=?').bind(item.user_id,item.release_id).run();continue;}
  const now=Date.now(),claim=await env.DB.prepare('UPDATE user_release_outbox SET lease_until=? WHERE user_id=? AND release_id=? AND lease_until<=?').bind(now+120000,item.user_id,item.release_id,now).run();
  if(!claim.meta.changes)continue;
  try{await send(env,'sendMessage',{chat_id:item.user_id,...JSON.parse(item.payload)});await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO user_reports_sent(user_id,id,created_at) VALUES(?,?,?)').bind(item.user_id,'release:'+item.release_id,Date.now()),
   env.DB.prepare('DELETE FROM user_release_outbox WHERE user_id=? AND release_id=?').bind(item.user_id,item.release_id)
  ]);stats.sent++;}
  catch{stats.failed++;await env.DB.prepare('UPDATE user_release_outbox SET lease_until=? WHERE user_id=? AND release_id=?').bind(Date.now()+60000,item.user_id,item.release_id).run();}
 }
 stats.pending=(await env.DB.prepare('SELECT COUNT(*) n FROM user_release_outbox').first()).n;
 return stats;
}
