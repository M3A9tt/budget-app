import React from 'react';
import Icon from './mini-icons.jsx';
import {moduleEnabled} from './modules.js';

export default function MoreMenu({data,onOpen,onPage}){
 const groups=[
  ['Деньги',[['accounts','wallet','Счета','Остатки, переводы и сверка'],['savings','shield','Накопления','Отложенные деньги'],...(moduleEnabled(data,'goals')?[['goals','goal','Цели','Покупки и планы накоплений']]:[])]],
  ['Планы и отчёты',[['payments','calendar','Планы','Будущие расходы, доходы и обязательства'],['calendar','history','Календарь','Расходы и доходы по датам'],['stats','chart','Аналитика','Куда уходят деньги'],...(moduleEnabled(data,'lunch')?[['lunch','lunch','Обеды','Дни, стоимость и доплаты']]:[])]],
  ['Приложение',[['settings','settings','Настройки','Категории, уведомления и резервные копии'],['updates','file','Что нового','Изменения в приложении'],['feedback','message','Обратная связь','Сообщить об ошибке или предложить идею']]]
 ];
 return <div className="more-menu"><h1 className="mini-title">Ещё</h1>{groups.map(([title,items])=><section key={title}><h2>{title}</h2><div>{items.map(([id,icon,name,hint])=><button type="button" key={id} aria-label={name} onClick={()=>['stats','lunch','updates','feedback'].includes(id)?onPage(id):onOpen(id)}><Icon name={icon} size={21}/><span><strong>{name}</strong><small>{hint}</small></span><Icon name="arrow" size={16}/></button>)}</div></section>)}</div>;
}
