import {showBotView} from '../server/bot-chat.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../server/worker.js';
import {EMPTY,todayMoscow,dashboard} from '../src/mini-model.js';
import {botView} from '../server/bot-views.js';
import {applyBotAction,fieldsFor,botImportPreview,parseField} from '../server/bot-catalog.js';
import {debtRemaining} from '../src/debt-state.js';
const today=todayMoscow();
const seed=()=>({...structuredClone(EMPTY),accounts:[{id:'bank',name:'Банк',currency:'RUB',balance:10000},{id:'reserve',name:'Наличный резерв',currency:'RUB',balance:2000,accType:'savings',storageKind:'cash'}],installments:[],reconciliations:[]});
function fixture(data=seed()){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let args=[];const s={bind(...a){args=a.map(x=>x instanceof ArrayBuffer?new Uint8Array(x):x);return s;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};return s;},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const env={DB,TELEGRAM_OWNER_ID:'111',TELEGRAM_ALLOWED_IDS:'222',TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_WEBHOOK_SECRET:'test-hook',API_TOKEN:'test-api',MINI_APP_URL:'https://budget.test'};
 for(const id of ['111','222'])sqlite.prepare('INSERT INTO user_finance_state VALUES(?,1,?,?)').run(id,JSON.stringify(data),'test');sqlite.prepare("INSERT INTO legacy_owner_migrations VALUES('111',0)").run();
 const sent=[],files=new Map(),original=globalThis.fetch;let sequence=100;
 globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('/file/bot'))return new Response(files.get(String(url).split('/').at(-1))||'');
  if(options.body instanceof FormData&&['sendPhoto','editMessageMedia'].some(m=>String(url).endsWith('/'+m))){sent.push({method:String(url).split('/').at(-1),body:{chat_id:options.body.get('chat_id'),message_id:options.body.get('message_id'),text:options.body.get('caption')||JSON.parse(options.body.get('media')).caption,reply_markup:JSON.parse(options.body.get('reply_markup')),photo:options.body.get('photo')}});return Response.json({ok:true,result:{message_id:++sequence,photo:[{file_id:'cached-photo'}]}});}
  if(options.body instanceof FormData){sent.push({method:'sendDocument',body:{chat_id:options.body.get('chat_id'),document:await options.body.get('document').text()}});return Response.json({ok:true,result:{message_id:++sequence}});}
  const body=JSON.parse(options.body);sent.push({method:String(url).split('/').at(-1),body});if(String(url).endsWith('/getFile'))return Response.json({ok:true,result:{file_path:'documents/'+body.file_id}});return Response.json({ok:true,result:{message_id:body.message_id||++sequence}});
 };
 async function update(text='',callback,who=111,extra={}){const content=callback?{callback_query:{id:'c'+sequence,from:{id:who},message:{message_id:sequence,chat:{id:who,type:'private'},...(last()?.photo?{photo:[{file_id:'cached-photo'}]}:{})},data:callback}}:{message:{message_id:sequence,from:{id:who},chat:{id:who,type:'private'},text,...extra}};const response=await worker.fetch(new Request('https://budget.test/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'test-hook','Content-Type':'application/json'},body:JSON.stringify({update_id:++sequence,...content})}),env);assert.equal(response.status,200);}
 const last=()=>sent.filter(x=>['sendMessage','sendPhoto','editMessageText','editMessageMedia'].includes(x.method)).at(-1)?.body;
 function button(label){const b=last()?.reply_markup?.inline_keyboard?.flat().find(b=>typeof label==='string'?b.text===label:label.test(b.text));assert.ok(b,`Missing button ${label} in ${JSON.stringify(last())}`);return b.callback_data;}
 const press=async(label,who=111)=>update('',button(label),who);
 const snapshot=(id='111')=>JSON.parse(sqlite.prepare('SELECT data FROM user_finance_state WHERE user_id=?').get(id).data);
 return {env,sqlite,sent,files,update,last,button,press,snapshot,close:()=>{globalThis.fetch=original;sqlite.close();}};
}
async function run(fn,data){const f=fixture(data);try{await fn(f);}finally{f.close();}}
test('Native expense wizard writes the shared budget only after confirmation, repeat callback cannot duplicate',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('180');const oldConfirm=f.button('✅ Подтвердить');assert.match(f.last().text,/180/);assert.equal(f.snapshot().transactions.length,0);
 await f.press('💳 Счёт');const oldAccountButton=f.button(/Банк/);await f.press(/Банк/);await f.update('',oldAccountButton);assert.match(f.last().text,/последнего шага/);await f.update('',oldConfirm);assert.equal(f.snapshot().transactions.length,0);
 await f.update('/add');await f.press('▶️ Продолжить запись');await f.press('🏷 Категория');await f.update('not a choice');assert.match(f.last().text,/Выбери вариант/);await f.press('Еда');await f.press('💬 Комментарий');await f.update('Кофе');assert.match(f.last().text,/Проверь|Запись операции/);assert.equal(f.snapshot().transactions.length,0);const confirm=f.button('✅ Подтвердить');await f.update('',confirm);assert.equal(f.snapshot().accounts[0].balance,9820);assert.equal(f.snapshot().transactions[0].note,'Кофе');await f.update('',confirm);assert.equal(f.snapshot().transactions.length,1);assert.ok(f.sqlite.prepare("SELECT * FROM user_state_backups WHERE user_id='111' AND revision=1").get());
}));
test('Native savings transfer and linked debt return use the same account and reserve calculations',()=>run(async f=>{
 await f.update('/savings');await f.press(/Наличный резерв/);await f.press('＋ Отложить сюда');await f.press(/Банк/);await f.update('500');await f.press(/^Оставить:/);await f.press('✅ Подтвердить');let d=f.snapshot();assert.equal(d.accounts[0].balance,9500);assert.equal(dashboard(d,today).reserve,2500);assert.equal(d.transactions.length,0);assert.equal(d.transfers.length,1);
 await f.update('/debts');await f.press('＋ Существующий долг');await f.update('Друг');await f.press('Я должен');await f.update('1000');await f.press('RUB');await f.press('Пропустить');await f.press('Пропустить');await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,9500);
 await f.update('/debts');await f.press(/Друг/);await f.press('Вернуть');await f.update('400');await f.press(/Банк/);await f.press(/^Оставить:/);await f.press('✅ Подтвердить');d=f.snapshot();assert.equal(d.accounts[0].balance,9100);assert.equal(debtRemaining(d.debts[0],d),600);assert.match(f.last().text,/600/);assert.equal(d.transactions.length,1);
}));
test('Native deposit creation retains metadata; schedule confirmation checks actual amount',()=>run(async f=>{
 await f.update('/accounts');await f.press('＋ Добавить');await f.update('Вклад');await f.press('Вклад');await f.press('RUB');await f.press('Уже отложено — указать остаток');await f.update('5000');await f.press('В банке');await f.update('12');await f.update('2027-01-15');await f.press('✅ Подтвердить');const a=f.snapshot().accounts.at(-1);assert.equal(a.savingsKind,'deposit');assert.equal(a.annualRate,12);assert.equal(a.balance,5000);
 const d=f.snapshot();d.recurring=[{id:'rent',name:'ЖКХ',type:'expense',amount:1000,currency:'RUB',accountId:'bank',cat:'housing',frequency:'once',startDate:today,active:true}];f.sqlite.prepare("UPDATE user_finance_state SET data=? WHERE user_id='111'").run(JSON.stringify(d));
 await f.update('/payments');await f.press('Что оплатить сейчас');await f.press(/ЖКХ/);await f.press('Подтвердить / изменить сумму');await f.press('Нет');await f.press(/^Оставить:/);assert.match(f.last().text,/Изменения применятся/);assert.equal(f.snapshot().accounts[0].balance,10000);await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,9000);assert.equal(f.snapshot().transactions[0].recurringId,'rent');
}));
test('Native import maps unknown accounts, previews rows and deduplicates without moving historical balances',()=>run(async f=>{
 await f.update('/import');await f.update(JSON.stringify({format:'burget-operations',version:1,operations:[{date:today,type:'expense',amount:180,currency:'RUB',account:'Альфа из выписки',category:'food',note:'Кофе'}]}));await f.press(/Банк/);await f.press('Нет, это старая история');assert.match(f.last().text,/Новых: 1/);assert.equal(f.snapshot().transactions.length,0);await f.press('✅ Импортировать 1');assert.equal(f.snapshot().transactions.length,1);assert.equal(f.snapshot().accounts[0].balance,10000);
 await f.update('/import');f.files.set('statement.json',JSON.stringify({format:'burget-operations',version:1,operations:[{date:today,type:'expense',amount:180,currency:'RUB',account:'Банк',category:'food',note:'Кофе'}]}));await f.update('',undefined,111,{document:{file_id:'statement.json',file_size:500,file_name:'statement.json'}});await f.press('Нет, это старая история');assert.match(f.last().text,/похожих: 1/);assert.ok(!f.last().reply_markup.inline_keyboard.flat().some(b=>b.text.startsWith('✅ Импортировать')));assert.equal(f.snapshot().transactions.length,1);
}));
test('Native minute settings and test messages do not write fictitious financial operations',()=>run(async f=>{
 await f.update('/reminders');await f.press(/^Время проверки:/);await f.update('20:37');await f.press('✅ Подтвердить');assert.equal(f.snapshot().settings.checkTime,'20:37');await f.update('/tests');await f.press('Вопрос об обеде');assert.match(f.last().text,/Тест/);assert.ok(f.last().reply_markup.inline_keyboard.flat().every(b=>b.callback_data.startsWith('test:')));assert.equal(f.snapshot().transactions.length,0);
}));
test('Foreign profiles cannot use form callbacks; changed Mini App state requires another preview',()=>run(async f=>{
 await f.update('/accounts');await f.press(/Банк/);await f.press('Переименовать');await f.update('Основной');const token=f.button('✅ Подтвердить');await f.update('',token,222);assert.equal(f.snapshot('222').accounts[0].name,'Банк');const d=f.snapshot();d.accounts[0].balance=7000;f.sqlite.prepare("UPDATE user_finance_state SET data=?,revision=revision+1 WHERE user_id='111'").run(JSON.stringify(d));await f.update('',token);assert.equal(f.snapshot().accounts[0].name,'Банк');await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].name,'Основной');assert.equal(f.snapshot().accounts[0].balance,7000);
}));
test('Native restore sends a before-copy, requires acknowledgement and shares the normal backup format',()=>run(async f=>{
 await f.update('/backup');await f.press('Скачать полный JSON');assert.equal(JSON.parse(f.sent.at(-1).body.document).accounts[0].balance,10000);await f.update('/backup');await f.press('Восстановить из файла');assert.ok(f.sent.some(x=>x.method==='sendDocument'));const candidate=seed();candidate.accounts[0].balance=42;await f.update(JSON.stringify(candidate));await f.update('ВОССТАНОВИТЬ');assert.equal(f.snapshot().accounts[0].balance,10000);await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,42);
}));
test('Native views cover all sections, long histories paginate and callback labels stay bounded',()=>{const d=seed();d.transactions=Array.from({length:30},(_,i)=>({id:'t'+i,date:today,type:'expense',cat:'food',amount:i+1,currency:'RUB',note:'Покупка '+i}));for(const name of ['home','allocation','add','accounts','savings','movements','history','goals','wishes','payments','plans','due','installments','debts','lunch','lunchDays','lunchMonths','analytics','limits','settings','modules','categories','tests','backup','help','updates','admin']){const result=botView(d,name,{},true);assert.ok(result.title);assert.ok(result.actions.length);assert.ok(result.actions.every(a=>a.view||a.op||a.command||a.special),name);}const h=botView(d,'history');assert.ok(h.actions.some(a=>a.label==='Дальше →'));assert.throws(()=>botView(d,'admin',{},false));});
test('Native imported new cash reserve and personal lunches preserve separate financial meaning',()=>{let d=seed(),v={content:JSON.stringify({format:'burget-operations',version:1,operations:[{date:today,type:'transfer',amount:100,currency:'RUB',from:'Банк',to:'Новая копилка',note:'Отложил'}]}),map_0:'new-savings',map_balance_0:300,affectBalances:false};const p=botImportPreview(d,v);assert.equal(p.sources.length,0);d=applyBotAction(d,'import',{},v);assert.equal(d.accounts.at(-1).accType,'savings');assert.equal(d.accounts.at(-1).balance,300);assert.equal(d.accounts[0].balance,10000);d=applyBotAction(d,'tx',{type:'expense',ownLunch:true},{amount:50,accountId:'bank',currency:'RUB',date:today,note:'Доплата'});assert.ok(d.transactions.at(-1).tags.includes('обед-за-свои'));assert.equal(d.accounts[0].balance,9950);});
test('Native invalid values reject early; editing USD transaction retains its currency',()=>{assert.throws(()=>parseField({type:'time'},'25:70'));assert.throws(()=>parseField({type:'date'},'2026-02-30'));assert.throws(()=>parseField({type:'money'},'1.001'));let d=seed();d.transactions=[{id:'fx',revision:1,type:'expense',cat:'other',amount:10,currency:'USD',accountId:'bank',accountAmount:920,amountRub:920,date:today}];d=applyBotAction(d,'tx',{id:'fx'},{amount:11,currency:'USD',accountId:'bank',cat:'other',date:today,note:'FX'});assert.equal(d.transactions[0].currency,'USD');assert.equal(d.accounts[0].balance,9908);assert.ok(fieldsFor(d,'restore').some(f=>f.key==='ack'));});

