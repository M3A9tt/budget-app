import {latestRelease} from '../src/release-notes.js';
export async function sendFeedback(env,userId,input,send){
 if(!input||typeof input.message!=='string'||input.message.trim().length<5||input.message.length>2000||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id)||Object.keys(input).some(k=>!['message','id'].includes(k)))throw Error('Опиши проблему: от 5 до 2000 символов');
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_feedback(user_id TEXT NOT NULL,id TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL,delivered INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,id))').run();
 const message=input.message.trim(),now=Date.now(),existing=await env.DB.prepare('SELECT * FROM user_feedback WHERE user_id=? AND id=?').bind(userId,input.id).first();
 if(existing&&existing.message!==message)throw Error('Сообщение изменилось: отправь с новым ключом');if(existing?.delivered)return {ok:true};
 const recent=await env.DB.prepare('SELECT id FROM user_feedback WHERE user_id=? AND id<>? AND created_at>? LIMIT 1').bind(userId,input.id,now-60000).first();if(recent)throw Error('Сообщение уже отправлено. Следующее — через минуту');
 await env.DB.prepare('INSERT OR IGNORE INTO user_feedback(user_id,id,message,created_at) VALUES(?,?,?,?)').bind(userId,input.id,message,now).run();
 const claim=await env.DB.prepare('UPDATE user_feedback SET lease_until=? WHERE user_id=? AND id=? AND delivered=0 AND lease_until<=?').bind(now+30000,userId,input.id,now).run();if(!claim.meta.changes)throw Error('Сообщение уже отправляется. Подожди немного');
 try{await send(env,'sendMessage',{chat_id:env.TELEGRAM_OWNER_ID,text:'Бургет · обратная связь\nВерсия: '+(latestRelease.version||latestRelease.id)+'\nПользователь: '+userId+'\n\n'+message});await env.DB.prepare('UPDATE user_feedback SET delivered=1,lease_until=0 WHERE user_id=? AND id=?').bind(userId,input.id).run();return {ok:true};}catch{await env.DB.prepare('UPDATE user_feedback SET lease_until=0 WHERE user_id=? AND id=?').bind(userId,input.id).run();throw Error('Telegram пока не принял сообщение. Попробуй отправить снова');}
}
