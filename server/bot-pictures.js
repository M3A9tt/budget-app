import {isSavings} from '../src/savings.js';
import {todayMoscow} from '../src/mini-model.js';
import {latestRelease} from '../src/release-notes.js';
export const PICTURE_ERROR='Картинку пока не удалось подготовить. Данные доступны в разделе и миниаппе. Попробуй немного позже.';
const TTL=8*60*60*1000,MAX_BYTES=1_800_000;
const ready=new WeakSet();
export async function ensurePictures(env){
 if(ready.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS bot_pictures(user_id TEXT NOT NULL,cache_key TEXT NOT NULL,png BLOB NOT NULL,file_id TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(user_id,cache_key))').run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS bot_picture_limits(day TEXT PRIMARY KEY,used INTEGER NOT NULL)').run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS bot_picture_lock(id INTEGER PRIMARY KEY,lease_until INTEGER NOT NULL)').run();ready.add(env.DB);
}
export function pictureParams(input={},data){
 const kind=['budget','analytics','categories','forecast','lunch','savings'].includes(input.kind)?input.kind:null;if(!kind)throw Error('Неизвестная картинка');
 const today=todayMoscow(data.settings.timeZone),month=input.month||today.slice(0,7);
 if(kind==='lunch'&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>today.slice(0,7)))throw Error('Выбери прошедший или текущий месяц');
 const page=Number(input.page||0);if(kind==='savings'&&(!Number.isInteger(page)||page<0||page>Math.max(0,Math.ceil(Math.max(data.accounts.filter(isSavings).length,data.goals.length)/6)-1)))throw Error('Страница отсутствует');
 return {kind,...(['analytics','categories'].includes(kind)?{days:input.days===7?7:30}:{}),...(kind==='lunch'?{month}:{}),...(kind==='savings'?{page}:{})};
}
export function pngInfo(bytes){
 if(bytes.length<24||bytes.length>MAX_BYTES||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('Invalid screenshot');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 if(!width||!height||width+height>10000||Math.max(width/height,height/width)>20)throw Error('Invalid screenshot size');return {width,height,bytes:bytes.length};
}
export async function capturePicture(env,data,params){
 if(!env.BROWSER?.quickAction)throw Error('Browser unavailable');
 const {renderReportHtml}=await import('./report-html.jsx');
 const html=renderReportHtml(data,params);
 const response=await env.BROWSER.quickAction('screenshot',{html,selector:'#report-card',viewport:{width:640,height:1600,deviceScaleFactor:2},setJavaScriptEnabled:false,actionTimeout:8000,gotoOptions:{timeout:8000,waitUntil:'load'},screenshotOptions:{type:'png',captureBeyondViewport:true}});
 if(!response.ok)throw Error('Screenshot unavailable');
 // Bound the response before persisting it in D1; no HTML or user data is logged.
 const reader=response.body.getReader(),parts=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_BYTES){await reader.cancel();throw Error('Screenshot too large');}parts.push(value);}
 const bytes=new Uint8Array(total);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length;}pngInfo(bytes);return bytes;
}
export async function getPicture(env,userId,state,input,capture=capturePicture){
 const params=pictureParams(input,state.data);await ensurePictures(env);const now=Date.now(),day=todayMoscow(state.data.settings.timeZone),key=JSON.stringify([latestRelease.id,state.revision,day,params]);
 await env.DB.prepare('DELETE FROM bot_pictures WHERE expires_at<?').bind(now).run();
 const cached=await env.DB.prepare('SELECT * FROM bot_pictures WHERE user_id=? AND cache_key=? AND expires_at>?').bind(String(userId),key,now).first();
 if(cached)return {...cached,params,bytes:new Uint8Array(cached.png)};
 await env.DB.prepare('INSERT OR IGNORE INTO bot_picture_lock(id,lease_until) VALUES(1,0)').run();
 const lock=await env.DB.prepare('UPDATE bot_picture_lock SET lease_until=? WHERE id=1 AND lease_until<?').bind(now+45000,now).run();if(!lock.meta.changes)throw Error('Рендер занят');
 try{
  // Atomic global cap also covers failed renders and demo smoke checks.
  const permit=await env.DB.prepare('INSERT INTO bot_picture_limits(day,used) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET used=used+1 WHERE used<24 RETURNING used').bind(new Date().toISOString().slice(0,10)).first();if(!permit)throw Error('Дневной лимит картинок');
  await env.DB.prepare('DELETE FROM bot_picture_limits WHERE day<?').bind(new Date(now-7*86400000).toISOString().slice(0,10)).run();
  const bytes=await capture(env,state.data,params);pngInfo(bytes);
  await env.DB.prepare('INSERT OR REPLACE INTO bot_pictures(user_id,cache_key,png,file_id,created_at,expires_at) VALUES(?,?,?,NULL,?,?)').bind(String(userId),key,bytes.buffer,now,now+TTL).run();
  return {user_id:String(userId),cache_key:key,bytes,params,created_at:now};
 }finally{await env.DB.prepare('UPDATE bot_picture_lock SET lease_until=0 WHERE id=1 AND lease_until=?').bind(now+45000).run();}
}
export async function originalPicture(env,userId,key){
 await ensurePictures(env);const cached=await env.DB.prepare('SELECT * FROM bot_pictures WHERE user_id=? AND cache_key=? AND expires_at>?').bind(String(userId),String(key),Date.now()).first();
 if(!cached)throw Error('Снимок устарел');return {...cached,bytes:new Uint8Array(cached.png),params:JSON.parse(cached.cache_key)[3]};
}
export async function uploadPicture(env,userId,picture,markup,original=false,caption){
 const form=new FormData(),method=original?'sendDocument':'sendPhoto';form.set('chat_id',String(userId));
 const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(picture.created_at));
 form.set('caption',(caption||`Бюрджет · ${date}\nСнимок из миниаппы · ${picture.params.kind==='lunch'?picture.params.month:'данные на момент создания'}`).slice(0,1000));
 if(markup)form.set('reply_markup',JSON.stringify(markup));
 if(!original&&picture.file_id)form.set('photo',picture.file_id);else form.set(original?'document':'photo',new Blob([picture.bytes],{type:'image/png'}),`byurdzhet-${picture.params.kind}.png`);
 const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)}),result=await response.json();if(!response.ok||!result.ok)throw Error('Telegram не принял картинку');
 const id=result.result?.photo?.at(-1)?.file_id;if(id)await env.DB.prepare('UPDATE bot_pictures SET file_id=? WHERE user_id=? AND cache_key=?').bind(id,String(userId),picture.cache_key).run();return result.result;
}