test('Native edit from history changes the same operation; deletion and undo restore balances and debt state',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('100');await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,9900);
 await f.update('/history');await f.press(/Еда ·/);await f.press('✏️ Изменить');await f.update('200');await f.press('✅ Подтвердить');assert.equal(f.snapshot().transactions.length,1);assert.equal(f.snapshot().accounts[0].balance,9800);
 await f.update('/history');await f.press(/Еда ·/);await f.press('⋯ Действия');await f.press('Удалить запись');await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,10000);
 await f.update('/history');await f.press('Отменить изменение');await f.press(/^delete_tx/);await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,9800);assert.equal(f.snapshot().transactions.length,1);
}));
test('Native wizard cancellation preserves pending lunch input; a test callback never runs real reminder actions',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('100');await f.update('/cancel');assert.equal(f.snapshot().transactions.length,0);await f.update('/tests');await f.press('Вопрос об обеде');const callback=f.last().reply_markup.inline_keyboard[0][0].callback_data;await f.update('',callback);assert.equal(f.snapshot().transactions.length,0);
 await f.update('/menu');const keyboard=f.sent.filter(x=>x.body.reply_markup?.keyboard).at(-1).body.reply_markup.keyboard;assert.equal(keyboard.flat().length,7);assert.equal(keyboard[0][0].text,'📱 Миниаппа');assert.ok(f.sent.flatMap(x=>x.body.reply_markup?.inline_keyboard?.flat()||[]).every(x=>Buffer.byteLength(x.callback_data||'')<=64));
}));
test('Native personal goals, wished purchases and installment actions share domain ledgers',()=>{let d=seed();d=applyBotAction(d,'goal',{}, {name:'Подушка',target:3000,accountId:'reserve'});d=applyBotAction(d,'fundGoal',{id:d.goals[0].id},{from:'bank',amount:100,date:today});assert.equal(d.accounts[1].balance,2100);assert.equal(d.transactions.length,0);assert.throws(()=>applyBotAction(d,'wish',{}, {name:'ТВ',target:3000,currency:'RUB',accountId:'reserve'}));d=applyBotAction(d,'wish',{}, {name:'ТВ',note:'Для комнаты',priority:'main',target:30000,currency:'RUB',accountId:''});d=applyBotAction(d,'wishDone',{id:d.wishes[0].id,done:true});assert.equal(d.wishes[0].done,true);d=applyBotAction(d,'installment',{}, {name:'Сплит',total:300,count:3,firstDate:today,accountId:'bank',cat:'tech',obligationKind:'split',cadence:'biweekly'});d=applyBotAction(d,'payInstallment',{id:d.installments[0].id,paymentId:d.installments[0].payments[0].id},{date:today});assert.equal(d.accounts[0].balance,9800);assert.equal(d.transactions.length,1);});

