import {lunchDayStatus} from '../src/lunch-day-state.js';
import {validDate} from '../src/finance-tools.js';

export const lunchReminderKey=day=>'lunch-day:'+day; // Read old receipts only.
export const lunchReminderAnswered=(data,day)=>!['unanswered','absence'].includes(lunchDayStatus(data,day));

// A reminder answers one existing day question; manual meals remain independent.
export function lunchEntryArgs(day,type,prefill={}){
 if(!validDate(day)||!['company','own'].includes(type))throw Error('Некорректный вопрос об обеде');
 return {type:type==='company'?'lunch':'expense',ownLunch:type==='own',lunchCheckDay:day,accountCurrency:'RUB',requireAccount:type==='own',
  prefill:{...prefill,date:day,currency:'RUB',...(type==='company'?{accountId:undefined,cat:'lunch',note:prefill.note||'Обед за счёт компании'}:{cat:'food',note:prefill.note||'Обед за свои',tags:['обед-за-свои']})},
  returnTo:{name:'lunch',args:{month:day.slice(0,7)}}};
}

export function validateLunchEntry(data,args,values){
 if(!args.lunchCheckDay)return;
 if(!validDate(args.lunchCheckDay)||values.date!==args.lunchCheckDay)throw Error('Этот вопрос относится к обеду за '+args.lunchCheckDay+'. Оставь эту дату или создай отдельную запись');
 if((values.currency||'RUB')!=='RUB')throw Error('Вопрос об обеде учитывается в рублях');
 if(args.type==='expense'){
  const account=data.accounts.find(a=>a.id===values.accountId);
  if(!account||(account.currency||'RUB')!=='RUB')throw Error('Выбери рублёвый счёт, с которого оплачен обед');
 }else if(args.type!=='lunch')throw Error('Неверный тип ответа об обеде');
 if(data.lunchAnswers?.[args.lunchCheckDay]?.status==='skipped')throw Error('Обед отмечен как пропущенный. Сначала измени ответ в разделе «Обеды»');
 if(lunchReminderAnswered(data,args.lunchCheckDay))throw Error('Ответ об обеде за этот день уже записан. Открой его в истории');
}
