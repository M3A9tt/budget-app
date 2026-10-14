import React,{useEffect,useState} from 'react';
import Icon from './mini-icons.jsx';
import {apiRequest} from './mini-api.js';
import {eventLabels,screenLabels} from './telemetry-events.js';
export default function TelemetryPanel(){
 const [report,setReport]=useState(null),[error,setError]=useState('');
 const load=async()=>{try{setError('');setReport(await apiRequest('admin/telemetry'));}catch(e){setError(e.message);}};useEffect(()=>{load();},[]);
 const totals={};for(const row of report?.rows||[]){const key=row.event+'|'+row.screen;totals[key]=(totals[key]||0)+row.count;}
 const sorted=Object.entries(totals).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...sorted.map(([,n])=>n));const count=event=>(report?.rows||[]).filter(r=>r.event===event).reduce((n,r)=>n+r.count,0);
 const download=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='burget-telemetry-'+report.to+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section><div className="mini-between"><h2>Как используют Бургет</h2><button className="mini-text-button" onClick={load} aria-label="Обновить телеметрию"><Icon name="refresh"/></button></div><p className="mini-small mini-muted">Последние 30 дней · только участники, включившие сбор</p>{error&&<p role="alert">{error}</p>}{!report&&!error&&<p>Загружаем…</p>}{report&&<><div className="telemetry-metrics">{[['Просмотры',count('page_view')],['Начатые записи',count('entry_open')],['Сохранения',count('entry_save')]].map(([label,n])=><div key={label}><strong>{n}</strong><small>{label}</small></div>)}</div>{!sorted.length?<div className="experience-empty"><Icon name="chart" size={32}/><h3>Пока без событий</h3><p>Данные появятся после включения телеметрии и использования приложения.</p></div>:<div className="telemetry-bars">{sorted.map(([key,n])=>{const [event,screen]=key.split('|');return <div key={key}><span>{eventLabels[event]}<small> · {screenLabels[screen]}</small></span><b>{n}</b><i style={{width:n/max*100+'%'}}/></div>;})}</div>}<button className="mini-secondary" onClick={download}><Icon name="download" size={17}/> Скачать JSON</button><p className="mini-small mini-muted">Это число действий, не людей. Суммы, тексты и имена счетов не собираются. Агрегаты хранятся до 90 дней.</p></>}</section>;
}