test('Native import fixes an uncertain JSON date inside the chat without writing until final import',()=>run(async f=>{
 await f.update('/import');await f.update(JSON.stringify({format:'burget-operations',version:1,operations:[{date:null,type:'expense',amount:180,currency:'RUB',account:'Банк',category:'food',note:'Кофе'}]}));await f.press('Нет, это старая история');assert.match(f.last().text,/ошибок: 1/);await f.press('✏️ Исправить строку 1');await f.press('Дата');await f.update(today);assert.match(f.last().text,/ошибок: 0/);assert.equal(f.snapshot().transactions.length,0);await f.press('✅ Импортировать 1');assert.equal(f.snapshot().transactions[0].date,today);
}));

test('New reserve can be funded atomically from an existing account in the native creation wizard',()=>run(async f=>{
 await f.update('/savings');await f.press('＋ Добавить');await f.update('На отпуск');await f.press('Накопления');await f.press('RUB');await f.press('Отложить с моего счёта');await f.press(/Банк/);await f.update('300');await f.press(/^Оставить:/);await f.press('Наличными');assert.equal(f.snapshot().accounts.length,2);await f.press('✅ Подтвердить');const d=f.snapshot();assert.equal(d.accounts.length,3);assert.equal(d.accounts[0].balance,9700);assert.equal(d.accounts.at(-1).balance,300);assert.equal(d.accounts.at(-1).storageKind,'cash');assert.equal(d.transfers.length,1);assert.equal(d.transactions.length,0);
}));
test('Picture generation failure keeps native menus usable and does not mutate finances',()=>run(async f=>{
 const before=f.snapshot();f.env.BROWSER={};await f.update('/budget');assert.match(f.last().text,/Твой бюджет/);assert.ok(f.last().reply_markup.inline_keyboard.flat().some(x=>x.text==='✍️ Записать'));assert.equal(f.last().reply_markup.inline_keyboard[0][0].web_app.url,f.env.MINI_APP_URL);assert.deepEqual(f.snapshot(),before);await f.update('/more');await f.press('🖼 Картинки миниаппы');assert.match(f.last().text,/Миниаппа в картинках/);assert.ok(f.last().reply_markup.inline_keyboard.flat().some(x=>x.text==='💚 Бюджет'));await f.press('⌂ Главное меню');assert.match(f.last().text,/Бюджет|бюджет/);
}));
test('Opening a section sends the image with its real actions immediately; text mode and editing remain connected',()=>run(async f=>{
 let captures=0;const api={readState:async()=>({revision:1,data:f.snapshot(),isOwner:true}),telegram:async(_env,method,body)=>{f.sent.push({method,body});return {};},capturePicture:async()=>{captures++;const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(16,1280);v.setUint32(20,922);return b;}};
 for(const name of ['home','analytics','lunch','savings','goals']){
  const before=f.sent.length;await showBotView(f.env,'111',api,name);const messages=f.sent.slice(before).filter(x=>['sendMessage','sendPhoto','editMessageText','editMessageMedia'].includes(x.method));assert.equal(messages.length,1);assert.equal(messages[0].method,'sendPhoto');assert.ok(f.last().reply_markup.inline_keyboard[0][0].web_app);assert.ok(f.last().reply_markup.inline_keyboard.flat().some(x=>x.text==='📄 Скачать PNG'));assert.ok(!f.last().reply_markup.inline_keyboard.flat().some(x=>x.text==='🖼 Показать картинкой'));
 }
 assert.equal(captures,4); // savings and goals reuse the same current snapshot.
 await showBotView(f.env,'111',api,'analytics',{chart:'categories',days:7});assert.match(f.last().text,/Последние 7 дней/);const beforeText=captures;await showBotView(f.env,'111',api,'analytics',{textOnly:true});assert.equal(f.sent.at(-1).method,'sendMessage');assert.equal(captures,beforeText);
 await showBotView(f.env,'111',api,'home');await f.press('✍️ Записать');assert.match(f.last().text,/Что записать/);assert.equal(f.snapshot().transactions.length,0);
}));
test('Savings and goals page buttons match six items in the image',()=>{
 const d=seed();d.accounts=Array.from({length:13},(_,i)=>({id:'s'+i,name:'Reserve '+i,accType:'savings',balance:100,currency:'RUB'}));d.goals=d.accounts.map((a,i)=>({id:'g'+i,name:'Goal '+i,accountId:a.id,target:1000,currency:'RUB'}));
 for(const name of ['savings','goals']){const s=botView(d,name,{page:1});assert.match(s.lines[0],/7–12 из 13/);assert.equal(s.picture.page,1);assert.equal(s.actions.filter(x=>['account','goal'].includes(x.view)).length,6);}
});
test('Section navigation edits the current card, falls back for expired cards, and quick repeat still requires review',()=>run(async f=>{
 const api={readState:async()=>({revision:1,data:f.snapshot()}),telegram:async(_env,method,body)=>{f.sent.push({method,body});if(method==='editMessageText'&&body.message_id===404)throw Error('expired');return {message_id:body.message_id||100};}};
 await showBotView(f.env,'111',{...api,viewMessage:{message_id:123}},'accounts');assert.equal(f.sent.at(-1).method,'editMessageText');assert.equal(f.sent.at(-1).body.message_id,123);
 await showBotView(f.env,'111',{...api,viewMessage:{message_id:404}},'accounts');assert.equal(f.sent.at(-1).method,'sendMessage');
 const d=f.snapshot();d.transactions=[{id:'coffee',date:today,type:'expense',cat:'food',amount:180,currency:'RUB',accountId:'bank',note:'Кофе',paymentMethod:'card'}];f.sqlite.prepare("UPDATE user_finance_state SET data=? WHERE user_id='111'").run(JSON.stringify(d));
 await f.update('/add');await f.press(/↻ Кофе/);assert.match(f.last().text,/180/);assert.equal(f.snapshot().transactions.length,1);
 await f.press('✏️ Изменить поля');await f.press('Сумма');await f.update('190');assert.equal(f.snapshot().transactions.length,1);await f.press('✅ Подтвердить');const result=f.snapshot();assert.equal(result.transactions.length,2);assert.equal(result.transactions[1].amount,190);assert.equal(result.accounts[0].balance,9810);
}));
test('Quick entry keeps one bot card, shows exact result, and undo returns to the shared ledger',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');const card=JSON.parse(f.sqlite.prepare("SELECT payload FROM telegram_drafts WHERE id GLOB 'bf_*' AND consumed=0").get().payload).cardId;
 await f.update('180');let latest=f.last();assert.equal(latest.message_id,card);assert.match(latest.text,/Банк/);assert.match(latest.text,/Еда/);assert.equal(f.snapshot().transactions.length,0);
 await f.press('💬 Комментарий');assert.equal(f.last().message_id,card);await f.update('Кофе');assert.equal(f.last().message_id,card);await f.press('✅ Подтвердить');assert.equal(f.last().message_id,card);assert.match(f.last().text,/Кофе/);assert.match(f.last().text,/9.?820/);assert.equal(f.snapshot().accounts[0].balance,9820);
 await f.press('↩️ Отменить изменение');assert.equal(f.snapshot().accounts[0].balance,9820);await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,10000);assert.equal(f.snapshot().transactions.length,0);
}));
test('Paused forms reject silent replacement, resume unchanged, require fresh review after another device, and expire safely',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('287.50');await f.press('💬 Комментарий');await f.update('Покупка');await f.update('/history');
 const active=f.sqlite.prepare("SELECT * FROM telegram_drafts WHERE id GLOB 'bf_*' AND consumed=0").get();assert.equal(JSON.parse(active.payload).paused,true);
 await f.update('/add');assert.match(f.last().text,/незавершённая/);await f.press('▶️ Продолжить запись');assert.match(f.last().text,/287,5/);assert.match(f.last().text,/Покупка/);
 const stale=f.button('✅ Подтвердить');f.sqlite.prepare("UPDATE user_finance_state SET revision=revision+1 WHERE user_id='111'").run();await f.update('',stale);assert.equal(f.snapshot().transactions.length,0);assert.match(f.last().text,/287,5/);
 await f.update('/add');await f.press('Начать заново');assert.match(f.last().text,/Сумма/);assert.equal(f.snapshot().transactions.length,0);
 const row=f.sqlite.prepare("SELECT id FROM telegram_drafts WHERE id GLOB 'bf_*' AND consumed=0").get(),old=f.button('✕ Отмена');f.sqlite.prepare('UPDATE telegram_drafts SET expires_at=0 WHERE id=?').run(row.id);await f.update('',old);assert.match(f.last().text,/закрыта/);assert.ok(f.last().reply_markup.inline_keyboard.flat().some(b=>b.text==='История'));
}));
test('History filters and installment ownership survive confirmations; outcome reads actual remaining schedule',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('100');await f.press('✅ Подтвердить');await f.update('/history');await f.press('Расходы');await f.press(/Еда ·/);await f.press('✏️ Изменить');await f.update('120');await f.press('✅ Подтвердить');await f.press('↩️ Вернуться в раздел');await f.press('⋯ Действия');await f.press('История');
 const viewDraft=f.sqlite.prepare("SELECT payload FROM telegram_drafts WHERE id=?").get(f.button('Все записи').split(':')[2]);assert.equal(JSON.parse(viewDraft.payload).origin.args.type,'expense');
 const d=f.snapshot();d.installments=[{id:'split',name:'Покупка частями',accountId:'bank',currency:'RUB',total:1000,payments:[{id:'p1',date:today,amount:400},{id:'p2',date:'2026-12-01',amount:600}]}];f.sqlite.prepare("UPDATE user_finance_state SET data=? WHERE user_id='111'").run(JSON.stringify(d));
 await f.update('/payments');await f.press('Кредиты / сплит / ипотека');await f.press(/Покупка частями/);await f.press(/Оплатил/);await f.press(/^Оставить:/);await f.press('✅ Подтвердить');assert.match(f.last().text,/осталось 600/);assert.match(f.last().text,/2026-12-01/);await f.press('↩️ Вернуться в раздел');assert.match(f.last().text,/Покупка частями/);assert.match(f.last().text,/600/);
 const next=f.snapshot();next.goals=[{id:'goal',name:'Подушка',target:3000,currency:'RUB',accountId:'reserve'}];f.sqlite.prepare("UPDATE user_finance_state SET data=? WHERE user_id='111'").run(JSON.stringify(next));await f.update('/goals');await f.press(/Подушка/);await f.press('Отложить на цель');await f.press(/Банк/);await f.update('100');await f.press(/^Оставить:/);await f.press('✅ Подтвердить');assert.match(f.last().text,/2.?100/);assert.match(f.last().text,/3.?000/);assert.equal(f.snapshot().accounts[1].balance,2100);assert.equal(f.snapshot().transfers.length,1);
}));
test('Multiple accounts require an explicit first choice; currency follows a newly selected account',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('10');assert.match(f.last().text,/Откуда оплатили/);assert.equal(f.snapshot().transactions.length,0);await f.press(/Доллар/);assert.match(f.last().text,/USD|\$/);await f.press('✅ Подтвердить');const tx=f.snapshot().transactions[0];assert.equal(tx.currency,'USD');assert.equal(tx.accountId,'usd');assert.equal(f.snapshot().accounts.find(a=>a.id==='usd').balance,90);
},{...seed(),accounts:[...seed().accounts,{id:'usd',name:'Доллар',currency:'USD',balance:100}]}));

