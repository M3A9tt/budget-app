import {validateInstallmentLinks} from './installment-state.js';
import {validateDebtLinks} from './debt-state.js';
import {validateWishes} from './wishes.js';
import {clockAt,DEFAULT_ZONE} from './time-settings.js';
import {validateModules} from './modules.js';
import {plannedPaid,planPeriod,planType} from './planned-model.js';
import {validateReminderSettings} from './reminder-settings.js';
export const roundMoney = n => Math.round((n + Number.EPSILON) * 100) / 100;
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
  return Number.isFinite(tx.amountRub) ? tx.amountRub : fallback(tx.amount, tx.currency || 'RUB');
}
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
  const unchanged=old&&old.amount===amount&&(old.currency||'RUB')===currency&&old.accountId===tx.accountId;
  const amountRub = unchanged&&Number.isFinite(old.amountRub)?old.amountRub:roundMoney(amount * rate(data, currency));
  if(tx.paymentMethod&&!['card','sbp','cash','bank','unknown'].includes(tx.paymentMethod))throw new Error('Неверный способ оплаты');
  if(tx.balanceEffect&&!['normal','history-only'].includes(tx.balanceEffect))throw new Error('Неверный режим остатка');
  if(!Number.isFinite(amountRub)||amountRub<0||amountRub>1e14)throw Error('Слишком большая сумма после пересчёта валюты');
  const account = tx.accountId ? data.accounts.find(a => a.id === tx.accountId) : null;
  if (tx.accountId && !account) throw new Error('Счёт не найден');
  const lunch = tx.type === 'lunch' || tx.cat === 'lunch';
  return {...tx, id: tx.id || newId(), amount, currency, amountRub,
    accountId: lunch ? undefined : tx.accountId,
    accountAmount: lunch || !account ? 0 : unchanged&&Number.isFinite(old.accountAmount)?old.accountAmount:roundMoney(amountRub / rate(data, account.currency)),
    revision: (tx.revision || 0) + 1, updatedAt: new Date().toISOString()};
}
function log(data, entry) {
  return {...data, history: [{id:newId(),ts:Date.now(),...entry},...(data.history||[])].slice(0,200)};
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
  if(old?.installmentPaymentId&&input.installmentPaymentId!==old.installmentPaymentId)throw Error('Связь операции с рассрочкой нельзя удалить при редактировании');
  if(old?.debtId&&input.debtId!==old.debtId)throw Error('Связь операции с долгом нельзя удалить при редактировании');
  if (old && input.revision !== old.revision) throw new Error('Операция уже изменена. Откройте её заново');
  let next = old ? apply(data, old, -1) : data;
  const rule=input.recurringId&&data.recurring.find(r=>r.id===input.recurringId);
  if(input.recurringId&&!rule&&!old)throw Error('План операции больше не существует');
  if(rule&&input.date>clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date)throw Error('Будущую операцию оставьте планом; подтвердите после фактической оплаты или поступления');
  const period=rule?(input.recurringPeriod||planPeriod(rule,input.date)):undefined;
  if(rule&&(input.type!==planType(rule)||!(rule.frequency==='once'?period==='once':['daily','weekly'].includes(rule.frequency)?/^\d{4}-\d{2}-\d{2}$/.test(period):/^\d{4}-(0[1-9]|1[0-2])$/.test(period))||(rule.skippedPeriods||[]).includes(period)))throw Error('Неверный или пропущенный период плана');
  if(rule&&plannedPaid({...data,transactions:data.transactions.filter(t=>t.id!==old?.id)}, {...rule,lastCreated:old?'':rule.lastCreated},period))throw Error('Этот период уже подтверждён');
  if(rule&&input.saveRecurringAmount&&(input.currency||'RUB')!==(rule.currency||'RUB'))throw Error('Чтобы обновить сумму плана, оставьте валюту плана или снимите флажок');
  const {saveRecurringAmount,...fields}=input;
  const tx = prepare(next,{...fields,...(rule?{recurringPeriod:period}:{})});
  if(rule&&saveRecurringAmount)next={...next,recurring:next.recurring.map(r=>r.id===rule.id?{...r,amount:tx.amount,variable:false}:r)};
  next = apply(next, tx, 1);
  next = {...next, transactions: old ? next.transactions.map(t => t.id === tx.id ? tx : t) : [...next.transactions,tx]};
  return log(validateInstallmentLinks(validateDebtLinks(reconcileRecurring(next,old?.recurringId,tx.recurringId))), {type:old?'edit_tx':'add_tx',before:old,after:tx});
}
export function deleteTransaction(data, id) {
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return data;
  const next = apply(data,tx,-1);
  return log(reconcileRecurring({...next,transactions:next.transactions.filter(t => t.id !== id)},tx.recurringId), {type:'delete_tx',before:tx});
}
export function undoTransaction(data, entry) {
  let next = data;
  const current = entry.after && data.transactions.find(t => t.id === entry.after.id);
  if (entry.type === 'delete_tx') {
    if (data.transactions.some(t => t.id === entry.before.id)) throw new Error('Операция уже восстановлена');
    next = apply(data,entry.before,1);
    next = {...next, transactions:[...next.transactions,entry.before]};
  } else {
    if (!current || current.revision !== entry.after.revision) throw new Error('После этого действия операция изменялась. Откат отменён');
    next = apply(data,current,-1);
    next = {...next, transactions:next.transactions.filter(t => t.id !== current.id)};
    if (entry.before) {
      next = apply(next,entry.before,1);
      next = {...next, transactions:[...next.transactions,entry.before]};
    }
  }
  return validateInstallmentLinks(validateDebtLinks(reconcileRecurring({...next, history:(next.history||[]).filter(h => h.id !== entry.id)},entry.before?.recurringId,entry.after?.recurringId))); 
}
export function transferMoney(data, {from,to,amount,fee=0,note='',date,externalId,balanceEffect='normal'}) {
  if(balanceEffect!=='history-only'&&date>clockAt(new Date(),data.settings?.timeZone||DEFAULT_ZONE).date)throw Error('Будущий перевод пока не меняет остатки: запишите его после фактической передачи денег');
  const a = positive(amount), f = parseMoney(fee);
  if (!Number.isFinite(f) || f < 0) throw new Error('Неверная комиссия');
  const source = data.accounts.find(x => x.id === from), target = data.accounts.find(x => x.id === to);
  if (!source || !target || from === to) throw new Error('Выберите разные счета');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || Number.isNaN(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Неверная дата перевода');
  if ((source.currency||'RUB') !== (target.currency||'RUB')) throw new Error('Переводы между разными валютами временно отключены: нужен фактический курс обмена');
  if(!['normal','history-only'].includes(balanceEffect))throw Error('Неверный режим перевода');
  let next = {...data, accounts:balanceEffect==='history-only'?data.accounts:data.accounts.map(x => x.id === from ? {...x,balance:roundMoney(x.balance-a)} : x.id === to ? {...x,balance:roundMoney(x.balance+a)} : x),
    transfers:[...(data.transfers||[]),{id:newId(),from,to,amount:a,fee:f,currency:source.currency||'RUB',note,date,externalId,balanceEffect}]};
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
  for(const key of ['accounts','transactions','transfers','recurring','goals','debts','installments','reconciliations','customCats'])if(data[key].some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Повреждённая запись: '+key);
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
  validateReminderSettings(data.settings);validateModules(data.settings);
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
  for(const p of data.installments){if(p.obligationKind!==undefined&&!['installment','split','loan','mortgage'].includes(p.obligationKind))throw Error('Неверный вид обязательства');if(p.cadence!==undefined&&!['monthly','weekly','biweekly'].includes(p.cadence))throw Error('Неверный график обязательства');if(!p.id||!Array.isArray(p.payments)||!Number.isFinite(p.total)||p.total<=0||p.total>1e12||!currencies.has(p.currency))throw new Error('Неверная рассрочка');for(const x of p.payments)if(!x.id||!Number.isFinite(x.amount)||x.amount<=0||x.amount>1e12||!dateValid(x.date))throw new Error('Неверный платёж рассрочки');}
  for (const k of ['transactions','accounts','debts','goals','recurring','installments','transfers']) if (new Set(data[k].map(x=>x.id)).size !== data[k].length) throw new Error('Повторяющиеся ID: '+k);
  data.migrationWarnings = data.transactions.filter(t=>t.accountId && !Number.isFinite(t.accountAmount) && (t.currency||'RUB') !== (data.accounts.find(a=>a.id===t.accountId)?.currency||'RUB')).map(t=>t.id);
  for(const d of data.debts){if(d.dueDate&&!dateValid(d.dueDate))throw Error('Неверный срок возврата долга');}
  validateDebtLinks(data);validateInstallmentLinks(data);delete data._pinHash;
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
