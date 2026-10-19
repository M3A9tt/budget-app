import MoneyCalendar from './MoneyCalendar.jsx';
import {moduleEnabled} from './modules.js';
import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import {money,todayMoscow,dashboard} from './mini-model.js';
import {paymentOverview} from './payment-overview.js';
import {PaymentTools,DebtTools} from './FinancePanels.jsx';
export default function PaymentsPage({data,mutate,busy,cats,onPrepare,onEdit,onMore=()=>{},initialCalendarDate='',onCalendarDateChange=()=>{},calendarState={},onCalendarStateChange=()=>{},initialSection='all',onSectionChange=()=>{}}){
 const [section,setSection]=useState(initialSection);const selectSection=id=>{setSection(id);onSectionChange(id);};const today=todayMoscow(data.settings.timeZone),overview=paymentOverview(data,today),s=dashboard(data,today),payoffTotal=overview.installmentTotal+overview.debtTotal+overview.oneOffTotal;
 const finite=['payoff','installments','debts','once'].includes(section),planData={...data,recurring:data.recurring.filter(r=>section==='once'?r.frequency==='once':r.frequency!=='once')};
 const plans=moduleEnabled(data,'plans')||data.recurring.length>0,installments=moduleEnabled(data,'installments')||(data.installments||[]).length>0,debts=moduleEnabled(data,'debts')||(data.debts||[]).length>0;
 const tabs=[['all','Календарь'],...(plans?[['regular','Постоянные']]:[]),...(plans||installments||debts?[['payoff','До погашения']]:[])];
 const groups=[{id:'regular',icon:'bell',name:'Постоянные',amount:overview.regularTotal,detail:`ЖКХ, подписки и другие повторяющиеся · ${overview.recurring.length} платежей до ${overview.until.slice(8,10)}.${overview.until.slice(5,7)}`},{id:'payoff',icon:'repeat',name:'До погашения',amount:payoffTotal,detail:'Остатки по кредитам, ипотеке, рассрочкам, сплиту и долгам'}];
 const types=[{id:'installments',icon:'repeat',name:'Кредиты, сплит, рассрочки',amount:overview.installmentTotal,detail:`Открыто обязательств: ${overview.installments.length}`},{id:'debts',icon:'wallet',name:'Долги людям',amount:overview.debtTotal,detail:overview.receivableTotal?`Мне должны ${money(overview.receivableTotal)}`:`Открыто записей: ${overview.debts.length}`},{id:'once',icon:'file',name:'Разовые платежи',amount:overview.oneOffTotal,detail:`Запланировано: ${overview.oneOff.length}`}];
 return <section className="connected-payments"><h2>Платежи и доходы</h2><div className="mini-tabs">{tabs.map(([id,name])=><button key={id} className={section===id||id==='payoff'&&finite?'selected':''} onClick={()=>selectSection(id)}>{name}</button>)}</div><div className="payments-linked-summary"><small>{s.days?'Зарезервировано до следующего дохода':'Зарезервировано на ближайшие 30 дней'}</small><strong>{money(s.obligations)}</strong><small>Долги без графика и будущий остаток кредитов — ниже, в обязательствах до погашения.</small></div>
 {!plans&&!installments&&!debts&&<div className="mini-card"><p className="mini-small mini-muted">Добавь ожидаемый доход или платёж — появятся календарь и прогноз.</p><button className="mini-primary" disabled={busy} onClick={()=>mutate(d=>({...d,settings:{...d.settings,modules:{...d.settings.modules,plans:true}}}),'Планы включены')}>Начать планирование</button></div>}
 {section==='all'&&<MoneyCalendar initialState={calendarState} onStateChange={onCalendarStateChange} initialDate={initialCalendarDate} onDateChange={onCalendarDateChange} data={data} busy={busy} onPrepare={onPrepare} onMore={id=>id==='payments'?document.getElementById('payment-source-options')?.scrollIntoView({behavior:'smooth',block:'start'}):onMore(id)}/>}
 {section==='all'&&<div id="payment-source-options" className="payment-source-grid">{groups.filter(g=>g.id!=='regular'||plans).map(g=><button key={g.id} onClick={()=>selectSection(g.id)}><Icon name={g.icon}/><b>{g.name}</b><strong>{money(g.amount)}</strong><small>{g.detail}</small><span>Открыть ↗</span></button>)}</div>}
 {finite&&<div className="payment-source-grid">{types.filter(g=>g.id==='once'?plans:g.id==='installments'?installments:debts).map(g=><button key={g.id} className={section===g.id?'selected':''} onClick={()=>selectSection(g.id)}><Icon name={g.icon}/><b>{g.name}</b><strong>{money(g.amount)}</strong><small>{g.detail}</small><span>Открыть ↗</span></button>)}</div>}
 {['regular','once'].includes(section)&&<PaymentTools key={section} section="plans" onEdit={onEdit} planFrequency={section==='once'?'once':'monthly'} data={planData} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare}/>}
 {section==='installments'&&<PaymentTools section="installments" onEdit={onEdit} data={data} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare}/>}
 {section==='debts'&&<DebtTools data={data} mutate={mutate} busy={busy} onEdit={onEdit}/>}
 </section>;
}