test('Reminder buttons settle shared plan, installment and debt, reject stale/foreign targets, preserve free budget',()=>{
 const d=seed();d.settings.nextIncomeDate=new Date(Date.parse(today+'T12:00:00Z')+10*86400000).toISOString().slice(0,10);
 d.recurring=[{id:'rent',name:'ЖКХ',type:'expense',active:true,frequency:'monthly',startDate:today,dueDay:Number(today.slice(-2)),amount:500,currency:'RUB',accountId:'bank',cat:'housing'}];
 d.installments=[{id:'split',name:'Сплит',total:300,currency:'RUB',accountId:'bank',payments:[{id:'payment',date:today,amount:300}]}];
 d.debts=[{id:'mom',person:'Мама',type:'iowe',amount:200,currency:'RUB',dueDate:today,payments:[]}];
 return run(async f=>{
  const free=dashboard(f.snapshot(),today).free;
  f.sqlite.prepare('UPDATE user_finance_state SET data=? WHERE user_id=?').run(JSON.stringify(seed()),'222');
  await f.update('','b:n:p:rent:'+today.slice(0,7),222);assert.match(f.last().text,/Что оплатить сейчас/);assert.equal(f.snapshot('222').transactions.length,0);
  assert.equal(f.snapshot().transactions.length,0);
  await f.update('','b:n:p:missing:once');assert.match(f.last().text,/Что оплатить сейчас/);
  await f.update('','b:n:p:rent:'+today.slice(0,7));await f.press('Нет');await f.press('Оставить: '+today);await f.press('✅ Подтвердить');
  assert.equal(f.snapshot().accounts[0].balance,9500);assert.equal(f.snapshot().transactions[0].recurringId,'rent');assert.equal(dashboard(f.snapshot(),today).free,free);
  await f.update('','b:n:p:rent:'+today.slice(0,7));assert.match(f.last().text,/Что оплатить сейчас/);assert.equal(f.snapshot().transactions.length,1);
  await f.update('','b:n:i:payment');await f.press('Оставить: '+today);await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[0].balance,9200);assert.equal(dashboard(f.snapshot(),today).free,free);
  await f.update('','b:n:d:mom');await f.update('200');await f.press(/Банк/);await f.press('Оставить: '+today);await f.press('✅ Подтвердить');
  assert.equal(f.snapshot().accounts[0].balance,9000);assert.equal(debtRemaining(f.snapshot().debts[0],f.snapshot()),0);assert.equal(dashboard(f.snapshot(),today).free,free);
  await f.update('','b:n:i:payment');assert.match(f.last().text,/Что оплатить сейчас/);assert.equal(f.snapshot().transactions.length,3);
 },d);
});

