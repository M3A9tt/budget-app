import {validDate} from './finance-tools.js';

const sections=['calendar','analytics','history','lunch'];
const eventKey=/^(?:plan|installment|debt):[^\u0000-\u001f\u007f]{1,240}$/u;
const linkDate=value=>validDate(value)&&value>='1900-01-01'&&value<='2100-12-31'?value:null;

export function readMiniAppLink(search) {
  const params=new URLSearchParams(search);
  const active=sections.filter(section=>params.get(section)==='1');
  if(active.length!==1)return null;
  const [section]=active;
  const date=section==='analytics'?null:linkDate(params.get('date'));
  const event=params.get('event');
  const eventId=section==='calendar'&&date&&eventKey.test(event||'')?event:null;
  const from=linkDate(params.get('from')),to=linkDate(params.get('to'));
  const range=section==='analytics'&&from&&to&&from<=to&&Date.parse(to)-Date.parse(from)<=365*86400000
    ?{period:'custom',from,to}:null;
  return {section,date,eventId,range};
}

export function writeMiniAppLink(params,target) {
  if(!sections.includes(target.section))return;
  for(const key of [...sections,'date','event','from','to'])params.delete(key);
  params.set(target.section,'1');
  if(target.section==='analytics') {
    if(target.range?.from&&target.range?.to) {
      params.set('from',target.range.from);
      params.set('to',target.range.to);
    }
  } else if(linkDate(target.date)) {
    params.set('date',target.date);
    if(target.section==='calendar'&&eventKey.test(target.eventId||''))params.set('event',target.eventId);
  }
}
