import {accountMentions,classifyFinancialIntent} from './input-intent.js';
export {accountMentions} from './input-intent.js';
export function entryType(text){return /(?<![\p{L}\d])\+\s*\d/u.test(text)||/зарплат|аванс|доход/iu.test(text)||/(?<!\p{L})(?:зп|получил(?:а)?)(?!\p{L})/iu.test(text)?'income':'expense';}
function without(text,spans){for(const x of [...spans].sort((a,b)=>b.start-a.start))text=text.slice(0,x.start)+' '+text.slice(x.end);return text;}
function datePart(value,today){
 let date=today;
 const relative=[...value.matchAll(/(?<!\p{L})(сегодня|вчера|позавчера|завтра)(?!\p{L})/giu)],explicit=[...value.matchAll(/(?<!\d)(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})(?!\d)/gu)];
 if(relative.length+explicit.length>1)throw Error('Укажи одну дату для одной операции');
 if(relative.length){const m=relative[0],days=({сегодня:0,вчера:-1,позавчера:-2,завтра:1})[m[0].toLocaleLowerCase('ru')];date=new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);value=value.slice(0,m.index)+' '+value.slice(m.index+m[0].length);}
 if(explicit.length){const m=explicit[0];date=m[0].includes('.')?m[0].split('.').reverse().join('-'):m[0];if(!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Проверь дату: например 14.10.2026');value=value.slice(0,m.index)+' '+value.slice(m.index+m[0].length);}
 if(date>today)throw Error('Будущую операцию добавь в планы. Фактическую запись подтвердим после оплаты');return {value,date};
}
function amountPart(value){
 const number='(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,]\\d{1,2})?',unit='(?:₽|руб(?:лей|ля|ль|\\.)?|р\\.?|RUB|USD|EUR|GBP|CNY|TRY|\\$|€)';
 const re=new RegExp(`(?<![\\p{L}\\p{N}.,])([+−-]?)(${number})(?:\\s*(${unit})(?!\\p{L})|(?![\\p{L}\\p{N}.,]))`,'giu'),matches=[...value.matchAll(re)];
 if(!matches.length)throw Error('Напиши сумму и покупку: кофе 180 или −180 кофе');
 if(matches.length>1)throw Error('Вижу несколько чисел. Пришли одну операцию с общей суммой, например: два кофе 360');
 const m=matches[0],amount=Number(m[2].replace(/[ \u00a0\u202f]/g,'').replace(',','.'));if(!Number.isFinite(amount)||amount<=0||amount>1e12)throw Error('Сумма должна быть больше нуля и не больше 1 трлн');
 const u=(m[3]||'').toUpperCase(),currency=!u?null:/^(?:₽|РУБ|Р\.?|RUB)/u.test(u)?'RUB':u==='$'?'USD':u==='€'?'EUR':u;
 return {amount,currency,sign:m[1],note:value.slice(0,m.index)+' '+value.slice(m.index+m[0].length)};
}
export function parseEntry(text,accounts,categories,date,defaults={}){
 if(typeof text!=='string'||text.length>2000)throw Error('Одна операция — сообщение до 2000 символов');
 const dated=datePart(text.trim(),date),hits=accountMentions(dated.value,accounts),ids=[...new Set(hits.map(x=>x.account.id))];if(ids.length>1)throw Error('Названо несколько счетов — выберите один');
 let working=without(dated.value,hits.map(x=>{const before=dated.value.slice(0,x.start).match(/(?:^|\s)(?:с|со|на|в|из|сч[её]т:?)\s*$/iu);return {...x,start:before?x.start-before[0].length:x.start};}));
 const parsed=amountPart(working),memo=parsed.note.toLocaleLowerCase('ru');
 const {type,companyLunch:lunch,mentionsLunch}=classifyFinancialIntent({memo,sign:parsed.sign,hasNamedAccount:hits.length>0,companyLunchEnabled:defaults.companyLunchEnabled!==false,inferredType:entryType(text)});
 const preferred=accounts.find(a=>a.id===defaults.accountId&&(a.currency||'RUB')==='RUB'&&a.accType!=='savings'&&a.savingsKind!=='deposit'),account=hits[0]?.account||(accounts.length===1?accounts[0]:preferred);
 if(!lunch&&accounts.length&&!account&&!defaults.allowMissingAccount)throw Error('Допишите название счёта, например: кофе 180 Сбер');
 const keywords=[['health',/аптек|таблет|врач|стомат|лекар/],['transport',/проезд|метро|такси|автобус/],['food',/кофе|продукт|еда|магазин|хлеб/],['housing',/жкх|квартплат|электрич/],['fun',/игра|кино/]];
 let cat=categories.find(c=>memo.includes(c.name.toLocaleLowerCase('ru')))?.id||keywords.find(([,re])=>re.test(memo))?.[0]||'other';
 const tags=[...parsed.note.matchAll(/#([\p{L}\p{N}_-]+)/gu)];for(const tag of tags){const found=categories.find(c=>[c.id,c.name].some(n=>n.toLocaleLowerCase('ru')===tag[1].toLocaleLowerCase('ru')));if(found){cat=found.id;parsed.note=parsed.note.replace(tag[0],' ');}}
 const note=parsed.note.replace(/(?<!\p{L})(?:сбп|наличными|наличные|картой|банковский перевод)(?!\p{L})/giu,' ').replace(/^\s*(?:расход|доход|получил(?:а)?|потратил(?:а)?)\s*[:;|]?\s*/iu,'').replace(/^[\s:;|,−+\-]+|[\s:;|,−+\-]+$/gu,'').replace(/\s+/g,' ').trim();
 return {type,cat:lunch?'lunch':type==='income'?'income':mentionsLunch?'food':cat,amount:parsed.amount,currency:lunch?'RUB':parsed.currency||account?.currency||'RUB',date:dated.date,note:note||(type==='income'?'Доход':lunch?'Обед компании':'Покупка'),paymentMethod:/сбп/u.test(memo)?'sbp':/налич/u.test(memo)?'cash':/карт/u.test(memo)?'card':/перевод/u.test(memo)?'bank':(account?.id===defaults.accountId?defaults.paymentMethod:'unknown')||'unknown',tags:mentionsLunch&&!lunch&&type==='expense'?['обед-за-свои']:[],accountId:lunch?undefined:account?.id||''};
}
export function parseOwnTransfer(text,accounts,today){
 const dated=datePart(text,today);
 if(!/^\s*(?:перевод|перевести|перевёл|перевел)\s/iu.test(dated.value)||!/(?:→|->|между своими|со?\s.+\sна\s)/iu.test(text))return null;
 const hits=accountMentions(dated.value,accounts),unique=[...new Set(hits.map(x=>x.account.id))];if(unique.length!==2)throw Error('Для перевода укажи два своих счёта: перевод 1000 Сбер → Копилка');
 const first=hits.find(x=>x.account.id===unique[0]).account,second=hits.find(x=>x.account.id===unique[1]).account;
 if((first.currency||'RUB')!==(second.currency||'RUB'))throw Error('Перевод между разными валютами пока не поддерживается: сначала зафиксируй обмен и фактический курс');
 const amount=amountPart(without(dated.value,hits));if(amount.currency&&amount.currency!==(first.currency||'RUB'))throw Error('Валюта суммы должна совпадать с валютой счетов');
 return {from:first.id,to:second.id,amount:amount.amount,fee:0,date:dated.date,note:'Перевод между своими счетами'};
}
