import React from 'react';
import {EXPENSE_GROUPS} from './analytics-report.js';

const types={expense:'Расходы',income:'Доходы',transfer:'Переводы',lunch:'Обеды компании'};
const dateLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export default function HistoryFilters({data,cats,type,date,search,accountId,includeLunch,report,onType,onDate,onSearch,onAccount,onLunch,onReport,onClear,backLabel,onBack}){
 const accountName=id=>data.accounts.find(account=>account.id===id)?.name||'Счёт отсутствует';
 const filters=[];
 const add=(key,label,remove)=>{if(label)filters.push({key,label,remove});};
 const removeReport=(...keys)=>{
  const next={...report,type:report.type||'expense'};
  for(const key of keys)delete next[key];
  if(keys.includes('type'))next.type='all';
  onReport(Object.keys(next).some(key=>key!=='fromAnalytics'&&(key!=='type'||next.type!=='all'))?next:null);
 };

 add('type',type==='all'?null:types[type],onType);
 add('search',search.trim()?'Поиск: '+search.trim():null,onSearch);
 add('date',date?dateLabel(date):null,onDate);
 add('account',accountId?accountName(accountId):null,onAccount);
 add('lunch',includeLunch?'Обеды компании':null,onLunch);

 if(report){
  const reportType=report.type||'expense';
  const kind=report.group?EXPENSE_GROUPS.find(group=>group.id===report.group)?.name:report.fixed===true?'Платежи и возвраты':report.fixed===false?'Остальные покупки':types[reportType];
  add('report-kind',kind,()=>removeReport('type','group','fixed'));
  add('report-category',report.cat?(cats.find(cat=>cat.id===report.cat)?.name||'Категория'):'',()=>removeReport('cat'));
  add('report-account',report.accountId?accountName(report.accountId):'',()=>removeReport('accountId'));
  add('report-period',report.date?dateLabel(report.date):report.from&&report.to?dateLabel(report.from)+' — '+dateLabel(report.to):'',()=>removeReport('date','from','to'));
  add('report-record',report.transactionId?'Выбранная операция':'',()=>removeReport('transactionId'));
 }
 if(!filters.length&&!backLabel)return null;
 return <div className="history-active-filters" role="group" aria-label="Активные фильтры">
  {backLabel&&<button type="button" className="mini-text-button history-filter-back" onClick={onBack}>{backLabel}</button>}
  {filters.map(({key,label,remove})=><button key={key} type="button" className="history-filter-tag" aria-label={'Снять фильтр: '+label} onClick={remove}><span>{label}</span><span aria-hidden="true">×</span></button>)}
  {filters.length>0&&<button type="button" className="mini-text-button" onClick={onClear}>Сбросить все</button>}
 </div>;
}
