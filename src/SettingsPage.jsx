import TelemetryPanel from './TelemetryPanel.jsx';
import Icon from './mini-icons.jsx';
import React,{useState} from 'react';
import ModuleSettings from './ModuleSettings.jsx';
import {NotificationPanel,BudgetPanel,LegacyTools,ImportPanel} from './FinancePanels.jsx';
import JsonImportPanel from './JsonImportPanel.jsx';
import BackupPanel from './BackupPanel.jsx';
import FeedbackPanel from './FeedbackPanel.jsx';
import {moduleEnabled} from './modules.js';
import {parseMoney} from './ledger.js';
import {todayMoscow} from './mini-model.js';
import {useSettingsDraft} from './settings-draft.js';
import {latestRelease} from './release-notes.js';
const groupIcons={modules:'settings',reminders:'bell',budget:'wallet',import:'file',backup:'shield',categories:'tag',feedback:'message',telemetry:'chart',admin:'shield'};
const groups=[['modules','Твой Бургет','Разделы, работодатель и быстрый ввод'],['reminders','Твой ритм','Время, вопросы и сводки Telegram'],['budget','Бюджет и лимиты','Резерв, дата дохода и лимиты категорий'],['import','Импорт операций','JSON из ChatGPT и выписки CSV'],['backup','Резервные копии','Сохранить данные или восстановить копию'],['categories','Свои категории','Добавить категорию для покупок'],['feedback','Обратная связь','Сообщить об ошибке или предложить идею']];
export default function SettingsPage({data,cats,mutate,busy,demo,onUpdates,isOwner=false}){
 const [section,setSection]=useState(''),[importType,setImportType]=useState('json');
 const menu=[...groups,['telemetry','Улучшать Бургет','Добровольная статистика нажатий'],...(isOwner?[['admin','Панель владельца','Действия пользователей и экспорт JSON']]:[])];
 const open=id=>{setSection(id);window.scrollTo?.({top:0,behavior:'instant'});};
 return <>{section?<><div className="mini-screen-back"><button aria-label="Все настройки" onClick={()=>open('')}><Icon name="back"/></button><h2><Icon name={groupIcons[section]}/>{menu.find(([id])=>id===section)?.[1]}</h2></div>
 {section==='modules'&&<><ModuleSettings data={data} mutate={mutate} busy={busy}/><div className="mini-card mini-form"><strong>Быстрый ввод</strong><label className="mini-check"><input type="checkbox" checked={data.settings.rememberEntryChoices!==false} disabled={busy} onChange={e=>{const enabled=e.target.checked;mutate(d=>({...d,settings:{...d.settings,rememberEntryChoices:enabled}}),'Подстановки '+(enabled?'включены':'отключены'));}}/>Помнить последние счёт, категорию и способ оплаты</label><p className="mini-small mini-muted">Расходы и доходы запоминаются отдельно. Новая сумма всегда пустая; запись — после подтверждения.</p></div></>}
 {section==='reminders'&&<NotificationPanel data={data} mutate={mutate} busy={busy}/>}
 {section==='budget'&&<><Planner settings={data.settings} mutate={mutate} busy={busy}/>{moduleEnabled(data,'limits')&&<BudgetPanel data={data} cats={cats} mutate={mutate} busy={busy}/>}</>}
 {section==='import'&&<><div className="mini-tabs">{[['json','JSON из чата'],['csv','Выписка CSV']].map(([id,label])=><button className={importType===id?'selected':''} key={id} onClick={()=>setImportType(id)}>{label}</button>)}</div>{importType==='json'?<JsonImportPanel data={data} mutate={mutate} busy={busy}/>:<ImportPanel data={data} mutate={mutate} busy={busy}/>}</>}
 {section==='backup'&&<BackupPanel data={data} mutate={mutate} busy={busy} demo={demo}/>}
 {section==='categories'&&<LegacyTools data={data} mutate={mutate} busy={busy}/>}
 {section==='telemetry'&&<div className="mini-card"><h3>Помочь сделать удобнее</h3><p className="mini-small mini-muted">Считаем открытия разделов и нажатия. Без сумм, покупок, текста и имён счетов. Результаты видит только владелец.</p><label className="mini-check"><input type="checkbox" disabled={busy} checked={data.settings.telemetryEnabled===true} onChange={e=>{const telemetryEnabled=e.target.checked;mutate(d=>({...d,settings:{...d.settings,telemetryEnabled}}),'Статистика '+(telemetryEnabled?'включена':'отключена'));}}/>Делиться статистикой действий</label></div>}
 {section==='admin'&&isOwner&&<TelemetryPanel/>}
 {section==='feedback'&&<FeedbackPanel demo={demo} busy={busy}/>}
 </>:<><h2>Настройки</h2><p className="mini-small mini-muted">Выбери, что настроить.</p><div className="mini-rows">{menu.map(([id,title,detail],i)=><button className="mini-tx" key={id} data-track={id==='import'?'import_open':undefined} onClick={()=>open(id)} disabled={busy}><span className={'mini-tx-icon settings-tone-'+i%4}><Icon name={groupIcons[id]}/></span><span className="mini-tx-center"><strong>{title}</strong><small>{detail}</small></span><Icon name="arrow" size={17}/></button>)}</div><button className="mini-text-button" onClick={onUpdates}><Icon name="history" size={16}/> Что нового · {latestRelease.version}</button><p className="mini-footer-note">{demo?'Демо: изменения исчезнут при перезагрузке.':'Telegram и браузер используют один бюджет.'}</p></>}</>;
}
function Planner({settings,mutate,busy}){
 const {value:v,patch,set,saved}=useSettingsDraft(settings),[error,setError]=useState('');
 return <form className="mini-card mini-form" onSubmit={async e=>{e.preventDefault();const pending={...patch};try{const reserve=parseMoney(v.reserveRub??0),date=v.nextIncomeDate||'';if(!Number.isFinite(reserve)||reserve<0)throw Error('Резерв должен быть положительным числом или нулём');if(date&&date<=todayMoscow(v.timeZone))throw Error('Выбери будущую дату дохода');const values={};if(Object.hasOwn(pending,'reserveRub'))values.reserveRub=reserve;if(Object.hasOwn(pending,'nextIncomeDate'))values.nextIncomeDate=date;if(await mutate(d=>({...d,settings:{...d.settings,...values}}),'План обновлён')){saved(pending);setError('');}}catch(e){setError(e.message);}}}><strong>Сколько можно потратить</strong><label>Следующий доход<input type="date" value={v.nextIncomeDate||''} onChange={e=>set('nextIncomeDate',e.target.value)}/></label><label>Неприкосновенный резерв, ₽<input value={v.reserveRub??0} onChange={e=>set('reserveRub',e.target.value)} inputMode="decimal"/></label><p className="mini-small mini-muted">Например, деньги на учёбу. Резерв вычитается из обычных счетов один раз; копилки уже исключены.</p>{error&&<p role="alert">{error}</p>}<button className="mini-primary" disabled={busy}>Сохранить план</button></form>;
}
