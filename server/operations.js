// Service health is aggregated: no user IDs, URLs, amounts, notes or error messages.
const ready=new WeakSet();
const codes={save:['ok','conflict','invalid','unavailable'],render:['ok','cache','busy','quota','failed'],delivery:['delivered','queued','blocked','uncertain','failed'],telegram:['rate_limited','forbidden','bad_request','unavailable','unknown'],cron:['failed']};
export async function ensureOperations(env){
 if(ready.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS service_metrics(hour TEXT NOT NULL,metric TEXT NOT NULL,code TEXT NOT NULL,count INTEGER NOT NULL,total_ms INTEGER NOT NULL,max_ms INTEGER NOT NULL,PRIMARY KEY(hour,metric,code))').run();ready.add(env.DB);
}
export async function recordOperation(env,metric,code,duration=0,now=Date.now()){
 if(!codes[metric]?.includes(code))return false;
 try{
  await ensureOperations(env);const ms=Math.min(86400000,Math.max(0,Math.round(Number(duration)||0)));
  await env.DB.prepare('INSERT INTO service_metrics(hour,metric,code,count,total_ms,max_ms) VALUES(?,?,?,1,?,?) ON CONFLICT(hour,metric,code) DO UPDATE SET count=count+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms)').bind(new Date(now).toISOString().slice(0,13),metric,code,ms,ms).run();return true;
 }catch{return false;} // Diagnostics must never change a financial result.
}
export async function pruneOperations(env,now=Date.now()){
 try{await ensureOperations(env);await env.DB.prepare('DELETE FROM service_metrics WHERE hour<?').bind(new Date(now-30*86400000).toISOString().slice(0,13)).run();}catch{}
}
async function optionalRows(env,sql,args=[]){
 try{return (await env.DB.prepare(sql).bind(...args).all()).results;}catch(error){if(/no such table/i.test(error.message))return [];throw error;}
}
export async function operationsReport(env,now=Date.now()){
 await ensureOperations(env);const from=new Date(now-24*3600000).toISOString().slice(0,13),to=new Date(now).toISOString().slice(0,13);
 const metrics=await optionalRows(env,'SELECT metric,code,SUM(count) count,SUM(total_ms) totalMs,MAX(max_ms) maxMs FROM service_metrics WHERE hour>=? AND hour<=? GROUP BY metric,code ORDER BY metric,code',[from,to]);
 const renders=await optionalRows(env,"SELECT COUNT(*) count,MIN(queued_at) oldest FROM bot_picture_queue WHERE expires_at>?",[now]);
 const notifications=await optionalRows(env,"SELECT COALESCE(json_extract(payload,'$.delivery.phase'),'queued') phase,COUNT(*) count,MIN(COALESCE(json_extract(payload,'$.queuedAt'),json_extract(payload,'$.delivery.startedAt'),0)) oldest FROM user_notification_outbox GROUP BY phase");
 const releases=await optionalRows(env,"SELECT COALESCE(json_extract(payload,'$.delivery.phase'),'queued') phase,COUNT(*) count,MIN(queued_at) oldest FROM user_release_outbox GROUP BY phase");
 const schedule=await optionalRows(env,'SELECT MIN(last_checked) oldest,COUNT(*) count FROM notification_schedule_state');
 const render=renders[0]||{},scan=schedule[0]||{};
 const groups=new Map();for(const row of [...notifications,...releases]){const prev=groups.get(row.phase)||{phase:row.phase,count:0,oldest:0};prev.count+=row.count;if(row.oldest)prev.oldest=prev.oldest?Math.min(prev.oldest,row.oldest):row.oldest;groups.set(row.phase,prev);}
 return {format:'burget-operations',version:1,from:from+':00:00Z',to:new Date(now).toISOString(),metrics:metrics.map(r=>({...r,averageMs:r.count?Math.round(r.totalMs/r.count):0})),queues:{renders:{count:render.count||0,oldestAgeMs:render.oldest?Math.max(0,now-render.oldest):0},notifications:[...groups.values()].map(r=>({phase:r.phase,count:r.count,oldestAgeMs:r.oldest?Math.max(0,now-r.oldest):null}))},scan:{profiles:scan.count||0,oldestAgeMs:scan.oldest?Math.max(0,now-scan.oldest):null}};
}
export function operationsLines(report){
 const count=(metric,code)=>report.metrics.find(r=>r.metric===metric&&r.code===code)?.count||0;
 const saves=report.metrics.filter(r=>r.metric==='save'),n=saves.reduce((s,r)=>s+r.count,0),ms=saves.reduce((s,r)=>s+r.totalMs,0);
 const delivery=phase=>report.queues.notifications.find(r=>r.phase===phase)?.count||0;
 const age=report.scan.oldestAgeMs;
 return ['За последние 24 часа',`Сохранения: ${count('save','ok')} успешных · ${count('save','conflict')} конфликтов · ${count('save','unavailable')} сбоев`,n?`Среднее сохранение: ${Math.round(ms/n)} мс`:'Сохранений пока нет',`Картинки: ${count('render','ok')} новых · ${count('render','cache')} из кэша · ${report.queues.renders.count} в очереди`,`Ожидают отправки: ${delivery('queued')+delivery('sending')}`,`Требуют разбора: ${delivery('uncertain')} с неизвестным результатом · ${delivery('blocked')} запрещённых`,age===null?'Фоновый обход ещё не выполнялся':`Самая старая проверка профиля: ${Math.floor(age/60000)} мин. назад`];
}
