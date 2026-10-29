import {attentionItems} from '../src/attention.js';
import {money} from '../src/mini-model.js';
export function attentionMessage(data,day,responses=[]){
 const items=attentionItems(data,day,{responses});
 return {text:'Что требует внимания · '+day+'\n\n'+(items.length?items.slice(0,12).map(i=>'• '+i.date+' · '+i.name+(i.amount!=null?' · '+money(i.amount,i.currency):'')).join('\n')+(items.length>12?'\nЕщё '+(items.length-12)+' в сводке':''):'Всё разобрано.'),reply_markup:{inline_keyboard:[[{text:'Разобрать сводку',callback_data:'b:v:attention'}],[{text:'Настроить уведомления',callback_data:'b:v:reminders'}]]},count:items.length};
}