test('Home and module controls persist per user through native confirmation and never change money',()=>run(async f=>{
 const initial=f.snapshot();await f.update('/budget');await f.press('⚙️ Моя главная');await f.press('Минимум');assert.equal(f.snapshot().settings.homeLayout,undefined);await f.press('✅ Подтвердить');assert.deepEqual(f.snapshot().settings.homeLayout.hidden.includes('wishes'),true);assert.equal(f.snapshot('222').settings.homeLayout,undefined);
 await f.update('/settings');await f.press('🧩 Модули');await f.press('✓ Цели накоплений');await f.press('✅ Подтвердить');assert.equal(f.snapshot().settings.modules.goals,false);assert.deepEqual(f.snapshot().accounts,initial.accounts);assert.deepEqual(f.snapshot().transactions,initial.transactions);assert.equal(f.snapshot('222').settings.modules,undefined);
}));

test('Free text selects only missing account, edits shared review, credits income and transfers once without creating an expense',()=>{
 const d=seed();d.settings.modules={lunch:false};d.accounts[1].name='Копилка';d.accounts.push({id:'alpha',name:'Альфа',balance:2000,currency:'RUB'});
 return run(async f=>{
  await f.update('вчера такси 450');assert.match(f.last().text,/Откуда оплатили/);assert.equal(f.snapshot().transactions.length,0);await f.press(/Банк/);assert.match(f.last().text,/такси/);assert.match(f.last().text,/450/);await f.press('💬 Комментарий');await f.update('Такси домой');const confirm=f.button('✅ Подтвердить');await f.update('',confirm);assert.equal(f.snapshot().accounts[0].balance,9550);assert.equal(f.snapshot().transactions[0].cat,'transport');assert.equal(f.snapshot().transactions[0].note,'Такси домой');assert.equal(f.snapshot().transactions[0].date,new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10));await f.update('',confirm);assert.equal(f.snapshot().transactions.length,1);
  await f.update('+3000 подработка Альфа');assert.match(f.last().text,/Доход/);assert.equal(f.snapshot().accounts[2].balance,2000);await f.press('✅ Подтвердить');assert.equal(f.snapshot().accounts[2].balance,5000);
  await f.update('перевод 1000 Банк → Копилка');const transfer=f.button('✅ Подтвердить');assert.equal(f.snapshot().transfers.length,0);await f.update('',transfer);assert.equal(f.snapshot().transfers.length,1);assert.equal(f.snapshot().accounts[0].balance,8550);assert.equal(f.snapshot().accounts[1].balance,3000);assert.equal(f.snapshot().transactions.length,2);assert.match(f.last().text,/Банк/);assert.match(f.last().text,/Копилка/);await f.update('',transfer);assert.equal(f.snapshot().transfers.length,1);
  await f.update('2 кофе 180');assert.match(f.last().text,/несколько чисел/);assert.equal(f.snapshot().transactions.length,2);
  await f.update('обед 300');assert.match(f.last().text,/Еда/);await f.press('✅ Подтвердить');assert.equal(f.snapshot().transactions.length,3);assert.equal(f.snapshot().transactions[0].type,'expense');assert.equal(f.snapshot().accounts[0].balance,8250);
 },d);
});

