import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server.browser';
import {BudgetHero,SpendChart,CategoryChart,ForecastChart,GoalsChart} from '../src/Insights.jsx';
import {SavingsWidget} from '../src/HomeWidgets.jsx';
import LunchPage from '../src/LunchPage.jsx';
import {todayMoscow} from '../src/mini-model.js';
import mini from '../src/mini.css';
import insights from '../src/insights.css';
import experience from '../src/experience.css';
const noop=()=>{},css=[mini,insights,experience].join('\n').replace(/@import\s+(?:url\([^;]+\)|[^;]+);/gi,'');
export const CARD_CSS=css+`
html,body{margin:0;background:#10131d;color:#f2f3f5;width:640px;overflow:visible;font-family:Manrope,'Segoe UI',Arial,sans-serif}
*{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}
#report-card{width:640px;padding:26px 24px 22px;background:radial-gradient(ellipse at 95% 0%,#28264744,transparent 38%),#10131d;overflow:hidden}
.report-brand{display:flex;justify-content:space-between;align-items:center;color:#b6bfce;font-size:14px;margin-bottom:20px}
.report-brand strong{color:#b4ec8b;font-size:23px}.report-heading{font-size:28px;line-height:1.2;margin:0 0 18px;letter-spacing:-.7px}.report-body{display:grid;gap:18px}
.report-foot{font-size:12px;color:#a0a9bc;border-top:1px solid #30364b;padding-top:14px;margin-top:20px;line-height:1.5}
.report-body .ins-card{margin:0}.report-body .ins-card h2{font-size:20px}.report-body .ins-stat-line strong{font-size:32px}.report-body .ins-hint{font-size:12px}
#report-card .ins-card-head>button,#report-card .ins-link,#report-card .ins-daily>button,#report-card .ins-allocation-labels small,#report-card .home-savings-widget>.mini-between>button,#report-card .home-savings-widget>.mini-text-button,#report-card .ins-goal>svg{display:none}
#report-card.report-analytics .ins-hint,#report-card.report-categories .ins-category-body small span{display:none}#report-card button{pointer-events:none}#report-card .ins-day,#report-card .ins-category,#report-card .ins-goal{text-align:left}
#report-card .lunch-toolbar,#report-card .lunch-month>.icon-button,#report-card .lunch-month input,#report-card .lunch-legend{display:none}
#report-card .lunch-table-scroll{overflow:visible}#report-card .lunch-table{width:100%;min-width:0;font-size:14px}#report-card .lunch-table th,#report-card .lunch-table td{padding:9px 7px}#report-card .lunch-metrics strong{font-size:21px}#report-card .lunch-metrics small{font-size:12px}#report-card .lunch-caption{font-size:12px}
#report-card .home-savings-widget{margin:0}#report-card .home-savings-total{font-size:36px}#report-card .home-saving-purpose-list button{min-height:68px}#report-card .home-saving-purpose-list small{font-size:12px}
#report-card .ins-forecast{height:auto;max-height:280px}#report-card input[type=date]{border:0;background:transparent;color:inherit;padding:0;margin:0 0 10px 8px;font-size:13px}
`;
export function ReportCard({data,params,createdAt}){
 const today=todayMoscow(data.settings.timeZone),titles={budget:'Твой бюджет',analytics:`Расходы · ${params.days} дней`,categories:`На что уходят деньги · ${params.days} дней`,forecast:'Прогноз остатка',lunch:'Обеды · '+params.month,savings:'Накопления и цели'};
 return <article id="report-card" className={"report-"+params.kind} data-render-ready="true"><header className="report-brand"><strong>Бюрджет</strong><span>{today} · снимок миниаппы</span></header><h1 className="report-heading">{titles[params.kind]}</h1><div className="report-body">
 {params.kind==='budget'&&<BudgetHero data={data}/>}
 {params.kind==='analytics'&&<SpendChart data={data} days={params.days} onInspect={noop}/>}
 {params.kind==='categories'&&<CategoryChart data={data} days={params.days} onInspect={noop}/>}
 {params.kind==='forecast'&&<ForecastChart data={data} onSettings={noop}/>}
 {params.kind==='lunch'&&<LunchPage data={data} initialMonth={params.month} mutate={noop} busy onAdd={noop} onEdit={noop}/>}
 {params.kind==='savings'&&<><SavingsWidget data={data} onOpen={noop} onGoals={noop} offset={params.page*6} limit={6}/><GoalsChart data={data} onGoals={noop} offset={params.page*6} limit={6}/></>}
 </div><footer className="report-foot">Состояние на {new Intl.DateTimeFormat('ru-RU',{timeZone:data.settings.timeZone||'Europe/Moscow',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(createdAt))}. Изменения — кнопками в боте или миниаппе.{params.kind==='savings'?` Страница ${params.page+1}.`:''}</footer></article>;
}
export function renderReportHtml(data,params,createdAt=new Date().toISOString()){
 const content=renderToStaticMarkup(<ReportCard data={data} params={params} createdAt={createdAt}/>);
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=640,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><title>Бюрджет · карточка</title><style>'+CARD_CSS+'</style></head><body>'+content+'</body></html>';
}
