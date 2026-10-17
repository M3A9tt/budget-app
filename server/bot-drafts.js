// Telegram draft persistence. Financial writes stay in bot-commit.js.
export async function load(env,userId,id){
 const row=await env.DB.prepare('SELECT * FROM telegram_drafts WHERE id=? AND owner=?').bind(id,userId).first();
 if(!row||row.expires_at<Date.now()||row.consumed)throw Error('Эта карточка уже выполнена или устарела. Открой раздел заново.');
 return {row,p:JSON.parse(row.payload)};
}

export async function create(env,userId,p,prefix='bv_'){
 const id=prefix+crypto.randomUUID().replaceAll('-','');
 await env.DB.prepare('INSERT INTO telegram_drafts(id,owner,payload,expires_at) VALUES(?,?,?,?)')
  .bind(id,userId,JSON.stringify(p),Date.now()+1800000).run();
 return id;
}

export async function replace(env,userId,row,p){
 const payload=JSON.stringify(p);
 const result=await env.DB.prepare('UPDATE telegram_drafts SET payload=? WHERE id=? AND owner=? AND payload=? AND consumed=0')
  .bind(payload,row.id,userId,row.payload).run();
 if(!result.meta.changes)throw Error('Шаг уже изменился. Используй последнее сообщение.');
 return {...row,payload};
}

export async function pendingForm(env,userId){
 const row=await env.DB.prepare("SELECT * FROM telegram_drafts WHERE owner=? AND id GLOB 'bf_*' AND consumed=0 AND expires_at>? ORDER BY expires_at DESC LIMIT 1")
  .bind(userId,Date.now()).first();
 return row?{row,p:JSON.parse(row.payload)}:null;
}