test('Transaction card is four rows with sum, dishes and relative day; navigation hides draft buttons',()=>run(async f=>{
 const d=f.snapshot();d.transactions=[{id:'company-lunch',date:today,type:'lunch',cat:'lunch',currency:'RUB',amount:379,note:'Суп, гречка'}];
 f.sqlite.prepare("UPDATE user_finance_state SET data=? WHERE user_id='111'").run(JSON.stringify(d));
 await f.update('/history');await f.press(/Суп, гречка/);
 const card=f.last();assert.match(card.text,/🍽 Обед · 379/);assert.match(card.text,/Сегодня/);assert.match(card.text,/Блюда:\nСуп, гречка/);assert.doesNotMatch(card.text,/с возвратом остатка/);
 assert.equal(card.reply_markup.inline_keyboard.length,4);assert.deepEqual(card.reply_markup.inline_keyboard.map(row=>row.length),[1,2,1,1]);
 assert.ok(card.reply_markup.inline_keyboard.flat().some(x=>x.text==='⋯ Действия'));assert.ok(!card.reply_markup.inline_keyboard.flat().some(x=>x.text.startsWith('Удалить')));
 await f.press('⋯ Действия');assert.ok(f.last().reply_markup.inline_keyboard.flat().some(x=>x.text==='Удалить запись'));
 const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);d.transactions[0].date=yesterday;
 assert.match(botView(d,'transaction',{id:'company-lunch'}).lines.join(' '),/Вчера/);
 await f.update('/add');await f.press('− Расход');await f.update('100');
 const id=JSON.parse(f.sqlite.prepare("SELECT payload FROM telegram_drafts WHERE id GLOB 'bf_*' AND consumed=0").get().payload).cardId;
 await f.update('/history');
 assert.ok(f.sent.some(x=>x.method==='editMessageReplyMarkup'&&x.body.message_id===id&&x.body.reply_markup.inline_keyboard.length===0));
}));

