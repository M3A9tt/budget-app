import {money,todayMoscow} from '../src/mini-model.js';
import {duePayments} from '../src/due-payments.js';
import {paymentsWidget} from './notification-widget.js';
import {paymentDate} from '../src/payment-copy.js';
import {fieldsFor,parseField,applyBotAction} from './bot-catalog.js';
import {duePaymentAction} from './bot-chat.js';
import {create,load,replace} from './bot-drafts.js';
import {commitBotAction} from './bot-commit.js';
import {readReceipt} from './state-persistence.js';

const pageSize=3;
const clip=(value,size)=>Array.from(String(value??'')).slice(0,size).join('');
export const paymentFormCommand=/^pf:(wp_[a-f0-9]{32}):(\d{1,2}):(c|r|p\d{1,5}|v[\d.,-]{1,16})$/;
export const paymentListCommand=/^(?:b:v:due|pd:(\d{1,5}))$/;

export function duePaymentsWidget(data,page=0){
 const today=todayMoscow(data.settings.timeZone),items=duePayments(data,today);
 const pages=Math.max(1,Math.ceil(items.length/pageSize));
 page=Math.min(page,pages-1);
 const start=page*pageSize,card=paymentsWidget(items.slice(start,start+pageSize),today);
 return {...card,scope:'due',refresh:'pd:'+page,title:'Платежи на сегодня',sum:String(items.length),
  foot:items.length?'':'Сегодня нет платежей к подтверждению.',
  count:pages>1?`${page+1} из ${pages}`:'',
  controls:[...(page>0?[['← Назад','pd:'+(page-1)]]:[]),
   ...(page+1<pages?[['Дальше →','pd:'+(page+1)]]:[]),['К напоминанию','back']]};
}

function screen(data,token,draft,page=0){
 const {op,args,values,step,item}=draft;
 const command=value=>`pf:${token}:${step}:${value}`;
 const amount=values.amount??item.amount;
 const card={scope:'payment-form',title:clip(item.name,42),mark:'calendar',dateLabel:paymentDate(item.date),
  label:values.amount!=null?'Фактическая сумма':item.income?'Поступление':'Платёж',
  sum:amount==null?'Уточни сумму':money(amount,item.currency),
  rows:[],controls:[]};
 const fields=fieldsFor(data,op,args,values),field=fields[step];
 if(field){
  card.foot=field.label;
  if(field.type==='choice'){
   const first=page*pageSize;
   card.controls=field.choices.slice(first,first+pageSize).map(([,label],i)=>[clip(label,36),command('v'+(first+i))]);
   if(page)card.controls.push(['← Варианты',command('p'+(page-1))]);
   if(first+pageSize<field.choices.length)card.controls.push(['Варианты →',command('p'+(page+1))]);
  }else card.input={type:field.type,label:field.label,value:field.default??'',command:command('v')};
 }else{
  const after=applyBotAction(structuredClone(data),op,args,values);
  card.foot='Проверь перед записью';
  card.rows=fields.filter(field=>field.key!=='amount'&&Object.hasOwn(values,field.key)).map(field=>{
   const value=values[field.key];
   return [clip(field.label,38),clip(field.type==='date'?paymentDate(value):
    field.choices?.find(([choice])=>choice===value)?.[1]??value,35)];
  });
  for(const account of after.accounts){
   const before=data.accounts.find(item=>item.id===account.id);
   if(before&&before.balance!==account.balance)card.rows.push([clip(account.name,30),money(account.balance,account.currency)]);
  }
  card.controls.push(['Подтвердить',command('c')],['Изменить',command('r')]);
 }
 card.controls.push(['← К платежам','back']);
 return card;
}

export async function openPaymentWidget(env,userId,state,messageId,kind,id,period){
 const {data,revision}=state,payment=duePaymentAction(data,kind,id,period);
 if(!payment)return null;
 const draft={kind:'widget-payment',messageId,revision,...payment,values:{},step:0};
 const token=await create(env,userId,draft,'wp_');
 return screen(data,token,draft);
}

export async function stepPaymentWidget(env,userId,state,messageId,match,readState,commit=commitBotAction){
 const [,token,step,action]=match;
 if(action==='c'&&await readReceipt(env,userId,'bot:'+token))return {status:'Платёж записан.',done:true};
 const {row,p}=await load(env,userId,token);
 if(p.kind!=='widget-payment'||p.messageId!==messageId||p.step!==Number(step))throw Error('Открой актуальный шаг платежа.');
 if(state.revision!==p.revision)throw Error('Платёж изменился. Открой его снова.');
 const {data}=state,field=fieldsFor(data,p.op,p.args,p.values)[p.step];
 if(action==='c'&&!field){
  await commit(env,userId,token,p,readState);
  return {status:'Платёж записан.',done:true};
 }
 if(action==='r'&&!field){
  const next={...p,values:{},step:0};
  await replace(env,userId,row,next);
  return screen(data,token,next);
 }
 if(!field)throw Error('Открой актуальный шаг платежа.');
 if(action[0]==='p'&&field.type==='choice'){
  const page=Number(action.slice(1));
  if(page*pageSize>=field.choices.length)throw Error('Варианты закончились.');
  return screen(data,token,p,page);
 }
 if(action[0]!=='v')throw Error('Выбери значение.');
 const value=action.slice(1);
 const selected=field.type==='choice'?(/^\d{1,5}$/.test(value)?field.choices[Number(value)]?.[0]:undefined):value;
 const next={...p,values:{...p.values,[field.key]:parseField(field,selected)},step:p.step+1};
 const result=screen(data,token,next);
 await replace(env,userId,row,next);
 return result;
}
