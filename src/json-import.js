import {validDate} from './finance-tools.js';
import {putTransaction,transferMoney,parseMoney,roundMoney} from './ledger.js';
import {CATEGORIES} from './mini-model.js';
import {clockAt,DEFAULT_ZONE} from './time-settings.js';
export const IMPORT_FORMAT='burget-operations';
export const IMPORT_VERSION=1;
export const IMPORT_EXAMPLE={format:IMPORT_FORMAT,version:1,operations:[{date:'2026-10-14',type:'expense',amount:180,currency:'RUB',account:'Основной счёт',category:'food',note:'Кофе',paymentMethod:'sbp'}]};
const allowed=['date','type','amount','currency','account','category','note','paymentMethod','externalId','from','to','fee'];
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sameMoney=(a,b)=>roundMoney(a)===roundMoney(b);
const ownAccount=(data,value)=>{if(typeof value!=='string')throw Error('Выберите свой счёт');const hits=data.accounts.filter(a=>a.id===value||a.name.trim().toLocaleLowerCase('ru')===value.trim().toLocaleLowerCase('ru'));if(hits.length!==1)throw Error('Выберите счёт: название не найдено или неоднозначно');return hits[0];};
function money(value){if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e12||Math.abs(value*100-Math.round(value*100))>0.001)throw Error('Сумма — положительное число с максимум двумя знаками');return roundMoney(value);}
export function parseImportJson(text){if(typeof text!=='string'||text.length>2_000_000)throw Error('JSON — до 2 МБ');let doc;try{doc=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('Некорректный JSON: проверьте запятые и кавычки');}validateDocument(doc);return doc;}
function validateDocument(doc){if(!object(doc)||doc.format!==IMPORT_FORMAT||doc.version!==1||!Array.isArray(doc.operations)||doc.operations.length<1||doc.operations.length>2000||Object.keys(doc).some(k=>!['format','version','operations'].includes(k)))throw Error('Нужен burget-operations версии 1, от 1 до 2000 операций. Бэкап восстанавливается в отдельном разделе.');}
export function previewJsonImport(data,doc,options={}){
 validateDocument(doc);const categories=new Set(CATEGORIES.concat(data.customCats||[]).map(c=>c.id)),transactions=[...data.transactions],transfers=[...(data.transfers||[])];
 return doc.operations.map((raw,index)=>{if(options.excluded?.includes(index))return {index,excluded:true};try{
  if(!object(raw)||Object.keys(raw).some(k=>!allowed.includes(k)))throw Error('Неизвестные поля операции: используйте единый стандарт');
  if(!validDate(raw.date))throw Error('Уточните дату в формате ГГГГ-ММ-ДД');if(!['income','expense','transfer','lunch'].includes(raw.type))throw Error('Уточните тип: расход, доход, перевод или обед');
  const amount=money(raw.amount);if(typeof raw.note!=='string'||raw.note.length>500)throw Error('Описание — строка до 500 символов');
  if(raw.externalId!==undefined&&(typeof raw.externalId!=='string'||!raw.externalId.trim()||raw.externalId.length>200))throw Error('Неверный внешний ID');
  let transaction,transfer,duplicate=false,referenceDuplicate=false;
  if(raw.type==='lunch'){
   if(raw.currency!=='RUB')throw Error('Обед компании указывается в RUB');
   if(['account','category','paymentMethod','from','to','fee'].some(k=>raw[k]!==undefined))throw Error('Обед компании: без счёта, категории, способа оплаты и комиссии');
   transaction={date:raw.date,type:'lunch',cat:'lunch',amount,currency:'RUB',note:raw.note,externalId:raw.externalId,tags:['импорт']};
   const lunches=transactions.filter(t=>t.type==='lunch'||t.cat==='lunch');
   referenceDuplicate=!!(raw.externalId&&lunches.some(t=>t.externalId===raw.externalId));
   duplicate=referenceDuplicate||lunches.some(t=>t.date===raw.date&&(t.currency||'RUB')==='RUB'&&sameMoney(t.amount,amount));transactions.push(transaction);
  }else if(raw.type==='transfer'){
   if(raw.account!==undefined||raw.category!==undefined||raw.paymentMethod!==undefined)throw Error('Перевод использует from/to, без account/category/paymentMethod');
   const from=ownAccount(data,raw.from),to=ownAccount(data,raw.to);if(from.id===to.id)throw Error('Для перевода нужны разные собственные счета');
   if((from.currency||'RUB')!==(to.currency||'RUB')||raw.currency!==(from.currency||'RUB'))throw Error('Счета перевода должны быть в одной указанной валюте');
   const fee=raw.fee??0;if(typeof fee!=='number'||fee<0||!Number.isFinite(parseMoney(fee)))throw Error('Неверная комиссия');
   transfer={from:from.id,to:to.id,date:raw.date,amount,fee,currency:raw.currency,note:raw.note,externalId:raw.externalId};
   referenceDuplicate=!!(raw.externalId&&transfers.some(t=>t.externalId===raw.externalId&&t.from===from.id));
   const similar=transfers.filter(t=>t.from===from.id&&t.to===to.id&&t.date===raw.date&&sameMoney(t.amount,amount));
   if(similar.some(t=>!sameMoney(t.fee||0,fee)))throw Error('Похожий перевод имеет другую комиссию. Сверьте вручную');duplicate=referenceDuplicate||similar.length>0;transfers.push(transfer);
  }else{
   if(raw.from!==undefined||raw.to!==undefined||raw.fee!==undefined)throw Error('Расход и доход используют account, без from/to/fee');
   const account=ownAccount(data,raw.account);if(raw.currency!==(account.currency||'RUB'))throw Error('Валюта должна совпадать со счётом: не угадываем курс');
   if(raw.type==='expense'&&!categories.has(raw.category))throw Error('Выберите категорию расхода');if(raw.type==='income'&&raw.category!==undefined&&raw.category!=='income')throw Error('Категория дохода — income');
   if(raw.paymentMethod!==undefined&&!['card','sbp','cash','bank','unknown'].includes(raw.paymentMethod))throw Error('Неверный способ оплаты');
   transaction={date:raw.date,type:raw.type,amount,currency:raw.currency,accountId:account.id,cat:raw.type==='income'?'income':raw.category,note:raw.note,paymentMethod:raw.paymentMethod||'unknown',externalId:raw.externalId,tags:['импорт']};
   referenceDuplicate=!!(raw.externalId&&transactions.some(t=>t.accountId===account.id&&t.externalId===raw.externalId));
   duplicate=referenceDuplicate||transactions.some(t=>t.accountId===account.id&&t.type===raw.type&&t.date===raw.date&&(t.currency||'RUB')===raw.currency&&sameMoney(t.amount,amount));transactions.push(transaction);
  }
  return {index,transaction,transfer,duplicate,referenceDuplicate,force:!!options.forced?.includes(index)};
 }catch(e){return {index,error:e.message};}});
}
export function commitJsonImport(data,doc,{affectBalances=false,excluded=[],forced=[]}={}){
 const rows=previewJsonImport(data,doc,{excluded,forced});if(rows.some(r=>r.error))throw Error('Исправьте ошибки или исключите строки до импорта');const selected=rows.filter(r=>!r.excluded&&(!r.duplicate||r.force&&!r.referenceDuplicate));
 if(!selected.length)throw Error('Нет новых операций для импорта');const today=clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date;
 if(selected.some(r=>(r.transaction||r.transfer).date>today))throw Error('Будущие операции оформите как планы, а не банковскую историю');
 let next=data;for(const row of selected){const fields={...(row.transaction||row.transfer),balanceEffect:affectBalances?'normal':'history-only'};next=row.transfer?transferMoney(next,fields):putTransaction(next,fields);}return next;
}
export function importPrompt(data){return `Извлеки банковские операции из приложенных скриншотов. Верни только JSON-файл по стандарту burget-operations версии 1. Не выдумывай даты, счета, суммы и назначения. Если поле не видно, оставь null: я исправлю его в предпросмотре. Не включай остатки и итоги как операции. Одна банковская операция — одна запись; две стороны перевода между МОИМИ счетами объединяй в один transfer. Перевод другому человеку — expense, а не transfer. Распознавание в чате, без API.\nФормат: {"format":"burget-operations","version":1,"operations":[...]}. Поля expense/income: date (YYYY-MM-DD), type, amount (положительное число, до 2 знаков), currency, account (точный ID или название моего счёта), category (ID), note, paymentMethod (card/sbp/cash/bank/unknown), необязательный externalId (только реальный банковский ID, не выдумывай). Доход: category=income. Поля transfer: date,type,amount,currency,from,to,note, необязательные fee и externalId; без account/category/paymentMethod. Переводы только между своими счетами в одной валюте. Включай комиссию отдельно в fee; не включай её снова как расход. Обед, явно оплаченный компанией, имеет type=lunch, currency=RUB, date, amount, note; без account/category/paymentMethod. Лично оплаченная еда остаётся expense. Неизвестные поля не добавляй.\nМои счета (без остатков): ${JSON.stringify(data.accounts.map(a=>({id:a.id,name:a.name,currency:a.currency||'RUB'})))}\nКатегории: ${JSON.stringify(CATEGORIES.concat(data.customCats||[]).map(c=>({id:c.id,name:c.name})))}\nЧасовой пояс: ${data.settings?.timeZone||DEFAULT_ZONE}. Относительные даты на скриншоте не угадывай: спроси дату его создания. Покупки по СБП — расходы. Выписка должна содержать фактические операции, не будущие планы.`;}
export function downloadJson(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
