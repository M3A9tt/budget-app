import {moduleEnabled} from '../src/modules.js';
export const BOT_BUTTONS={home:'💰 Бюджет',add:'✍️ Записать',history:'🕘 История',payments:'📅 Платежи',lunch:'🍽 Обеды',more:'🧩 Ещё',app:'📱 Миниаппа',summary:'📊 Сводки',reminders:'🔔 Напоминания'};
export function botKeyboard(appUrl,data){return {keyboard:[[BOT_BUTTONS.home,BOT_BUTTONS.add,BOT_BUTTONS.history],[BOT_BUTTONS.payments,data&&!moduleEnabled(data,'lunch')?'💳 Счета':BOT_BUTTONS.lunch,BOT_BUTTONS.more]].map(row=>row.map(text=>({text}))),resize_keyboard:true,is_persistent:false,one_time_keyboard:false,input_field_placeholder:'Кофе 180 или выбери действие'};}
export function miniAppButton(appUrl,text=BOT_BUTTONS.app){
 if(!appUrl)return null;
 const url=new URL(appUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Для миниаппы нужен HTTPS-адрес без учётных данных');
 return {text,web_app:{url:url.href}};
}
export async function configureMiniAppMenu(env,userId,telegram){
 const button=miniAppButton(env.MINI_APP_URL);if(!button)return false;
 await telegram(env,'setChatMenuButton',{...(userId?{chat_id:userId}:{}),menu_button:{type:'web_app',...button}});return true;
}
// Presentation only: preserve each button, callback and order; keep long labels readable.
export function buttonRows(buttons,{columns=2,labelLimit=22,rowLimit=38,fullWidth=()=>false}={}){
 const rows=[];
 for(let i=0;i<buttons.length;i++){
  const button=buttons[i],length=[...button.text].length,last=rows.at(-1),previous=i>0?buttons[i-1]:null;
  const canShare=length<=labelLimit&&!fullWidth(button,i);
  if(canShare&&last&&last.length<columns&&previous&&[...previous.text].length<=labelLimit&&!fullWidth(previous,i-1)&&last.reduce((n,b)=>n+[...b.text].length,0)+length<=rowLimit)last.push(button);
  else rows.push([button]);
 }
 return rows;
}
export function navigationCommand(text){return ({['💳 Счета']:'/accounts',[BOT_BUTTONS.home]:'/budget',[BOT_BUTTONS.add]:'/add',[BOT_BUTTONS.history]:'/history',[BOT_BUTTONS.payments]:'/payments',[BOT_BUTTONS.more]:'/more',[BOT_BUTTONS.app]:'/app',['💼 Открыть Бюрджет']:'/app',[BOT_BUTTONS.summary]:'/summary',[BOT_BUTTONS.lunch]:'/lunch',[BOT_BUTTONS.reminders]:'/reminders'})[text]||text;}
export function summariesMenu(){return {inline_keyboard:[[{text:'☀️ Сегодня',callback_data:'nav:day'},{text:'📅 Неделя',callback_data:'nav:week'},{text:'🗓 Месяц',callback_data:'nav:month'}],[{text:'Ещё · тесты, обновления, помощь',callback_data:'nav:more'}]]};}
export function extraMenu(appUrl){return {inline_keyboard:buttonRows([miniAppButton(appUrl),{text:'🧪 Тесты',callback_data:'b:v:tests'},{text:'✨ Что нового',callback_data:'b:v:updates'},{text:'❓ Помощь',callback_data:'b:v:help'},{text:'⌂ Главное меню',callback_data:'b:v:home'}].filter(Boolean))};}
export const botHelp='Твой Бюрджет\n\nКнопки внизу: бюджет, запись, история, платежи, обеды и все разделы.\nПокупку можно написать одной строкой: кофе 180 Сбер.\nБот покажет карточку — запись после подтверждения.\n\nТесты: «Ещё → Настройки». Обновления: «Ещё → Что нового». Клавиатуру можно свернуть значком возле поля ввода.';

export const BOT_SECTIONS={'/budget':'home','/accounts':'accounts','/savings':'savings','/goals':'goals','/history':'history','/payments':'payments','/plans':'plans','/debts':'debts','/lunch':'lunch','/settings':'settings','/reminders':'reminders','/analytics':'analytics','/backup':'backup','/tests':'tests','/more':'more','/help':'help','/updates':'updates'};
