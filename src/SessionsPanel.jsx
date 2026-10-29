import React,{useEffect,useState} from 'react';
import {apiRequest} from './mini-api.js';
import {clearEntryDrafts} from './entry-draft.js';
export default function SessionsPanel({demo}){
 const [sessions,setSessions]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{if(!demo)setSessions((await apiRequest('security/sessions')).sessions);}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[]);
 return <section className="mini-card"><h2>Входы в браузере</h2><p>Одноразовый код действует 5 минут, вход — до 7 дней. Здесь можно отозвать входы в браузерах. Доступ через Telegram управляется отдельно.</p>{demo?<p>В демо нет активных сеансов.</p>:sessions.map(s=><div key={s.id} className="mini-card"><span>До {new Date(s.expiresAt).toLocaleString('ru-RU')}</span><button className="mini-text-button" disabled={busy} onClick={async()=>{setBusy(true);try{await apiRequest('security/sessions',{method:'POST',body:JSON.stringify({id:s.id})});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Завершить этот вход</button></div>)}<button className="mini-secondary" disabled={busy||demo} onClick={async()=>{setBusy(true);try{await apiRequest('security/sessions',{method:'POST',body:JSON.stringify({all:true})});clearEntryDrafts();setSessions([]);}catch(e){setError(e.message);}finally{setBusy(false);}}}>Завершить все входы в браузере</button>{error&&<p role="alert">{error}</p>}</section>;
}
