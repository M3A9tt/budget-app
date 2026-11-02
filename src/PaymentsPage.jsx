import PlannedOperations from './PlannedOperations.jsx';
import {budgetWindow} from './finance-events.js';
import {planType} from './planned-model.js';
import MoneyCalendar from './MoneyCalendar.jsx';
import UpcomingPayments from './UpcomingPayments.jsx';
import {moduleEnabled} from './modules.js';
import React,{useState,useRef} from 'react';
import Icon from './mini-icons.jsx';
import {money,todayMoscow,dashboard} from './mini-model.js';
import {paymentDate} from './payment-copy.js';
import {PaymentTools,DebtTools} from './FinancePanels.jsx';

export default function PaymentsPage({personal=false,data,mutate,busy,cats,onPrepare,onEdit,onMore=()=>{},initialCalendarDate='',onCalendarDateChange=()=>{},calendarState={},onCalendarStateChange=()=>{},incomeStartDate='',onIncomeDateChange=()=>{},initialSection='all',onSectionChange=()=>{}}){
 const today=todayMoscow(data.settings.timeZone),s=dashboard(data,today);
 const plans=moduleEnabled(data,'plans')||data.recurring.length>0,installments=moduleEnabled(data,'installments')||(data.installments||[]).length>0,debts=moduleEnabled(data,'debts')||(data.debts||[]).length>0;
 const tabs=[['all','Ближайшие'],...(installments?[['installments','Сплиты и кредиты']]:[]),...(plans?[['regular','Регулярные'],['manual','По необходимости'],['once','Разовые']]:[]),...(debts?[['debts','Долги']]:[])];
 const target=initialSection==='payoff'?'installments':initialSection,[section,setSection]=useState(()=>['calendar','income'].includes(target)||tabs.some(([id])=>id===target)?target:'all');
 const menu=useRef(null);
 const selectSection=id=>{if(menu.current)menu.current.open=false;setSection(id);onSectionChange(id);};
 const planData={...data,recurring:data.recurring.filter(r=>(section==='once'?r.frequency==='once':section==='manual'?r.frequency==='manual':!['once','manual'].includes(r.frequency)))};
 const incomeWindow=budgetWindow(data,today);
 const management=<details className="payments-management" ref={menu}><summary>{personal?'Управление событиями':'Расходы и доходы'}<span>{section==='income'?'Ожидаемые доходы':section==='calendar'?'Календарь':tabs.find(([id])=>id===section)?.[1]||'Ближайшие'} <Icon name="down" size={14}/></span></summary><nav className="payments-sections" aria-label="Разделы планирования">{tabs.map(([id,name])=><button type="button" key={id} aria-pressed={section===id||id==='all'&&section==='calendar'} onClick={()=>selectSection(id)}>{name}</button>)}</nav></details>;
 return <section className="connected-payments payments-simple"><header className="payments-page-heading"><h2>{personal?'Календарь':'Планы'}</h2>{!personal&&<button type="button" className="mini-text-button payments-calendar-link" aria-pressed={section==='calendar'} onClick={()=>selectSection(section==='calendar'?'all':'calendar')}><Icon name={section==='calendar'?'back':'calendar'} size={17}/>{section==='calendar'?'К списку':'Календарь'}</button>}</header>{personal&&<div className="personal-calendar-views" role="group" aria-label="Вид календаря">{[['all','Список'],['calendar','Месяц']].map(([id,name])=><button type="button" key={id} aria-pressed={section===id} onClick={()=>selectSection(id)}>{name}</button>)}</div>}
 {(!personal||section!=='calendar')&&management}
 {section==='all'&&<><div className="payments-budget-line"><span>Учтено в «Можно потратить»<small>{s.budgetHorizon==='payday'?'До дохода '+paymentDate(s.budgetUntil):'На ближайшие 30 дней'}{s.unknown>0?' · ещё '+s.unknown+' без суммы':''}</small></span><b>{money(s.obligations)}</b></div><button type="button" className="payments-income-entry" onClick={()=>{onIncomeDateChange(today);selectSection('income');}}><Icon name="down" size={18}/><span><b>Ожидаемые доходы</b><small>{incomeWindow.incomeSource==='plan'?incomeWindow.incomeName+' · '+paymentDate(incomeWindow.until):'Зарплата, аванс и другие поступления'}</small></span><Icon name="arrow" size={16}/></button><UpcomingPayments personal={personal} data={data} busy={busy} onPrepare={onPrepare} mutate={mutate} onSource={event=>selectSection(event.source==='installment'?'installments':'debts')}/></>}
 {!plans&&!installments&&!debts&&<div className="mini-card"><p className="payment-hint">Включи планирование, чтобы добавить первую операцию.</p><button className="mini-primary" disabled={busy} onClick={()=>mutate(d=>({...d,settings:{...d.settings,modules:{...d.settings.modules,plans:true}}}),'Планы включены')}>Начать планирование</button></div>}
 {section==='calendar'&&<MoneyCalendar personal={personal} mutate={mutate} onEdit={onEdit} initialState={calendarState} onStateChange={onCalendarStateChange} initialDate={initialCalendarDate} onDateChange={onCalendarDateChange} data={data} busy={busy} onPrepare={onPrepare} onMore={(id,context={})=>{if(id==='incomePlans'){onIncomeDateChange(context.date||today);selectSection('income');}else if(id==='payments')selectSection('all');else onMore(id);}}/>}
 {section==='income'&&<><button type="button" className="mini-text-button" onClick={()=>selectSection('all')}>← К планам</button><h3>Ожидаемые доходы</h3><PlannedOperations defaultDate={incomeStartDate||today} incomeOnly defaultFrequency="once" data={{...data,recurring:data.recurring.filter(r=>planType(r)==='income')}} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare} onEdit={onEdit}/></>}
 {['regular','manual','once'].includes(section)&&<PaymentTools key={section} section="plans" onEdit={onEdit} planFrequency={section==='manual'?'manual':section==='once'?'once':'monthly'} data={planData} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare}/>}
 {section==='installments'&&<PaymentTools section="installments" onEdit={onEdit} data={data} mutate={mutate} busy={busy} cats={cats} onPrepare={onPrepare}/>}
 {section==='debts'&&<DebtTools data={data} mutate={mutate} busy={busy} onEdit={onEdit}/>}
 {personal&&section==='calendar'&&management}
 </section>;
}
