export const paymentDate=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export const paymentStatus=(event,today)=>event.date<today?'Нет отметки · '+paymentDate(event.date):event.date===today?'Сегодня':paymentDate(event.date);
export const paymentPeriod=(frequency,day)=>({once:'Один раз',daily:'Каждый день',weekly:'Каждую неделю',monthly:`Каждого ${day}-го числа`})[frequency||'monthly'];
