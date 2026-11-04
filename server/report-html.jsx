import {budgetState} from '../src/budget-view.js';
import {moduleEnabled} from '../src/modules.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server.browser';
import {BudgetHero,SpendChart,CategoryChart,ForecastChart,GoalsChart} from '../src/Insights.jsx';
import {SavingsWidget} from '../src/HomeWidgets.jsx';
import LunchPage from '../src/LunchPage.jsx';
import {periodSummaryData} from './period-summary.js';
import {money} from '../src/mini-model.js';
import {todayMoscow} from '../src/mini-model.js';
import Brand from '../src/Brand.jsx';
import Icon from '../src/mini-icons.jsx';
import AccountsPage from '../src/AccountsPage.jsx';
import MoneyCalendar from '../src/MoneyCalendar.jsx';
import {botView} from './bot-views.js';
import desktopStyle from '../src/desktop.css';
import brandStyle from '../src/brand.css';
import style0 from '../src/typography.css';
import style1 from '../src/mini.css';
import style2 from '../src/insights.css';
import style3 from '../src/experience.css';
import style4 from '../src/installments.css';
import style5 from '../src/report.css';
import style6 from '../src/payments.css';
import style7 from '../src/calendar.css';
import style8 from '../src/clarity.css';
import style9 from '../src/quiet-ui.css';
import style10 from '../src/personal-ui.css';
import style11 from '../src/home-v5.css';
import style12 from '../src/entry-v5.css';
import style13 from '../src/calendar-v5.css';
import style14 from '../src/symbol-picker.css';
const noop=()=>{},css=[desktopStyle,brandStyle,style0,style1,style2,style3,style4,style5,style6,style7,style8,style9,style10,style11,style12,style13,style14].join('\n').replace(/@import\s+(?:url\([^;]+\)|[^;]+);/gi,'');
export const CARD_CSS=css+`html,body{margin:0;width:640px;background:#101722;color:#edf3f5;font:16px/1.45 Commissioner,system-ui,sans-serif}
*{box-sizing:border-box;animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}
#report-card.mini-shell{width:640px;min-height:0;margin:0;padding:24px;border-radius:0;overflow:hidden}
.report-brand{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 17px;margin-bottom:24px;border:1px solid #c6dce33b;border-radius:22px;background:linear-gradient(130deg,#b2d7c818,#b2c9ed0d);box-shadow:inset 0 1px #ffffff12}
.report-brand .burget-lockup{width:190px;height:auto}.report-brand time{color:#afbdcc;font-size:14px;white-space:nowrap}
.report-heading{display:flex;align-items:center;justify-content:center;gap:16px;text-align:center;margin:12px 0 24px;font-size:36px!important;font-weight:650;letter-spacing:-1px;line-height:1.15}
.report-heading:before,.report-heading:after{content:'';flex:1;min-width:16px;height:1px;background:#bbd6d447}
.report-body{display:grid;gap:16px;min-width:0}.report-body>*{min-width:0}.report-foot{display:flex;justify-content:space-between;gap:20px;margin-top:22px;padding-top:12px;border-top:1px solid #c6dce326;color:#aebdcc;font-size:14px}
#report-card .ins-card{margin:0}.report-body .ins-hint{font-size:14px}.report-body h2{font-size:24px}.report-body .mini-icon{flex-shrink:0}
#report-card .budget-links,#report-card .ins-card-head>button,#report-card .ins-link,#report-card .ins-daily>button,#report-card .home-savings-widget>.mini-between>button,#report-card .home-savings-widget>.mini-text-button{display:none}
#report-card.report-analytics .ins-hint,#report-card.report-categories .ins-category-body small span{display:none}
#report-card .lunch-toolbar,#report-card .lunch-month,#report-card .lunch-legend,#report-card .lunch-workday,#report-card .account-action-bar{display:none}
#report-card .lunch-table-scroll{overflow:visible;width:100%;margin:0}#report-card .lunch-table{width:100%;min-width:0;font-size:15px;table-layout:fixed}#report-card .lunch-table :is(th,td){padding:9px 6px}#report-card .lunch-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}#report-card .lunch-metrics strong{font-size:20px}#report-card .lunch-metrics small{font-size:14px}
#report-card .home-savings-widget{margin:0}#report-card .home-savings-total{font-size:32px}#report-card .ins-forecast{height:auto;max-height:280px}
#report-card button:disabled{opacity:1}
#report-card .lunch-import-heading,#report-card .lunch-caption+button,#report-card .money-calendar-add,#report-card .money-calendar-links,#report-card .calendar-risk{display:none}
#report-card .lunch-extra-entry,#report-card .calendar-create-button,#report-card .calendar-quick-links{display:none}
#report-card .calendar-month-title{display:flex;gap:8px}
#report-card input[type=date]{border:0;background:transparent;color:inherit;padding:0;font:inherit}
#report-card .report-list{padding:6px 20px;border:1px solid #c6dce330;border-radius:22px;background:linear-gradient(140deg,#b1bcde16,#9ac8b609)}
.report-line{margin:0;padding:13px 0;overflow-wrap:anywhere;font-size:17px}.report-line+.report-line{border-top:1px solid #c6dce31c}
.report-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.report-option{display:flex;align-items:center;gap:12px;padding:17px;border:1px solid #c6dce330;border-radius:17px;background:linear-gradient(135deg,#dceaff12,#b1d9cb07);font-size:16px;min-width:0;overflow-wrap:anywhere}.report-option svg{color:#b9ccdb;flex-shrink:0}.report-option.record{grid-column:1/-1}
.report-options .tone-income{color:#abd5ba}.report-options .tone-expense{color:#e7ada7}.report-options .tone-transfer{color:#a5c7e5}.report-options .tone-lunch{color:#e4c887}
.summary-hero,.summary-section{padding:24px;border:1px solid #c6dce330;border-radius:22px;background:linear-gradient(135deg,#a7cfc31a,#a8b6dc0c)}
.summary-label,.summary-note{color:#b7c6d1;font-size:15px}.summary-total{font-size:52px;line-height:1.2;font-weight:650;margin:12px 0 18px;letter-spacing:-1.7px}.summary-stats{display:grid;grid-template-columns:1fr 1fr;gap:16px}.summary-stats strong{display:block;font-size:26px;margin-top:6px}.summary-stats span{color:#b7c6d1}.summary-section h2{margin:0 0 18px}.summary-row{display:flex;justify-content:space-between;gap:18px;margin:14px 0 8px}.summary-bar{height:5px;background:#c6dce316;border-radius:5px;overflow:hidden}.summary-bar i{display:block;height:100%;background:#b4d5c5}.summary-note{line-height:1.5}
`;
function SummaryCard({data,params}){
 const r=periodSummaryData(data,params.from,params.to,params.title);
 return <><section className="summary-hero"><span className="summary-label">Записанные личные расходы</span><div className="summary-total">{money(r.expense)}</div><div className="summary-stats"><div><span>Поступило</span><strong>{money(r.income)}</strong></div><div><span>Доходы − расходы</span><strong>{money(r.income-r.expense)}</strong></div></div><p className="summary-note">Учтено операций: {r.count}. Переводы между своими счетами и обеды компании не входят в расходы.</p></section><section className="summary-section"><h2>На что ушли деньги</h2>{r.categories.length?r.categories.map(c=><div key={c.id}><div className="summary-row"><span>{c.name}</span><strong>{money(c.value)}</strong></div><div className="summary-bar"><i style={{width:c.value/r.expense*100+'%'}}/></div></div>):<p className="summary-note">Личных расходов за эти даты не записано.</p>}{r.lunch>0&&<p className="summary-note">Обеды за счёт компании · {money(r.lunch)}</p>}</section><section className="summary-section"><div className="summary-label">{budgetState({free:r.free,balance:r.actual,unknown:r.unknown}).heading}</div><div className="summary-total" style={{fontSize:42}}>{money(Math.abs(r.free))}</div><p className="summary-note">На повседневных счетах {money(r.actual)}. Накопления отдельно. Это текущие остатки, а не итог выбранного периода.</p></section></>;
}
const screenIcons={accounts:'wallet',account:'wallet',savings:'shield',goals:'goal',history:'history',calendar:'calendar',analytics:'chart',settings:'settings',settingsApp:'settings',settingGroup:'settings',settingsMoney:'wallet',settingsData:'file',settingsHelp:'message',backup:'file',more:'grid',moreMoney:'wallet',moreReports:'chart',moreApp:'settings',add:'plus',payments:'calendar',lunch:'lunch',plans:'calendar',installments:'repeat',debts:'wallet'};
function ScreenCard({data,params}){
 if(params.name==='accounts')return <AccountsPage personal data={data} mutate={noop}/>;
 if(params.name==='calendar')return <MoneyCalendar showHeading={false} personal data={data} initialDate={params.args?.date} onPrepare={noop} onEdit={noop} mutate={noop}/>;
 const screen=botView(data,params.name,{...params.args,textOnly:true});
 const actions=screen.actions.filter(a=>a.view!=='home'&&!/^[←↩]/.test(a.label)&&a.command!=='/app');
 return <>{screen.lines.length>0&&<section className="report-list">{screen.lines.map((line,i)=><p className="report-line" key={i}>{line}</p>)}</section>}{actions.length>0&&<div className="report-options">{actions.slice(0,12).map((a,i)=><div className={'report-option '+(a.args?.id?'record ':'')+(a.args?.type?'tone-'+a.args.type:'')} key={i}><Icon name={screenIcons[a.view]||({income:'up',expense:'down',transfer:'repeat',lunch:'lunch'})[a.args?.type]||'arrow'} size={23}/><span>{a.label.replace(/^[↑↓] /,'')}</span></div>)}</div>}</>;
}
export function ReportCard({data,params,createdAt,assets={}}){
 const today=todayMoscow(data.settings.timeZone),titles={budget:'Главная',analytics:`Расходы · ${params.days} дней`,categories:'На что ушли деньги',forecast:'Прогноз остатка',lunch:'Обеды',savings:'Накопления',summary:params.title,screen:params.kind==='screen'?botView(data,params.name,{...params.args,textOnly:true}).title:''};
 const stamp=new Intl.DateTimeFormat('ru-RU',{timeZone:data.settings.timeZone||'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(createdAt));
 return <article id="report-card" className={'mini-shell personal-ui personal-home '+(params.kind==='screen'&&params.name==='calendar'?'personal-calendar ':'')+'report-'+params.kind} data-render-ready="true"><header className="report-brand"><Brand src={assets.logo} decoding="sync"/><time>{stamp}</time></header><h1 className="report-heading">{titles[params.kind]}</h1><div className="report-body">
 {params.kind==='screen'&&<ScreenCard data={data} params={params}/>}
 {params.kind==='summary'&&<SummaryCard data={data} params={params}/>}
 {params.kind==='budget'&&<BudgetHero data={data} personal/>}
 {params.kind==='analytics'&&<SpendChart data={data} days={params.days} onInspect={noop}/>}
 {params.kind==='categories'&&<CategoryChart data={data} days={params.days} onInspect={noop}/>}
 {params.kind==='forecast'&&<ForecastChart data={data} onSettings={noop} horizonDays={params.forecastDays}/>}
 {params.kind==='lunch'&&<LunchPage data={data} initialMonth={params.month} mutate={noop} onAdd={noop} onEdit={noop}/>}
 {params.kind==='savings'&&<><SavingsWidget data={data} onOpen={noop} onGoals={noop} offset={params.page*6} limit={6}/>{moduleEnabled(data,'goals')&&<GoalsChart data={data} onGoals={noop} offset={params.page*6} limit={6}/>}</>}
 </div><footer className="report-foot"><span>{params.kind==='summary'?params.from+' — '+params.to:'Данные на момент снимка'}</span>{params.kind==='savings'&&<span>Страница {params.page+1}</span>}</footer></article>;
}
export function renderReportHtml(data,params,createdAt=new Date().toISOString(),assets={}){
 const content=renderToStaticMarkup(<ReportCard data={data} params={params} createdAt={createdAt} assets={assets}/>);
 const readyContent=params.kind==='budget'?content.replace('<details class="personal-budget-details">','<details open class="personal-budget-details">'):content;
 const styles=CARD_CSS.replace("url('/fonts/commissioner-variable.ttf')",`url('${assets.font||'/fonts/commissioner-variable.ttf'}')`);
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=640,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; base-uri \'none\'; form-action \'none\'"><title>Бюрджет · карточка</title><style>'+styles+'</style></head><body>'+readyContent+'</body></html>';
}
