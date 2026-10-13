export function notificationJobs(data,now){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(now),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(now));
 const s=data.settings||{};if(hour!==(s.reportHour??21))return [];
 const reports=[],local=new Date(today+'T12:00:00Z');
 if(s.reminders!==false&&!data.transactions.some(t=>t.date===today))reports.push({id:'reminder:'+today,text:'Сегодня пока нет записей. Были расходы или доходы? Запишите одной строкой, например: кофе 180 Сбер. Если покупок не было — всё в порядке.'});
 if(s.dailyReport!==false)reports.push({id:'day:'+today,from:today,to:today,title:'Итог дня'});
 if(s.weeklyReport!==false&&local.getUTCDay()===0){const from=new Date(local);from.setUTCDate(from.getUTCDate()-6);reports.push({id:'week:'+today,from:from.toISOString().slice(0,10),to:today,title:'Итог недели'});}
 if(s.monthlyReport!==false&&local.getUTCDate()===1){const end=new Date(local);end.setUTCDate(0);reports.push({id:'month:'+end.toISOString().slice(0,7),from:end.toISOString().slice(0,8)+'01',to:end.toISOString().slice(0,10),title:'Итог месяца'});}
 return reports;
}
