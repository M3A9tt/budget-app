import {companyLunch,personalLunch} from './lunch-records.js';
import {lunchDayRatio} from './lunch-schedule.js';
export function lunchDayStatus(data,date,responses=[]){
 const rows=data.transactions.filter(t=>t.date===date);
 if(rows.some(companyLunch))return 'company';
 if(rows.some(personalLunch))return 'own';
 // A profile answer is authoritative; SQL is a compatibility fallback.
 const answer=data.lunchAnswers?.[date];
 if(answer?.status==='skipped')return 'skipped';
 if(answer?.status==='unanswered')return 'unanswered';
 if(lunchDayRatio(data,date)===0)return 'absence';
 const sql=responses.find(r=>r.day===date&&r.kind==='lunch');
 return sql?.status==='recorded'?'company':['skipped','off'].includes(sql?.status)?'skipped':'unanswered';
}
export function setLunchAnswer(data,date,status,reason=''){
 if(!['skipped','unanswered'].includes(status)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Неверный ответ об обеде');
 return {...data,lunchAnswers:{...data.lunchAnswers,[date]:{status,reason}}};
}
