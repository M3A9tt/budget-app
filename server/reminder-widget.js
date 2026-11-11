import {settingTime} from '../src/time-settings.js';
import {create,load} from './bot-drafts.js';
import {applyBotAction,fieldsFor,parseField} from './bot-catalog.js';
import {commitBotAction} from './bot-commit.js';
import {readReceipt} from './state-persistence.js';

const labels={manual:'Только вручную',digest:'Одна общая сводка',legacy:'Отдельные напоминания'};
export const reminderWidgetCommand=/^(?:b:v:reminders|rw:(manual|digest|time(?::([0-2]\d:[0-5]\d))?|save:(wr_[a-f0-9]{32})))$/;

export function reminderWidget(data){
 return {title:'Уведомления',mark:'bell',scope:'reminders',label:'Режим',
  sum:labels[data.settings.notificationMode]||labels.legacy,rows:[['Время сводки',settingTime(data.settings,'report',21)]],
  controls:[[labels.manual,'rw:manual'],[labels.digest,'rw:digest'],['Изменить время','rw:time'],['К сводке','back']]};
}

export async function answerReminderWidget(env,userId,state,messageId,match,readState,commit=commitBotAction){
 const [,action,time,token]=match,{data,revision}=state,card=reminderWidget(data);
 if(!action)return card;
 if(token){
  if(await readReceipt(env,userId,'bot:'+token))return {...card,status:'Настройки сохранены.'};
  const {p}=await load(env,userId,token);
  if(p.kind!=='widget-reminders'||p.messageId!==messageId)throw Error('Открой настройки в исходной карточке.');
  await commit(env,userId,token,p,readState);
  return {...reminderWidget((await readState(env,userId)).data),status:'Настройки сохранены.'};
 }
 if(action==='time')return {...card,scope:'reminders-edit',foot:'Время общей сводки',
  input:{type:'time',label:'Время общей сводки',value:settingTime(data.settings,'report',21),command:'rw:time:'},
  controls:[['К настройкам','back']]};
 const op=time?'setting':'notificationMode',args=time?{key:'reportTime'}:{mode:action};
 const values=time?{value:parseField(fieldsFor(data,op,args)[0],time)}:{};
 const next=applyBotAction(structuredClone(data),op,args,values);
 const id=await create(env,userId,{kind:'widget-reminders',messageId,revision,op,args,values},'wr_');
 return {...reminderWidget(next),scope:'reminders-edit',foot:'Проверь изменения',
  controls:[['Сохранить','rw:save:'+id],['К настройкам','back']]};
}
