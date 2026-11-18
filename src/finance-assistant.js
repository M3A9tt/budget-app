import {spendingReport} from './analytics-report.js';
import {forecast,validDate} from './finance-tools.js';
import {moveDate} from './finance-events.js';
import {parseMoney} from './ledger.js';

const cents=value=>{
  const result=Math.round(value*100);
  if(!Number.isSafeInteger(result))throw Error('Сумма выходит за пределы точного расчёта.');
  return result;
};

export function financeAnalysis(data,today,input) {
  if(input?.mode==='spending') {
    const report=spendingReport(data,today,input.range);
    if(report.accountId&&!data.accounts.some(account=>account.id===report.accountId))throw Error('Выбери существующий счёт.');
    const category=report.changes.find(row=>Math.sign(row.change)===Math.sign(report.delta));
    const facts=[
      {id:'spent',amount:cents(report.total),count:report.count},
      {id:'coverage',days:report.recordedDays,totalDays:report.days,priorDays:report.previousRecordedDays,priorTotalDays:report.previousDays}
    ];
    if(report.count&&report.previousCount) {
      facts.push({id:'comparison',amount:cents(report.delta),previous:cents(report.previous)});
      if(category)facts.push({id:'category',amount:cents(category.change)});
    }
    return {
      facts,categoryName:category?.name,mode:input.mode,
      period:[report.from,report.to],previousPeriod:[report.previousFrom,report.previousTo],
      comparisonAvailable:report.count>0&&report.previousCount>0
    };
  }
  if(input?.mode!=='purchase')throw Error('Выбери расчёт.');
  const amount=parseMoney(input.amount),lastDay=moveDate(today,30),date=input.date;
  if(!(amount>0)||!validDate(date)||date<today||date>lastDay) {
    throw Error('Укажи сумму больше нуля и дату в ближайшие 30 дней.');
  }
  const estimate=forecast(data,today),points=[estimate.todayPoint,...estimate.points],purchase=cents(amount);
  const evaluate=key=>{
    const balances=points.map(point=>{
      const balance=cents(point[key])-(point.date>=date?purchase:0);
      if(!Number.isSafeInteger(balance))throw Error('Сумма выходит за пределы точного расчёта.');
      return balance;
    });
    return {
      minimum:Math.min(...balances),
      shortfall:points[balances.findIndex(balance=>balance<0)]?.date||null,
      balanceOnPurchase:balances[points.findIndex(point=>point.date===date)]
    };
  };
  const safe=evaluate('balance'),expected=evaluate('expectedBalance');
  const unknown=estimate.events.filter(event=>event.spendable&&event.type==='expense'&&event.amountRub===null).length;
  const facts=[
    {id:'safe',minimum:safe.minimum,onDate:safe.balanceOnPurchase,deficit:!!safe.shortfall},
    {id:'income',minimum:expected.minimum,deficit:!!expected.shortfall,amount:cents(estimate.plannedIncome)},
    {id:'pace',amount:cents(estimate.daily),days:estimate.activeDays}
  ];
  if(unknown)facts.push({id:'unknown',count:unknown});
  return {mode:input.mode,facts,safe,expected,unknown,amount:purchase,date,lastDay};
}

export function assistantPrompt(analysis) {
  const schema={
    type:'object',additionalProperties:false,required:['ids'],
    properties:{ids:{type:'array',minItems:1,maxItems:3,items:{type:'string',enum:analysis.facts.map(fact=>fact.id)}}}
  };
  const messages=[
    {role:'system',content:'Ты объясняешь расчёт личного бюджета. Проверь, какие факты подтверждают вывод. Верни только JSON с массивом ids из 1–3 самых уместных идентификаторов, по важности, без повторов. Перечисляй только переданные факты. В режиме spending отдай приоритет изменению и его категории, если они есть, иначе сумме и полноте записей. В режиме purchase объясни безопасный остаток, затем неизвестные расходы или вклад ожидаемых доходов, если это существенно. Денежные значения в копейках.'},
    {role:'user',content:JSON.stringify({mode:analysis.mode,facts:analysis.facts})}
  ];
  return {messages,schema};
}

export function verifyAssistantSelection(value,analysis) {
  if(typeof value==='string') {
    if(value.length>1_000)return null;
    try{value=JSON.parse(value);}catch{return null;}
  }
  if(!value||Array.isArray(value)||Object.keys(value).length!==1||!Array.isArray(value.ids))return null;
  const {ids}=value,allowed=analysis.facts.map(fact=>fact.id);
  if(ids.length<1||ids.length>3||new Set(ids).size!==ids.length||!ids.every(id=>allowed.includes(id)))return null;
  if(analysis.mode==='purchase'&&!ids.includes('safe'))return null;
  if(analysis.mode==='spending'&&!ids.some(id=>id==='spent'||id==='comparison'))return null;
  return ids;
}