test('Budget bot labels, settings, planned income and debt refunds remain human-readable',()=>{
 const d=seed();
 d.settings.nextIncomeDate='';
 d.settings.expenseCheckEnabled=true;d.settings.lunchAskDays=[1,2,5];
 d.recurring=[{id:'income-month',name:'Зарплата',frequency:'monthly',active:true,type:'income',startDate:today,amount:30000,accountId:'bank',currency:'RUB'}];
 d.history=[{id:'hist-1',type:'add_tx',after:{note:'Покупка',amount:180,currency:'RUB'}}];
 d.debts=[{id:'debt-1',type:'my',person:'Друг',amount:500,payments:[{id:'pay-1',amount:200,date:today}],currency:'RUB'}];
 let card=botView(d,'settingGroup',{group:'reminders'});
 assert.ok(card.actions.some(a=>a.label==='Проверка расходов: Включено'));
 assert.ok(card.actions.some(a=>a.label.includes('Пн, Вт, Пт')));
 assert.match(botView(d,'activity').actions.find(a=>a.label.includes('Покупка')).label,/Добавление/);
 assert.match(botView(d,'plan',{id:'income-month'}).lines.join(' '),/Ежемесячно/);
 assert.match(botView(d,'dueItem',{id:'income-month',period:today.slice(0,7)}).lines.join(' '),/поступление/i);
 assert.match(botView(d,'debtHistory',{id:'debt-1'}).actions[1].label,/200/);
});
test('Cancel closes old input keyboard and preserves real account balance',()=>run(async f=>{
 await f.update('/add');await f.press('− Расход');await f.update('100');
 const cardId=JSON.parse(f.sqlite.prepare("SELECT payload FROM telegram_drafts WHERE id GLOB 'bf_*' AND consumed=0").get().payload).cardId;
 await f.update('/cancel');
 assert.ok(f.sent.some(x=>x.method==='editMessageReplyMarkup'&&x.body.message_id===cardId&&x.body.reply_markup.inline_keyboard.length===0));
 assert.equal(f.snapshot().accounts[0].balance,10000);
}));
