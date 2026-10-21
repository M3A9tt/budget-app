import {RequestError,validateInput} from './request-errors.js';
import {validateTelemetry} from '../src/telemetry-events.js';
const ready=new WeakSet();
async function ensure(env){if(ready.has(env.DB))return;await env.DB.batch([
 env.DB.prepare('CREATE TABLE IF NOT EXISTS ui_telemetry(day TEXT NOT NULL,event TEXT NOT NULL,screen TEXT NOT NULL,device TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,event,screen,device))'),
 env.DB.prepare('CREATE TABLE IF NOT EXISTS ui_telemetry_receipts(day TEXT NOT NULL,actor TEXT NOT NULL,id TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,actor,id))')]);ready.add(env.DB);}
export async function collectTelemetry(env,userId,input,consent,now=new Date()){
 if(consent!==true)return {accepted:0,disabled:true};
 validateInput(()=>validateTelemetry(input));await ensure(env);const day=now.toISOString().slice(0,10),cutoff=new Date(now.getTime()-90*86400000).toISOString().slice(0,10);
 // Daily salted digest is only used to cap/deduplicate requests and expires after 48 hours.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.TELEGRAM_BOT_TOKEN}:${day}:${userId}`));const actor=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
 const total=(await env.DB.prepare('SELECT COALESCE(SUM(count),0) n FROM ui_telemetry_receipts WHERE day=? AND actor=?').bind(day,actor).first()).n;
 if(total+input.events.length>2000)throw new RequestError('Лимит телеметрии');
 const added=await env.DB.prepare('INSERT OR IGNORE INTO ui_telemetry_receipts(day,actor,id,count) VALUES(?,?,?,?)').bind(day,actor,input.id,input.events.length).run();if(!added.meta.changes)return {accepted:0,duplicate:true};
 const groups=new Map();for(const e of input.events){const key=[e.event,e.screen,e.device].join('|');groups.set(key,(groups.get(key)||0)+1);}
 await env.DB.batch([...groups].map(([key,count])=>env.DB.prepare('INSERT INTO ui_telemetry(day,event,screen,device,count) VALUES(?,?,?,?,?) ON CONFLICT(day,event,screen,device) DO UPDATE SET count=count+excluded.count').bind(day,...key.split('|'),count)));
 await env.DB.batch([env.DB.prepare('DELETE FROM ui_telemetry WHERE day<?').bind(cutoff),env.DB.prepare('DELETE FROM ui_telemetry_receipts WHERE day<?').bind(new Date(now.getTime()-86400000).toISOString().slice(0,10))]);
 return {accepted:input.events.length};
}
export async function telemetryReport(env,now=new Date()){await ensure(env);const from=new Date(now.getTime()-29*86400000).toISOString().slice(0,10),to=now.toISOString().slice(0,10);return {format:'burget-telemetry',version:1,from,to,rows:(await env.DB.prepare('SELECT day,event,screen,device,count FROM ui_telemetry WHERE day>=? AND day<=? ORDER BY day DESC,count DESC').bind(from,to).all()).results};}

export async function pruneTelemetry(env,now=new Date()){await ensure(env);await env.DB.batch([env.DB.prepare('DELETE FROM ui_telemetry WHERE day<?').bind(new Date(now.getTime()-90*86400000).toISOString().slice(0,10)),env.DB.prepare('DELETE FROM ui_telemetry_receipts WHERE day<?').bind(new Date(now.getTime()-86400000).toISOString().slice(0,10))]);}
