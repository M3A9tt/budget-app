import MoneyCalendar from './MoneyCalendar.jsx';
import UpcomingPayments from './UpcomingPayments.jsx';
import {moduleEnabled} from './modules.js';
import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import {money,todayMoscow,dashboard} from './mini-model.js';
import {paymentDate} from './payment-copy.js';
import {PaymentTools,DebtTools} from './FinancePanels.jsx';

export default function PaymentsPage({data,mutate,busy,cats,onPrepare,onEdit,onMore=()=>{},initialCalendarDate='',onCalendarDateChange=()=>{},calendarState={},onCalendarStateChange=()=>{},initialSection='all',onSectionChange=()=>{}}){
 const today=todayMoscow(data.settings.timeZone),s=dashboard(data,today);
 const plans=moduleEnabled(data,'plans')||data.recurring.length>0,installments=moduleEnabled(data,'installments')||(data.installments||[]).length>0,debts=moduleEnabled(data,'debts')||(data.debts||[]).length>0;
 const tabs=[['all','Ближайшие'],...(installments?[['installments','Сплиты и кредиты']]:[]),...(plans?[['regular','Регулярные'],['once','Разовые']]:[]),...(debts?[['debts','Долги']]:[])];
 const target=initialSection==='payoff'?'installments':initialSection,[section,setSection]=useState(()=>target==='calendar'||tabs.some(([id])=>id===target)?target:'all');
 const selectSection=id=>{setSection(id);onSectionChange(id);};
 const planData={...data,recurring:data.recurring.filter(r=>section==='once'?r.frequency==='once':r.frequency!=='once')};
 return <section className="connected-payments payments-simple"><header className="payments-page-heading"><h2>Платежи</h2><button type="button" className="mini-text-button payments-calendar-link" aria-pressed={section==='calendar'} onClick={()=>selectSection(section==='calendar'?'all':'calendar')}><Icon name={section==='calendar'?'back':'calendar'} size={17}/>{section==='calendar'?'К списку':'Календарь'}</button></header>
 <nav className="payments-sections" aria-label="Разделы платежей">{tabs.map(([id,name])=><button type="button" key={id} aria-pressed={section===id||id==='all'&&section==='calendar'} onClick={()=>selectSection(id)}>{name}</button>)}</nav>
 {section==='all'&&<><div className="payments-budget-line"><span>Учтено в «Можно потратить»<small>{s.budgetHorizon==='payday'?'До дохода '+paymentDate(s.budgetUntil):'На ближайшие 30 дней'}{s.unknown>0?' · ещё '+s.unknown+' без суммы':''}</small></span><b>{money(s.obligations)}</b></div><UpcomingPayments data={data} busy={busy} onPrepare={onPrepare}/></>}
 {!plans&&!installments&&!debts&&<div className="mini-card"><p className="payment-hint">Включи планирование, чтобы добавить первый платёж.</p><button className="mini-primary" disabled={busy} onClick={()=>mutate(d=>({...d,settings:{...d.settings,modules:{...d.settings.modules,plans:true}}}),'Планы включены')}>Начать планирование</button></div>}
 {section==='calendar'&&<MoneyCalendar initialState={calendarState} onStateChange={onCalendarStateChange} initialDate={initialCalendarDate} onDateChange={onCalendarDateChange} data={data} busy={busy} onPrepare={onPrepare} onMore={id=>id==='payments'?selectSection('all'):onMore(id)}/>}
 {['regular','once'].includes(section)&&<PaymentTools key={section} section="plans" onEdit={onEdit} planFrequency={section==='once'?'once':'monthly'} data={planData} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare}/>}
 {section==='installments'&&<PaymentTools section="installments" onEdit={onEdit} data={data} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare}/>}
 {section==='debts'&&<DebtTools data={data} mutate={mutate} busy={busy} onEdit={onEdit}/>}
 </section>;
}
