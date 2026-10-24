import {budgetState} from './budget-view.js';
import {SpendChart,ForecastChart,Limits,PaymentCalendar} from './AnalyticsCharts.jsx';
export {SpendChart,CategoryChart,ForecastChart,Limits,PaymentCalendar,GoalsChart} from './AnalyticsCharts.jsx';
import AccountVisibility from './AccountVisibility.jsx';
import {orderedAccounts,accountRub} from './account-balances.js';
import ModuleSettings from './ModuleSettings.jsx';
import {homeBlocks} from './home-layout.js';
import HomeSettings from './HomeSettings.jsx';
import {SavingsWidget} from './HomeWidgets.jsx';
import {WishesWidget} from './Wishes.jsx';
import {isSavings} from './savings.js';
import {moduleEnabled} from './modules.js';
import React,{useState} from 'react';
import {COLORS} from './analytics.js';
import {todayMoscow,money,dashboard} from './mini-model.js';
import Icon from './mini-icons.jsx';
const label=d=>new Date(d+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
export {default as Insights} from './AnalyticsPage.jsx';
export function SpendableAccounts({data,onAccounts=()=>{}}){
 const accounts=orderedAccounts(data).filter(a=>!isSavings(a)&&a.balance!==0),positive=accounts.reduce((n,a)=>n+Math.max(0,accountRub(data,a)),0);
 return <div className="spendable-accounts"><div className="mini-between"><h3>Деньги на повседневных счетах</h3><button className="mini-text-button" onClick={onAccounts}>Все счета <Icon name="arrow" size={15}/></button></div>{positive>0&&<div className="spendable-bar" role="img" aria-label="Деньги по счетам — цвета соответствуют списку ниже">{accounts.map((a,i)=>a.balance>0&&<span key={a.id} title={a.name+': '+money(a.balance,a.currency)} style={{width:accountRub(data,a)/positive*100+'%',background:COLORS[i%COLORS.length]}}/>)}</div>}{accounts.length?accounts.map((a,i)=><button className="spendable-account" key={a.id} onClick={onAccounts}><i style={{background:COLORS[i%COLORS.length]}}/><span>{a.name}{a.currency!=='RUB'&&<small>≈ {money(accountRub(data,a))}</small>}</span><strong className={a.balance<0?'ins-danger':''}>{money(a.balance,a.currency)}</strong><Icon name="arrow" size={14}/></button>):<p className="ins-hint">На повседневных счетах пока нет денег.</p>}{accounts.some(a=>a.balance<0)&&<p className="ins-hint">Полоса показывает положительные остатки. Счета с минусом уменьшают итог ниже.</p>}</div>;
}
export function BudgetHero({data,onMore=()=>{}}){
 const [expanded,setExpanded]=useState(false),s=dashboard(data,todayMoscow(data.settings.timeZone)),{shortfall,heading,amount,context}=budgetState(s);
 return <div className="home-budget"><section className={'ins-hero budget-clear '+(shortfall?'budget-shortfall':'')} aria-label="Текущий бюджет"><span className="ins-kicker">{heading}</span><div className={'ins-hero-amount '+(shortfall?'ins-danger':'')}>{money(amount)}</div>
 <p className="budget-horizon">План до {label(s.budgetUntil)}{s.budgetHorizon==='payday'?' · до следующего дохода':' · на 30 дней вперёд'}</p><p className="budget-context">{context}</p>
 <div className="budget-equation"><button type="button" aria-label={'Деньги на счетах: '+money(s.balance)+'. Посмотреть состав'} aria-expanded={expanded} aria-controls="spendable-breakdown" onClick={()=>setExpanded(!expanded)}><span>На повседневных счетах <Icon name={expanded?'up':'down'} size={13}/></span><strong>{money(s.balance)}</strong></button><button type="button" onClick={()=>onMore('payments')}><span>Минус плановые платежи <Icon name="arrow" size={13}/></span><strong>−{money(s.obligations)}</strong></button></div>
 {expanded&&<div id="spendable-breakdown" className="spendable-breakdown"><SpendableAccounts data={data} onAccounts={()=>onMore('accounts')}/><p className="ins-hint">Накопления здесь не учитываются. Валютные счета пересчитаны по курсам из настроек.</p></div>}
 {s.free>0&&s.days>0&&<div className="budget-daily"><span>Дневной ориентир до дохода</span><b>{money(s.free/s.days)} / день</b></div>}
 {s.unknown>0&&<p className="budget-warning">Ещё {s.unknown} платежей без суммы — итог пока неполный.</p>}
 <div className="budget-links"><button type="button" className="mini-text-button" onClick={()=>onMore('calendar')}><Icon name="calendar" size={16}/> Посмотреть план</button><button type="button" className="mini-text-button" onClick={()=>onMore('incomePlans')}><Icon name="plus" size={15}/>{s.days?'Ожидаемые доходы':'Добавить доход'}</button></div><small className="budget-explanation">{s.budgetHorizon==='payday'?'День дохода не включён в платежи. ':''}План не списывает деньги. Остатки меняются после записи оплаты.</small></section>
 <button type="button" className="home-reserve-compact" onClick={()=>onMore('savings')}><span className="home-reserve-icon"><Icon name="shield" size={21}/></span><span><b>Отложено отдельно</b><small>Накопления и резерв</small></span><strong>{money(s.reserve)}</strong><Icon name="arrow" size={16}/></button></div>;
}
export function HomeAccounts({data,onOpen}){
 const [zero,setZero]=useState(false),accounts=orderedAccounts(data).filter(a=>!isSavings(a)),count=accounts.filter(a=>a.balance===0).length;
 return <section className="home-accounts"><div className="mini-between"><h2>Повседневные счета</h2><button className="mini-text-button" onClick={onOpen}>Все <Icon name="arrow" size={14}/></button></div><div className="ins-account-strip">{accounts.filter(a=>zero||a.balance!==0).map((a,i)=><button key={a.id} onClick={onOpen} style={{'--account-color':COLORS[i%COLORS.length]}}><span className="ins-account-initial">{a.name.slice(0,1)}</span><span><small>{a.name}</small><strong>{money(a.balance,a.currency)}</strong></span></button>)}</div><AccountVisibility zero={zero} setZero={setZero} count={count}/>{accounts.length>0&&!accounts.some(a=>zero||a.balance!==0)&&<p className="ins-hint">Пока все счета пустые. Покажи нулевые счета, чтобы выбрать нужный.</p>}</section>;
}
export function HomeOverview({data,onAdd,onMore,onInspect,onAnalytics,mutate,busy,onWish,recentContent}){
 const [editing,setEditing]=useState(false),today=todayMoscow(data.settings.timeZone),s=dashboard(data,today);
 const blocks={
  budget:()=> <BudgetHero data={data} onMore={onMore}/>,
  actions:()=> <div className="ins-actions"><button onClick={()=>onAdd('quick')}><Icon name="plus" size={19}/>Записать расход</button><button onClick={()=>onAdd('income')}><Icon name="down" size={18}/>Доход</button>{moduleEnabled(data,'lunch')&&<button onClick={()=>onAdd('lunch')}><Icon name="lunch" size={18}/>Обед</button>}</div>,
  accounts:()=> <HomeAccounts data={data} onOpen={()=>onMore('accounts')}/>,
  savings:()=> homeBlocks(data).includes('budget')?<details className="home-savings-details"><summary>На что отложено</summary><SavingsWidget data={data} onOpen={()=>onMore('savings')} onGoals={()=>moduleEnabled(data,'goals')?onWish('new'):onMore('savings')}/></details>:<SavingsWidget data={data} onOpen={()=>onMore('savings')} onGoals={()=>moduleEnabled(data,'goals')?onWish('new'):onMore('savings')}/>,
  wishes:()=> <WishesWidget data={data} onOpen={onWish} onAdd={()=>onWish('new')}/>,
  month:()=> <div className="ins-month-summary"><div><span>Расходы за месяц</span><strong>{money(s.spent)}</strong></div><div><span>Доходы за месяц</span><strong className="ins-mint">{money(s.income)}</strong></div><button className="ins-link" onClick={onAnalytics}>Аналитика ↗</button></div>,
  spending:()=> homeBlocks(data).includes('budget')?<details className="home-chart-details"><summary>Расходы по дням</summary><SpendChart data={data} onInspect={onInspect}/></details>:<SpendChart data={data} onInspect={onInspect}/>,
  payments:()=> s.obligationItems.length>0?<PaymentCalendar data={data} onPayments={()=>onMore('payments')}/>:null,
  limits:()=> Object.values(data.categoryBudgets||{}).some(v=>v>0)?<Limits data={data} onInspect={onInspect} onSettings={()=>onMore('settings')}/>:null,
  forecast:()=> <ForecastChart data={data} onSettings={()=>onMore('settings')}/>,
  recent:()=> <section className="home-recent">{recentContent}</section>
 };
 const sections=[];for(const id of homeBlocks(data)){if(['spending','payments','limits','forecast'].includes(id)){const previous=sections.at(-1);if(Array.isArray(previous))previous.push(id);else sections.push([id]);}else sections.push(id);}
 return <div className="ins-home"><div className="ins-page-head"><div><span className="ins-kicker">Твой бюджет · {label(today)}</span><h1>{editing?'Моя главная':'Мои деньги'}</h1></div><button className="mini-text-button" onClick={()=>setEditing(!editing)}><Icon name={editing?'back':'settings'} size={18}/>{editing?'Готово':'Настроить'}</button></div>{editing?<><details className="mini-card"><summary>Мои модули</summary><ModuleSettings data={data} mutate={mutate} busy={busy}/></details><HomeSettings data={data} mutate={mutate} busy={busy}/></>:<>{sections.map(section=>Array.isArray(section)?<div className="ins-grid" key={section.join('-')}>{section.map(id=><React.Fragment key={id}>{blocks[id]?.()}</React.Fragment>)}</div>:<React.Fragment key={section}>{blocks[section]?.()}</React.Fragment>)}<button className="ins-explore" onClick={onAnalytics}>Разобраться в расходах <span>Категории, сравнение и календарь денег ↗</span></button></>}</div>;
}
