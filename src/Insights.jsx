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
 const [expanded,setExpanded]=useState(false),s=dashboard(data,todayMoscow(data.settings.timeZone)),parts=[{label:'Можно потратить',value:Math.max(0,s.free),color:'#b7ee83'},{label:'Резерв',value:Math.max(0,s.reserve),color:'#a99cff'},{label:'Платежи',value:Math.max(0,s.obligations),color:'#ffbb77'}],sum=parts.reduce((n,p)=>n+p.value,0);
 return <section className="ins-hero"><span className="ins-kicker">Свободно после предстоящих платежей</span><div className={'ins-hero-amount '+(s.free<0?'ins-danger':'')}>{money(s.free)}</div><div className="ins-daily"><Icon name="chart" size={17}/>{s.days?`${money(Math.max(0,s.free)/s.days)} / день до дохода · ${s.days} дн.`:'Добавь ожидаемый доход, чтобы увидеть дневной ориентир'}<button aria-label="Ожидаемые доходы" onClick={()=>onMore('incomePlans')}>↗</button></div><p className="ins-hint">Учитываем платежи до {label(s.budgetUntil)}. Деньги спишутся со счетов, когда подтвердишь оплату.</p><div className="ins-allocation" aria-label="Свободные деньги, резерв и предстоящие платежи">{parts.map(p=><span key={p.label} style={{width:(sum?p.value/sum*100:0)+'%',background:p.color}}/>)}</div><div className="ins-allocation-labels">{parts.map((p,i)=><button key={p.label} {...(i===0?{'aria-expanded':expanded,'aria-controls':'spendable-breakdown'}:{})} aria-label={`${p.label}: ${money(i===0?s.free:p.value)}. Посмотреть состав`} onClick={()=>i===0?setExpanded(!expanded):onMore(i===1?'savings':'payments')}><span><i style={{background:p.color}}/>{p.label}<Icon name={i===0?(expanded?'up':'down'):'arrow'} size={13}/></span><strong>{money(i===0?s.free:p.value)}</strong></button>)}</div>
 {expanded&&<div id="spendable-breakdown" className="spendable-breakdown"><SpendableAccounts data={data} onAccounts={()=>onMore('accounts')}/><div className="spendable-equation"><div><span>Всего на этих счетах</span><b>{money(s.balance)}</b></div><button onClick={()=>onMore('payments')}><span>Минус предстоящие платежи <Icon name="arrow" size={14}/></span><b>−{money(s.obligations)}</b></button><div className="spendable-result"><span>Можно потратить</span><strong>{money(s.free)}</strong></div></div><p className="ins-hint">Резерв и вклады сюда не входят. Платежи вычитаем из общей суммы: банк пока хранит весь остаток. Валютные счета пересчитываем по курсам из настроек.</p></div>}
 <button type="button" className="mini-text-button" onClick={()=>onMore('calendar')}><Icon name="calendar" size={16}/> План до дохода <Icon name="arrow" size={14}/></button>{s.free<0&&<p className="ins-danger">Денег на повседневных счетах недостаточно для платежей.</p>}{(!s.days||s.unknown>0)&&<p className="ins-hint">{!s.days?'Без даты дохода считаем известные платежи на 30 дней вперёд. ':''}{s.unknown>0?`${s.unknown} платежей без суммы не учтены.`:''}</p>}</section>;
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
  savings:()=> <SavingsWidget data={data} onOpen={()=>onMore('savings')} onGoals={()=>moduleEnabled(data,'goals')?onWish('new'):onMore('savings')}/>,
  wishes:()=> <WishesWidget data={data} onOpen={onWish} onAdd={()=>onWish('new')}/>,
  month:()=> <div className="ins-month-summary"><div><span>Расходы за месяц</span><strong>{money(s.spent)}</strong></div><div><span>Доходы за месяц</span><strong className="ins-mint">{money(s.income)}</strong></div><button className="ins-link" onClick={onAnalytics}>Аналитика ↗</button></div>,
  spending:()=> <SpendChart data={data} onInspect={onInspect}/>,
  payments:()=> s.obligationItems.length>0?<PaymentCalendar data={data} onPayments={()=>onMore('payments')}/>:null,
  limits:()=> Object.values(data.categoryBudgets||{}).some(v=>v>0)?<Limits data={data} onInspect={onInspect} onSettings={()=>onMore('settings')}/>:null,
  forecast:()=> <ForecastChart data={data} onSettings={()=>onMore('settings')}/>,
  recent:()=> recentContent
 };
 const sections=[];for(const id of homeBlocks(data)){if(['spending','payments','limits','forecast'].includes(id)){const previous=sections.at(-1);if(Array.isArray(previous))previous.push(id);else sections.push([id]);}else sections.push(id);}
 return <div className="ins-home"><div className="ins-page-head"><div><span className="ins-kicker">Твой бюджет · {label(today)}</span><h1>{editing?'Моя главная':'Деньги. Ясно.'}</h1></div><button className="mini-text-button" onClick={()=>setEditing(!editing)}><Icon name={editing?'back':'settings'} size={18}/>{editing?'Готово':'Настроить'}</button></div>{editing?<><details className="mini-card"><summary>Мои модули</summary><ModuleSettings data={data} mutate={mutate} busy={busy}/></details><HomeSettings data={data} mutate={mutate} busy={busy}/></>:<>{sections.map(section=>Array.isArray(section)?<div className="ins-grid" key={section.join('-')}>{section.map(id=><React.Fragment key={id}>{blocks[id]?.()}</React.Fragment>)}</div>:<React.Fragment key={section}>{blocks[section]?.()}</React.Fragment>)}<button className="ins-explore" onClick={onAnalytics}>Разобраться в расходах <span>Категории, сравнение и календарь денег ↗</span></button></>}</div>;
}
