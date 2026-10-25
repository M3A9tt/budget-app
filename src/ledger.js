import {companyLunch,lunchDeletionRecords,validateLunchLinks} from './lunch-records.js';
import {validateHome} from './home-layout.js';
import {validateInstallmentLinks} from './installment-state.js';
import {validateDebtLinks} from './debt-state.js';
import {validateWishes} from './wishes.js';
import {clockAt,DEFAULT_ZONE} from './time-settings.js';
import {validateModules} from './modules.js';
import {plannedPaid,planPeriod,planType,validPlannedPeriod,validatePlannedLinks} from './planned-model.js';
import {validateReminderSettings} from './reminder-settings.js';
import {validateLunchSchedule} from './lunch-schedule.js';
export const roundMoney = n => {
  if(!Number.isFinite(n))return n;
  // Decimal shifting keeps values such as 10.075 on the correct side of the
  // half-cent boundary; a fixed binary epsilon does not at that magnitude.
  const [digits,exponent='0']=Math.abs(n).toString().split('e');
  const cents=Math.round(Number(digits+'e'+(Number(exponent)+2)));
  return cents===0?0:(n<0?-cents:cents)/100;
};
// Sum rounded monetary amounts as cents, including historical currency fallbacks.
export const sumMoney = (rows, value = x => x) => rows.reduce((cents,row) => cents + Math.round(roundMoney(value(row))*100),0)/100;
export function parseMoney(value) {
  const s = String(value ?? '').trim().replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? roundMoney(n) : NaN;
}
const positive = value => {
  const n = parseMoney(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Введите положительную сумму, до двух знаков после запятой');
  return n;
};
const newId = () => crypto.randomUUID();
function rate(data, currency) {
  if (!currency || currency === 'RUB') return 1;
  const r = data.rates?.[currency];
  if (!Number.isFinite(r) || r <= 0) throw new Error('Нет курса для ' + currency);
  return r;
}
export function historicalRub(tx, fallback) {
  return Number.isFinite(tx.amountRub) ? tx.amountRub : roundMoney(fallback(tx.amount, tx.currency || 'RUB'));
}
export const transactionRub = (data,tx) => historicalRub(tx,(amount,currency)=>amount*(data.rates?.[currency]||1));
function delta(data, tx) {
  if (tx.balanceEffect === 'history-only' || !tx.accountId || tx.type === 'lunch' || tx.cat === 'lunch') return 0;
  const account = data.accounts.find(a => a.id === tx.accountId);
  if (!account) throw new Error('Счёт операции отсутствует. Сначала восстановите или переназначьте счёт');
  if (Number.isFinite(tx.accountAmount)) return tx.accountAmount;
  if ((tx.currency || 'RUB') !== (account.currency || 'RUB')) {
    throw new Error('Старая валютная операция: фактическое списание неизвестно. Сначала сверка остатка');
  }
  return tx.amount;
}
function apply(data, tx, direction) {
  const amount = delta(data, tx);
  if (!amount) return data;
  const sign = tx.type === 'income' ? 1 : -1;
  return {...data, accounts: data.accounts.map(a => a.id === tx.accountId ? {...a, balance: roundMoney(a.balance + sign * direction * amount)} : a)};
}
function prepare(data, tx) {
  const amount = positive(tx.amount);
  if(tx.balanceEffect!=='history-only'&&tx.date>clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date)throw Error('Будущую операцию оставьте планом; подтвердите после фактической оплаты или поступления');
  if (!['expense','income','lunch'].includes(tx.type)) throw new Error('Неверный тип операции');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date) || Number.isNaN(Date.parse(tx.date+'T00:00:00Z')) || new Date(tx.date + 'T00:00:00Z').toISOString().slice(0,10) !== tx.date) throw new Error('Неверная дата');
  const currency = tx.currency || 'RUB';
  const old=data.transactions.find(t=>t.id===tx.id);
  const sameAmount=old&&old.amount===amount&&(old.currency||'RUB')===currency;
  const unchanged=sameAmount&&old.accountId===tx.accountId;
  const amountRub = sameAmount&&Number.isFinite(old.amountRub)?old.amountRub:roundMoney(amount * rate(data, currency));
  if(tx.paymentMethod&&!['card','sbp','cash','bank','unknown'].includes(tx.paymentMethod))throw new Error('Неверный способ оплаты');
  if(tx.balanceEffect&&!['normal','history-only'].includes(tx.balanceEffect))throw new Error('Неверный режим остатка');
  if(!Number.isFinite(amountRub)||amountRub<0||amountRub>1e14)throw Error('Слишком большая сумма после пересчёта валюты');
  const account = tx.accountId ? data.accounts.find(a => a.id === tx.accountId) : null;
  if (tx.accountId && !account) throw new Error('Счёт не найден');
  const lunch = tx.type === 'lunch' || tx.cat === 'lunch';
  return {...tx, ...(tx._lunchCheckDay?{_lunchCheckDay:tx.date}:{}), id: tx.id || newId(), amount, currency, amountRub,
    accountId: lunch ? undefined : tx.accountId,
    accountAmount: lunch || !account ? 0 : unchanged&&Number.isFinite(old.accountAmount)?old.accountAmount:currency===(account.currency||'RUB')?amount:roundMoney(amountRub / rate(data, account.currency)),
    revision: (tx.revision || 0) + 1, updatedAt: new Date().toISOString()};
}
function log(data, entry) {
  return {...data, history: [{id:newId(),ts:Date.now(),...entry},...(data.history||[])].slice(0,200)};
}
function samePlan(a,b){
  return !!a&&!!b&&[...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>JSON.stringify(a[key])===JSON.stringify(b[key]));
}
function reconcileRecurring(data,...ids) {
  const touched=new Set(ids.filter(Boolean));
  if(!touched.size)return data;
  return {...data,recurring:(data.recurring||[]).map(rule=>{
    if(!touched.has(rule.id))return rule;
    const months=data.transactions.filter(t=>t.recurringId===rule.id&&t.type===planType(rule)).map(t=>t.recurringPeriod||planPeriod(rule,t.date)).sort();
    return {...rule,lastCreated:months.at(-1)||''};
  })};
}
export function putTransaction(data, input) {
  const old = data.transactions.find(t => t.id === input.id);
  if(old?.recurringId&&input.recurringId!==old.recurringId)throw Error('Связь операции с планом нельзя удалить или заменить при редактировании');
  if(old?.installmentPaymentId&&input.installmentPaymentId!==old.installmentPaymentId)throw Error('Связь операции с рассрочкой нельзя удалить при редактировании');
  if(old?.debtId&&input.debtId!==old.debtId)throw Error('Связь операции с долгом нельзя удалить при редактировании');
  if (old && input.revision !== old.revision) throw new Error('Операция уже изменена. Откройте её заново');
  let next = old ? apply(data, old, -1) : data;
  const rule=input.recurringId&&data.recurring.find(r=>r.id===input.recurringId);
  if(input.recurringId&&!rule&&!old)throw Error('План операции больше не существует');
  if(rule&&input.date>clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date)throw Error('Будущую операцию оставьте планом; подтвердите после фактической оплаты или поступления');
  const period=rule?(input.recurringPeriod||planPeriod(rule,input.date)):undefined;
  const sameOccurrence=rule&&old&&old.recurringId===rule.id&&(old.recurringPeriod||planPeriod(rule,old.date))===period;
  if(rule&&(input.type!==planType(rule)||!validPlannedPeriod(rule,period,!sameOccurrence)||(rule.skippedPeriods||[]).includes(period)))throw Error('Неверный или пропущенный период плана');
  if(rule&&plannedPaid({...data,transactions:data.transactions.filter(t=>t.id!==old?.id)}, {...rule,lastCreated:old?'':rule.lastCreated},period))throw Error('Этот период уже подтверждён');
  if(rule&&input.saveRecurringAmount&&(input.currency||'RUB')!==(rule.currency||'RUB'))throw Error('Чтобы обновить сумму плана, оставьте валюту плана или снимите флажок');
  if(old?.lunchId&&input.lunchId!==old.lunchId)throw Error('Связь доплаты с обедом нельзя удалить при редактировании');
  if(input.lunchId){const meal=data.transactions.find(t=>t.id===input.lunchId);if(!meal||!companyLunch(meal)||input.type!=='expense'||input.cat==='lunch'||input.date!==meal.date)throw Error('Доплата должна относиться к существующему обеду той же даты');}
  const {saveRecurringAmount,...fields}=input;
  const tx = prepare(next,{...fields,...(rule?{recurringPeriod:period}:{})});
  if(rule&&saveRecurringAmount)next={...next,recurring:next.recurring.map(r=>r.id===rule.id?{...r,amount:tx.amount,variable:false}:r)};
  next = apply(next, tx, 1);
  next = {...next, transactions: old ? next.transactions.map(t => t.id === tx.id ? tx : t) : [...next.transactions,tx]};
  const relatedBefore=old&&old.date!==tx.date?next.transactions.filter(t=>t.lunchId===tx.id):[];
  if(relatedBefore.length)next={...next,transactions:next.transactions.map(t=>t.lunchId===tx.id?{...t,date:tx.date,...(t._lunchCheckDay?{_lunchCheckDay:tx.date}:{}),revision:(t.revision||0)+1,updatedAt:tx.updatedAt}:t)};
  next=validatePlannedLinks(validateLunchLinks(validateInstallmentLinks(validateDebtLinks(reconcileRecurring(next,old?.recurringId,tx.recurringId)))));
  const recurringChange=rule&&saveRecurringAmount?{recurringBefore:structuredClone(rule),recurringAfter:structuredClone(next.recurring.find(r=>r.id===rule.id))}:{};
  return log(next,{type:old?'edit_tx':'add_tx',before:old,after:tx,...(relatedBefore.length?{relatedBefore}:{}),...recurringChange});
}
export function deleteTransaction(data, id) {
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return data;
  const removed=lunchDeletionRecords(data,id),ids=new Set(removed.map(t=>t.id));
  let next=data;for(const row of removed)next=apply(next,row,-1);
  return log(validateLunchLinks(reconcileRecurring({...next,transactions:next.transactions.filter(t=>!ids.has(t.id))},...removed.map(t=>t.recurringId))),{type:'delete_tx',before:tx,relatedBefore:removed.filter(t=>t.id!==id)});
}
export function undoTransaction(data, entry) {
  // Only a still-available journal event can be reversed. Never trust cached fields.
  entry=(data.history||[]).find(h=>h.id===entry?.id);
  if(!entry||!['add_tx','edit_tx','delete_tx'].includes(entry.type))throw Error('Это изменение уже отменено или отсутствует в истории. Обновите данные');
  if(entry.recurringBefore&&(!entry.recurringAfter||!samePlan(data.recurring.find(r=>r.id===entry.recurringAfter.id),entry.recurringAfter)))throw Error('После этого действия план изменялся или был удалён. Откат отменён, чтобы сохранить актуальные настройки');
  let next = data;
  const current = entry.after && data.transactions.find(t => t.id === entry.after.id);
  if (entry.type === 'delete_tx') {
    const restored=[entry.before,...(entry.relatedBefore||[])];
    if(restored.some(t=>data.transactions.some(x=>x.id===t.id)))throw new Error('Операция уже восстановлена');
    for(const tx of restored)next=apply(next,tx,1);
    next={...next,transactions:[...next.transactions,...restored]};
  } else {
    if (!current || current.revision !== entry.after.revision) throw new Error('После этого действия операция изменялась. Откат отменён');
    for(const before of entry.relatedBefore||[]){const now=next.transactions.find(t=>t.id===before.id);if(!now||now.revision!==(before.revision||0)+1)throw Error('Связанная доплата изменилась. Откат отменён');}
    if(entry.relatedBefore?.length)next={...next,transactions:next.transactions.map(t=>entry.relatedBefore.find(b=>b.id===t.id)||t)};
    next = apply(next,current,-1);
    next = {...next, transactions:next.transactions.filter(t => t.id !== current.id)};
    if (entry.before) {
      next = apply(next,entry.before,1);
      next = {...next, transactions:[...next.transactions,entry.before]};
    }
  }
  if(entry.recurringBefore)next={...next,recurring:next.recurring.map(r=>r.id===entry.recurringBefore.id?structuredClone(entry.recurringBefore):r)};
  return validatePlannedLinks(validateLunchLinks(validateInstallmentLinks(validateDebtLinks(reconcileRecurring({...next, history:(next.history||[]).filter(h => h.id !== entry.id)},entry.before?.recurringId,entry.after?.recurringId)))));
}
export function transferMoney(data, {id,from,to,amount,fee=0,note='',date,externalId,externalAccountId,balanceEffect='normal'}) {
  if(balanceEffect!=='history-only'&&date>clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date)throw Error('Будущий перевод пока не меняет остатки: запишите его после фактической передачи денег');
  const a = positive(amount), f = parseMoney(fee);
  if (!Number.isFinite(f) || f < 0) throw new Error('Неверная комиссия');
  const source = data.accounts.find(x => x.id === from), target = data.accounts.find(x => x.id === to);
  if (!source || !target || from === to) throw new Error('Выберите разные счета');
  if(externalAccountId!==undefined&&(typeof externalAccountId!=='string'||![from,to].includes(externalAccountId)||!data.accounts.some(a=>a.id===externalAccountId)))throw Error('Счёт внешнего идентификатора должен участвовать в переводе');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || Number.isNaN(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Неверная дата перевода');
  if ((source.currency||'RUB') !== (target.currency||'RUB')) throw new Error('Переводы между разными валютами временно отключены: нужен фактический курс обмена');
  if(!['normal','history-only'].includes(balanceEffect))throw Error('Неверный режим перевода');
  if(id!==undefined&&(typeof id!=='string'||!id||id.length>100))throw Error('Неверный идентификатор перевода');
  const prior=id&&(data.transfers||[]).find(t=>t.id===id);
  if(prior){if(prior.from===from&&prior.to===to&&prior.amount===a&&(prior.fee||0)===f&&(prior.note||'')===note&&prior.date===date&&(prior.balanceEffect||'normal')===balanceEffect&&prior.externalId===externalId&&(prior.externalAccountId||prior.from)===(externalAccountId||from)&&(prior.currency||'RUB')===(source.currency||'RUB'))return data;throw Error('Этот перевод уже сохранён с другими данными. Проверь историю переводов');}
  let next = {...data, accounts:balanceEffect==='history-only'?data.accounts:data.accounts.map(x => x.id === from ? {...x,balance:roundMoney(x.balance-a)} : x.id === to ? {...x,balance:roundMoney(x.balance+a)} : x),
    transfers:[...(data.transfers||[]),{id:id||newId(),from,to,amount:a,fee:f,currency:source.currency||'RUB',note,date,externalId,...(externalAccountId!==undefined?{externalAccountId}:{}),balanceEffect}]};
  if (f) next = putTransaction(next,{type:'expense',cat:'other',amount:f,currency:source.currency||'RUB',note:'Комиссия за перевод'+(note?' · '+note:''),date,tags:['комиссия'],accountId:from,balanceEffect});
  return next;
}
export function migrateData(input, defaults) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Нужен JSON-бэкап приложения');
  if (input.schemaVersion > 2) throw new Error('Бэкап создан более новой версией приложения');
  for (const k of ['settings','rates','lunchDayMod','categoryBudgets']) if (input[k] !== undefined && (!input[k] || typeof input[k] !== 'object' || Array.isArray(input[k]))) throw new Error('Повреждённое поле: '+k);
  for (const k of ['transactions','accounts','debts','goals','wishes','customCats','transfers','recurring','history','lunchDayOff','installments','reconciliations']) {
    if (input[k] !== undefined && !Array.isArray(input[k])) throw new Error('Повреждённое поле: '+k);
  }
  const data = {installments:[],reconciliations:[],wishes:[],...structuredClone(defaults), ...input, schemaVersion:2,
    settings:{...defaults.settings,...input.settings},rates:{...defaults.rates,...input.rates}};
  const dateValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  for(const key of ['accounts','transactions','transfers','recurring','goals','debts','installments','reconciliations','customCats','history']){
    for(const row of data[key]){
      if(!record(row))throw Error('Повреждённая запись: '+key);
      if(row.id!==undefined&&(typeof row.id!=='string'||!row.id.trim()))throw Error('Неверный идентификатор: '+key);
      for(const field of ['name','note','person','cat','icon','color'])if(row[field]!==undefined&&typeof row[field]!=='string')throw Error('Неверное текстовое поле '+field+': '+key);
      if(row.tags!==undefined&&(!Array.isArray(row.tags)||row.tags.some(tag=>typeof tag!=='string')))throw Error('Теги операции должны быть строками');
      for(const field of ['payments','relatedBefore'])if(row[field]!==undefined&&(!Array.isArray(row[field])||row[field].some(x=>!record(x))))throw Error('Повреждённые вложенные записи '+field+': '+key);
      if(key==='history')for(const field of ['before','after','recurringBefore','recurringAfter'])if(row[field]!=null&&!record(row[field]))throw Error('Повреждённая история: '+field);
    }
  }
  if(data.settings.reserveRub!==undefined&&(!Number.isFinite(data.settings.reserveRub)||data.settings.reserveRub<0))throw Error('Неверный резерв');
  if(data.settings.nextIncomeDate&&!dateValid(data.settings.nextIncomeDate))throw Error('Неверная дата следующего дохода');
  const currencies=new Set(['RUB','USD','EUR','GBP','CNY','TRY']);
  for (const [currency,value] of Object.entries(data.rates)) if (!currencies.has(currency)||!Number.isFinite(value)||value<=0) throw new Error('Неверный курс в бэкапе');
  data.rates.RUB=1; // The reporting currency is a unit, never an editable exchange rate.
  for (const key of ['budget','lunchDaily','workDays']) if (data.settings[key]!==undefined && (!Number.isFinite(data.settings[key])||data.settings[key]<0)) throw new Error('Неверная настройка: '+key);
  if(data.settings.telemetryEnabled!==undefined&&typeof data.settings.telemetryEnabled!=='boolean')throw Error('Неверная настройка телеметрии');
  if(data.settings.lunchEmployeeId!==undefined&&!/^\d{1,5}$/.test(data.settings.lunchEmployeeId))throw Error('Номер сотрудника: от 1 до 5 цифр');
  if(data.settings.lunchLearningEnabled!==undefined&&typeof data.settings.lunchLearningEnabled!=='boolean')throw Error('Неверная настройка обучения обедов');
  if(data.settings.reserveNote!==undefined&&(typeof data.settings.reserveNote!=='string'||data.settings.reserveNote.length>160))throw Error('Назначение резерва — до 160 символов');
  validateWishes(data);
  validateReminderSettings(data.settings);validateModules(data.settings);validateHome(data.settings);validateLunchSchedule(data);
  if(data.settings.rememberEntryChoices!==undefined&&typeof data.settings.rememberEntryChoices!=='boolean')throw Error('Неверная настройка быстрого ввода');
  for (const a of data.accounts) if (!a.id || (!Number.isFinite(a.balance)||Math.abs(a.balance)>1e14) || !currencies.has(a.currency||'RUB')) throw new Error('Неверный счёт в бэкапе');
  for(const a of data.accounts){if(a.storageKind!==undefined&&!['bank','cash','other'].includes(a.storageKind))throw Error('Неверное место хранения денег');if(a.savingsKind==='deposit'&&a.storageKind&&a.storageKind!=='bank')throw Error('Вклад хранится в банке');if(a.annualRate!==undefined&&(!Number.isFinite(a.annualRate)||a.annualRate<0))throw Error('Неверная ставка вклада');if(a.maturityDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(a.maturityDate)||Number.isNaN(Date.parse(a.maturityDate))||new Date(a.maturityDate+'T12:00:00Z').toISOString().slice(0,10)!==a.maturityDate))throw Error('Неверная дата окончания вклада');}
  const accountIds=new Set(data.accounts.map(a=>a.id));
  for (const tx of data.transactions) {
    if(tx.accountId&&!accountIds.has(tx.accountId))throw Error('Счёт операции отсутствует в бэкапе. Восстановите или сопоставьте счёт');
    for(const key of ['amountRub','accountAmount'])if(tx[key]!==undefined&&(!Number.isFinite(tx[key])||tx[key]<0||tx[key]>1e14||Math.abs(tx[key]*100-Math.round(tx[key]*100))>0.01))throw Error('Неверная сумма списания в бэкапе: '+key);
    if(tx.balanceEffect!==undefined&&!['normal','history-only'].includes(tx.balanceEffect))throw Error('Неверный режим остатка в бэкапе');
    if (!['expense','income','lunch'].includes(tx.type)||!tx.id || !Number.isFinite(tx.amount) || tx.amount <= 0 || tx.amount>1e12 || Math.abs(tx.amount*100-Math.round(tx.amount*100))>0.01 || !currencies.has(tx.currency||'RUB') || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date||'') || Number.isNaN(Date.parse(tx.date+'T00:00:00Z')) || new Date(tx.date+'T00:00:00Z').toISOString().slice(0,10)!==tx.date || (tx.tags!==undefined&&!Array.isArray(tx.tags))) throw new Error('Неверная операция в бэкапе');
  }
  for(const r of data.recurring){if(['once','daily','weekly'].includes(r.frequency)&&!dateValid(r.startDate))throw Error('Укажите первую дату плана');if(['daily','weekly'].includes(r.frequency)&&(Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:data.settings.timeZone||'Europe/Moscow'}).format(new Date())+'T12:00:00Z')-Date.parse(r.startDate+'T12:00:00Z'))/86400000/(r.frequency==='daily'?1:7)>9900)throw Error('Уточните начало плана: слишком много прошлых периодов');if(r.active!==undefined&&typeof r.active!=='boolean')throw Error('Неверное состояние плана');if(r.dueDay!==undefined&&(!Number.isInteger(r.dueDay)||r.dueDay<1||r.dueDay>31))throw Error('Неверный день плана');if(r.type!==undefined&&!['income','expense'].includes(r.type))throw Error('Неверный тип плана');if(r.frequency!==undefined&&!['daily','weekly','monthly','once'].includes(r.frequency))throw Error('Неверный период плана');if(r.startDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.startDate)||Number.isNaN(Date.parse(r.startDate))||new Date(r.startDate+'T12:00:00Z').toISOString().slice(0,10)!==r.startDate))throw Error('Неверная дата плана');if(r.skippedPeriods!==undefined&&(!Array.isArray(r.skippedPeriods)||r.skippedPeriods.some(p=>p!=='once'&&!/^\d{4}-\d{2}(?:-\d{2})?$/.test(p))))throw Error('Неверный пропуск периода');}
  for (const k of ['debts','goals','recurring']) for (const entity of data[k]) {
    if (!entity || !entity.id || (entity.payments!==undefined&&!Array.isArray(entity.payments))) throw new Error('Неверная запись: '+k);
    for (const field of ['amount','target','saved']) if (entity[field]!==undefined && (!Number.isFinite(entity[field])||entity[field]<0)) throw new Error('Неверная сумма: '+k);
  }
  for(const t of data.transfers)if(!t.id||(!t.from&&!t.to)||(t.from&&t.from===t.to)||!Number.isFinite(t.amount)||t.amount<=0||!dateValid(t.date)||(t.fee!==undefined&&(!Number.isFinite(t.fee)||t.fee<0)))throw Error('Неверный перевод в бэкапе');
  for(const t of data.transfers)if(t.externalAccountId!==undefined&&(typeof t.externalAccountId!=='string'||![t.from,t.to].includes(t.externalAccountId)||!accountIds.has(t.externalAccountId)))throw Error('Счёт внешнего идентификатора перевода отсутствует или не участвует в переводе');
  for(const p of data.installments){if(p.obligationKind!==undefined&&!['installment','split','loan','mortgage'].includes(p.obligationKind))throw Error('Неверный вид обязательства');if(p.cadence!==undefined&&!['monthly','weekly','biweekly'].includes(p.cadence))throw Error('Неверный график обязательства');if(!p.id||!Array.isArray(p.payments)||!Number.isFinite(p.total)||p.total<=0||p.total>1e12||!currencies.has(p.currency))throw new Error('Неверная рассрочка');for(const x of p.payments)if(!x.id||!Number.isFinite(x.amount)||x.amount<=0||x.amount>1e12||!dateValid(x.date))throw new Error('Неверный платёж рассрочки');}
  for (const k of ['transactions','accounts','debts','goals','recurring','installments','transfers']) if (new Set(data[k].map(x=>x.id)).size !== data[k].length) throw new Error('Повторяющиеся ID: '+k);
  data.migrationWarnings = data.transactions.filter(t=>t.accountId && !Number.isFinite(t.accountAmount) && (t.currency||'RUB') !== (data.accounts.find(a=>a.id===t.accountId)?.currency||'RUB')).map(t=>t.id);
  for(const d of data.debts){if(d.dueDate&&!dateValid(d.dueDate))throw Error('Неверный срок возврата долга');}
  validatePlannedLinks(data);validateDebtLinks(data);validateInstallmentLinks(data);validateLunchLinks(data);delete data._pinHash;
  // Preserve supplied balances. Historical bank exchange rates cannot be reconstructed.
  return data;
}

// Changes to live facts must obey the same date rule for whole-state saves and bot commands.
export function validateStateChange(previous,next){
 const today=clockAt(new Date(),next.settings?.timeZone||DEFAULT_ZONE).date;
 for(const key of ['transactions','transfers']){
  const old=new Map((previous[key]||[]).map(x=>[x.id,JSON.stringify(x)]));
  for(const x of next[key]||[])if(x.balanceEffect!=='history-only'&&x.date>today&&old.get(x.id)!==JSON.stringify(x))throw Error('Будущие операции оставьте планами; они не должны менять текущие остатки');
 }
 return next;
}
