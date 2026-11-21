import {miniAppButton} from './bot-navigation.js';
import {readMiniAppLink} from '../src/mini-app-link.js';

const labels={calendar:'Календарь в Бюрджете',analytics:'Аналитика в Бюрджете',history:'Операции в Бюрджете',lunch:'Обеды в Бюрджете'};
const commands={calendar:'c',analytics:'a',history:'h',lunch:'l'};

export const summaryLink=report=>({section:'analytics',range:{from:report.from,to:report.to}});

export function withNotificationLink(env,body,target) {
  if(!target)return body;
  let button;
  try{button=miniAppButton(env.MINI_APP_URL,labels[target.section],target);}catch{return body;}
  if(!button)return body;
  return {...body,reply_markup:{inline_keyboard:[...(body.reply_markup?.inline_keyboard||[]),[button]]}};
}

export function withWidgetLink(env,card,controls,target) {
  if(!env.MINI_APP_URL||!target)return {...card,controls};
  const prefix='app:'+commands[target.section]+':';
  let action=target.section==='analytics'
    ?prefix+target.range.from+':'+target.range.to
    :prefix+target.date+(target.eventId?':'+target.eventId:'');
  if(new TextEncoder().encode(action).length>64)action=prefix+target.date;
  if(!readWidgetLink(action))return {...card,controls};
  const next={...card,controls:[...controls,[labels[target.section],action]]};
  const encoded=JSON.stringify(next,(_key,value)=>value===''?undefined:value);
  // If the card is near Telegram's limit, keep its existing controls. The
  // ordinary message still carries the link if the widget is unavailable.
  return new TextEncoder().encode(encoded).length<=1024?next:{...card,controls};
}

export function readWidgetLink(action) {
  const match=typeof action==='string'&&/^app:([cahl]):(\d{4}-\d\d-\d\d)(?::(.+))?$/u.exec(action);
  if(!match)return null;
  const [,command,date,extra]=match;
  const section=Object.keys(commands).find(key=>commands[key]===command);
  const search=new URLSearchParams({[section]:'1'});
  if(section==='analytics'){search.set('from',date);search.set('to',extra||date);}
  else {
    search.set('date',date);
    if(section==='calendar'&&extra)search.set('event',extra);
  }
  const link=readMiniAppLink(search);
  return (section==='analytics'?link?.range:link?.date)?link:null;
}
