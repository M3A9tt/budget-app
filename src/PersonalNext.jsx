import React from 'react';
import {scheduledEvents,moveDate} from './finance-events.js';
import {money,todayMoscow} from './mini-model.js';
import Icon from './mini-icons.jsx';
export default function PersonalNext({data,onOpen}){
 const today=todayMoscow(data.settings.timeZone),events=scheduledEvents(data,today,moveDate(today,30)),event=events[0];
 return event?<button type="button" className="personal-next-event" onClick={()=>onOpen(event.date)}><time className="personal-next-date" dateTime={event.date} aria-label={new Date(event.date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}>{new Date(event.date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',timeZone:'UTC'})}</time><span><small>{event.date<today?'Без отметки':event.date===today?'Сегодня':event.type==='income'?'Поступление':'К оплате'}</small><strong>{event.name}</strong></span><b>{event.amount===null?'Без суммы':(event.type==='income'?'+':'')+money(event.amount,event.currency)}</b><Icon name="arrow" size={16}/></button>:<div className="personal-next-clear">На ближайшие 30 дней событий нет<button type="button" className="mini-text-button" onClick={()=>onOpen(today)}>Открыть календарь</button></div>;
}
