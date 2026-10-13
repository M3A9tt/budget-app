import QuickEntry from "./QuickEntry.jsx";
import { parseMoney, putTransaction, deleteTransaction, undoTransaction, transferMoney, migrateData, historicalRub } from "./ledger.js";
import { parseEntry } from "./quick-entry.js";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, Legend } from "recharts";

/* ═══════════════════ CONSTANTS ═══════════════════ */
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const WDAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

const DEFAULT_CATS = [
  { id:'food', name:'Еда', icon:'🍔', color:'#e87a6b' },
  { id:'transport', name:'Транспорт', icon:'🚌', color:'#6ba3e8' },
  { id:'housing', name:'ЖКХ', icon:'🏠', color:'#b07ae8' },
  { id:'clothes', name:'Одежда', icon:'👕', color:'#e87ab0' },
  { id:'fun', name:'Развлечения', icon:'🎮', color:'#e8c76b' },
  { id:'subs', name:'Подписки', icon:'📱', color:'#e86bb0' },
  { id:'comm', name:'Связь', icon:'📞', color:'#6be8a3' },
  { id:'health', name:'Здоровье', icon:'💊', color:'#7ac99a' },
  { id:'tech', name:'Техника', icon:'💻', color:'#6bc4e8' },
  { id:'other', name:'Другое', icon:'📦', color:'#8a8a96' },
];

const CURRENCIES = [
  { code:'RUB', symbol:'₽', name:'Рубль' },
  { code:'USD', symbol:'$', name:'Доллар' },
  { code:'EUR', symbol:'€', name:'Евро' },
  { code:'GBP', symbol:'£', name:'Фунт' },
  { code:'CNY', symbol:'¥', name:'Юань' },
  { code:'TRY', symbol:'₺', name:'Лира' },
];

const DEFAULT_RATES = { RUB:1, USD:92, EUR:100, GBP:117, CNY:12.7, TRY:2.8 };

const DEFAULT_DATA = {
  transactions: [], debts: [], goals: [], customCats: [],
  settings: { budget:0, lunchDaily:400, workDays:22, notifications:false },
  accounts: [],
  transfers: [],
  recurring: [],
  categoryBudgets: {},
  history: [],
  lunchDayOff: [],
  lunchDayMod: {},
  rates: { ...DEFAULT_RATES }, ratesUpdated: null,
};

/* ═══════════════════ UTILS ═══════════════════ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const curSym = c => (CURRENCIES.find(x => x.code === c) || CURRENCIES[0]).symbol;
const fN = n => {
  const r = Math.round((n || 0) * 100) / 100;
  return r.toLocaleString('ru-RU', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 });
};
const fmt = (n, c='RUB') => fN(n) + ' ' + curSym(c);
const pD = s => s ? new Date(s+'T00:00:00') : new Date();
const dStr = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
const today = () => dStr(new Date());
const dDisp = s => { if (!s) return ''; const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };
const sameMo = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth();
const isWd = (y,m,d) => { const w = new Date(y,m,d).getDay(); return w!==0 && w!==6; };
function countWd(y,m,til=null) { const dim=new Date(y,m+1,0).getDate(); const e=til?Math.min(til,dim):dim; let c=0; for(let d=1;d<=e;d++) if(isWd(y,m,d)) c++; return c; }
function getMTx(txs,date) { const y=date.getFullYear(),m=date.getMonth(); return txs.filter(t=>{const d=pD(t.date);return d.getFullYear()===y&&d.getMonth()===m;}); }

function buildLunchTable(txs, year, month, dailyLimit, dayOffSet, dayMod) {
  const dim = new Date(year,month+1,0).getDate();
  const now = new Date();
  const isCur = now.getFullYear()===year && now.getMonth()===month;
  const td = now.getDate();
  const ltx = txs.filter(t => t.cat==='lunch');
  const dayOff = dayOffSet instanceof Set ? dayOffSet : new Set(dayOffSet || []);
  const mod = dayMod || {};
  let cum = 0;
  const rows = [];
  for (let d=1; d<=dim; d++) {
    if (!isWd(year,month,d)) continue;
    const ds = dStr(new Date(year,month,d));
    const isOff = dayOff.has(ds);
    // ratio: 1 = full day, 0 = off, 0.5/0.75 = partial
    const ratio = isOff ? 0 : (mod[ds] !== undefined ? mod[ds] : 1);
    const dayLimit = Math.round(dailyLimit * ratio);
    const dtx = ltx.filter(t => t.date===ds);
    const spent = dtx.reduce((a,t) => a + (t.amountRub||t.amount||0), 0);
    const past = ds <= dStr(now);
    const fut = !past;
    const delta = (ratio === 0) ? 0 : (past && !fut ? dayLimit - spent : 0);
    cum += delta;
    rows.push({
      day:d, dow:WDAYS[new Date(year,month,d).getDay()], date:ds,
      spent:past?spent:null, limit:dayLimit, fullLimit:dailyLimit,
      avail:dayLimit+(cum-delta),
      delta:past&&ratio>0?delta:null,
      cum, past, fut, isToday:isCur&&d===td, txs:dtx, isOff, ratio, isPartial:ratio>0&&ratio<1
    });
  }
  return rows;
}

/* Category recommendations: recency + time of day */
function recommendCats(txs, allCats, maxCount=8) {
  const now = new Date();
  const hour = now.getHours();
  const scores = {};
  allCats.forEach(c => scores[c.id] = { cat: c, score: 0, lastUsed: 0 });
  txs.filter(t => t.type==='expense' && t.cat !== 'lunch').forEach(t => {
    if (!scores[t.cat]) return;
    const ageDays = (now - pD(t.date)) / 86400000;
    const w = ageDays <= 30 ? 3 : ageDays <= 90 ? 1.5 : 0.5;
    scores[t.cat].score += w;
    const ts = pD(t.date).getTime();
    if (ts > scores[t.cat].lastUsed) scores[t.cat].lastUsed = ts;
  });
  const period = hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 15 ? 'lunch' : hour >= 17 ? 'evening' : null;
  const boosts = { morning: ['transport', 'food'], lunch: ['food'], evening: ['food', 'fun', 'clothes', 'other'] };
  if (period && boosts[period]) boosts[period].forEach((id, idx) => { if (scores[id]) scores[id].score += (3 - idx) * 0.8; });
  return Object.values(scores).sort((a, b) => b.score - a.score || b.lastUsed - a.lastUsed).slice(0, maxCount).map(s => s.cat);
}

/* ═══════════════════ STORAGE ═══════════════════ */
const SB_URL = 'https://dsjrppruclhievslbxbl.supabase.co';
const SB_KEY = 'sb_publishable_0L-ntSlXcrzJvfjOT_RAjw_lCDOhpIM';
const SB_H = { 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}`, 'Content-Type':'application/json', 'Prefer':'return=minimal' };

function mergeData(base, inc) {
  if (!inc || !Object.keys(inc).length) return base;
  return migrateData(inc,DEFAULT_DATA);
}

const LOCAL_V2='finance-app-encrypted-v2';
function loadLocal() {
  // Encrypted data is hydrated only after PIN entry. Never substitute an empty save.
  try {if(localStorage.getItem(LOCAL_V2)) return structuredClone(DEFAULT_DATA);
    const r=localStorage.getItem('finance-app-data');if(r)return migrateData(JSON.parse(r),DEFAULT_DATA);
  } catch(e) { console.error('Local read:',e); }
  return structuredClone(DEFAULT_DATA);
}
let localSaveQueue=Promise.resolve();
function saveLocal(d) {
  const key=getEncKey();
  if(!key) return Promise.reject(new Error('Введите PIN для сохранения'));
  const snapshot=structuredClone(d);
  const task=localSaveQueue.catch(()=>{}).then(async()=>{
    const encrypted=await encryptData(snapshot,key);
    const previous=localStorage.getItem(LOCAL_V2);
    // An encrypted recovery copy, never a plaintext backup.
    if(previous) localStorage.setItem(LOCAL_V2+'-previous',previous);
    localStorage.setItem(LOCAL_V2,JSON.stringify({_enc:encrypted,schemaVersion:2,savedAt:Date.now()}));
    localStorage.removeItem('finance-app-data');
  });
  localSaveQueue=task;return task;
}
async function readLocalUnlocked() {
  const encoded=localStorage.getItem(LOCAL_V2);
  if(encoded){const envelope=JSON.parse(encoded);const decoded=await decryptData(envelope._enc);if(!decoded)throw new Error('Не удалось расшифровать локальные данные. Ничего не перезаписано');return migrateData(decoded,DEFAULT_DATA);}
  const legacy=localStorage.getItem('finance-app-data');
  return legacy?migrateData(JSON.parse(legacy),DEFAULT_DATA):null;
}

/* ═══════════════════ ENCRYPTION ═══════════════════ */
// PBKDF2 -> AES-GCM encryption keyed by PIN
let _encKey = null;
async function deriveKey(pin) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('finance-app-salt-2026-v1'), iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

function setEncKey(key) { _encKey = key; }
function getEncKey() { return _encKey; }
function clearEncKey() { _encKey = null; }

async function encryptData(obj,key=_encKey) {
  if (!key) throw new Error("Нет ключа шифрования");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  // Combine IV + ciphertext as base64
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  let binary='';for(let i=0;i<combined.length;i+=8192)binary+=String.fromCharCode(...combined.subarray(i,i+8192));return btoa(binary);
}

async function decryptData(b64) {
  if (!_encKey || !b64) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _encKey, ct);
    return JSON.parse(new TextDecoder().decode(dec));
  } catch (e) { return null; }
}

async function loadCloud() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/finance_data?id=eq.main&select=data,updated_at`, { headers: SB_H });
    if (r.ok) {
      const rows = await r.json();
      if (rows.length > 0 && rows[0].data) {
        const d = rows[0].data;
        // New encrypted format: { _enc: 'base64', _meta: {...} }
        if (d._enc) {
          const decrypted = await decryptData(d._enc);
          if (decrypted) return { data: {...decrypted,_pinHash:d._meta?._pinHash}, updated: rows[0].updated_at, _meta: d._meta };
          return { encrypted: true, updated: rows[0].updated_at, _meta: d._meta };
        }
        // Legacy plaintext format
        if (Object.keys(d).length > 0) return { data: d, updated: rows[0].updated_at, legacy: true };
      }
    }
  } catch (e) {}
  return null;
}

// Staging v2 deliberately never writes to the legacy shared cloud row.
// It is a one-time read source only until an authenticated API is deployed.
function saveCloud() { return Promise.resolve(false); }
function saveAll(d) { return saveLocal(d); }

async function fetchRates() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/RUB');
    const d = await r.json();
    if (d && d.rates) return { RUB:1, USD:+(1/d.rates.USD).toFixed(2), EUR:+(1/d.rates.EUR).toFixed(2), GBP:+(1/d.rates.GBP).toFixed(2), CNY:+(1/d.rates.CNY).toFixed(2), TRY:+(1/d.rates.TRY).toFixed(2) };
  } catch (e) {}
  return null;
}

/* ═══════════════════ STYLES ═══════════════════ */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
:root{
  --bg:#0c0a08;--bg2:#0e0c09;
  --s1:#15120e;--s2:#1d1913;--s3:#26211a;
  --border:#2c2620;--border2:#3a3328;
  --text:#f0e8d8;--text-soft:#dfd4be;--muted:#8a7e6c;--muted2:#5a5246;
  --accent:#d4a54b;--accent-dim:#d4a54b14;--accent-glow:#d4a54b40;
  --accent2:#7a9fb8;
  --danger:#cc5a4a;--danger-dim:#cc5a4a12;
  --success:#79b87a;--success-dim:#79b87a10;
  --warning:#d99948;--warning-dim:#d9994810;
  --paper:radial-gradient(ellipsis at 30% 20%, rgba(212,165,75,.04), transparent 60%), radial-gradient(circle at 70% 80%, rgba(122,159,184,.025), transparent 50%);
  --grain:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  --glow-accent:0 0 32px #d4a54b14;--glow-success:0 0 32px #79b87a12;--glow-danger:0 0 32px #cc5a4a12;
  --mono:'JetBrains Mono',monospace;
  --sans:'DM Sans',-apple-system,sans-serif;
  --radius:14px;--radius-sm:10px;--radius-lg:20px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{width:100%;max-width:100vw;overflow-x:hidden}
body{
  background:var(--bg);
  background-image:var(--paper),var(--grain);
  background-attachment:fixed;
  font-feature-settings:'tnum','ss01';
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}input[type=number]{-moz-appearance:textfield}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}::-webkit-scrollbar-thumb:hover{background:var(--accent)}
::selection{background:var(--accent);color:var(--bg)}

/* Subtle hover lift for clickable cards */
.card-hover:hover{transform:translateY(-1px);border-color:var(--border2)!important;transition:all .25s cubic-bezier(.22,.68,0,1.2)}

@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes su{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.fi{animation:fi .45s cubic-bezier(.22,.68,0,1.2) both}.su{animation:su .5s cubic-bezier(.22,.68,0,1.1) both}
.fab{position:fixed;bottom:80px;right:20px;z-index:95}
.home-grid{display:flex;flex-direction:column;gap:12px}
.tg-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}

/* Numerical display with tabular figures */
.num-display{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-0.01em;font-weight:600}

@media(max-width:768px){
  .dn{display:none!important}.ml0{margin-left:0!important}
  table{font-size:11px!important}
  .compact-pad{padding:14px!important}
  .fab{bottom:78px;right:16px}
}
@media(min-width:769px){
  .mn{display:none!important}.ml{margin-left:240px}.fab{bottom:32px;right:32px}
  .home-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  .home-grid>*{margin-bottom:0}
}
`;

const LS = { fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8, display:'block', fontFamily:'var(--mono)', fontWeight:500 };
const TT = { contentStyle:{background:'#1d1913',border:'1px solid #2c2620',borderRadius:10,fontFamily:'var(--mono)',fontSize:12,boxShadow:'0 8px 32px #000a',padding:'8px 12px'}, itemStyle:{color:'#f0e8d8'} };

/* ═══════════════════ UI COMPONENTS ═══════════════════ */
function Card({children,style,onClick,glow,accent}) {
  return <div className={`fi ${onClick?'card-hover':''}`} onClick={onClick} style={{
    background: accent
      ? `linear-gradient(165deg, ${accent}10 0%, var(--s1) 35%, var(--s1) 100%)`
      : 'linear-gradient(165deg, var(--s1) 0%, #110e0a 100%)',
    border:`1px solid ${accent ? accent+'25' : 'var(--border)'}`,
    borderRadius:'var(--radius)',
    padding:'18px 16px',
    marginBottom:12,
    cursor:onClick?'pointer':undefined,
    boxShadow: glow
      ? `${glow}, 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.02)`
      : '0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.02)',
    position:'relative',
    transition:'transform .25s cubic-bezier(.22,.68,0,1.2), border-color .3s, box-shadow .3s',
    ...style
  }}>{children}</div>;
}

function PH({title,sub}){
  return <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:24,paddingTop:8,gap:12,position:'relative'}}>
    <div style={{minWidth:0,flex:1}}>
      <div style={{
        fontFamily:'var(--mono)',
        fontSize:22,fontWeight:700,
        color:'var(--accent)',
        letterSpacing:'-0.02em',
        lineHeight:1,
      }}>{title}</div>
    </div>
    {sub&&<span style={{
      fontFamily:'var(--mono)',
      fontSize:12,color:'var(--muted)',
      textAlign:'right',whiteSpace:'nowrap',
      paddingBottom:4
    }}>{sub}</span>}
  </div>;
}

function MN({date,onChange}){
  const b={
    background:'var(--s2)',border:'1px solid var(--border)',
    color:'var(--text-soft)',width:36,height:36,
    borderRadius:'var(--radius-sm)',fontSize:18,cursor:'pointer',
    display:'flex',alignItems:'center',justifyContent:'center',
    transition:'all .15s'
  };
  return <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
    <button onClick={()=>onChange(-1)} style={b}>‹</button>
    <span style={{
      fontFamily:'var(--mono)',fontSize:14,
      color:'var(--accent)',
      fontWeight:600,letterSpacing:'0.02em'
    }}>{MONTHS[date.getMonth()]} {date.getFullYear()}</span>
    <button onClick={()=>onChange(1)} style={b}>›</button>
  </div>;
}

function Seg({options,value,onChange}){
  return <div style={{display:'flex',background:'var(--s2)',borderRadius:'var(--radius-sm)',padding:3,gap:3,border:'1px solid var(--border)'}}>{options.map(o=><button key={o.value} onClick={()=>onChange(o.value)} style={{
    flex:1,padding:'9px 6px',border:'none',
    background:value===o.value?'linear-gradient(180deg,var(--s3),#1a1611)':'transparent',
    color:value===o.value?'var(--accent)':'var(--muted)',
    fontFamily:'var(--sans)',fontSize:13,
    borderRadius:8,cursor:'pointer',transition:'all .2s',
    fontWeight:value===o.value?600:400,
    boxShadow:value===o.value?'0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)':'none',
    letterSpacing:'0.01em'
  }}>{o.label}</button>)}</div>;
}

function Inp({label,...p}){
  return <div style={{marginBottom:14}}>
    {label&&<label style={LS}>{label}</label>}
    <input {...p} style={{
      width:'100%',background:'var(--s2)',
      border:'1px solid var(--border)',
      borderRadius:'var(--radius-sm)',
      padding:'12px 14px',color:'var(--text)',
      fontFamily:'var(--sans)',fontSize:14,
      outline:'none',transition:'border-color .2s, background .2s',
      ...p.style
    }} />
  </div>;
}

function Sel({label,children,...p}){
  return <div style={{marginBottom:14}}>
    {label&&<label style={LS}>{label}</label>}
    <select {...p} style={{
      width:'100%',background:'var(--s2)',
      border:'1px solid var(--border)',
      borderRadius:'var(--radius-sm)',
      padding:'12px 14px',color:'var(--text)',
      fontFamily:'var(--sans)',fontSize:14,
      outline:'none',appearance:'none',cursor:'pointer',
      backgroundImage:'linear-gradient(45deg, transparent 50%, var(--accent) 50%), linear-gradient(135deg, var(--accent) 50%, transparent 50%)',
      backgroundPosition:'calc(100% - 16px) center, calc(100% - 12px) center',
      backgroundSize:'4px 4px, 4px 4px',
      backgroundRepeat:'no-repeat',
      paddingRight:32,
      ...p.style
    }}>{children}</select>
  </div>;
}

function Btn({children,variant='primary',onClick,...p}){
  const [busy,setBusy]=useState(false);
  const handleClick=onClick?(e)=>{
    if(busy||p.disabled)return;
    setBusy(true);
    try{onClick(e);}finally{setTimeout(()=>setBusy(false),700);}
  }:undefined;
  const S={
    primary:{
      background:'linear-gradient(180deg,#dcad53 0%,#c4922e 100%)',
      color:'#1a140a',
      boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 24px rgba(212,165,75,0.28), 0 1px 3px rgba(0,0,0,0.35)',
      letterSpacing:'0.02em'
    },
    danger:{
      background:'transparent',
      border:'1px solid var(--danger)',
      color:'var(--danger)',
      boxShadow:'inset 0 0 0 1px transparent'
    },
    ghost:{
      background:'var(--s2)',
      border:'1px solid var(--border)',
      color:'var(--text-soft)',
      boxShadow:'inset 0 1px 0 rgba(255,255,255,0.03)'
    },
    success:{
      background:'linear-gradient(180deg,#85c485 0%,#5fa760 100%)',
      color:'#0a1a0a',
      boxShadow:'0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 20px rgba(121,184,122,0.22)'
    }
  };
  return <button {...p} onClick={handleClick} disabled={busy||p.disabled} style={{
    width:'100%',padding:'13px 16px',borderRadius:'var(--radius-sm)',border:'none',
    fontFamily:'var(--sans)',fontSize:14,fontWeight:500,cursor:busy?'wait':'pointer',
    transition:'all .2s,transform .1s',opacity:busy?0.7:1,
    ...S[variant],...p.style
  }}>{children}</button>;
}

function Empty({icon,text,hint,action}){
  return <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)',fontSize:14}}>
    <div style={{fontSize:42,marginBottom:14,filter:'grayscale(0.3) opacity(0.85)'}}>{icon}</div>
    <div style={{fontFamily:'var(--sans)',fontSize:14,color:'var(--text-soft)',marginBottom:hint?6:0,fontWeight:500}}>{text}</div>
    {hint&&<div style={{fontSize:12,color:'var(--muted2)',marginTop:6,fontFamily:'var(--sans)'}}>{hint}</div>}
    {action&&<button onClick={action.onClick} style={{
      marginTop:16,background:'var(--accent-dim)',
      border:'1px solid var(--accent)',color:'var(--accent)',
      padding:'9px 22px',borderRadius:'var(--radius-sm)',
      fontSize:13,cursor:'pointer',fontFamily:'var(--sans)',fontWeight:500,
      letterSpacing:'0.02em'
    }}>{action.label}</button>}
  </div>;
}

function TxRow({t,allCats,onClick,onDelete,accounts}) {
  const cat = allCats.find(c=>c.id===t.cat);
  const isInc = t.type==='income';
  const cur = t.currency||'RUB';
  const stripe = isInc ? 'var(--success)' : t.cat==='lunch' ? 'var(--warning)' : 'var(--danger)';
  const isOblig = (t.tags||[]).includes('постоянный')||!!t.recurringId;
  const acc = t.accountId && accounts ? accounts.find(a=>a.id===t.accountId) : null;
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 0 14px 12px',borderBottom:'1px solid var(--border)',cursor:onClick?'pointer':'default',transition:'background .15s',position:'relative'}} onClick={onClick}>
      <div style={{position:'absolute',left:0,top:'18%',bottom:'18%',width:2,borderRadius:1,background:stripe,opacity:.6}}/>
      <div style={{
        width:38,height:38,borderRadius:'10px',
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:17,flexShrink:0,
        background:`linear-gradient(135deg, ${(cat?.color||(t.cat==='lunch'?'#d99948':'#888'))}26, ${(cat?.color||(t.cat==='lunch'?'#d99948':'#888'))}10)`,
        border:`1px solid ${(cat?.color||(t.cat==='lunch'?'#d99948':'#888'))}25`
      }}>{t.cat==='lunch'?'🍱':isInc?'＄':(cat?.icon||'·')}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:6,color:'var(--text)',fontFamily:'var(--sans)'}}>
          {isOblig&&<span style={{fontSize:9,color:'var(--warning)'}}>🔁</span>}
          {t.note||cat?.name||(t.cat==='lunch'?'Обед':isInc?'Доход':'Расход')}
        </div>
        <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.02em'}}>{dDisp(t.date)} · {t.cat==='lunch'?'Обед':(cat?.name||'')}{cur!=='RUB'?` · ${cur}`:''}{acc?` · ${acc.icon} ${acc.name}`:''}{(t.tags||[]).filter(tg=>tg!=='постоянный').length>0&&<span style={{color:'var(--accent)',marginLeft:4,fontFamily:'var(--sans)'}}>{t.tags.filter(tg=>tg!=='постоянный').map(tg=>'#'+tg).join(' ')}</span>}</div>
      </div>
      <span className="num-display" style={{fontSize:15,fontWeight:500,flexShrink:0,color:isInc?'var(--success)':'var(--danger)',letterSpacing:'-0.01em'}}>{isInc?'+':'−'}{fN(t.amount)} {curSym(cur)}</span>
      {onDelete&&<button onClick={e=>{e.stopPropagation();onDelete(t.id)}} style={{background:'none',border:'none',color:'var(--muted2)',fontSize:16,cursor:'pointer',padding:'4px 6px',transition:'color .2s',fontFamily:'var(--sans)'}}>×</button>}
    </div>
  );
}

function Confirm({text,onYes,onNo}){
  return <div className="su" style={{position:'fixed',inset:0,background:'rgba(8,6,4,0.7)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:20}}>
    <div style={{
      background:'linear-gradient(165deg, var(--s1) 0%, #110e0a 100%)',
      border:'1px solid var(--border2)',
      borderRadius:'var(--radius-lg)',
      padding:'28px 24px 22px',
      maxWidth:340,width:'100%',textAlign:'center',
      boxShadow:'0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(212,165,75,0.05)',
    }}>
      <div style={{
        fontSize:15,marginBottom:22,lineHeight:1.6,
        color:'var(--text-soft)',fontFamily:'var(--sans)'
      }}>{text}</div>
      <div style={{display:'flex',gap:10}}>
        <Btn variant="ghost" onClick={onNo} style={{flex:1}}>Нет</Btn>
        <Btn variant="danger" onClick={onYes} style={{flex:1}}>Да</Btn>
      </div>
    </div>
  </div>;
}

/* ═══════════════════ DATE INPUT ═══════════════════ */
function DateInput({label,value,onChange}) {
  const [text,setText]=useState(value?dDisp(value):'');
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setText(value?dDisp(value):'');},[value,focused]);
  const handle=(e)=>{
    let raw=e.target.value.replace(/[^\d]/g,'');
    if(raw.length>8)raw=raw.slice(0,8);
    let f='';for(let i=0;i<raw.length;i++){if(i===2||i===4)f+='.';f+=raw[i];}
    setText(f);
    if(raw.length>=2){let d=parseInt(raw.slice(0,2));if(d>31)d=31;if(d<1&&raw.length>=2)d=1;raw=String(d).padStart(2,'0')+raw.slice(2);}
    if(raw.length>=4){let m=parseInt(raw.slice(2,4));if(m>12)m=12;if(m<1&&raw.length>=4)m=1;raw=raw.slice(0,2)+String(m).padStart(2,'0')+raw.slice(4);}
    if(raw.length===8){const dd=raw.slice(0,2),mm=raw.slice(2,4),yyyy=raw.slice(4,8);const iso=`${yyyy}-${mm}-${dd}`;const test=new Date(iso+'T00:00:00');if(!isNaN(test.getTime())){onChange(iso);setText(`${dd}.${mm}.${yyyy}`);}}
  };
  const shift=(days)=>{if(!value)return;const d=new Date(value+'T00:00:00');d.setDate(d.getDate()+days);onChange(dStr(d));};
  const ab={background:'var(--s2)',border:'1px solid var(--border)',color:'var(--text)',minWidth:44,height:44,borderRadius:10,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,padding:0};
  return <div style={{marginBottom:14}}>{label&&<label style={LS}>{label}</label>}
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <button type="button" onClick={()=>shift(-1)} style={ab}>‹</button>
      <input type="text" inputMode="numeric" placeholder="дд.мм.гггг" value={focused?text:(value?dDisp(value):'')} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={handle} maxLength={10} style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 14px',color:'var(--text)',fontFamily:'var(--mono)',fontSize:15,outline:'none',letterSpacing:'0.06em',textAlign:'center'}} />
      <button type="button" onClick={()=>shift(1)} style={ab}>›</button>
    </div>
  </div>;
}

/* ═══════════════════ EDIT MODAL ═══════════════════ */
function EditModal({tx,allCats,onSave,onDelete,onClose,data,upd,msg}) {
  const [amount,setAmt] = useState(String(tx.amount));
  const [currency,setCur] = useState(tx.currency||'RUB');
  const [cat,setCat] = useState(tx.cat);
  const [note,setNote] = useState(tx.note||'');
  const [date,setDate] = useState(tx.date);
  const [tags,setTags] = useState(tx.tags||[]);
  const [tagInput,setTagInput] = useState('');
  const [accId,setAccId] = useState(tx.accountId||'');
  const [showNewCat,setShowNewCat] = useState(false);
  const [ncN,setNcN]=useState('');const [ncI,setNcI]=useState('📌');const [ncC,setNcC]=useState('#d4a54b');
  const isLunch = tx.cat==='lunch'||tx.type==='lunch';
  const isInc = tx.type==='income';
  const addTag=()=>{const t=tagInput.trim();if(t&&!tags.includes(t))setTags([...tags,t]);setTagInput('');};
  const accounts=data?.accounts||[];
  const addCat=()=>{if(!ncN.trim())return;const id='c_'+uid();if(upd)upd(d=>({...d,customCats:[...(d.customCats||[]),{id,name:ncN.trim(),icon:ncI,color:ncC}]}));setCat(id);setNcN('');setShowNewCat(false);if(msg)msg('✓ Категория добавлена');};

  return (
    <div className="su" style={{position:'fixed',inset:0,background:'#000a',backdropFilter:'blur(10px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999,padding:0}} onClick={onClose}>
      <div style={{background:'linear-gradient(180deg,#151619,#0d0e12)',border:'1px solid var(--border)',borderRadius:'22px 22px 0 0',padding:'24px 20px',paddingBottom:'calc(28px + env(safe-area-inset-bottom))',width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:44,height:4,borderRadius:3,background:'var(--border2)',margin:'0 auto 20px'}} />
        <div style={{fontSize:17,fontWeight:600,marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>{isLunch?'🍱 Обед':isInc?'💰 Доход':'✏️ Расход'}</span>
          <button onClick={onClose} style={{background:'var(--s3)',border:'none',color:'var(--muted)',fontSize:16,cursor:'pointer',width:32,height:32,borderRadius:8}}>×</button>
        </div>
        <Inp label="Сумма" type="number" value={amount} onChange={e=>setAmt(e.target.value)} inputMode="decimal" />
        <div style={{display:'flex',gap:10}}>
          <div style={{flex:1}}><Sel label="Валюта" value={currency} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</Sel></div>
          {!isLunch&&!isInc&&<div style={{flex:2}}><Sel label="Категория" value={cat} onChange={e=>setCat(e.target.value)}>{allCats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Sel></div>}
        </div>
        {!isLunch&&!isInc&&<button onClick={()=>setShowNewCat(!showNewCat)} style={{background:'none',border:'none',color:'var(--accent)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)',marginTop:-8,marginBottom:12,padding:0}}>+ Новая категория</button>}
        {showNewCat&&<div className="su" style={{background:'var(--s2)',borderRadius:12,padding:12,marginBottom:14}}>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input value={ncI} onChange={e=>setNcI(e.target.value)} style={{width:40,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:6,color:'var(--text)',fontSize:18,textAlign:'center'}}/>
            <input value={ncN} onChange={e=>setNcN(e.target.value)} placeholder="Название" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:6,color:'var(--text)',fontSize:13}}/>
            <input type="color" value={ncC} onChange={e=>setNcC(e.target.value)} style={{width:36,height:36,border:'none',borderRadius:8,cursor:'pointer',background:'none'}}/>
          </div>
          <Btn variant="ghost" onClick={addCat} style={{padding:7,fontSize:12}}>Добавить</Btn>
        </div>}
        {accounts.length>0&&!isLunch&&<Sel label="Счёт" value={accId} onChange={e=>setAccId(e.target.value)}>
          <option value="">Без привязки</option>
          {accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </Sel>}
        <Inp label="Описание" type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="..." />
        <div style={{marginBottom:14}}>
          <label style={LS}>Теги</label>
          {tags.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>{tags.map(t=><span key={t} style={{background:'var(--accent-dim)',color:'var(--accent)',fontSize:12,padding:'4px 10px',borderRadius:8,fontFamily:'var(--mono)',display:'flex',alignItems:'center',gap:4}}>{t}<button onClick={()=>setTags(tags.filter(x=>x!==t))} style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontSize:11,padding:0}}>×</button></span>)}</div>}
          <div style={{display:'flex',gap:6}}><input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag();}}} placeholder="Тег..." style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none'}}/><button onClick={addTag} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 14px',color:'var(--accent)',fontSize:13,cursor:'pointer'}}>+</button></div>
        </div>
        <DateInput label="Дата" value={date} onChange={setDate} />
        <div style={{display:'flex',gap:10,marginTop:6}}>
          <Btn onClick={()=>{const a=parseMoney(amount);if(!a||a<=0)return;onSave({...tx,amount:a,currency,cat,note,date,tags,accountId:isLunch?undefined:(accId||undefined)});}} style={{flex:1}}>Сохранить</Btn>
          <Btn variant="danger" onClick={()=>onDelete(tx.id)} style={{flex:0,width:56,padding:'13px 0',display:'flex',alignItems:'center',justifyContent:'center'}}>🗑</Btn>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ QUICK ADD MODAL ═══════════════════ */
function QuickAddModal({data, allCats, upd, msg, toR, onClose}) {
  const [amount, setAmount] = useState('');
  const [selectedCat, setSelectedCat] = useState(null);
  const [note, setNote] = useState('');
  const [type, setType] = useState('expense');
  const recommended = useMemo(() => recommendCats(data.transactions||[], allCats, 8), [data.transactions, allCats]);
  const accounts = data.accounts||[];
  const [accId, setAccId] = useState(accounts.length > 0 ? accounts[0].id : '');
  const recentNotes = useMemo(()=>[...new Set((data.transactions||[]).filter(t=>t.note&&t.note.trim()).slice().reverse().map(t=>t.note.trim()))].slice(0,6),[data.transactions]);

  const pressKey = (k) => {
    if (k === '⌫') { setAmount(a => a.slice(0, -1)); return; }
    if (k === '.') { if (!amount.includes('.') && amount.length > 0) setAmount(a => a + '.'); return; }
    if (amount.includes('.')) { const dec = amount.split('.')[1] || ''; if (dec.length >= 2) return; }
    if (amount === '0' && k !== '.') { setAmount(k); return; }
    if (amount.length < 12) setAmount(a => a + k);
  };
  const submit = () => {
    const a = parseMoney(amount);
    if (!a || a <= 0) { msg('Введи сумму'); return; }
    if (type === 'expense' && !selectedCat) { msg('Выбери категорию'); return; }
    
    if (type !== 'lunch' && accounts.length > 0 && !accId) { msg('Выбери счёт'); return; }
    const cid = type === 'lunch' ? 'lunch' : type === 'income' ? 'income' : selectedCat;
    const catObj = allCats.find(c => c.id === cid);
    const newTx = {
      id: uid(), type: type === 'lunch' ? 'lunch' : type === 'income' ? 'income' : 'expense',
      cat: cid, amount: a, currency: 'RUB', amountRub: a,
      note: note.trim(), date: today(), tags: [], accountId: accId || undefined
    };
    try { upd(d => putTransaction(d, {...newTx,note:note.trim()||catObj?.name||(type==='lunch'?'Обед':'Доход')})); } catch(e) {msg(e.message);return;}
    msg('✓ Записано');
    onClose();
  };
  const keypad = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];
  const quickAmounts = [100, 200, 500, 1000];

  return (
    <div className="su" style={{position:'fixed',inset:0,background:'#000c',backdropFilter:'blur(12px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999,padding:0}} onClick={onClose}>
      <div style={{background:'linear-gradient(180deg,#151619,#0a0b0e)',border:'1px solid var(--border)',borderRadius:'24px 24px 0 0',padding:'18px 18px',paddingBottom:'calc(18px + env(safe-area-inset-bottom))',width:'100%',maxWidth:500,maxHeight:'95vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:44,height:4,borderRadius:3,background:'var(--border2)',margin:'0 auto 14px'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <span style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.1em'}}>⚡ Быстрый ввод</span>
          <button onClick={onClose} style={{background:'var(--s3)',border:'none',color:'var(--muted)',fontSize:16,cursor:'pointer',width:30,height:30,borderRadius:8}}>×</button>
        </div>
        <div style={{display:'flex',gap:3,background:'var(--s2)',borderRadius:10,padding:3,marginBottom:12}}>
          {[{v:'expense',l:'Расход'},{v:'income',l:'Доход'},{v:'lunch',l:'Обед'}].map(o=><button key={o.v} onClick={()=>{setType(o.v);if(o.v!=='expense')setSelectedCat(null)}} style={{flex:1,padding:'8px 4px',border:'none',background:type===o.v?'linear-gradient(135deg,var(--s3),#2a2b33)':'transparent',color:type===o.v?'var(--text)':'var(--muted)',fontSize:12,borderRadius:8,cursor:'pointer',fontWeight:type===o.v?600:400}}>{o.l}</button>)}
        </div>
        <div style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:16,padding:'18px 16px',textAlign:'center',marginBottom:10}}>
          <div style={{fontFamily:'var(--mono)',fontSize:36,fontWeight:700,color:amount?(type==='income'?'var(--success)':'var(--danger)'):'var(--muted2)',lineHeight:1}}>{amount||'0'} ₽</div>
        </div>
        <div style={{display:'flex',gap:6,marginBottom:12}}>
          {quickAmounts.map(q=><button key={q} onClick={()=>setAmount(String(q))} style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'7px 0',color:'var(--muted)',fontFamily:'var(--mono)',fontSize:12,cursor:'pointer'}}>{q}</button>)}
        </div>
        {type==='expense'&&<>
          <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:6}}>Категория {recommended.length>0&&<span style={{color:'var(--muted2)',textTransform:'none'}}>· по частоте</span>}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:6,marginBottom:12}}>
            {recommended.map(c=><button key={c.id} onClick={()=>setSelectedCat(c.id)} style={{padding:'10px 4px',background:selectedCat===c.id?c.color+'30':'var(--s2)',border:`1px solid ${selectedCat===c.id?c.color:'var(--border)'}`,borderRadius:10,color:selectedCat===c.id?c.color:'var(--text)',fontSize:11,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
              <span style={{fontSize:18}}>{c.icon}</span><span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{c.name}</span>
            </button>)}
          </div>
        </>}
        {accounts.length>0&&type!=='lunch'&&<select value={accId} onChange={e=>setAccId(e.target.value)} style={{width:'100%',background:'var(--s2)',border:`1px solid ${!accId?'var(--danger)':'var(--border)'}`,borderRadius:10,padding:'9px 12px',color:'var(--text)',fontSize:13,outline:'none',appearance:'none',marginBottom:10,cursor:'pointer'}}>
          <option value="">— Счёт обязателен —</option>
          {accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name} · {fN(a.balance)} {curSym(a.currency||'RUB')}</option>)}
        </select>}
        <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="Описание (необязательно)" style={{width:'100%',background:'var(--s2)',border:`1px solid var(--border)`,borderRadius:10,padding:'9px 12px',color:'var(--text)',fontSize:13,outline:'none',marginBottom:10}}/>
        {recentNotes.length>0&&!note&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>{recentNotes.map(n=><button key={n} onClick={()=>setNote(n)} style={{background:'var(--s3)',border:'0.5px solid var(--border)',color:'var(--muted)',fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer'}}>{n}</button>)}</div>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:5,marginBottom:10}}>
          {keypad.map(k=><button key={k} onClick={()=>pressKey(k)} style={{padding:'14px 0',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,color:k==='⌫'?'var(--danger)':'var(--text)',fontFamily:'var(--mono)',fontSize:22,fontWeight:500,cursor:'pointer'}}>{k}</button>)}
        </div>
        <Btn variant={type==='income'?'success':'primary'} onClick={submit} style={{fontSize:16,padding:'14px'}}>Записать</Btn>
      </div>
    </div>
  );
}

/* ═══════════════════ MAIN APP ═══════════════════ */
/* ═══════════════════ AUTH ═══════════════════ */
async function hashPin(pin) {
  const buf = new TextEncoder().encode(pin + '|finance-salt-2026');
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function getStoredPinHash() {
  try { return localStorage.getItem('finance-pin-hash') || null; } catch (e) { return null; }
}
function setStoredPinHash(h) {
  try { 
    if (h) localStorage.setItem('finance-pin-hash', h);
    else localStorage.removeItem('finance-pin-hash');
  } catch (e) {}
}
function getSession() {
  try {
    const s = sessionStorage.getItem('finance-session');
    if (s) {
      const parsed = JSON.parse(s);
      // Session valid for 24 hours
      if (Date.now() - parsed.ts < 86400000) return true;
    }
  } catch (e) {}
  return false;
}
function setSession(active) {
  try {
    if (active) sessionStorage.setItem('finance-session', JSON.stringify({ts:Date.now()}));
    else sessionStorage.removeItem('finance-session');
  } catch (e) {}
}

// Cloud-stored PIN sync
async function loadCloudPin() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/finance_data?id=eq.main&select=data`, { headers: SB_H });
    if (r.ok) {
      const rows = await r.json();
      if (rows.length > 0 && rows[0].data) {
        // New format: data._meta._pinHash
        if (rows[0].data._meta?._pinHash) return rows[0].data._meta._pinHash;
        // Legacy: data._pinHash
        if (rows[0].data._pinHash) return rows[0].data._pinHash;
      }
    }
  } catch (e) {}
  return null;
}

// WebAuthn / Passkey helpers
function isPasskeySupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.create;
}
async function registerPasskey(userId) {
  if (!isPasskeySupported()) return null;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBytes = new TextEncoder().encode(userId);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge, rp: { name: 'Финансы' },
        user: { id: userIdBytes, name: 'user', displayName: 'Я' },
        pubKeyCredParams: [{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
        authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
        timeout: 60000, attestation: 'none'
      }
    });
    if (cred) {
      const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      localStorage.setItem('finance-passkey-id', credId);
      return credId;
    }
  } catch (e) { console.warn('Passkey register:', e); }
  return null;
}
async function verifyPasskey() {
  if (!isPasskeySupported()) return false;
  const credId = localStorage.getItem('finance-passkey-id');
  if (!credId) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const idBytes = Uint8Array.from(atob(credId), c => c.charCodeAt(0));
    const result = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: idBytes }],
        userVerification: 'preferred', timeout: 60000
      }
    });
    return !!result;
  } catch (e) { console.warn('Passkey verify:', e); return false; }
}

/* ═══════════════════ LOCK SCREEN ═══════════════════ */
function LockScreen({ onUnlock, hasPin, savePinHash }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState(hasPin ? 'enter' : 'create'); // 'create' | 'confirm' | 'enter'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(()=>{
    setBiometricAvailable(isPasskeySupported() && !!localStorage.getItem('finance-passkey-id'));
  },[]);

  // Try biometric auto-prompt on mount if PIN exists and biometric registered
  useEffect(()=>{
    if (step === 'enter' && biometricAvailable) {
      // small delay so screen renders
      setTimeout(async ()=>{
        const ok = await verifyPasskey();
        if (ok && getEncKey()) onUnlock();
      }, 250);
    }
  },[step, biometricAvailable]);

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (step === 'create') {
        if (pin.length < 4) { setError('Минимум 4 символа'); setBusy(false); return; }
        setStep('confirm');
        setBusy(false);
        return;
      }
      if (step === 'confirm') {
        if (pin !== confirmPin) { setError('PIN-коды не совпадают'); setConfirmPin(''); setBusy(false); return; }
        const h = await hashPin(pin);
        const key = await deriveKey(pin);
        setEncKey(key);
        // Cache key in sessionStorage for biometric unlock during session
        try { sessionStorage.removeItem('finance-pin-mem'); } catch(e) {}
        await savePinHash(h);
        onUnlock();
        return;
      }
      if (step === 'enter') {
        const stored = getStoredPinHash();
        const h = await hashPin(pin);
        const matchLocal = h === stored;
        let matchCloud = false;
        if (!matchLocal) {
          const cloudHash = await loadCloudPin();
          if (cloudHash && h === cloudHash) { setStoredPinHash(cloudHash); matchCloud = true; }
        }
        if (matchLocal || matchCloud) {
          const key = await deriveKey(pin);
          setEncKey(key);
          try { sessionStorage.removeItem('finance-pin-mem'); } catch(e) {}
          onUnlock();
          return;
        }
        setError('Неверный PIN');
        setPin('');
      }
    } catch (e) { setError('Ошибка: ' + e.message); }
    finally { setBusy(false); }
  };

  const tryBiometric = async () => {
    setBusy(true);
    const ok = await verifyPasskey();
    if (ok) {
      if(getEncKey()){setBusy(false);onUnlock();return;}
      // No cached PIN — ask to enter once
      setError('Введи PIN один раз для активации биометрии в этой сессии');
    } else setError('Биометрия не подтверждена');
    setBusy(false);
  };

  const titles = {
    create: 'Создай PIN-код',
    confirm: 'Повтори PIN-код',
    enter: 'Введи PIN-код'
  };
  const hints = {
    create: 'Минимум 4 символа · цифры или буквы',
    confirm: 'Чтобы убедиться что запомнил',
    enter: 'Защищает доступ к твоим финансам'
  };

  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 50% 0%, rgba(212,165,75,0.06), transparent 60%), linear-gradient(180deg,#0e0c08,#07060a)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'var(--sans)',color:'var(--text)'}}>
      <div className="fi" style={{width:'100%',maxWidth:340,textAlign:'center'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,marginBottom:30}}>
          <div style={{fontSize:54,filter:'drop-shadow(0 4px 24px rgba(212,165,75,0.3))'}}>💰</div>
          <div style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.2em',fontWeight:600}}>Финансы</div>
        </div>
        <div style={{padding:'24px',background:'linear-gradient(165deg,#15120e,#0d0a07)',border:'1px solid var(--border2)',borderRadius:'var(--radius-lg)',boxShadow:'0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(212,165,75,0.04)'}}>
          <h2 style={{fontFamily:'var(--sans)',fontSize:18,fontWeight:600,marginBottom:6,color:'var(--text)'}}>{titles[step]}</h2>
          <p style={{fontSize:12,color:'var(--muted)',marginBottom:22,lineHeight:1.6,fontFamily:'var(--sans)'}}>{hints[step]}</p>
          <input
            type="password" value={step==='confirm'?confirmPin:pin}
            onChange={e=>step==='confirm'?setConfirmPin(e.target.value):setPin(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')submit();}}
            autoFocus inputMode="text" autoComplete="off" maxLength={32}
            placeholder="• • • •"
            style={{
              width:'100%',background:'var(--bg)',
              border:`1px solid ${error?'var(--danger)':'var(--border)'}`,
              borderRadius:'var(--radius-sm)',padding:'16px 18px',color:'var(--text)',
              fontFamily:'var(--mono)',fontSize:20,outline:'none',
              textAlign:'center',letterSpacing:'.3em',marginBottom:14,
              transition:'all .2s'
            }}
          />
          {error && <div style={{color:'var(--danger)',fontSize:12,marginBottom:14,fontFamily:'var(--sans)'}}>{error}</div>}
          <Btn onClick={submit} variant="primary" style={{padding:'14px',fontSize:14,marginBottom:step==='enter'&&biometricAvailable?12:0}}>{step==='create'?'Далее':step==='confirm'?'Подтвердить':'Войти'}</Btn>
          {step === 'enter' && biometricAvailable && (
            <button onClick={tryBiometric} disabled={busy} style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',color:'var(--accent)',fontSize:13,fontFamily:'var(--sans)',cursor:'pointer',fontWeight:500,letterSpacing:'0.01em'}}>
              🔐 Проверить устройство (затем PIN)
            </button>
          )}
        </div>
        {step === 'create' && <p style={{fontSize:11,color:'var(--muted2)',lineHeight:1.6,marginTop:16,fontFamily:'var(--sans)'}}>PIN используется для шифрования данных на устройстве. В этой версии старое облако доступно только для переноса.</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [data,setData]=useState(()=>loadLocal());
  const dataRef=useRef(data); dataRef.current=data;
  const [page,setPage]=useState('home');
  const [toast,setToast]=useState('');
  const [sync,setSync]=useState('loading');
  const [storageReady,setStorageReady]=useState(false);
  const [storageError,setStorageError]=useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pinExists, setPinExists] = useState(!!getStoredPinHash());
  const [authChecking, setAuthChecking] = useState(true);
  const [statsDate,setStatsDate]=useState(new Date());
  const [histDate,setHistDate]=useState(new Date());
  const [lunchDate,setLunchDate]=useState(new Date());
  const [editDebt,setEditDebt]=useState(null);
  const [editGoal,setEditGoal]=useState(null);
  const [showAddCat,setShowAddCat]=useState(false);
  const [confirm,setConfirm]=useState(null);
  const [editTx,setEditTx]=useState(null);
  const [quickAdd,setQuickAdd]=useState(false);

  // On mount: check cloud for PIN, restore session
  useEffect(()=>{
    (async () => {
      let pinHash = getStoredPinHash();
      if (!pinHash) {
        const cloudPin = await loadCloudPin();
        if (cloudPin) { setStoredPinHash(cloudPin); pinHash = cloudPin; setPinExists(true); }
      }
      sessionStorage.removeItem('finance-pin-mem');
      setAuthChecking(false);
    })();
  },[]);

  const savePinHash = async (h) => {
    setStoredPinHash(h);
    setPinExists(true);
    // Save to cloud as part of data
    setData(prev => prev ? {...prev, _pinHash: h} : prev);
  };

  const handleUnlock = () => { setSession(true); setUnlocked(true); };

  // Prefer the device's data. Legacy cloud is read only when the device is empty.
  useEffect(()=>{
    if(!unlocked)return;
    let cancelled=false;
    (async()=>{
      try{
        let selected=await readLocalUnlocked();
        if(!selected){const cloud=await loadCloud();if(cloud?.encrypted)throw new Error('Не удалось расшифровать старое облако. Импортируйте JSON-бэкап');
          selected=cloud?.data?migrateData(cloud.data,DEFAULT_DATA):structuredClone(DEFAULT_DATA);}
        if(!cancelled){const next={...selected,_pinHash:getStoredPinHash()};dataRef.current=next;setData(next);setStorageReady(true);}
      }catch(e){if(!cancelled){setStorageError(e.message);setSync('error');}}
    })();
    return()=>{cancelled=true;};
  },[unlocked]);
  useEffect(()=>{
    if(!data||!unlocked||!storageReady)return;
    let cancelled=false;setSync('saving');
    saveLocal({...data,_lastUpdate:Date.now()}).then(()=>{if(!cancelled){setSync('local');setStorageError('');}}).catch(e=>{if(!cancelled){setSync('error');setStorageError('Сохранение не удалось: '+e.message);}});
    return()=>{cancelled=true;};
  },[data,unlocked,storageReady]);

  // Fetch rates daily
  useEffect(()=>{
    if(data&&(!data.ratesUpdated||Date.now()-data.ratesUpdated>86400000))
      fetchRates().then(r=>{if(r)setData(p=>p?{...p,rates:r,ratesUpdated:Date.now()}:p)});
  },[]);

  // Recurring rules are plans. A debit requires explicit payment confirmation.
  // Daily reminder at 21:00
  useEffect(()=>{
    if(!('Notification' in window)) return;
    const sched=()=>{
      const now=new Date();
      const target=new Date();
      target.setHours(21,0,0,0);
      if(target<=now) target.setDate(target.getDate()+1);
      return setTimeout(()=>{
        const last=localStorage.getItem('finance-last-reminder');
        const tk=dStr(new Date());
        if(dataRef.current?.settings?.notifications&&last!==tk&&!dataRef.current.transactions.some(t=>t.date===tk)&&Notification.permission==='granted'){
          new Notification('💰 Финансы',{body:'Запиши расходы за сегодня'});
          localStorage.setItem('finance-last-reminder',tk);
        }
        sched();
      },target-now);
    };
    const t=sched();
    return ()=>clearTimeout(t);
  },[]);

  // Budget update listener
  useEffect(()=>{
    const handler=e=>setData(p=>p?{...p,categoryBudgets:{...e.detail}}:p);
    window.addEventListener('finance-budget-update',handler);
    return ()=>window.removeEventListener('finance-budget-update',handler);
  },[]);

  const upd=useCallback(fn=>{const next=fn(dataRef.current);dataRef.current=next;setData(next);},[]);
  const msg=m=>{setToast(m);setTimeout(()=>setToast(''),2200);};
  const toR=useCallback((a,c)=>(!c||c==='RUB')?a:a*(data?.rates?.[c]||DEFAULT_RATES[c]||1),[data?.rates]);
  const cats=useMemo(()=>data?[...DEFAULT_CATS,...(data.customCats||[])]:DEFAULT_CATS,[data?.customCats]);

  const saveTx=tx=>{try{upd(d=>putTransaction(d,tx));setEditTx(null);msg('✓ Сохранено');}catch(e){msg(e.message);}};
  const delTx=id=>setConfirm({text:'Удалить эту операцию?',action:()=>{try{upd(d=>deleteTransaction(d,id));setEditTx(null);msg('✓ Удалено');}catch(e){msg(e.message);}}});

  if(!data) return <div style={{background:'#07080a',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#d4a54b',fontFamily:'monospace',fontSize:18}}><div style={{animation:'pulse 1.2s infinite'}}>Загрузка...</div></div>;

  const nav=[
    // Main bar (mobile bottom nav shows first 4)
    {id:'home',icon:'◈',label:'Главная'},
    {id:'add',icon:'＋',label:'Добавить'},
    {id:'history',icon:'≡',label:'История'},
    {id:'lunch',icon:'🍱',label:'Обеды'},
    // "More" menu
    {id:'accounts',icon:'🏦',label:'Счета'},
    {id:'recurring',icon:'🔁',label:'Постоянные'},
    {id:'goals',icon:'◎',label:'Цели'},
    {id:'stats',icon:'◉',label:'Стат-ка'},
    {id:'settings',icon:'⚙',label:'Настройки'},
    // Hidden (accessed from inside other pages)
    {id:'calendar',icon:'📅',label:'Календарь',hidden:true},
    {id:'search',icon:'⌕',label:'Поиск',hidden:true},
    {id:'changelog',icon:'↶',label:'Откат',hidden:true},
  ];
  const go=p=>setPage(p);
  const P={data,upd,cats,msg,toR,go,setEditTx};

  // Auth checking spinner
  if (authChecking) {
    return <><style>{STYLE}</style><div style={{minHeight:'100vh',background:'#07080a',display:'flex',alignItems:'center',justifyContent:'center',color:'#d4a54b',fontFamily:'monospace',fontSize:18}}><div style={{animation:'pulse 1.2s infinite'}}>💰</div></div></>;
  }
  
  // Lock screen guard
  if (!unlocked) {
    return <><style>{STYLE}</style><LockScreen onUnlock={handleUnlock} hasPin={pinExists} savePinHash={savePinHash}/></>;
  }

  if(!storageReady) return <><style>{STYLE}</style><div style={{padding:24,color:'var(--text)',background:'var(--bg)',minHeight:'100vh'}}>{storageError||'Расшифровка и перенос данных…'}{storageError&&<><button onClick={()=>location.reload()}>Повторить</button><button onClick={()=>{const next={...structuredClone(DEFAULT_DATA),_pinHash:getStoredPinHash()};dataRef.current=next;setData(next);setStorageError('');setStorageReady(true);}}>Открыть пустую новую версию для импорта JSON</button></>}</div></>;
  return (<>
    <style>{STYLE}</style>
    <div style={{display:'flex',minHeight:'100vh',background:'var(--bg)',color:'var(--text)',fontFamily:'var(--sans)',width:'100%',overflowX:'hidden'}}>
      <nav className="dn" style={{width:240,background:'linear-gradient(180deg,#161210,#0e0c08)',borderRight:'1px solid var(--border)',padding:'32px 0 24px',display:'flex',flexDirection:'column',gap:2,position:'fixed',top:0,left:0,bottom:0,zIndex:100,boxShadow:'inset -1px 0 0 rgba(212,165,75,0.04)'}}>
        <div style={{padding:'0 22px',marginBottom:32}}>
          <div style={{fontFamily:'var(--mono)',fontSize:19,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',lineHeight:1}}>💰 Финансы</div>
        </div>
        {nav.filter(n=>!n.hidden).map(n=><button key={n.id} onClick={()=>go(n.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 22px',background:page===n.id?'linear-gradient(90deg,var(--accent-dim),transparent)':'transparent',border:'none',color:page===n.id?'var(--accent)':'var(--muted)',cursor:'pointer',fontSize:13,fontWeight:page===n.id?500:400,borderLeft:page===n.id?'2px solid var(--accent)':'2px solid transparent',textAlign:'left',fontFamily:'var(--sans)',letterSpacing:'0.01em',transition:'all .2s'}}><span style={{fontSize:15,width:22,textAlign:'center',opacity:page===n.id?1:.7}}>{n.icon}</span>{n.label}</button>)}
        <div style={{marginTop:'auto',padding:'16px 22px',fontSize:10,color:'var(--muted2)',fontFamily:'var(--mono)',borderTop:'1px solid var(--border)',paddingTop:14}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:5,height:5,borderRadius:'50%',background:sync==='local'?'var(--success)':sync==='error'?'var(--danger)':'var(--warning)',boxShadow:`0 0 8px ${sync==='local'?'var(--success)':sync==='error'?'var(--danger)':'var(--warning)'}`}}/>{sync==='local'?'сохранено на устройстве':sync==='error'?'ошибка сохранения':'сохраняется'}</div>
        </div>
      </nav>

      <main className="ml0 ml" style={{flex:1,minWidth:0,minHeight:'100vh',paddingBottom:90}}>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'16px 12px'}}>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:12,padding:10,border:'1px solid var(--border)',borderRadius:10}}>Новая версия · {sync==='local'?'сохранено на устройстве':sync==='error'?'ошибка сохранения':'сохраняется'} · запись в старое облако отключена</div>
          {storageError&&<div role="alert" style={{color:'var(--danger)',padding:12}}>{storageError}</div>}
          {page==='home'&&<HomePage {...P} setConfirm={setConfirm}/>}
          {page==='add'&&<AddPage {...P} showAddCat={showAddCat} setShowAddCat={setShowAddCat}/>}
          {page==='lunch'&&<LunchPage {...P} lunchDate={lunchDate} setLunchDate={setLunchDate}/>}
          {page==='accounts'&&<AccountsPage {...P} setConfirm={setConfirm}/>}
          {page==='recurring'&&<RecurringPage {...P} setConfirm={setConfirm}/>}
          {page==='goals'&&<GoalsPage {...P} editGoal={editGoal} setEditGoal={setEditGoal} setConfirm={setConfirm}/>}
          {page==='calendar'&&<CalendarPage {...P}/>}
          {page==='search'&&<SearchPage {...P}/>}
          {page==='stats'&&<StatsPage {...P} sd={statsDate} setSd={setStatsDate}/>}
          {page==='history'&&<HistoryPage {...P} hd={histDate} setHd={setHistDate} setConfirm={setConfirm}/>}
          {page==='changelog'&&<ChangelogPage {...P} setConfirm={setConfirm}/>}
          {page==='settings'&&<SettingsPage {...P} setData={setData} setConfirm={setConfirm}/>}
        </div>
      </main>

      <nav className="mn" style={{position:'fixed',bottom:0,left:0,right:0,background:'linear-gradient(180deg,rgba(12,10,8,0) 0%,rgba(20,16,12,0.95) 14px,#161210 100%)',backdropFilter:'blur(8px)',borderTop:'1px solid var(--border)',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom)',boxShadow:'0 -2px 20px rgba(0,0,0,0.5)'}}>
        {nav.slice(0,4).map(n=><button key={n.id} onClick={()=>go(n.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'10px 0 8px',background:'none',border:'none',color:page===n.id?'var(--accent)':'var(--muted)',cursor:'pointer',fontSize:9,letterSpacing:'.06em',textTransform:'uppercase',position:'relative',fontFamily:'var(--mono)',fontWeight:500,transition:'color .2s'}}><span style={{fontSize:17,opacity:page===n.id?1:.75}}>{n.icon}</span>{n.label}{page===n.id&&<div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:18,height:2,borderRadius:0,background:'var(--accent)',boxShadow:'0 0 8px var(--accent)'}}/>}</button>)}
        <button onClick={()=>go(page==='more'?'home':'more')} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'10px 0 8px',background:'none',border:'none',color:['accounts','recurring','goals','stats','settings','calendar','search','changelog','more'].includes(page)?'var(--accent)':'var(--muted)',cursor:'pointer',fontSize:9,letterSpacing:'.06em',textTransform:'uppercase',fontFamily:'var(--mono)',fontWeight:500}}><span style={{fontSize:17,opacity:.75}}>⋯</span>Ещё</button>
      </nav>

      {page==='more'&&<div className="mn su" style={{position:'fixed',bottom:62,left:10,right:10,background:'linear-gradient(165deg,#1a1611,#0e0c08)',border:'1px solid var(--border2)',borderRadius:'var(--radius-lg)',padding:12,zIndex:99,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,boxShadow:'0 12px 40px rgba(0,0,0,0.5)'}}>
        {nav.slice(4).filter(n=>!n.hidden).map(n=><button key={n.id} onClick={()=>go(n.id)} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'14px 0',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',color:'var(--text-soft)',cursor:'pointer',fontSize:11,fontFamily:'var(--sans)'}}><span style={{fontSize:18,opacity:.85}}>{n.icon}</span>{n.label}</button>)}
      </div>}

      <button className="fab" onClick={()=>setQuickAdd(true)} style={{width:58,height:58,borderRadius:'50%',border:'none',background:'linear-gradient(160deg,#dcad53 0%,#c4922e 60%,#a87f25 100%)',color:'#1a140a',fontSize:30,fontWeight:300,cursor:'pointer',boxShadow:'0 1px 0 rgba(255,255,255,0.2) inset, 0 8px 28px rgba(212,165,75,0.45), 0 2px 8px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1,fontFamily:'var(--sans)',transition:'transform .2s'}}>+</button>

      {toast&&<div className="su" style={{position:'fixed',top:24,left:'50%',transform:'translateX(-50%)',background:'linear-gradient(165deg,#1d1913,#15120e)',border:'1px solid var(--border2)',borderRadius:'var(--radius-sm)',padding:'12px 24px',fontSize:13,color:'var(--text-soft)',zIndex:999,boxShadow:'0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,165,75,0.08)',fontFamily:'var(--sans)',letterSpacing:'0.01em'}}>{toast}</div>}
      {confirm&&<Confirm text={confirm.text} onYes={()=>{confirm.action();setConfirm(null)}} onNo={()=>setConfirm(null)}/>}
      {editTx&&<EditModal tx={editTx} allCats={cats} onSave={saveTx} onDelete={delTx} onClose={()=>setEditTx(null)} data={data} upd={upd} msg={msg}/>}
      {quickAdd&&<QuickAddModal data={data} allCats={cats} upd={upd} msg={msg} toR={toR} onClose={()=>setQuickAdd(false)}/>}
    </div>
  </>);
}

/* ═══════════════════ HOME ═══════════════════ */
function HomePage({data,cats,toR,go,setEditTx,upd,msg,setConfirm}) {
  const now=new Date();
  const calc=useMemo(()=>{
    const txs=getMTx(data.transactions,now);
    const expTxs=txs.filter(t=>t.type==='expense'&&t.cat!=='lunch');
    const isOblig=t=>(t.tags||[]).includes('постоянный')||!!t.recurringId;
    const obligSpent=expTxs.filter(isOblig).reduce((a,t)=>a+historicalRub(t,toR),0);
    const discSpent=expTxs.filter(t=>!isOblig(t)).reduce((a,t)=>a+historicalRub(t,toR),0);
    const spent=obligSpent+discSpent;
    const income=txs.filter(t=>t.type==='income').reduce((a,t)=>a+historicalRub(t,toR),0);
    const bal=income>0?income-spent:data.settings.budget-spent;
    const wN=countWd(now.getFullYear(),now.getMonth(),now.getDate());
    const dayOffSet=new Set(data.lunchDayOff||[]);
    const dayMod=data.lunchDayMod||{};
    let effectiveBudget=0;
    for(let d=1;d<=now.getDate();d++){
      if(!isWd(now.getFullYear(),now.getMonth(),d)) continue;
      const ds=dStr(new Date(now.getFullYear(),now.getMonth(),d));
      if(dayOffSet.has(ds)) continue;
      const ratio=dayMod[ds]!==undefined?dayMod[ds]:1;
      effectiveBudget+=data.settings.lunchDaily*ratio;
    }
    const lS=txs.filter(t=>t.cat==='lunch'&&!dayOffSet.has(t.date)).reduce((a,t)=>a+historicalRub(t,toR),0);
    const lD=effectiveBudget-lS, lNx=data.settings.lunchDaily+lD;
    const calcDR=d=>{const p=(d.payments||[]).reduce((s,pp)=>s+pp.amount,0);return toR(d.amount-p,d.currency||'RUB');};
    const myDebts=(data.debts||[]).filter(d=>d.type==='my'&&!d.closed);
    const toMeDebts=(data.debts||[]).filter(d=>d.type==='tome'&&!d.closed);
    const transitDebts=(data.debts||[]).filter(d=>d.type==='transit'&&!d.closed);
    const myD=myDebts.reduce((a,d)=>a+calcDR(d),0);
    const toMe=toMeDebts.reduce((a,d)=>a+calcDR(d),0);
    const transit=transitDebts.reduce((a,d)=>a+calcDR(d),0);
    return {txs,expTxs,obligSpent,discSpent,spent,income,bal,wN,dayOffSet,dayMod,effectiveBudget,lS,lD,lNx,myDebts,toMeDebts,transitDebts,myD,toMe,transit,isOblig};
  },[data.transactions,data.debts,data.recurring,data.settings,data.lunchDayOff,data.lunchDayMod,toR]);
  const {txs,expTxs,obligSpent,discSpent,spent,income,bal,wN,dayOffSet,dayMod,effectiveBudget,lS,lD,lNx,myDebts,toMeDebts,transitDebts,myD,toMe,transit,isOblig}=calc;
  const gT=(data.goals||[]).reduce((a,g)=>a+toR(g.saved||0,g.currency||'RUB'),0);
  const accs=data.accounts||[];
  const recent=[...txs].filter(t=>t.cat!=='lunch'&&t.type!=='lunch').sort((a,b)=>a.date!==b.date?(b.date>a.date?1:-1):(b.id||'').localeCompare(a.id||'')).slice(0,7);

  const [openDebt,setOpenDebt]=useState(null);
  const [payId,setPayId]=useState(null);
  const [payAmt,setPayAmt]=useState('');
  const [payNote,setPayNote]=useState('');
  const [editDebtId,setEditDebtId]=useState(null);
  const [edN,setEdN]=useState('');const [edA,setEdA]=useState('');const [edNo,setEdNo]=useState('');

  const addPay=did=>{const a=parseMoney(payAmt);if(!Number.isFinite(a)||a<=0)return;const debt=data.debts.find(x=>x.id===did);if(a>debt.amount-(debt.payments||[]).reduce((n,p)=>n+p.amount,0)){msg('Сумма больше остатка долга');return;}upd(d=>({...d,debts:d.debts.map(debt=>{if(debt.id!==did)return debt;const ps=[...(debt.payments||[]),{id:uid(),amount:a,date:today(),note:payNote}];return{...debt,payments:ps,closed:ps.reduce((s,p)=>s+p.amount,0)>=debt.amount};})}));setPayAmt('');setPayNote('');setPayId(null);msg('✓ Платёж записан');};
  const delDebt=id=>setConfirm({text:'Удалить запись?',action:()=>{upd(d=>{const debt=d.debts.find(x=>x.id===id);const hist=debt?[{id:uid(),type:'delete_debt',ts:Date.now(),before:debt},...(d.history||[])].slice(0,50):(d.history||[]);return {...d,debts:d.debts.filter(x=>x.id!==id),history:hist};});msg('✓ Удалено');}});
  const startEd=d=>{setEditDebtId(d.id);setEdN(d.person);setEdA(String(d.amount));setEdNo(d.note||'');};
  const saveEd=id=>{const a=parseMoney(edA);if(!Number.isFinite(a)||a<=0||!edN.trim())return;upd(d=>({...d,debts:d.debts.map(x=>x.id===id?{...x,person:edN.trim(),amount:a,note:edNo}:x)}));setEditDebtId(null);msg('✓ Обновлено');};

  const renderDebts=(debts,type)=>{
    if(debts.length===0) return <div style={{padding:'12px 0',textAlign:'center',color:'var(--muted)',fontSize:13}}>{type==='my'?'Нет долгов':type==='tome'?'Никто не должен':'Нет транзитов'}</div>;
    return debts.map(debt=>{
      const paid=(debt.payments||[]).reduce((s,p)=>s+p.amount,0),rem=debt.amount-paid,pct=Math.round(paid/debt.amount*100);
      const sym=curSym(debt.currency||'RUB'),isPO=payId===debt.id,isE=editDebtId===debt.id;
      const cMain=type==='my'?'var(--danger)':type==='tome'?'var(--success)':'var(--accent)';
      const cBar=type==='my'?'var(--warning)':type==='tome'?'var(--success)':'var(--accent)';
      if(isE) return <div key={debt.id} style={{padding:'12px 0',borderBottom:'0.5px solid var(--border)'}}>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <input value={edN} onChange={e=>setEdN(e.target.value)} placeholder="Имя" style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:13}}/>
          <div style={{display:'flex',gap:8}}>
            <input type="number" value={edA} onChange={e=>setEdA(e.target.value)} placeholder="Сумма" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:13}}/>
            <input value={edNo} onChange={e=>setEdNo(e.target.value)} placeholder="Заметка" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:13}}/>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>saveEd(debt.id)} style={{flex:1,background:'var(--accent)',border:'none',borderRadius:8,padding:8,color:'#07080a',fontWeight:600,fontSize:12,cursor:'pointer'}}>Сохранить</button>
            <button onClick={()=>setEditDebtId(null)} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>✕</button>
          </div>
        </div>
      </div>;
      return <div key={debt.id} style={{padding:'12px 0',borderBottom:'0.5px solid var(--border)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div><div style={{fontSize:13,fontWeight:500}}>{debt.person}</div><div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2}}>{dDisp(debt.date)}{debt.note?` · ${debt.note}`:''}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:700,color:cMain}}>{fN(rem)} {sym}</div>{paid>0&&<div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)'}}>из {fN(debt.amount)}</div>}</div>
        </div>
        {paid>0&&<div style={{background:'var(--s3)',borderRadius:99,height:4,overflow:'hidden',margin:'8px 0'}}><div style={{height:'100%',width:pct+'%',background:cBar,borderRadius:99}}/></div>}
        <div style={{display:'flex',gap:6,marginTop:6}}>
          <button onClick={()=>setPayId(isPO?null:debt.id)} style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:6,color:'var(--text)',fontSize:11,cursor:'pointer'}}>{isPO?'Скрыть':'+ Платёж'}</button>
          <button onClick={()=>startEd(debt)} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✏️</button>
          <button onClick={()=>delDebt(debt.id)} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✕</button>
        </div>
        {isPO&&<div style={{marginTop:10}}>
          {(debt.payments||[]).length>0&&<div style={{marginBottom:8}}>{debt.payments.map(p=><div key={p.id} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--muted)',padding:'3px 0'}}><span>{dDisp(p.date)}{p.note?` · ${p.note}`:''}</span><span style={{fontFamily:'var(--mono)',color:'var(--success)'}}>+{fN(p.amount)} {sym}</span></div>)}</div>}
          <div style={{display:'flex',gap:6}}>
            <input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)} placeholder="Сумма" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:7,color:'var(--text)',fontSize:12}}/>
            <input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="Заметка" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:7,color:'var(--text)',fontSize:12}}/>
            <button onClick={()=>addPay(debt.id)} style={{background:'var(--success)',border:'none',borderRadius:8,padding:'7px 12px',color:'#07080a',fontWeight:600,fontSize:12,cursor:'pointer'}}>✓</button>
          </div>
        </div>}
      </div>;
    });
  };

  const widgets=data.settings.homeWidgets||{today:true,week:true,accounts:true,lunch:true,debts:true,goals:true,recent:true};
  const isShown=k=>widgets[k]!==false;

  return <div>
    <PH title="Финансы" sub={MONTHS[now.getMonth()]+' '+now.getFullYear()}/>
    <QuickEntry data={data} cats={cats} upd={upd} msg={msg}/>
    {data.migrationWarnings?.length>0&&<Card><div style={{color:'var(--warning)'}}>Старые валютные операции требуют сверки: {data.migrationWarnings.length}. Остатки перенесены без пересчёта.</div></Card>}
    {(()=>{
      const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const pending=(data.recurring||[]).filter(r=>r.active&&r.lastCreated!==monthKey);
      const tdyDay=now.getDate();
      const showReminder=pending.length>0;
      if(!showReminder) return null;
      return <Card style={{borderLeft:'4px solid var(--danger)',background:'linear-gradient(135deg,#d45b4f12,var(--s1))',cursor:'pointer'}} onClick={()=>go('recurring')}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
          <span style={{fontSize:22}}>⚠️</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:'var(--danger)'}}>Введи суммы за {MONTHS[now.getMonth()]}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{pending.map(r=>r.name).join(', ')}</div>
          </div>
          <span style={{color:'var(--danger)',fontSize:14}}>→</span>
        </div>
      </Card>;
    })()}
    {isShown('today')&&(()=>{
      const tdy=today();
      const todayTxs=txs.filter(t=>t.date===tdy);
      const todaySpent=todayTxs.filter(t=>t.type==='expense').reduce((a,t)=>a+historicalRub(t,toR),0);
      const todayCount=todayTxs.filter(t=>t.type==='expense').length;
      const yest=dStr(new Date(Date.now()-86400000));
      const yestSpent=data.transactions.filter(t=>t.date===yest&&t.type==='expense').reduce((a,t)=>a+historicalRub(t,toR),0);
      if(todayCount===0&&yestSpent===0) return null;
      return <Card accent="#5b9fd4" style={{padding:'14px 18px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.08em'}}>Сегодня</div>
            <div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:todaySpent>0?'var(--text)':'var(--muted2)',marginTop:2}}>{todaySpent>0?fmt(todaySpent):'—'}</div>
            <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2}}>{todayCount} {todayCount===1?'операция':todayCount<5?'операции':'операций'}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.08em'}}>Вчера</div>
            <div style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:600,color:'var(--muted)',marginTop:2}}>{yestSpent>0?fmt(yestSpent):'—'}</div>
          </div>
        </div>
      </Card>;
    })()}
    <Card style={{padding:0,overflow:'hidden'}} accent="#cc5a4a">
      <div style={{padding:'18px 20px 20px',borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12}}>
          <span style={LS}>Расходы за месяц</span>
          <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--muted2)'}}>{spent>0?'итого':''}</span>
        </div>
        <div className="num-display" style={{fontSize:24,fontWeight:700,color:'var(--danger)',marginTop:6,lineHeight:1}}>{fmt(spent)}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
        <div style={{padding:'14px 18px',borderRight:'1px solid var(--border)'}}>
          <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.14em',display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:11}}>🔁</span> Обязательные</div>
          <div className="num-display" style={{fontSize:16,fontWeight:700,marginTop:6,color:'var(--warning)'}}>{fmt(obligSpent)}</div>
          <div style={{fontSize:10,color:'var(--muted2)',fontFamily:'var(--sans)',marginTop:3}}>{spent>0?Math.round(obligSpent/spent*100):0}% от всех</div>
        </div>
        <div style={{padding:'14px 18px'}}>
          <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.14em',display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:11}}>💸</span> Свободные</div>
          <div className="num-display" style={{fontSize:16,fontWeight:700,marginTop:6,color:'var(--text)'}}>{fmt(discSpent)}</div>
          <div style={{fontSize:10,color:'var(--muted2)',fontFamily:'var(--sans)',marginTop:3}}>{spent>0?Math.round(discSpent/spent*100):0}% от всех</div>
        </div>
      </div>
    </Card>
    <Card accent={bal>=0?"#79b87a":"#cc5a4a"} glow={bal>=0?'var(--glow-success)':'var(--glow-danger)'}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={LS}>Результат месяца</div>
          <div className="num-display" style={{fontSize:22,fontWeight:700,color:bal>=0?'var(--success)':'var(--danger)',marginTop:4,lineHeight:1}}>{fmt(bal)}</div>
        </div>
        {(()=>{
          const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
          const dayOfMonth=now.getDate();
          if(dayOfMonth<3||spent===0) return null;
          // Forecast: extrapolate from current pace (excluding obligatory which are fixed)
          const dailyRate=discSpent/dayOfMonth;
          const projDisc=dailyRate*dim;
          const fixedRest=(data.recurring||[]).filter(r=>r.active&&!r.variable&&r.dueDay>dayOfMonth&&r.lastCreated!==`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`).reduce((a,r)=>a+r.amount,0);
          const projTotal=obligSpent+projDisc+fixedRest;
          const projBal=income>0?income-projTotal:data.settings.budget-projTotal;
          const willOverspend=data.settings.budget>0&&projTotal>data.settings.budget;
          return <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.08em'}}>Прогноз к {dim} числу</div>
            <div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:600,marginTop:4,color:willOverspend?'var(--danger)':projBal>=0?'var(--accent)':'var(--warning)'}}>~ {fmt(projTotal)}</div>
            {data.settings.budget>0&&<div style={{fontSize:10,color:willOverspend?'var(--danger)':'var(--muted)',fontFamily:'var(--mono)',marginTop:2}}>{willOverspend?'⚠️ перерасход':'в бюджете'}</div>}
          </div>;
        })()}
      </div>
    </Card>
    {income>0&&<Card accent="#4fd48a"><div style={LS}>Доход за месяц</div><div style={{fontFamily:'var(--mono)',fontSize:18,fontWeight:700,color:'var(--success)',marginTop:4}}>{fmt(income)}</div></Card>}

    {isShown('week')&&(()=>{
      const week=Array.from({length:7},(_,i)=>{
        const d=new Date();d.setDate(d.getDate()-(6-i));
        const ds=dStr(d);
        const v=data.transactions.filter(t=>t.date===ds&&t.type==='expense').reduce((a,t)=>a+historicalRub(t,toR),0);
        return {day:WDAYS[d.getDay()],date:ds,value:v,isToday:i===6};
      });
      const wkTotal=week.reduce((a,d)=>a+d.value,0);
      const max=Math.max(...week.map(d=>d.value),1);
      if(wkTotal===0) return null;
      return <Card>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
          <span style={LS}>За 7 дней</span>
          <span style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:'var(--text)'}}>{fmt(wkTotal)}</span>
        </div>
        <div style={{display:'flex',gap:6,height:80,alignItems:'flex-end'}}>{week.map(d=><div key={d.date} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
          <div style={{flex:1,width:'100%',display:'flex',alignItems:'flex-end'}}>
            <div style={{width:'100%',height:`${(d.value/max)*100}%`,minHeight:d.value>0?4:0,background:d.isToday?'linear-gradient(180deg,var(--accent),#c4922e)':'linear-gradient(180deg,var(--danger),#a8423a)',borderRadius:'4px 4px 0 0',transition:'height .6s'}}/>
          </div>
          <div style={{fontSize:10,fontFamily:'var(--mono)',color:d.isToday?'var(--accent)':'var(--muted)',fontWeight:d.isToday?700:400}}>{d.day}</div>
        </div>)}</div>
      </Card>;
    })()}

    {(isShown('accounts')||isShown('lunch'))&&<div className="home-grid">
      {isShown('accounts')&&accs.length>0&&<Card accent="#5b9fd4" onClick={()=>go('accounts')} style={{cursor:'pointer'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontSize:14,fontWeight:600}}>🏦 Счета</span>
          <span style={{fontSize:11,color:'var(--accent2)',fontFamily:'var(--mono)'}}>подробнее →</span>
        </div>
        <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:4}}>
          {accs.map(acc=><div key={acc.id} style={{flexShrink:0,minWidth:100}}>
            <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',whiteSpace:'nowrap'}}>{acc.icon} {acc.name}{acc.accType==='savings'?' 🐷':''}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,marginTop:2,color:acc.balance>=0?'var(--text)':'var(--danger)'}}>{fN(acc.balance)} {curSym(acc.currency||'RUB')}</div>
          </div>)}
        </div>
      </Card>}
      {isShown('lunch')&&<Card accent="#d4a04f" onClick={()=>go('lunch')} style={{cursor:'pointer'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontSize:14,fontWeight:600}}>🍱 Обеды</span>
          <span style={{fontSize:11,color:'var(--accent)',fontFamily:'var(--mono)'}}>таблица →</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Потрачено</div><div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:700,marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fN(lS)} ₽</div></div>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Баланс</div><div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:700,marginTop:3,color:lD>=0?'var(--success)':'var(--danger)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{lD>=0?'+':''}{fN(lD)} ₽</div></div>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Завтра</div><div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:700,marginTop:3,color:lNx>=data.settings.lunchDaily?'var(--success)':'var(--warning)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fN(Math.max(0,lNx))} ₽</div></div>
        </div>
      </Card>}
    </div>}

    {isShown('debts')&&(myD>0||toMe>0||transit>0||myDebts.length>0||toMeDebts.length>0||transitDebts.length>0)&&<>
      <div style={{...LS,marginTop:18,marginBottom:10}}>Долги</div>
      <div className="home-grid">
        <Card style={{padding:0,overflow:'hidden'}}>
          <div onClick={()=>setOpenDebt(openDebt==='my'?null:'my')} style={{padding:'14px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:openDebt==='my'?'0.5px solid var(--border)':'none'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:34,height:34,borderRadius:10,background:'var(--danger-dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>📤</div>
              <div><div style={{fontSize:13,fontWeight:500}}>Я должен</div><div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)'}}>{myDebts.length} зап.</div></div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:myD>0?'var(--danger)':'var(--muted)'}}>{myD>0?fN(myD)+' ₽':'—'}</span>
              <span style={{color:'var(--muted)',fontSize:12,transform:openDebt==='my'?'rotate(180deg)':'rotate(0)'}}>▾</span>
            </div>
          </div>
          {openDebt==='my'&&<div style={{padding:'0 16px'}}>{renderDebts(myDebts,'my')}</div>}
        </Card>
        <Card style={{padding:0,overflow:'hidden'}}>
          <div onClick={()=>setOpenDebt(openDebt==='tome'?null:'tome')} style={{padding:'14px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:openDebt==='tome'?'0.5px solid var(--border)':'none'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:34,height:34,borderRadius:10,background:'var(--success-dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>📥</div>
              <div><div style={{fontSize:13,fontWeight:500}}>Мне должны</div><div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)'}}>{toMeDebts.length} зап.</div></div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:toMe>0?'var(--success)':'var(--muted)'}}>{toMe>0?fN(toMe)+' ₽':'—'}</span>
              <span style={{color:'var(--muted)',fontSize:12,transform:openDebt==='tome'?'rotate(180deg)':'rotate(0)'}}>▾</span>
            </div>
          </div>
          {openDebt==='tome'&&<div style={{padding:'0 16px'}}>{renderDebts(toMeDebts,'tome')}</div>}
        </Card>
      </div>
      {transitDebts.length>0&&<Card style={{padding:0,overflow:'hidden'}}>
        <div onClick={()=>setOpenDebt(openDebt==='transit'?null:'transit')} style={{padding:'14px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:openDebt==='transit'?'0.5px solid var(--border)':'none'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>⇄</div>
            <div><div style={{fontSize:13,fontWeight:500}}>Транзит</div><div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)'}}>через меня · не влияет на баланс</div></div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:'var(--accent)'}}>{fN(transit)} ₽</span>
            <span style={{color:'var(--muted)',fontSize:12,transform:openDebt==='transit'?'rotate(180deg)':'rotate(0)'}}>▾</span>
          </div>
        </div>
        {openDebt==='transit'&&<div style={{padding:'0 16px'}}>{renderDebts(transitDebts,'transit')}</div>}
      </Card>}
    </>}

    {isShown('goals')&&gT>0&&<Card onClick={()=>go('goals')}><div style={LS}>Отложено на цели</div><div style={{fontFamily:'var(--mono)',fontSize:17,fontWeight:700,color:'var(--accent)',marginTop:4}}>{fmt(gT)}</div></Card>}

    {isShown('recent')&&<><div style={{...LS,marginTop:22,marginBottom:10}}>Последние операции</div>
    <Card style={{padding:'4px 16px'}}>{recent.length===0?<Empty icon="🧾" text="Пока нет операций" hint="Нажми + чтобы добавить первую"/>:recent.map(t=><TxRow key={t.id} t={t} allCats={cats} accounts={accs} onClick={()=>setEditTx(t)}/>)}</Card></>}
  </div>;
}

/* ═══════════════════ LUNCH ═══════════════════ */
function LunchPage({data,upd,msg,toR,go,lunchDate,setLunchDate,setEditTx}) {
  const y=lunchDate.getFullYear(),m=lunchDate.getMonth();
  const txs=getMTx(data.transactions,lunchDate);
  const dayOffSet=new Set(data.lunchDayOff||[]);
  const dayMod=data.lunchDayMod||{};
  const rows=buildLunchTable(txs,y,m,data.settings.lunchDaily,dayOffSet,dayMod);
  const past=rows.filter(r=>r.past&&!r.isOff);
  const tSpent=past.reduce((a,r)=>a+(r.spent||0),0);
  // Budget: account for partial days
  const tBudget=past.reduce((a,r)=>a+r.limit,0);
  const tDelta=tBudget-tSpent;
  const offCount=rows.filter(r=>r.isOff&&r.past).length;
  const partialCount=rows.filter(r=>r.isPartial&&r.past).length;
  const last=rows.filter(r=>r.past).slice(-1)[0];
  const tc={fontSize:12,fontFamily:'var(--mono)',padding:'9px 4px',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',textAlign:'right'};
  const th={...tc,color:'var(--muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:500,background:'var(--s2)'};
  const [menuRow,setMenuRow]=useState(null);

  const setDayStatus=(date,ratio)=>{
    upd(d=>{
      const offList=d.lunchDayOff||[];
      const modObj={...(d.lunchDayMod||{})};
      let newOff=offList;
      if(ratio===0){
        // Mark as off
        if(!offList.includes(date)) newOff=[...offList,date];
        delete modObj[date];
      } else if(ratio===1){
        // Restore full day
        newOff=offList.filter(x=>x!==date);
        delete modObj[date];
      } else {
        // Partial day
        newOff=offList.filter(x=>x!==date);
        modObj[date]=ratio;
      }
      return {...d,lunchDayOff:newOff,lunchDayMod:modObj};
    });
    setMenuRow(null);
    if(ratio===0)msg('☼ Отгул');
    else if(ratio===1)msg('✓ Полный день');
    else msg(`⏰ Доля: ${Math.round(ratio*100)}%`);
  };

  const handleRowClick=(r)=>{
    if(r.past&&!r.fut)setMenuRow(menuRow===r.date?null:r.date);
  };

  return <div>
    <PH title="🍱 Обеды"/>
    <MN date={lunchDate} onChange={d=>setLunchDate(new Date(y,m+d,1))}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:16}}>
      <Card style={{marginBottom:0,padding:'12px 10px'}}><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Потрачено</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,marginTop:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fN(tSpent)} ₽</div></Card>
      <Card style={{marginBottom:0,padding:'12px 10px'}}><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Бюджет</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,marginTop:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fN(tBudget)} ₽</div></Card>
      <Card style={{marginBottom:0,padding:'12px 10px'}} accent={tDelta>=0?"#4fd48a":"#d45b4f"}><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Итого</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,marginTop:4,color:tDelta>=0?'var(--success)':'var(--danger)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tDelta>=0?'+':''}{fN(tDelta)} ₽</div></Card>
    </div>
    {last&&<Card accent={last.cum>=0?"#4fd48a":"#d45b4f"}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:12,color:'var(--muted)'}}>Следующий рабочий день</div><div style={{fontFamily:'var(--mono)',fontSize:24,fontWeight:700,marginTop:4,color:last.cum>=0?'var(--success)':'var(--danger)'}}>{fN(Math.max(0,data.settings.lunchDaily+last.cum))} ₽</div></div>
        <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)'}}>{last.cum>=0?'ПРОФИЦИТ':'ДЕФИЦИТ'}</div><div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:last.cum>=0?'var(--success)':'var(--danger)'}}>{last.cum>=0?'+':''}{fN(last.cum)} ₽</div></div>
      </div>
    </Card>}
    <Card style={{padding:0,overflow:'hidden'}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:380}}>
          <thead><tr>
            <td style={{...th,textAlign:'left'}}>Дата</td>
            <td style={{...th,textAlign:'center'}}>День</td><td style={th}>Доступно</td><td style={th}>Потрачено</td><td style={th}>±День</td>
            <td style={th}>Баланс</td>
          </tr></thead>
          <tbody>{rows.map(r=>{
            const f=r.fut;
            const off=r.isOff;
            const partial=r.isPartial;
            return <tr key={r.day} style={{background:r.isToday?'var(--s2)':off?'#5b9fd408':partial?'#d4a04f0a':'transparent',cursor:r.past&&!r.fut?'pointer':'default'}} onClick={()=>handleRowClick(r)}>
              <td style={{...tc,textAlign:'left',fontWeight:r.isToday?700:400,color:off?'var(--accent2)':partial?'var(--warning)':f?'var(--muted2)':'var(--text)'}}>{r.isToday?'▸ ':off?'☼ ':partial?'⏰ ':''}{r.day}</td>
              <td style={{...tc,textAlign:'center',color:off?'var(--accent2)':partial?'var(--warning)':f?'var(--muted2)':'var(--muted)'}}>{r.dow}</td>
              <td style={{...tc,color:off?'var(--muted2)':partial?'var(--warning)':f?'var(--muted2)':'var(--muted)',fontStyle:off?'italic':'normal'}}>{off?'отгул':partial?`${Math.round(r.ratio*100)}%`:f?fN(r.limit):fN(r.avail)}</td>
              <td style={{...tc,color:off?'var(--muted2)':f?'var(--muted2)':r.spent>0?'var(--text)':'var(--muted2)',fontWeight:r.spent>0?600:400}}>{off?'—':r.spent!==null?(r.spent>0?fN(r.spent):'—'):'·'}</td>
              <td style={{...tc,color:r.delta===null?'var(--muted2)':r.delta>0?'var(--success)':r.delta<0?'var(--danger)':'var(--muted)',fontWeight:600}}>{off?'·':r.delta!==null?(r.delta>0?'+':r.delta<0?'':'±')+fN(r.delta):'·'}</td>
              <td style={{...tc,fontWeight:700,fontSize:13,color:f?'var(--muted2)':r.cum>0?'var(--success)':r.cum<0?'var(--danger)':'var(--muted)'}}>{f?'·':(r.cum>0?'+':r.cum<0?'':'±')+fN(r.cum)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </Card>
    {menuRow&&(()=>{
      const r=rows.find(x=>x.date===menuRow);
      if(!r) return null;
      const isOff=r.isOff;
      const ratio=r.ratio;
      // Convert ratio to arrival time (assuming 9:00–18:00 = 9hrs work day)
      // ratio 1.0 = 9:00 (full day), 0.5 = 13:30 (half), 0 = "didn't come"
      const ratioToTime=rt=>{
        if(rt<=0) return '';
        if(rt>=1) return '09:00';
        const minsLate=Math.round((1-rt)*9*60);
        const totalMins=9*60+minsLate;
        const h=Math.floor(totalMins/60);
        const mm=totalMins%60;
        return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      };
      const timeToRatio=t=>{
        if(!t||!/^\d{2}:\d{2}$/.test(t)) return 1;
        const [h,mm]=t.split(':').map(Number);
        const arrived=h*60+mm;
        const startWork=9*60; // 9:00
        const endWork=18*60; // 18:00
        if(arrived<=startWork) return 1;
        if(arrived>=endWork) return 0;
        const remaining=endWork-arrived;
        const fullDay=endWork-startWork;
        return Math.max(0,Math.min(1,remaining/fullDay));
      };
      const currentTime=isOff?'':ratioToTime(ratio);
      const [tempTime,setTempTime]=[currentTime,()=>{}]; // we'll use a controlled input below
      
      return <Card style={{borderLeft:'3px solid var(--accent2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{fontSize:22}}>{isOff?'☼':r.isPartial?'⏰':'📅'}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600}}>{r.day} {MONTHS[m]}, {r.dow}</div>
            <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {isOff?'Отгул':r.isPartial?`${Math.round(ratio*100)}% дня · бюджет ${fN(r.limit)} ₽`:`Полный день · бюджет ${fN(data.settings.lunchDaily)} ₽`}
              {r.spent>0?` · потрачено ${fN(r.spent)} ₽`:''}
            </div>
          </div>
          <button onClick={()=>setMenuRow(null)} style={{background:'var(--s3)',border:'none',color:'var(--muted)',width:28,height:28,borderRadius:7,cursor:'pointer',fontSize:14,flexShrink:0}}>×</button>
        </div>
        {r.txs.length>0&&<div style={{marginBottom:14}}><Btn variant="ghost" onClick={()=>{setMenuRow(null);setEditTx(r.txs[0]);}} style={{padding:10,fontSize:13}}>✏️ Изменить запись обеда</Btn></div>}
        
        <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.08em',marginBottom:10}}>Время прихода</div>
        
        {/* Time picker */}
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <input
            type="time"
            value={isOff?'':currentTime}
            onChange={e=>{
              const newRatio=timeToRatio(e.target.value);
              setDayStatus(r.date,newRatio);
            }}
            style={{
              flex:1,background:'var(--s2)',
              border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)',padding:'12px 14px',
              color:'var(--text)',fontFamily:'var(--mono)',fontSize:18,
              outline:'none',textAlign:'center',letterSpacing:'.05em',
              colorScheme:'dark'
            }}
          />
          <div style={{textAlign:'center',padding:'0 12px',minWidth:80}}>
            <div className="num-display" style={{fontSize:18,color:isOff?'var(--muted2)':ratio>=1?'var(--success)':'var(--warning)',fontWeight:700}}>{isOff?'0%':Math.round(ratio*100)+'%'}</div>
            <div style={{fontSize:9,color:'var(--muted2)',fontFamily:'var(--mono)',textTransform:'uppercase',marginTop:2}}>бюджета</div>
          </div>
        </div>
        
        {/* Quick presets */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {[
            {l:'9:00',v:'09:00',hint:'полный'},
            {l:'10:00',v:'10:00',hint:'-1ч'},
            {l:'11:00',v:'11:00',hint:'-2ч'},
            {l:'13:00',v:'13:00',hint:'полдня'},
            {l:'15:00',v:'15:00',hint:'к концу'},
          ].map(p=>{
            const pRatio=timeToRatio(p.v);
            const isCur=!isOff&&Math.abs(ratio-pRatio)<0.01;
            return <button key={p.v} onClick={()=>setDayStatus(r.date,pRatio)} style={{
              flex:'1 1 calc(33.333% - 4px)',
              background:isCur?'var(--accent-dim)':'var(--s2)',
              border:`1px solid ${isCur?'var(--accent)':'var(--border)'}`,
              borderRadius:'var(--radius-sm)',padding:'8px 4px',
              color:isCur?'var(--accent)':'var(--text-soft)',
              fontSize:12,cursor:'pointer',
              fontFamily:'var(--sans)',fontWeight:isCur?600:500,
              transition:'all .15s'
            }}>
              <div style={{fontFamily:'var(--mono)',fontSize:12}}>{p.l}</div>
              <div style={{fontSize:9,color:'var(--muted2)',marginTop:1}}>{p.hint}</div>
            </button>;
          })}
        </div>
        
        {/* Day off button */}
        <button onClick={()=>setDayStatus(r.date,0)} style={{
          width:'100%',
          background:isOff?'var(--accent-dim)':'transparent',
          border:`1px solid ${isOff?'var(--accent)':'var(--border)'}`,
          borderRadius:'var(--radius-sm)',padding:'10px',
          color:isOff?'var(--accent)':'var(--muted)',
          fontSize:12,cursor:'pointer',
          fontFamily:'var(--sans)',fontWeight:isOff?600:500,
          display:'flex',alignItems:'center',justifyContent:'center',gap:8
        }}>
          ☼ {isOff?'✓ Отгул отмечен':'Отметить отгулом'}
        </button>
        
        <div style={{fontSize:10,color:'var(--muted)',marginTop:12,lineHeight:1.5,fontFamily:'var(--sans)'}}>💡 Рабочий день 9:00–18:00. Лимит обеда уменьшится пропорционально</div>
      </Card>;
    })()}
    <div style={{fontSize:11,color:'var(--muted)',padding:'4px 8px',lineHeight:1.7}}>Нажми на день чтобы изменить статус{offCount>0||partialCount>0?` · ${offCount?offCount+' отгул'+(offCount===1?'':offCount<5?'а':'ов'):''}${offCount&&partialCount?', ':''}${partialCount?partialCount+' непол.':''}`:''}</div>
  </div>;
}

/* ═══════════════════ ADD ═══════════════════ */
function AddPage({data,upd,cats,msg,toR,go,showAddCat,setShowAddCat}) {
  const [type,setType]=useState('expense');
  const [amount,setAmt]=useState('');
  const [currency,setCur]=useState('RUB');
  const [cat,setCat]=useState('food');
  const [note,setNote]=useState('');
  const [date,setDt]=useState(()=>today());
  const [tags,setTags]=useState([]);
  const [tagInput,setTagInput]=useState('');
  const [accId,setAccId]=useState('');
  const [debtDir,setDebtDir]=useState('my');
  const [debtPerson,setDebtPerson]=useState('');
  const [ncN,setNcN]=useState('');const [ncI,setNcI]=useState('📌');const [ncC,setNcC]=useState('#d4a54b');
  const setDate=d=>{setDt(d);localStorage.setItem('finance-last-date',d);};
  const accounts=data.accounts||[];
  const existing=data.transactions.find(t=>t.cat==='lunch'&&t.date===date);
  const allTags=[...new Set((data.transactions||[]).flatMap(t=>(t.tags||[]).filter(tg=>tg!=='постоянный')))].slice(0,10);
  const recentNotes=[...new Set((data.transactions||[]).filter(t=>t.note&&t.note.trim()&&t.note!==cats.find(c=>c.id===t.cat)?.name).slice().reverse().map(t=>t.note.trim()))].slice(0,8);
  const filteredNotes=note.trim()?recentNotes.filter(n=>n.toLowerCase().includes(note.toLowerCase())&&n!==note).slice(0,5):recentNotes.slice(0,8);

  const addTag=()=>{const t=tagInput.trim();if(t&&!tags.includes(t))setTags([...tags,t]);setTagInput('');};
  const removeTag=t=>setTags(tags.filter(x=>x!==t));
  const add=()=>{
    const a=parseMoney(amount);if(!a||a<=0){msg('Введи сумму');return;}
    if(type==='debt'){
      if(!debtPerson.trim()){msg('Введи имя');return;}
      if(!note.trim()){msg('Опиши за что');return;}
      upd(d=>({...d,debts:[...(d.debts||[]),{id:uid(),type:debtDir,person:debtPerson.trim(),amount:a,currency,note,date,payments:[],closed:false}]}));
      setAmt('');setNote('');setDebtPerson('');msg('✓ Добавлено');return;
    }
    
    if(type!=='lunch'&&accounts.length>0&&!accId){msg('Выбери счёт');return;}
    const cid=type==='lunch'?'lunch':type==='income'?'income':cat;
    try {
      upd(d=>putTransaction(d,{...(type==='lunch'&&existing?existing:{}),type:type==='lunch'?'lunch':type==='income'?'income':'expense',cat:cid,amount:a,currency,note:note.trim()||(type==='lunch'?'Обед':cats.find(c=>c.id===cid)?.name||'Доход'),date,tags:[...tags],accountId:type==='lunch'?undefined:accId||undefined}));
      setAmt('');setNote('');setTags([]);msg('✓ Добавлено');
    } catch(e) {msg(e.message);}

  };
  const addC=()=>{if(!ncN.trim())return;const id='c_'+uid();upd(d=>({...d,customCats:[...(d.customCats||[]),{id,name:ncN.trim(),icon:ncI,color:ncC}]}));setCat(id);setNcN('');setShowAddCat(false);msg('✓ Добавлена');};

  // Recent widget filters — toggleable chips, persisted in localStorage
  const [recentFilters,setRecentFilters]=useState(()=>{
    try{const s=localStorage.getItem('finance-recent-filters');if(s) return JSON.parse(s);}catch(e){}
    return {expense:true,income:true,lunch:true,debt:true};
  });
  const toggleRecentFilter=k=>{
    const next={...recentFilters,[k]:!recentFilters[k]};
    setRecentFilters(next);
    try{localStorage.setItem('finance-recent-filters',JSON.stringify(next));}catch(e){}
  };

  return <div><PH title="Добавить"/>
    {(()=>{
      const allTxs=[...(data.transactions||[])];
      const expenses=recentFilters.expense?allTxs.filter(t=>t.cat!=='lunch'&&t.type!=='lunch'&&(t.type==='expense'||(!t.type))).sort((a,b)=>a.date!==b.date?(b.date>a.date?1:-1):(b.id||'').localeCompare(a.id||'')).slice(0,5):[];
      const incomes=recentFilters.income?allTxs.filter(t=>t.type==='income').sort((a,b)=>a.date!==b.date?(b.date>a.date?1:-1):(b.id||'').localeCompare(a.id||'')).slice(0,3):[];
      const lunches=recentFilters.lunch?allTxs.filter(t=>t.cat==='lunch'||t.type==='lunch').sort((a,b)=>a.date!==b.date?(b.date>a.date?1:-1):(b.id||'').localeCompare(a.id||'')).slice(0,3):[];
      const recentDebts=recentFilters.debt?[...(data.debts||[])].sort((a,b)=>a.date!==b.date?(b.date>a.date?1:-1):0).slice(0,3):[];
      
      const totalShown=expenses.length+incomes.length+lunches.length+recentDebts.length;
      const anyDataExists=(data.transactions||[]).length>0||(data.debts||[]).length>0;
      if(!anyDataExists) return null;
      
      const Chip=({k,label,color})=><button onClick={()=>toggleRecentFilter(k)} style={{
        background:recentFilters[k]?color+'25':'var(--s2)',
        border:`1px solid ${recentFilters[k]?color+'66':'var(--border)'}`,
        color:recentFilters[k]?color:'var(--muted)',
        padding:'5px 11px',borderRadius:99,fontSize:11,
        cursor:'pointer',fontFamily:'var(--mono)',
        fontWeight:600,letterSpacing:'.02em',
        transition:'all .15s'
      }}>{label}</button>;
      
      const sectionHeader=(label,count,color)=><div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',padding:'10px 0 6px',marginTop:4,borderTop:'1px solid var(--border)'}}>
        <span style={{fontSize:10,fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'.12em',color,fontWeight:600}}>{label}</span>
        <span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--muted2)'}}>{count}</span>
      </div>;
      
      return <Card accent="#7a9fb8" style={{padding:'14px 16px 6px',marginBottom:18}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <span style={{...LS,marginBottom:0,color:'var(--accent2)'}}>Последние транзакции</span>
          <span style={{fontFamily:'var(--sans)',fontSize:11,color:'var(--muted)'}}>для сверки</span>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',paddingBottom:10,borderBottom:'1px solid var(--border)',marginBottom:0}}>
          <Chip k="expense" label="Расходы" color="#cc5a4a"/>
          <Chip k="income" label="Доходы" color="#79b87a"/>
          <Chip k="lunch" label="Обеды" color="#d99948"/>
          <Chip k="debt" label="Долги" color="#d4a54b"/>
        </div>
        {totalShown===0&&<div style={{padding:'18px 8px',textAlign:'center',color:'var(--muted)',fontSize:12,fontFamily:'var(--sans)'}}>Включи хотя бы один тип сверху</div>}
        {expenses.length>0&&<>
          {sectionHeader('Расходы',expenses.length,'var(--danger)')}
          {expenses.map(t=><TxRow key={t.id} t={t} allCats={cats} accounts={data.accounts||[]} />)}
        </>}
        {incomes.length>0&&<>
          {sectionHeader('Доходы',incomes.length,'var(--success)')}
          {incomes.map(t=><TxRow key={t.id} t={t} allCats={cats} accounts={data.accounts||[]} />)}
        </>}
        {lunches.length>0&&<>
          {sectionHeader('Обеды',lunches.length,'var(--warning)')}
          {lunches.map(t=><TxRow key={t.id} t={t} allCats={cats} accounts={data.accounts||[]} />)}
        </>}
        {recentDebts.length>0&&<>
          {sectionHeader('Долги',recentDebts.length,'var(--accent)')}
          {recentDebts.map(d=>{
            const paid=(d.payments||[]).reduce((s,p)=>s+p.amount,0);
            const rem=d.amount-paid;
            const sym=curSym(d.currency||'RUB');
            const typeLabel=d.type==='my'?'Я должен':d.type==='tome'?'Мне должны':'Транзит';
            const c=d.type==='my'?'var(--danger)':d.type==='tome'?'var(--success)':'var(--accent)';
            return <div key={d.id} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:38,height:38,borderRadius:10,background:c+'1a',border:`1px solid ${c}25`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{d.type==='my'?'📤':d.type==='tome'?'📥':'⇄'}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.person}</div>
                <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:3}}>{dDisp(d.date)} · {typeLabel}{d.closed?' · ✓ закрыт':''}</div>
              </div>
              <span className="num-display" style={{fontSize:15,color:c,flexShrink:0}}>{fN(rem)} {sym}</span>
            </div>;
          })}
        </>}
      </Card>;
    })()}
    <Card>
    <div style={{marginBottom:14}}><label style={LS}>Тип</label><Seg options={[{value:'expense',label:'Расход'},{value:'income',label:'Доход'},{value:'lunch',label:'Обед'},{value:'debt',label:'Долг'}]} value={type} onChange={setType}/></div>
    {type==='lunch'&&existing&&<div style={{background:'var(--warning-dim)',border:'1px solid #d4a04f33',borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{color:'var(--warning)',fontWeight:600,fontSize:13,marginBottom:4}}>🍱 Обед за {dDisp(date)} уже записан</div>
      <div style={{fontFamily:'var(--mono)',fontSize:14}}>{fN(existing.amount)} {curSym(existing.currency||'RUB')}</div>
    </div>}
    {type==='debt'&&<>
      <div style={{marginBottom:14}}><label style={LS}>Тип</label><Seg options={[{value:'my',label:'Я должен'},{value:'tome',label:'Мне должны'},{value:'transit',label:'Транзит'}]} value={debtDir} onChange={setDebtDir}/></div>
      <Inp label={debtDir==='my'?'Кому должен':debtDir==='tome'?'Кто должен':'Кому передать'} type="text" value={debtPerson} onChange={e=>setDebtPerson(e.target.value)}/>
      {debtDir==='transit'&&<div style={{background:'var(--accent-dim)',border:'1px solid #d4a54b33',borderRadius:10,padding:10,fontSize:12,color:'var(--muted)',marginBottom:14,marginTop:-8,lineHeight:1.5}}>💡 <strong style={{color:'var(--accent)'}}>Транзит</strong> — деньги через тебя проходят, на баланс не влияют</div>}
    </>}
    <div style={{display:'flex',gap:10}}>
      <div style={{flex:1}}><Inp label="Сумма" type="number" value={amount} onChange={e=>setAmt(e.target.value)} placeholder="0" inputMode="decimal"/></div>
      <div style={{width:100}}><Sel label="Валюта" value={currency} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</Sel></div>
    </div>
    {currency!=='RUB'&&amount&&<div style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--mono)',marginBottom:14,marginTop:-8}}>≈ {fmt(toR(parseMoney(amount)||0,currency))}</div>}
    {accounts.length>0&&type!=='debt'&&type!=='lunch'&&<div style={{marginBottom:14}}>
      <label style={LS}>Счёт <span style={{color:'var(--danger)'}}>*</span></label>
      <select value={accId} onChange={e=>setAccId(e.target.value)} style={{width:'100%',background:'var(--s2)',border:`1px solid ${!accId?'var(--danger)':'var(--border)'}`,borderRadius:12,padding:'12px 14px',color:'var(--text)',fontSize:15,outline:'none',appearance:'none',cursor:'pointer'}}>
        <option value="">— Выбери счёт —</option>
        {accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name} ({fN(a.balance)} {curSym(a.currency||'RUB')})</option>)}
      </select>
    </div>}
    {type==='expense'&&<>
      <Sel label="Категория" value={cat} onChange={e=>setCat(e.target.value)}>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Sel>
      <button onClick={()=>setShowAddCat(!showAddCat)} style={{background:'none',border:'none',color:'var(--accent)',fontSize:12,cursor:'pointer',fontFamily:'var(--mono)',marginTop:-8,marginBottom:14,padding:0}}>+ Своя категория</button>
      {showAddCat&&<div className="su" style={{background:'var(--s2)',borderRadius:12,padding:12,marginBottom:14}}>
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input value={ncI} onChange={e=>setNcI(e.target.value)} style={{width:44,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:18,textAlign:'center'}}/>
          <input value={ncN} onChange={e=>setNcN(e.target.value)} placeholder="Название" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:14}}/>
          <input type="color" value={ncC} onChange={e=>setNcC(e.target.value)} style={{width:44,height:40,border:'none',borderRadius:8,cursor:'pointer',background:'none'}}/>
        </div>
        <Btn variant="ghost" onClick={addC} style={{padding:8,fontSize:13}}>Добавить</Btn>
      </div>}
    </>}
    <div style={{marginBottom:14}}>
      <label style={LS}>Описание <span style={{color:'var(--danger)'}}>*</span></label>
      <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="Опиши покупку..." style={{width:'100%',background:'var(--s2)',border:`1px solid var(--border)`,borderRadius:12,padding:'12px 14px',color:'var(--text)',fontSize:15,outline:'none'}}/>
      {filteredNotes.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>{filteredNotes.map(n=><button key={n} onClick={()=>setNote(n)} style={{background:'var(--s3)',border:'0.5px solid var(--border)',color:'var(--muted)',fontSize:12,padding:'5px 10px',borderRadius:8,cursor:'pointer'}}>{n}</button>)}</div>}
    </div>
    {type!=='debt'&&<div style={{marginBottom:14}}>
      <label style={LS}>Теги</label>
      {tags.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>{tags.map(t=><span key={t} style={{background:'var(--accent-dim)',color:'var(--accent)',fontSize:12,padding:'4px 10px',borderRadius:8,fontFamily:'var(--mono)',display:'flex',alignItems:'center',gap:4}}>{t}<button onClick={()=>removeTag(t)} style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontSize:11,padding:0}}>×</button></span>)}</div>}
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag();}}} placeholder="Тег..." style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none'}}/>
        <button onClick={addTag} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 14px',color:'var(--accent)',fontSize:13,cursor:'pointer'}}>+</button>
      </div>
      {allTags.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6}}>{allTags.filter(t=>!tags.includes(t)).slice(0,8).map(t=><button key={t} onClick={()=>setTags([...tags,t])} style={{background:'var(--s3)',border:'0.5px solid var(--border)',color:'var(--muted)',fontSize:11,padding:'4px 8px',borderRadius:6,cursor:'pointer',fontFamily:'var(--mono)'}}>+{t}</button>)}</div>}
    </div>}
    <DateInput label="Дата" value={date} onChange={setDate}/>
    <Btn onClick={add}>{type==='lunch'&&existing?'Обновить':'Добавить'}</Btn>
  </Card></div>;
}

/* ═══════════════════ ACCOUNTS ═══════════════════ */
function AccountsPage({data,upd,msg,toR,setConfirm}) {
  const [showAdd,setShowAdd]=useState(false);
  const [name,setName]=useState('');const [icon,setIcon]=useState('🏦');const [color,setColor]=useState('#6e9fc9');
  const [bal,setBal]=useState('');const [currency,setCur]=useState('RUB');
  const [accType,setAccType]=useState('regular');
  const [showTransfer,setShowTransfer]=useState(false);
  const [trFrom,setTrFrom]=useState('');const [trTo,setTrTo]=useState('');const [trAmt,setTrAmt]=useState('');const [trFee,setTrFee]=useState('');const [trNote,setTrNote]=useState('');
  const [editId,setEditId]=useState(null);const [editBal,setEditBal]=useState('');
  const [showTopUp,setShowTopUp]=useState(null);const [topAmt,setTopAmt]=useState('');const [topNote,setTopNote]=useState('');

  const accounts=data.accounts||[];
  const regular=accounts.filter(a=>(a.accType||'regular')==='regular');
  const savings=accounts.filter(a=>a.accType==='savings');
  const totalRub=regular.reduce((a,acc)=>a+toR(acc.balance||0,acc.currency||'RUB'),0);
  const savingsRub=savings.reduce((a,acc)=>a+toR(acc.balance||0,acc.currency||'RUB'),0);

  const addAcc=()=>{
    if(!name.trim()){msg('Введи название');return;}
    const b=parseMoney(bal)||0;
    upd(d=>({...d,accounts:[...(d.accounts||[]),{id:uid(),name:name.trim(),icon,color,balance:b,currency,accType}]}));
    setName('');setBal('');setAccType('regular');setShowAdd(false);msg('✓ Счёт добавлен');
  };
  const delAcc=id=>{if(data.transactions.some(t=>t.accountId===id)||(data.transfers||[]).some(t=>t.from===id||t.to===id)||(data.recurring||[]).some(r=>r.accountId===id)){msg('Счёт используется в истории или платежах. Удаление отменено');return;}setConfirm({text:'Удалить счёт?',action:()=>{upd(d=>{const acc=(d.accounts||[]).find(a=>a.id===id);const hist=acc?[{id:uid(),type:'delete_acc',ts:Date.now(),before:acc},...(d.history||[])].slice(0,50):(d.history||[]);return {...d,accounts:(d.accounts||[]).filter(a=>a.id!==id),history:hist};});msg('✓ Удалено');}});};
  const updBal=(id,nb)=>{upd(d=>({...d,accounts:d.accounts.map(a=>a.id===id?{...a,balance:parseMoney(nb)||0}:a)}));setEditId(null);msg('✓ Обновлено');};
  const doTransfer=()=>{try{upd(d=>transferMoney(d,{from:trFrom,to:trTo,amount:trAmt,fee:trFee||0,note:trNote,date:today()}));setTrAmt('');setTrFee('');setTrNote('');setShowTransfer(false);msg('✓ Перевод');}catch(e){msg(e.message);}};
  const doTopUp=(accId)=>{
    const amt=parseMoney(topAmt);if(!Number.isFinite(amt)||amt<=0){msg('Введи сумму');return;}
    upd(d=>({...d,accounts:d.accounts.map(a=>a.id===accId?{...a,balance:a.balance+amt}:a),
      transfers:[...(d.transfers||[]),{id:uid(),from:null,to:accId,amount:amt,fee:0,note:topNote||'Внешнее зачисление',date:today()}]}));
    setTopAmt('');setTopNote('');setShowTopUp(null);msg('✓ Зачислено');
  };

  return <div><PH title="Счета" sub={accounts.length>0?(savingsRub>0?`Доступно: ${fmt(totalRub)} · Копилка: ${fmt(savingsRub)}`:`Всего: ${fmt(totalRub)}`):undefined}/>
    <div style={{display:'flex',gap:8,marginBottom:16}}>
      <Btn variant="ghost" onClick={()=>setShowAdd(!showAdd)} style={{flex:1}}>+ Счёт</Btn>
      {accounts.length>=2&&<Btn variant="ghost" onClick={()=>setShowTransfer(!showTransfer)} style={{flex:1}}>⇄ Перевод</Btn>}
    </div>

    {showAdd&&<Card>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input value={icon} onChange={e=>setIcon(e.target.value)} style={{width:44,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:18,textAlign:'center'}}/>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Название" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:14}}/>
        <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:44,height:40,border:'none',borderRadius:8,cursor:'pointer',background:'none'}}/>
      </div>
      <div style={{display:'flex',gap:10}}>
        <div style={{flex:1}}><Inp label="Начальный баланс" type="number" value={bal} onChange={e=>setBal(e.target.value)} placeholder="0"/></div>
        <div style={{width:100}}><Sel label="Валюта" value={currency} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</Sel></div>
      </div>
      <div style={{marginBottom:14}}><label style={LS}>Тип счёта</label><Seg options={[{value:'regular',label:'💳 Обычный'},{value:'savings',label:'🐷 Копилка'}]} value={accType} onChange={setAccType}/><div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>{accType==='savings'?'Копилка показывается отдельно от обычных':'Обычный счёт для повседневных трат'}</div></div>
      <div style={{display:'flex',gap:8}}><Btn onClick={addAcc} style={{flex:1}}>Добавить</Btn><Btn variant="ghost" onClick={()=>setShowAdd(false)} style={{width:60,flex:'none'}}>✕</Btn></div>
    </Card>}

    {showTransfer&&<Card accent="#d4a54b">
      <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>⇄ Перевод</div>
      <Sel label="Откуда" value={trFrom} onChange={e=>setTrFrom(e.target.value)}>
        <option value="">Выбери</option>
        {accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name} ({fN(a.balance)} {curSym(a.currency||'RUB')})</option>)}
      </Sel>
      <Sel label="Куда" value={trTo} onChange={e=>setTrTo(e.target.value)}>
        <option value="">Выбери</option>
        {accounts.filter(a=>a.id!==trFrom).map(a=><option key={a.id} value={a.id}>{a.icon} {a.name} ({fN(a.balance)} {curSym(a.currency||'RUB')})</option>)}
      </Sel>
      <div style={{display:'flex',gap:10}}>
        <div style={{flex:1}}><Inp label="Сумма" type="number" value={trAmt} onChange={e=>setTrAmt(e.target.value)}/></div>
        <div style={{flex:1}}><Inp label="Комиссия" type="number" value={trFee} onChange={e=>setTrFee(e.target.value)}/></div>
      </div>
      <Inp label="Заметка" type="text" value={trNote} onChange={e=>setTrNote(e.target.value)}/>
      <div style={{display:'flex',gap:8}}><Btn onClick={doTransfer} style={{flex:1}}>Перевести</Btn><Btn variant="ghost" onClick={()=>setShowTransfer(false)} style={{width:60,flex:'none'}}>✕</Btn></div>
    </Card>}

    {accounts.length===0&&<Card><Empty icon="🏦" text="Пока нет счетов" hint="Создай счёт для каждого банка" action={{label:'+ Первый счёт',onClick:()=>setShowAdd(true)}}/></Card>}

    {accounts.map(acc=>{
      const sym=curSym(acc.currency||'RUB');
      const isE=editId===acc.id;
      const isT=showTopUp===acc.id;
      const accTr=(data.transfers||[]).filter(tr=>tr.from===acc.id||tr.to===acc.id).sort((a,b)=>b.date>a.date?1:-1).slice(0,5);
      return <Card key={acc.id} style={{borderLeft:`3px solid ${acc.color||'var(--accent)'}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:40,height:40,borderRadius:12,background:(acc.color||'#6e9fc9')+'1a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{acc.icon||'🏦'}</div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:15,fontWeight:600}}>{acc.name}</span>
                {acc.accType==='savings'&&<span style={{background:'var(--accent-dim)',color:'var(--accent)',fontSize:9,padding:'2px 7px',borderRadius:6,fontFamily:'var(--mono)',textTransform:'uppercase'}}>🐷 Копилка</span>}
              </div>
              <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2}}>{acc.currency||'RUB'}</div>
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:acc.balance>=0?'var(--text)':'var(--danger)'}}>{fN(acc.balance)} {sym}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginTop:10}}>
          <button onClick={()=>{setEditId(isE?null:acc.id);setEditBal(String(acc.balance));}} style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:7,color:'var(--text)',fontSize:11,cursor:'pointer'}}>{isE?'Скрыть':'✏️ Баланс'}</button>
          <button onClick={()=>setShowTopUp(isT?null:acc.id)} style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:7,color:'var(--text)',fontSize:11,cursor:'pointer'}}>{isT?'Скрыть':'📥 Зачисление'}</button>
          <button onClick={()=>delAcc(acc.id)} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✕</button>
        </div>
        {isE&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
          <input type="number" value={editBal} onChange={e=>setEditBal(e.target.value)} style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:14}}/>
          <button onClick={()=>updBal(acc.id,editBal)} style={{background:'var(--accent)',border:'none',borderRadius:8,padding:'8px 16px',color:'#07080a',fontWeight:600,fontSize:13,cursor:'pointer'}}>Сохранить</button>
        </div>}
        {isT&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>Внешнее зачисление (не доход)</div>
          <div style={{display:'flex',gap:8}}>
            <input type="number" value={topAmt} onChange={e=>setTopAmt(e.target.value)} placeholder="Сумма" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:13}}/>
            <input value={topNote} onChange={e=>setTopNote(e.target.value)} placeholder="Заметка" style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:8,color:'var(--text)',fontSize:13}}/>
            <button onClick={()=>doTopUp(acc.id)} style={{background:'var(--success)',border:'none',borderRadius:8,padding:'8px 14px',color:'#07080a',fontWeight:600,fontSize:13,cursor:'pointer'}}>✓</button>
          </div>
        </div>}
        {accTr.length>0&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',marginBottom:6}}>Последние операции</div>
          {accTr.map(tr=>{
            const isOut=tr.from===acc.id;
            const other=isOut?accounts.find(a=>a.id===tr.to):accounts.find(a=>a.id===tr.from);
            return <div key={tr.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',color:'var(--muted)'}}>
              <span>{dDisp(tr.date)} · {tr.from===null?'Зачисление':isOut?`→ ${other?.name||'?'}`:`← ${other?.name||'?'}`}{tr.note?' · '+tr.note:''}</span>
              <span style={{fontFamily:'var(--mono)',color:isOut?'var(--danger)':'var(--success)',fontWeight:600}}>{isOut?'−':'+'}{fN(tr.amount)} {sym}</span>
            </div>;
          })}
        </div>}
      </Card>;
    })}
  </div>;
}

/* ═══════════════════ RECURRING ═══════════════════ */
function RecurringPage({data,upd,msg,cats,setConfirm}) {
  const [show,setShow]=useState(false);
  const [name,setName]=useState('');const [amount,setAmt]=useState('');const [cat,setCat]=useState('housing');const [dueDay,setDueDay]=useState('1');const [accId,setAccId]=useState('');
  const [variable,setVariable]=useState(false);
  const [editId,setEditId]=useState(null);
  const accounts=data.accounts||[];
  const recurring=data.recurring||[];
  const fixed=recurring.filter(r=>r.active&&!r.variable);
  const vari=recurring.filter(r=>r.active&&r.variable);
  const total=fixed.reduce((a,r)=>a+r.amount,0);

  const reset=()=>{setName('');setAmt('');setCat('housing');setDueDay('1');setAccId(accounts[0]?.id||'');setVariable(false);setEditId(null);setShow(false);};
  const save=()=>{
    if(!name.trim()){msg('Введи название');return;}
    const a=parseMoney(amount);
    if(!variable&&(!a||a<=0)){msg('Введи сумму');return;}
    if(!accId){msg('Выбери счёт');return;}
    const day=Math.min(31,Math.max(1,parseInt(dueDay)||1));
    const payload={name:name.trim(),amount:variable?0:a,cat,dueDay:day,accountId:accId,variable};
    if(editId){
      upd(d=>({...d,recurring:d.recurring.map(r=>r.id===editId?{...r,...payload}:r)}));
      msg('✓ Обновлено');
    } else {
      upd(d=>({...d,recurring:[...(d.recurring||[]),{id:uid(),...payload,currency:'RUB',active:true,lastCreated:'',createdAt:today()}]}));
      msg('✓ Добавлено');
    }
    reset();
  };
  const startEdit=r=>{setEditId(r.id);setName(r.name);setAmt(String(r.amount||''));setCat(r.cat);setDueDay(String(r.dueDay||1));setAccId(r.accountId||'');setVariable(!!r.variable);setShow(true);};
  const toggle=id=>upd(d=>({...d,recurring:d.recurring.map(r=>r.id===id?{...r,active:!r.active}:r)}));
  const del=id=>setConfirm({text:'Удалить постоянный расход?',action:()=>{upd(d=>{const r=d.recurring.find(x=>x.id===id);const hist=r?[{id:uid(),type:'delete_recurring',ts:Date.now(),before:r},...(d.history||[])].slice(0,50):(d.history||[]);return {...d,recurring:d.recurring.filter(rr=>rr.id!==id),history:hist};});msg('✓ Удалено');}});

  // Quick-fill handler for variable recurring
  const [qfId,setQfId]=useState(null);const [qfAmt,setQfAmt]=useState('');
  const fillVariable=(r)=>{
    const a=parseMoney(qfAmt||(!r.variable?r.amount:''));if(!Number.isFinite(a)||a<=0){msg('Введи сумму');return;}
    const now=new Date();
    const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    try { upd(d=>{
      const dueDate=new Date(now.getFullYear(),now.getMonth(),Math.min(r.dueDay||1,new Date(now.getFullYear(),now.getMonth()+1,0).getDate()));
      const tx={id:uid(),type:'expense',cat:r.cat,amount:a,currency:'RUB',amountRub:a,note:r.name,date:today(),tags:['постоянный'],accountId:r.accountId,recurringId:r.id};
      const next=putTransaction(d,tx);
      return {...next,recurring:d.recurring.map(rr=>rr.id===r.id?{...rr,lastCreated:monthKey}:rr)};
    });
    setQfId(null);setQfAmt('');msg('✓ Добавлено'); } catch(e) {msg(e.message);}
  };

  // Check pending variable expenses for current month (10-15 day notification)
  const now=new Date();
  const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const pendingVar=recurring.filter(r=>r.active&&r.lastCreated!==monthKey);
  const today_=now.getDate();
  const showReminder=today_>=10&&today_<=15&&pendingVar.length>0;

  const renderItem=r=>{
    const c=cats.find(x=>x.id===r.cat);
    const acc=accounts.find(a=>a.id===r.accountId);
    const filledThisMonth=r.lastCreated===monthKey;
    const isQF=qfId===r.id;
    return <Card key={r.id} style={{borderLeft:`3px solid ${c?.color||'var(--accent)'}`,opacity:r.active?1:0.5}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
          <div style={{width:36,height:36,borderRadius:10,background:(c?.color||'#888')+'1a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{c?.icon||'🔁'}</div>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>{r.name}{r.variable&&<span style={{background:'var(--accent2)15',color:'var(--accent2)',fontSize:9,padding:'1px 6px',borderRadius:5,fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'.05em'}}>~ изм.</span>}</div>
            <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c?.name||''} · {r.dueDay||1} число{acc?` · ${acc.icon} ${acc.name}`:''}</div>
          </div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          {r.variable?<div style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:600,color:filledThisMonth?'var(--success)':'var(--accent2)'}}>{filledThisMonth?'✓ заполнен':'~ ожидает'}</div>:<div style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:'var(--warning)'}}>{fN(r.amount)} ₽</div>}
        </div>
      </div>
      {!filledThisMonth&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
        {!isQF?<button onClick={()=>{setQfId(r.id);setQfAmt(r.variable?'':String(r.amount));}} style={{width:'100%',background:'var(--accent2)15',border:'1px solid var(--accent2)',borderRadius:10,padding:8,color:'var(--accent2)',fontSize:12,cursor:'pointer',fontFamily:'var(--sans)',fontWeight:500}}>Подтвердить оплату за {MONTHS[now.getMonth()]}</button>:
        <div style={{display:'flex',gap:6}}>
          <input type="number" value={qfAmt} onChange={e=>setQfAmt(e.target.value)} placeholder={`Сумма за ${MONTHS_SHORT[now.getMonth()]}`} autoFocus style={{flex:1,background:'var(--s3)',border:'1px solid var(--accent2)',borderRadius:8,padding:8,color:'var(--text)',fontFamily:'var(--mono)',fontSize:14}}/>
          <button onClick={()=>fillVariable(r)} style={{background:'var(--accent2)',border:'none',borderRadius:8,padding:'8px 14px',color:'#07080a',fontWeight:600,cursor:'pointer'}}>✓</button>
          <button onClick={()=>{setQfId(null);setQfAmt('');}} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--muted)',cursor:'pointer'}}>✕</button>
        </div>}
      </div>}
      <div style={{display:'flex',gap:6,marginTop:10}}>
        <button onClick={()=>toggle(r.id)} style={{flex:1,background:r.active?'var(--success-dim)':'var(--s3)',border:`1px solid ${r.active?'var(--success)':'var(--border)'}`,borderRadius:8,padding:7,color:r.active?'var(--success)':'var(--muted)',fontSize:11,cursor:'pointer'}}>{r.active?'✓ Активен':'⏸ Пауза'}</button>
        <button onClick={()=>startEdit(r)} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✏️</button>
        <button onClick={()=>del(r.id)} style={{background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>✕</button>
      </div>
    </Card>;
  };

  return <div><PH title="🔁 Постоянные" sub={fixed.length>0?`фикс. ${fmt(total)}/мес`:undefined}/>
    <div style={{fontSize:12,color:'var(--muted)',padding:'0 8px 16px',lineHeight:1.5}}>План платежей. Подтвердите сумму после оплаты — деньги не списываются заранее</div>
    {showReminder&&<Card accent="#d45b4f" style={{borderLeft:'3px solid var(--danger)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
        <span style={{fontSize:20}}>⚠️</span>
        <span style={{fontSize:14,fontWeight:600,color:'var(--danger)'}}>Введи суммы за {MONTHS[now.getMonth()]}</span>
      </div>
      <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>Не забудь: {pendingVar.map(r=>r.name).join(', ')}</div>
    </Card>}
    {!show?<Btn variant="ghost" onClick={()=>setShow(true)} style={{marginBottom:16}}>+ Добавить</Btn>:<Card>
      <Inp label="Название" type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Netflix, ЖКХ, Электроэнергия..."/>
      <div style={{marginBottom:14}}>
        <label style={LS}>Тип</label>
        <Seg options={[{value:'fixed',label:'💰 Фиксированный'},{value:'variable',label:'~ Изменяемый'}]} value={variable?'variable':'fixed'} onChange={v=>setVariable(v==='variable')}/>
        <div style={{fontSize:11,color:'var(--muted)',marginTop:6,lineHeight:1.5}}>{variable?'Сумма меняется (ЖКХ, электроэнергия). Будешь вводить вручную каждый месяц.':'Сумма одинаковая (подписки, аренда). Оплату нужно подтвердить.'}</div>
      </div>
      <div style={{display:'flex',gap:10}}>
        {!variable&&<div style={{flex:1}}><Inp label="Сумма ₽" type="number" value={amount} onChange={e=>setAmt(e.target.value)}/></div>}
        <div style={{flex:variable?1:0,width:variable?'auto':120}}><Inp label="День месяца" type="number" value={dueDay} onChange={e=>setDueDay(e.target.value)} min="1" max="31"/></div>
      </div>
      <Sel label="Категория" value={cat} onChange={e=>setCat(e.target.value)}>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Sel>
      {accounts.length>0&&<Sel label="Счёт" value={accId} onChange={e=>setAccId(e.target.value)}><option value="">Выбери</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Sel>}
      <div style={{display:'flex',gap:8}}><Btn onClick={save} style={{flex:1}}>{editId?'Сохранить':'Добавить'}</Btn><Btn variant="ghost" onClick={reset} style={{width:60,flex:'none'}}>✕</Btn></div>
    </Card>}
    {recurring.length===0&&<Card><Empty icon="🔁" text="Нет постоянных расходов" hint="Подписки, ЖКХ, страховки..." action={{label:'+ Добавить',onClick:()=>setShow(true)}}/></Card>}
    {recurring.map(renderItem)}
  </div>;
}

/* ═══════════════════ GOALS ═══════════════════ */
function GoalsPage({data,upd,msg,editGoal,setEditGoal,toR,setConfirm}) {
  const [name,setN]=useState('');const [target,setT]=useState('');const [currency,setC]=useState('RUB');
  const [show,setShow]=useState(false);const [addA,setAA]=useState('');
  const [editMode,setEditMode]=useState(null);
  const [eName,setEN]=useState('');const [eTarget,setET]=useState('');
  const addG=()=>{const t=parseMoney(target);if(!Number.isFinite(t)||t<=0||!name.trim()){msg('Заполни поля');return;}upd(d=>({...d,goals:[...(d.goals||[]),{id:uid(),name:name.trim(),target:t,currency,saved:0,date:today()}]}));setN('');setT('');setShow(false);msg('✓ Создана');};
  const addTo=gid=>{const a=parseMoney(addA);if(!Number.isFinite(a)||a<=0)return;upd(d=>({...d,goals:d.goals.map(g=>g.id===gid?{...g,saved:Math.min(g.target,g.saved+a)}:g)}));setAA('');msg('✓ Отложено');};
  const delG=id=>setConfirm({text:'Удалить цель?',action:()=>{upd(d=>{const g=d.goals.find(x=>x.id===id);const hist=g?[{id:uid(),type:'delete_goal',ts:Date.now(),before:g},...(d.history||[])].slice(0,50):(d.history||[]);return {...d,goals:d.goals.filter(gg=>gg.id!==id),history:hist};});msg('✓ Удалено');}});
  const startE=g=>{setEditMode(g.id);setEN(g.name);setET(String(g.target));};
  const saveE=id=>{const t=parseMoney(eTarget);if(!Number.isFinite(t)||t<=0||!eName.trim())return;upd(d=>({...d,goals:d.goals.map(g=>g.id===id?{...g,name:eName.trim(),target:t}:g)}));setEditMode(null);msg('✓ Обновлено');};

  return <div><PH title="Цели"/>
    {!show?<Btn variant="ghost" onClick={()=>setShow(true)} style={{marginBottom:16}}>+ Новая цель</Btn>:<Card>
      <Inp label="На что копим?" type="text" value={name} onChange={e=>setN(e.target.value)}/>
      <div style={{display:'flex',gap:10}}><div style={{flex:1}}><Inp label="Сумма" type="number" value={target} onChange={e=>setT(e.target.value)}/></div><div style={{width:100}}><Sel label="Валюта" value={currency} onChange={e=>setC(e.target.value)}>{CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</Sel></div></div>
      <div style={{display:'flex',gap:8}}><Btn onClick={addG} style={{flex:1}}>Создать</Btn><Btn variant="ghost" onClick={()=>setShow(false)} style={{width:60,flex:'none'}}>✕</Btn></div>
    </Card>}
    {(data.goals||[]).length===0&&<Card><Empty icon="🎯" text="Поставь финансовую цель" action={{label:'+ Создать',onClick:()=>setShow(true)}}/></Card>}
    {(data.goals||[]).map(g=>{
      const sym=curSym(g.currency||'RUB'),pct=Math.min(100,Math.round((g.saved/g.target)*100)),done=g.saved>=g.target,isO=editGoal===g.id,isE=editMode===g.id;
      const startDate=pD(g.date);
      const monthsElapsed=Math.max(1,(new Date()-startDate)/(86400000*30.4));
      const perMonth=g.saved/monthsElapsed;
      const monthsLeft=perMonth>0?Math.ceil((g.target-g.saved)/perMonth):null;
      return <Card key={g.id} accent={done?"#4fd48a":"#d4a54b"}>
        {isE?<>
          <Inp label="Название" type="text" value={eName} onChange={e=>setEN(e.target.value)}/>
          <Inp label="Целевая сумма" type="number" value={eTarget} onChange={e=>setET(e.target.value)}/>
          <div style={{display:'flex',gap:8}}><Btn onClick={()=>saveE(g.id)} style={{flex:1}}>Сохранить</Btn><Btn variant="ghost" onClick={()=>setEditMode(null)} style={{width:60,flex:'none'}}>✕</Btn></div>
        </>:<>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div><div style={{fontSize:15,fontWeight:600}}>{done?'✅':'🎯'} {g.name}</div><div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2}}>с {dDisp(g.date)}{!done&&perMonth>0&&monthsLeft?` · через ~${monthsLeft} мес.`:''}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:done?'var(--success)':'var(--accent)'}}>{fN(g.saved)} / {fN(g.target)} {sym}</div><div style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--mono)'}}>{pct}%</div></div>
        </div>
        <div style={{background:'var(--s3)',borderRadius:99,height:8,overflow:'hidden',margin:'10px 0'}}><div style={{height:'100%',borderRadius:99,width:pct+'%',background:done?'var(--success)':'linear-gradient(90deg,var(--accent),#e8b659)',transition:'width .8s'}}/></div>
        <div style={{display:'flex',gap:6}}>
          {!done&&<button onClick={()=>setEditGoal(isO?null:g.id)} style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:8,color:'var(--text)',fontSize:12,cursor:'pointer'}}>{isO?'Скрыть':'+ Отложить'}</button>}
          <button onClick={()=>startE(g)} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>✏️</button>
          <button onClick={()=>delG(g.id)} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',color:'var(--danger)',fontSize:12,cursor:'pointer'}}>✕</button>
        </div>
        {isO&&<div style={{display:'flex',gap:8,marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
          <input type="number" value={addA} onChange={e=>setAA(e.target.value)} placeholder={`Сумма (${sym})`} style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:10,padding:8,color:'var(--text)',fontSize:13}}/>
          <button onClick={()=>addTo(g.id)} style={{background:'var(--accent)',border:'none',borderRadius:10,padding:'8px 16px',color:'#07080a',fontWeight:600,cursor:'pointer'}}>Отложить</button>
        </div>}
        </>}
      </Card>;
    })}
  </div>;
}

/* ═══════════════════ SEARCH ═══════════════════ */
function SearchPage({data,cats,toR,setEditTx}) {
  const [q,setQ]=useState('');
  const [tagFilter,setTagFilter]=useState('');
  const allTags=[...new Set((data.transactions||[]).flatMap(t=>(t.tags||[]).filter(tg=>tg!=='постоянный')))];
  const accs=data.accounts||[];
  const txs=data.transactions||[];
  const ql=q.toLowerCase().trim();
  const matched=txs.filter(t=>{
    if(tagFilter&&!(t.tags||[]).includes(tagFilter)) return false;
    if(!ql) return tagFilter?true:false;
    return (t.note||'').toLowerCase().includes(ql)
      || String(t.amount).includes(ql)
      || (t.date||'').includes(ql)
      || dDisp(t.date).includes(ql)
      || (cats.find(c=>c.id===t.cat)?.name||'').toLowerCase().includes(ql)
      || (t.tags||[]).some(tg=>tg.toLowerCase().includes(ql))
      || (accs.find(a=>a.id===t.accountId)?.name||'').toLowerCase().includes(ql);
  }).sort((a,b)=>b.date>a.date?1:-1);

  return <div><PH title="Поиск"/>
    <Inp type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Описание, сумма, дата, тег, счёт..."/>
    {allTags.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>{allTags.map(t=><button key={t} onClick={()=>setTagFilter(tagFilter===t?'':t)} style={{background:tagFilter===t?'var(--accent-dim)':'var(--s2)',border:`1px solid ${tagFilter===t?'var(--accent)':'var(--border)'}`,color:tagFilter===t?'var(--accent)':'var(--muted)',fontSize:12,padding:'5px 12px',borderRadius:8,cursor:'pointer',fontFamily:'var(--mono)'}}>{t}</button>)}</div>}
    {!q&&!tagFilter?<Empty icon="🔍" text="Начни вводить для поиска" hint="Можешь искать по описанию, сумме, дате, тегу или названию счёта"/>:matched.length===0?<Empty icon="📭" text="Ничего не найдено"/>:<Card style={{padding:'4px 16px'}}>{matched.map(t=><TxRow key={t.id} t={t} allCats={cats} accounts={accs} onClick={()=>setEditTx(t)}/>)}</Card>}
  </div>;
}

/* ═══════════════════ STATS ═══════════════════ */
function StatsPage({data,cats,sd,setSd,toR,setEditTx,go}) {
  const [period,setPeriod]=useState('month'); // 'week' | '2weeks' | 'month' | 'season'
  const [openCats,setOpenCats]=useState(new Set());
  const [showCharts,setShowCharts]=useState(false);
  const toggleCat=id=>setOpenCats(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  
  // Period range based on selection
  const range=useMemo(()=>{
    const ref=new Date(sd);
    if(period==='week'){
      const end=ref;
      const start=new Date(end);start.setDate(start.getDate()-6);
      return {from:start,to:end,label:'7 дней'};
    }
    if(period==='2weeks'){
      const end=ref;
      const start=new Date(end);start.setDate(start.getDate()-13);
      return {from:start,to:end,label:'14 дней'};
    }
    if(period==='season'){
      // 3 months ending at sd's month
      const start=new Date(ref.getFullYear(),ref.getMonth()-2,1);
      const end=new Date(ref.getFullYear(),ref.getMonth()+1,0);
      return {from:start,to:end,label:'Сезон (3 мес.)'};
    }
    // month
    const start=new Date(ref.getFullYear(),ref.getMonth(),1);
    const end=new Date(ref.getFullYear(),ref.getMonth()+1,0);
    return {from:start,to:end,label:'Месяц'};
  },[period,sd]);
  
  const fromStr=dStr(range.from), toStr=dStr(range.to);
  const txs=(data.transactions||[]).filter(t=>t.date>=fromStr&&t.date<=toStr);
  const exp=txs.filter(t=>t.type==='expense'&&t.cat!=='lunch'),inc=txs.filter(t=>t.type==='income');
  const tE=exp.reduce((a,t)=>a+historicalRub(t,toR),0);
  const tI=inc.reduce((a,t)=>a+historicalRub(t,toR),0);
  const catMap={};exp.forEach(t=>{if(!catMap[t.cat])catMap[t.cat]={value:0,txs:[]};catMap[t.cat].value+=historicalRub(t,toR);catMap[t.cat].txs.push(t);});
  const catData=Object.entries(catMap).sort((a,b)=>b[1].value-a[1].value).map(([id,v])=>{const c=cats.find(x=>x.id===id);return{id,name:c?.name||id,value:v.value,txs:v.txs,color:c?.color||'#888',icon:c?.icon||'📦'};});
  const expandAll=()=>setOpenCats(new Set(catData.map(c=>c.id)));
  const collapseAll=()=>setOpenCats(new Set());
  
  // Daily series within range
  const totalDays=Math.round((range.to-range.from)/86400000)+1;
  const daily=Array.from({length:totalDays},(_,i)=>{
    const d=new Date(range.from);d.setDate(d.getDate()+i);
    const ds=dStr(d);
    return {
      day:`${d.getDate()}.${d.getMonth()+1}`,
      expense:exp.filter(t=>t.date===ds).reduce((a,t)=>a+historicalRub(t,toR),0),
      income:inc.filter(t=>t.date===ds).reduce((a,t)=>a+historicalRub(t,toR),0)
    };
  });
  
  // Trend over last 6 periods of same kind (for context)
  const trend=[];
  for(let i=5;i>=0;i--){
    let pStart,pEnd,label;
    if(period==='week'){
      pEnd=new Date(range.to);pEnd.setDate(pEnd.getDate()-i*7);
      pStart=new Date(pEnd);pStart.setDate(pStart.getDate()-6);
      label=`${pEnd.getDate()}.${pEnd.getMonth()+1}`;
    } else if(period==='2weeks'){
      pEnd=new Date(range.to);pEnd.setDate(pEnd.getDate()-i*14);
      pStart=new Date(pEnd);pStart.setDate(pStart.getDate()-13);
      label=`${pEnd.getDate()}.${pEnd.getMonth()+1}`;
    } else if(period==='season'){
      pStart=new Date(range.from);pStart.setMonth(pStart.getMonth()-i*3);
      pEnd=new Date(pStart.getFullYear(),pStart.getMonth()+3,0);
      label=`${MONTHS_SHORT[pStart.getMonth()]}-${MONTHS_SHORT[pEnd.getMonth()]}`;
    } else {
      pStart=new Date(sd.getFullYear(),sd.getMonth()-i,1);
      pEnd=new Date(sd.getFullYear(),sd.getMonth()-i+1,0);
      label=MONTHS_SHORT[pStart.getMonth()];
    }
    const ps=dStr(pStart),pe=dStr(pEnd);
    const pTxs=(data.transactions||[]).filter(t=>t.date>=ps&&t.date<=pe);
    trend.push({
      month:label,
      expense:pTxs.filter(t=>t.type==='expense'&&t.cat!=='lunch').reduce((a,t)=>a+historicalRub(t,toR),0),
      income:pTxs.filter(t=>t.type==='income').reduce((a,t)=>a+historicalRub(t,toR),0)
    });
  }
  
  // Average per day
  const now=new Date();
  const effectiveDays=Math.min(totalDays,Math.max(1,Math.round((Math.min(range.to.getTime(),now.getTime())-range.from.getTime())/86400000)+1));
  const avg=effectiveDays>0?tE/effectiveDays:0;
  
  // Comparison with previous period of same kind
  let pStart,pEnd;
  if(period==='week'||period==='2weeks'){
    const days=period==='week'?7:14;
    pEnd=new Date(range.from);pEnd.setDate(pEnd.getDate()-1);
    pStart=new Date(pEnd);pStart.setDate(pStart.getDate()-(days-1));
  } else if(period==='season'){
    pEnd=new Date(range.from);pEnd.setDate(pEnd.getDate()-1);
    pStart=new Date(pEnd);pStart.setMonth(pStart.getMonth()-3);pStart.setDate(pStart.getDate()+1);
  } else {
    pStart=new Date(sd.getFullYear(),sd.getMonth()-1,1);
    pEnd=new Date(sd.getFullYear(),sd.getMonth(),0);
  }
  const pE=(data.transactions||[]).filter(t=>t.date>=dStr(pStart)&&t.date<=dStr(pEnd)).filter(t=>t.type==='expense'&&t.cat!=='lunch').reduce((a,t)=>a+historicalRub(t,toR),0);
  const diff=pE>0?((tE-pE)/pE*100):0;
  const compareLabel=period==='week'?'vs прошлая неделя':period==='2weeks'?'vs прошлые 2 нед.':period==='season'?'vs прошлый сезон':'vs прошлый мес.';
  
  // Header range display
  const rangeLabel=period==='month'?`${MONTHS[range.from.getMonth()]} ${range.from.getFullYear()}`:`${dDisp(fromStr)} — ${dDisp(toStr)}`;

  return <div><PH title="Статистика" sub={rangeLabel}/>
    <Card style={{padding:'12px 14px',marginBottom:12}}>
      <div style={{...LS,marginBottom:8}}>Период</div>
      <Seg options={[
        {value:'week',label:'Неделя'},
        {value:'2weeks',label:'2 нед.'},
        {value:'month',label:'Месяц'},
        {value:'season',label:'Сезон'}
      ]} value={period} onChange={setPeriod}/>
      {period==='month'&&<div style={{marginTop:10}}><MN date={sd} onChange={d=>setSd(new Date(sd.getFullYear(),sd.getMonth()+d,1))}/></div>}
      {period!=='month'&&<div style={{display:'flex',gap:8,marginTop:10,alignItems:'center',justifyContent:'center'}}>
        <button onClick={()=>{
          const days=period==='week'?7:period==='2weeks'?14:90;
          const next=new Date(sd);next.setDate(next.getDate()-days);setSd(next);
        }} style={{background:'var(--s2)',border:'1px solid var(--border)',color:'var(--text-soft)',width:36,height:32,borderRadius:'var(--radius-sm)',fontSize:16,cursor:'pointer'}}>‹</button>
        <span style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--accent)',fontWeight:600,textAlign:'center',flex:1}}>{rangeLabel}</span>
        <button onClick={()=>{
          const days=period==='week'?7:period==='2weeks'?14:90;
          const next=new Date(sd);next.setDate(next.getDate()+days);setSd(next);
        }} style={{background:'var(--s2)',border:'1px solid var(--border)',color:'var(--text-soft)',width:36,height:32,borderRadius:'var(--radius-sm)',fontSize:16,cursor:'pointer'}}>›</button>
        <button onClick={()=>setSd(new Date())} style={{background:'var(--s2)',border:'1px solid var(--border)',color:'var(--muted)',padding:'7px 10px',borderRadius:'var(--radius-sm)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)'}}>Сейчас</button>
      </div>}
    </Card>
    {go&&<div style={{marginBottom:14,display:'flex',gap:8}}>
      <button onClick={()=>go('calendar')} style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'9px 12px',color:'var(--accent)',fontSize:12,cursor:'pointer',fontFamily:'var(--sans)',display:'flex',justifyContent:'center',alignItems:'center',gap:6}}>📅 Календарь</button>
    </div>}
    
    {/* Hero summary card — one card with all key numbers, compact */}
    <Card accent="#d4a54b" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'16px 18px',borderBottom:'1px solid var(--border)'}}>
        <div style={LS}>Итого за {range.label.toLowerCase()}</div>
        <div style={{display:'flex',alignItems:'baseline',gap:12,marginTop:6,flexWrap:'wrap'}}>
          <span className="num-display" style={{fontSize:26,color:'var(--danger)',fontWeight:700,lineHeight:1}}>−{fN(tE)} ₽</span>
          {tI>0&&<span className="num-display" style={{fontSize:18,color:'var(--success)',fontWeight:600,lineHeight:1}}>+{fN(tI)} ₽</span>}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',padding:'10px 0'}}>
        <div style={{padding:'4px 18px',borderRight:'1px solid var(--border)'}}>
          <div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.12em'}}>В среднем</div>
          <div className="num-display" style={{fontSize:14,marginTop:3,color:'var(--text)'}}>{fN(avg)} <span style={{color:'var(--muted2)',fontSize:11}}>₽/день</span></div>
        </div>
        <div style={{padding:'4px 18px'}}>
          <div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.12em'}}>{compareLabel.replace('vs ','vs ')}</div>
          <div className="num-display" style={{fontSize:14,marginTop:3,color:diff>0?'var(--danger)':diff<0?'var(--success)':'var(--muted)'}}>{pE>0?(diff>0?'+':'')+diff.toFixed(0)+'%':'—'}</div>
        </div>
      </div>
    </Card>
    
    {/* Categories — main analytical tool */}
    <Card>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={LS}>По категориям</div>
        {catData.length>0&&<div style={{display:'flex',gap:6}}>
          <button onClick={expandAll} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',color:openCats.size===catData.length?'var(--accent)':'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)'}}>▼ Все</button>
          <button onClick={collapseAll} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',color:openCats.size===0?'var(--accent)':'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)'}}>▴</button>
        </div>}
      </div>
      {catData.length>0?<>
        {/* Pie chart */}
        <div style={{height:200,position:'relative'}}>
          <ResponsiveContainer><PieChart>
            <Pie data={catData} cx="50%" cy="50%" innerRadius={60} outerRadius={88} paddingAngle={3} dataKey="value">
              {catData.map((e,i)=><Cell key={i} fill={e.color} stroke="none" style={{cursor:'pointer'}} onClick={()=>toggleCat(e.id)}/>)}
            </Pie>
            <Tooltip formatter={v=>fmt(v)} {...TT}/>
          </PieChart></ResponsiveContainer>
          {/* Center label */}
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',pointerEvents:'none',textAlign:'center'}}>
            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.1em'}}>Категорий</div>
            <div className="num-display" style={{fontSize:22,color:'var(--text)',marginTop:2}}>{catData.length}</div>
          </div>
        </div>
        {/* Category list — with parallel progress bars */}
        <div style={{marginTop:14}}>{catData.map((c)=>{
          const isOpen=openCats.has(c.id);
          const pct=tE>0?(c.value/tE)*100:0;
          return <div key={c.id} style={{borderBottom:'1px solid var(--border)'}}>
            <div onClick={()=>toggleCat(c.id)} style={{padding:'10px 0',cursor:'pointer'}}>
              {/* Top row: name + amount */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:6}}>
                <span style={{display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1}}>
                  <span style={{fontSize:14}}>{c.icon}</span>
                  <span style={{fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</span>
                  <span style={{color:'var(--muted)',fontSize:10,fontFamily:'var(--mono)',flexShrink:0}}>· {c.txs.length}</span>
                </span>
                <span style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <span className="num-display" style={{fontSize:13,color:'var(--text)'}}>{fN(c.value)} ₽</span>
                  <span style={{color:'var(--muted)',fontSize:11,transition:'transform .2s',transform:isOpen?'rotate(180deg)':'rotate(0)'}}>▾</span>
                </span>
              </div>
              {/* Progress bar with percentage label inside */}
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,height:8,background:'var(--s2)',borderRadius:99,overflow:'hidden',position:'relative'}}>
                  <div style={{height:'100%',width:pct+'%',background:c.color,borderRadius:99,transition:'width .5s'}}/>
                </div>
                <span className="num-display" style={{fontSize:11,color:'var(--muted)',minWidth:42,textAlign:'right'}}>{pct.toFixed(1)}%</span>
              </div>
            </div>
            {isOpen&&<div style={{paddingBottom:10}}>{c.txs.sort((a,b)=>b.amount-a.amount).map(t=><div key={t.id} onClick={()=>setEditTx(t)} style={{display:'flex',justifyContent:'space-between',padding:'7px 12px',fontSize:12,cursor:'pointer',borderRadius:8,background:'var(--s2)',marginBottom:4,gap:8}}><span style={{color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0,flex:1}}>{dDisp(t.date)} · {t.note}</span><span className="num-display" style={{fontSize:12,color:'var(--text)',flexShrink:0}}>{fN(t.amount)} ₽</span></div>)}</div>}
          </div>;
        })}</div>
      </>:<Empty icon="📊" text="Нет данных за этот период"/>}
    </Card>
    
    {/* Charts — collapsible to reduce clutter */}
    <Card>
      <div onClick={()=>setShowCharts(!showCharts)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',marginBottom:showCharts?14:0}}>
        <div style={LS}>Графики</div>
        <span style={{color:'var(--muted)',fontSize:11,transition:'transform .2s',transform:showCharts?'rotate(180deg)':'rotate(0)'}}>▾</span>
      </div>
      {showCharts&&<>
        <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.1em',marginBottom:8}}>Расходы по дням</div>
        <div style={{height:160,marginBottom:18}}><ResponsiveContainer><BarChart data={daily}><CartesianGrid strokeDasharray="3 3" stroke="#272830"/><XAxis dataKey="day" tick={{fill:'#6d6e7a',fontSize:10}} axisLine={false} tickLine={false} interval={Math.max(0,Math.floor(totalDays/10))}/><YAxis tick={{fill:'#6d6e7a',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>0?fN(v):''} width={50}/><Tooltip formatter={v=>fmt(v)} {...TT}/><Bar dataKey="expense" fill="#d45b4f" radius={[3,3,0,0]} name="Расход"/></BarChart></ResponsiveContainer></div>
        <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.1em',marginBottom:8}}>Тренд за 6 {period==='week'?'недель':period==='2weeks'?'двухнедельных':period==='season'?'сезонов':'месяцев'}</div>
        <div style={{height:160}}><ResponsiveContainer><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="#272830"/><XAxis dataKey="month" tick={{fill:'#6d6e7a',fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#6d6e7a',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>0?fN(v):''} width={50}/><Tooltip formatter={v=>fmt(v)} {...TT}/><Area type="monotone" dataKey="expense" stroke="#d45b4f" fill="#d45b4f18" strokeWidth={2} name="Расходы"/><Area type="monotone" dataKey="income" stroke="#4fd48a" fill="#4fd48a18" strokeWidth={2} name="Доходы"/></AreaChart></ResponsiveContainer></div>
      </>}
    </Card>
    
    {/* Transit, only if relevant */}
    {(()=>{
      const transitDebts=(data.debts||[]).filter(d=>d.type==='transit');
      if(transitDebts.length===0) return null;
      const monthTransit=transitDebts.filter(dd=>dd.date>=fromStr&&dd.date<=toStr);
      if(monthTransit.length===0) return null;
      const totalAmt=monthTransit.reduce((a,d)=>a+toR(d.amount,d.currency||'RUB'),0);
      const open=monthTransit.filter(d=>!d.closed);
      const openAmt=open.reduce((a,d)=>{const p=(d.payments||[]).reduce((s,pp)=>s+pp.amount,0);return a+toR(d.amount-p,d.currency||'RUB');},0);
      return <Card>
        <div style={{...LS,marginBottom:8}}>⇄ Транзит за период</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12}}>
          <span className="num-display" style={{fontSize:18,color:'var(--accent)'}}>{fN(totalAmt)} ₽</span>
          {openAmt>0&&<span style={{fontSize:11,color:'var(--warning)',fontFamily:'var(--mono)'}}>висит {fN(openAmt)} ₽</span>}
        </div>
      </Card>;
    })()}
    
    {/* Budgets — only in month mode (irrelevant for week/season) */}
    {period==='month'&&<BudgetsCard data={data} cats={cats} catData={catData} sd={sd} sameMo={sameMo} />}
  </div>;
}

/* ═══════════════════ BUDGETS CARD ═══════════════════ */
function BudgetsCard({data,cats,catData,sd}){
  const [editing,setEditing]=useState(false);
  const budgets=data.categoryBudgets||{};
  const now=new Date();
  const isCur=now.getFullYear()===sd.getFullYear()&&now.getMonth()===sd.getMonth();
  const dim=new Date(sd.getFullYear(),sd.getMonth()+1,0).getDate();
  const dayOfMonth=isCur?now.getDate():dim;
  const expectedRatio=dayOfMonth/dim;
  const hasBudgets=Object.values(budgets).some(v=>v>0);
  
  return <Card>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
      <span style={LS}>Бюджеты по категориям</span>
      <button onClick={()=>setEditing(!editing)} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)'}}>{editing?'Готово':'✏️ Изменить'}</button>
    </div>
    {!hasBudgets&&!editing&&<div style={{fontSize:13,color:'var(--muted)',padding:'8px 0',lineHeight:1.5}}>Установи лимит расходов для каждой категории. Когда подойдёшь к лимиту — увидишь индикатор в статистике (без раздражающих уведомлений).</div>}
    {editing?<EditBudgetsList data={data} cats={cats}/>:hasBudgets?cats.filter(c=>budgets[c.id]>0).map(c=>{
      const cd=catData.find(x=>x.id===c.id);
      const spent=cd?.value||0;
      const budget=budgets[c.id];
      const pct=budget>0?(spent/budget)*100:0;
      const expectedSpent=budget*expectedRatio;
      const isOverpaced=spent>expectedSpent*1.15;
      const isUnder=spent<expectedSpent*0.85;
      const color=pct>=100?'var(--danger)':pct>=85?'var(--warning)':isUnder?'var(--success)':'var(--accent)';
      return <div key={c.id} style={{marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',fontSize:13,marginBottom:5}}>
          <span>{c.icon} {c.name}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:12}}><span style={{color}}>{fN(spent)}</span> <span style={{color:'var(--muted2)'}}>/ {fN(budget)} ₽</span></span>
        </div>
        <div style={{background:'var(--s3)',borderRadius:99,height:6,overflow:'hidden',position:'relative'}}>
          <div style={{position:'absolute',left:`${expectedRatio*100}%`,top:0,bottom:0,width:1,background:'var(--muted2)',zIndex:2}}/>
          <div style={{height:'100%',width:`${Math.min(100,pct)}%`,background:color,borderRadius:99,transition:'width .8s'}}/>
        </div>
        <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:3,display:'flex',justifyContent:'space-between'}}>
          <span>{Math.round(pct)}%</span>
          {isCur&&<span>{isOverpaced?'⚠️ перерасход':isUnder?'✓ экономия':'в норме'}</span>}
        </div>
      </div>;
    }):null}
  </Card>;
}

function EditBudgetsList({data,cats}){
  const [edits,setEdits]=useState(()=>({...data.categoryBudgets||{}}));
  return <div>{cats.filter(c=>c.id!=='lunch').map(c=>
    <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontSize:18,width:24,textAlign:'center'}}>{c.icon}</span>
      <span style={{flex:1,fontSize:13}}>{c.name}</span>
      <input type="number" value={edits[c.id]||''} onChange={e=>{const next={...edits,[c.id]:Math.max(0,parseMoney(e.target.value)||0)};setEdits(next);window.dispatchEvent(new CustomEvent('finance-budget-update',{detail:next}));}} placeholder="0" style={{width:100,textAlign:'right',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text)',fontFamily:'var(--mono)',fontSize:13,outline:'none'}}/>
      <span style={{fontSize:12,color:'var(--muted)'}}>₽</span>
    </div>
  )}</div>;
}

/* ═══════════════════ HISTORY ═══════════════════ */
function HistoryPage({data,upd,cats,hd,setHd,msg,setEditTx,setConfirm,toR,go}) {
  const [filter,setF]=useState('all');
  const [accFilter,setAccFilter]=useState('');
  const [catFilter,setCatFilter]=useState('');
  const [tagFilter,setTagFilter]=useState('');
  const [showFilters,setShowFilters]=useState(false);
  const [showRange,setShowRange]=useState(false);
  const [rangeFrom,setRangeFrom]=useState('');
  const [rangeTo,setRangeTo]=useState('');
  const txs=getMTx(data.transactions,hd);
  const monthTransfers=(data.transfers||[]).filter(tr=>{const d=pD(tr.date);return d.getFullYear()===hd.getFullYear()&&d.getMonth()===hd.getMonth()});
  const allTags=[...new Set((data.transactions||[]).flatMap(t=>(t.tags||[]).filter(tg=>tg!=='постоянный')))];
  const accounts=data.accounts||[];
  let fl=txs;
  if(filter==='income')fl=fl.filter(t=>t.type==='income');
  else if(filter==='lunch')fl=fl.filter(t=>t.cat==='lunch');
  else if(filter==='expense')fl=fl.filter(t=>t.type==='expense'&&t.cat!=='lunch');
  if(accFilter)fl=fl.filter(t=>t.accountId===accFilter);
  if(catFilter)fl=fl.filter(t=>t.cat===catFilter);
  if(tagFilter)fl=fl.filter(t=>(t.tags||[]).includes(tagFilter));
  const items=[...fl.map(t=>({kind:'tx',data:t,date:t.date}))];
  if(filter==='all'&&!accFilter&&!catFilter&&!tagFilter)items.push(...monthTransfers.map(tr=>({kind:'transfer',data:tr,date:tr.date})));
  items.sort((a,b)=>a.date!==b.date?(b.date>a.date?1:-1):((b.data.id||'').localeCompare(a.data.id||'')));
  const del=id=>setConfirm({text:'Удалить операцию?',action:()=>{try{upd(d=>deleteTransaction(d,id));msg('✓ Удалено');}catch(e){msg(e.message);}}});
  const clearFilters=()=>{setAccFilter('');setCatFilter('');setTagFilter('');};
  const hasFilters=accFilter||catFilter||tagFilter;

  return <div>
    <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:24,paddingTop:8,gap:12}}>
      <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',lineHeight:1}}>История</div>
      {go&&<button onClick={()=>go('search')} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'8px 14px',color:'var(--text-soft)',fontSize:13,cursor:'pointer',fontFamily:'var(--sans)',display:'flex',alignItems:'center',gap:6}}>⌕ Поиск</button>}
    </div>
    <MN date={hd} onChange={d=>setHd(new Date(hd.getFullYear(),hd.getMonth()+d,1))}/>
    <div style={{marginBottom:12}}><Seg options={[{value:'all',label:'Все'},{value:'expense',label:'Расходы'},{value:'income',label:'Доходы'},{value:'lunch',label:'Обеды'}]} value={filter} onChange={setF}/></div>
    <div style={{display:'flex',gap:8,marginBottom:16}}>
      <button onClick={()=>setShowFilters(!showFilters)} style={{flex:1,background:hasFilters?'var(--accent-dim)':'var(--s2)',border:`1px solid ${hasFilters?'var(--accent)':'var(--border)'}`,borderRadius:10,padding:'8px 14px',color:hasFilters?'var(--accent)':'var(--muted)',fontSize:12,cursor:'pointer',fontWeight:500}}>⚲ Фильтры {hasFilters?`(${[accFilter,catFilter,tagFilter].filter(Boolean).length})`:''}</button>
      <button onClick={()=>setShowRange(!showRange)} style={{flex:1,background:showRange?'var(--accent-dim)':'var(--s2)',border:`1px solid ${showRange?'var(--accent)':'var(--border)'}`,borderRadius:10,padding:'8px 14px',color:showRange?'var(--accent)':'var(--muted)',fontSize:12,cursor:'pointer',fontWeight:500}}>📊 Сумма за период</button>
      {hasFilters&&<button onClick={clearFilters} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>Сброс</button>}
    </div>
    {showRange&&<Card style={{padding:14}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <DateInput label="С" value={rangeFrom} onChange={setRangeFrom}/>
        <DateInput label="По" value={rangeTo} onChange={setRangeTo}/>
      </div>
      {rangeFrom&&rangeTo&&(()=>{
        const rangeTxs=data.transactions.filter(t=>t.date>=rangeFrom&&t.date<=rangeTo);
        const rE=rangeTxs.filter(t=>t.type==='expense'&&t.cat!=='lunch').reduce((a,t)=>a+historicalRub(t,toR),0);
        const rI=rangeTxs.filter(t=>t.type==='income').reduce((a,t)=>a+historicalRub(t,toR),0);
        const rL=rangeTxs.filter(t=>t.cat==='lunch').reduce((a,t)=>a+historicalRub(t,toR),0);
        const days=Math.max(1,Math.round((pD(rangeTo)-pD(rangeFrom))/86400000)+1);
        return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:8}}>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Расходы</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:'var(--danger)',marginTop:3}}>{fmt(rE)}</div></div>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Доходы</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:'var(--success)',marginTop:3}}>{fmt(rI)}</div></div>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>Обеды</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:'var(--warning)',marginTop:3}}>{fmt(rL)}</div></div>
          <div><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)'}}>В среднем/день</div><div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:'var(--accent)',marginTop:3}}>{fmt(rE/days)}</div></div>
        </div>;
      })()}
    </Card>}
    {showFilters&&<Card style={{padding:14}}>
      {accounts.length>0&&<Sel label="Счёт" value={accFilter} onChange={e=>setAccFilter(e.target.value)}><option value="">Любой</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Sel>}
      <Sel label="Категория" value={catFilter} onChange={e=>setCatFilter(e.target.value)}><option value="">Любая</option>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Sel>
      {allTags.length>0&&<div><label style={LS}>Тег</label><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{allTags.map(t=><button key={t} onClick={()=>setTagFilter(tagFilter===t?'':t)} style={{background:tagFilter===t?'var(--accent-dim)':'var(--s2)',border:`1px solid ${tagFilter===t?'var(--accent)':'var(--border)'}`,color:tagFilter===t?'var(--accent)':'var(--muted)',fontSize:12,padding:'4px 10px',borderRadius:8,cursor:'pointer',fontFamily:'var(--mono)'}}>{t}</button>)}</div></div>}
    </Card>}
    {items.length===0?<Card><Empty icon="📋" text="Нет операций"/></Card>:(()=>{
      // Group items by date
      const groups={};
      items.forEach(i=>{
        if(!groups[i.date]) groups[i.date]=[];
        groups[i.date].push(i);
      });
      const sortedDates=Object.keys(groups).sort((a,b)=>b>a?1:-1);
      
      const dayLabel=ds=>{
        const d=pD(ds);
        const today_=new Date();
        const yest=new Date(today_.getTime()-86400000);
        if(dStr(today_)===ds) return 'Сегодня';
        if(dStr(yest)===ds) return 'Вчера';
        const wd=['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][d.getDay()];
        return `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}, ${wd}`;
      };
      
      const renderItem=i=>{
        if(i.kind==='tx') return <TxRow key={i.data.id} t={i.data} allCats={cats} accounts={accounts} onClick={()=>setEditTx(i.data)} onDelete={id=>del(id,i.data)}/>;
        const tr=i.data;
        const fromAcc=accounts.find(a=>a.id===tr.from);
        const toAcc=accounts.find(a=>a.id===tr.to);
        const isExt=tr.from===null;
        return <div key={tr.id} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 0 13px 10px',borderBottom:'1px solid var(--border)',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:3,borderRadius:2,background:'var(--accent2)',opacity:.7}}/>
          <div style={{width:40,height:40,borderRadius:12,background:'#5b9fd41a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{isExt?'📥':'⇄'}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{isExt?'Внешнее зачисление':`${fromAcc?.name||'?'} → ${toAcc?.name||'?'}`}</div>
            <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tr.note||(isExt?'Зачисление':'Перевод')}{tr.fee>0?` · комиссия ${fN(tr.fee)}₽`:''}</div>
          </div>
          <span style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:'var(--accent2)',flexShrink:0}}>{fN(tr.amount)} ₽</span>
        </div>;
      };
      
      return sortedDates.map(ds=>{
        const dayItems=groups[ds];
        // Day total: sum expenses, lunches, transfers (out)
        let dayTotal=0;
        dayItems.forEach(i=>{
          if(i.kind==='tx'){
            if(i.data.type==='expense') dayTotal+=toR(i.data.amount,i.data.currency||'RUB');
          }
        });
        return <div key={ds} style={{marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'0 4px',marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:600,color:'var(--accent)',fontFamily:'var(--mono)',letterSpacing:'0.02em'}}>{dayLabel(ds)}</span>
            {dayTotal>0&&<span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--muted)'}}>{fN(dayTotal)} ₽</span>}
          </div>
          <Card style={{padding:'4px 16px',marginBottom:0}}>
            {dayItems.map(renderItem)}
          </Card>
        </div>;
      });
    })()}
  </div>;
}

/* ═══════════════════ SETTINGS ═══════════════════ */
function SettingsPage({data,upd,setData,msg,cats,setConfirm,go}) {
  const [notif,setNotif]=useState(typeof Notification!=='undefined'?Notification.permission:'unsupported');
  const [biometric,setBiometric]=useState(typeof window!=='undefined'?!!localStorage.getItem('finance-passkey-id'):false);
  const [csvFrom,setCsvFrom]=useState(()=>{const d=new Date();d.setDate(1);return dStr(d);});
  const [csvTo,setCsvTo]=useState(today());
  const [csvOpen,setCsvOpen]=useState(false);
  const sv=(k,v)=>upd(d=>({...d,settings:{...d.settings,[k]:parseMoney(v)||0}}));
  const exp=()=>{const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='finance_'+today()+'.json';a.click();msg('✓ Экспортировано');};
  const imp=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;const r=new FileReader();r.onload=ev=>{try{const imported=migrateData(JSON.parse(ev.target.result),DEFAULT_DATA);setConfirm({text:`Заменить текущие данные? В бэкапе ${imported.transactions.length} операций и ${imported.accounts.length} счетов. Сначала сохраните текущий JSON кнопкой «Экспорт».`,action:()=>{const next={...imported,_pinHash:getStoredPinHash(),_pending:true};setData(next);msg('✓ Импортировано. Остатки сохранены без пересчёта');}});}catch(err){msg('Импорт отменён: '+err.message);}};r.readAsText(f);};

  const delCat=id=>{if(data.transactions.some(t=>t.cat===id)||(data.recurring||[]).some(r=>r.cat===id)){msg('Категория используется. Удаление отменено');return;}upd(d=>({...d,customCats:(d.customCats||[]).filter(c=>c.id!==id)}));};
  const updCat=(id,field,val)=>upd(d=>({...d,customCats:(d.customCats||[]).map(c=>c.id===id?{...c,[field]:val}:c)}));
  
  // CSV export
  const csvEsc=v=>{
    if(v===null||v===undefined) return '';
    const s=String(v);
    if(s.includes(';')||s.includes('"')||s.includes('\n')||s.includes(',')) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  };
  const csvLine=arr=>arr.map(csvEsc).join(';');
  
  const exportCSV=()=>{
    if(!csvFrom||!csvTo){msg('Выбери диапазон');return;}
    if(csvFrom>csvTo){msg('Начало позже конца');return;}
    const accs=data.accounts||[];
    const accName=id=>{const a=accs.find(x=>x.id===id);return a?`${a.icon} ${a.name}`:'';};
    const catName=id=>{const c=cats.find(x=>x.id===id);return c?c.name:(id==='lunch'?'Обеды':id==='income'?'Доход':id||'');};
    
    // Filter transactions in range
    const txs=(data.transactions||[]).filter(t=>t.date>=csvFrom&&t.date<=csvTo);
    const sortedTxs=[...txs].sort((a,b)=>a.date>b.date?1:-1);
    
    // Filter transfers
    const transfers=(data.transfers||[]).filter(t=>t.date>=csvFrom&&t.date<=csvTo);
    
    // Filter debts that overlap
    const debts=(data.debts||[]).filter(d=>{
      const created=d.date>=csvFrom&&d.date<=csvTo;
      const hasPayInRange=(d.payments||[]).some(p=>p.date>=csvFrom&&p.date<=csvTo);
      return created||hasPayInRange;
    });
    
    // Calculate totals
    let totalIncome=0,totalExpense=0,totalLunch=0;
    const byCategory={};
    txs.forEach(t=>{
      const amount=t.amountRub||t.amount||0;
      if(t.type==='income') totalIncome+=amount;
      else if(t.cat==='lunch') totalLunch+=amount;
      else if(t.type==='expense') {
        totalExpense+=amount;
        if(!byCategory[t.cat]) byCategory[t.cat]={count:0,total:0};
        byCategory[t.cat].count++;
        byCategory[t.cat].total+=amount;
      }
    });
    const days=Math.max(1,Math.round((pD(csvTo)-pD(csvFrom))/86400000)+1);
    
    // Build CSV with BOM for Excel UTF-8 compat
    const lines=[];
    lines.push('\ufeff'+csvLine(['ОТЧЁТ ПО ФИНАНСАМ']));
    lines.push(csvLine(['Период:',`${dDisp(csvFrom)} — ${dDisp(csvTo)}`]));
    lines.push(csvLine(['Дней:',days]));
    lines.push(csvLine(['Сформирован:',new Date().toLocaleString('ru-RU')]));
    lines.push('');
    
    // Сводка
    lines.push(csvLine(['=== СВОДКА ===']));
    lines.push(csvLine(['Доходы',totalIncome.toFixed(2)]));
    lines.push(csvLine(['Расходы (без обедов)',totalExpense.toFixed(2)]));
    lines.push(csvLine(['Обеды',totalLunch.toFixed(2)]));
    lines.push(csvLine(['Всего трат',(totalExpense+totalLunch).toFixed(2)]));
    lines.push(csvLine(['Баланс',(totalIncome-totalExpense-totalLunch).toFixed(2)]));
    lines.push(csvLine(['Среднее в день (расходы)',((totalExpense+totalLunch)/days).toFixed(2)]));
    lines.push('');
    
    // По категориям
    if(Object.keys(byCategory).length>0){
      lines.push(csvLine(['=== ПО КАТЕГОРИЯМ ===']));
      lines.push(csvLine(['Категория','Кол-во','Сумма ₽','% от расходов']));
      Object.entries(byCategory).sort((a,b)=>b[1].total-a[1].total).forEach(([cid,v])=>{
        const pct=totalExpense>0?(v.total/totalExpense*100).toFixed(1):0;
        lines.push(csvLine([catName(cid),v.count,v.total.toFixed(2),pct+'%']));
      });
      lines.push('');
    }
    
    // Транзакции
    lines.push(csvLine(['=== ТРАНЗАКЦИИ ===']));
    lines.push(csvLine(['Дата','Тип','Категория','Описание','Сумма','Валюта','Сумма ₽','Счёт','Теги']));
    sortedTxs.forEach(t=>{
      const type=t.type==='income'?'Доход':t.cat==='lunch'?'Обед':'Расход';
      lines.push(csvLine([
        dDisp(t.date),type,catName(t.cat),t.note||'',
        (t.amount||0).toFixed(2),t.currency||'RUB',
        (t.amountRub||t.amount||0).toFixed(2),
        accName(t.accountId),(t.tags||[]).join(',')
      ]));
    });
    lines.push('');
    
    // Переводы между счетами
    if(transfers.length>0){
      lines.push(csvLine(['=== ПЕРЕВОДЫ И ЗАЧИСЛЕНИЯ ===']));
      lines.push(csvLine(['Дата','Тип','Откуда','Куда','Сумма','Комиссия','Заметка']));
      transfers.forEach(t=>{
        lines.push(csvLine([
          dDisp(t.date),
          t.from===null?'Внешнее зачисление':'Перевод',
          t.from===null?'—':accName(t.from),
          accName(t.to),
          (t.amount||0).toFixed(2),
          (t.fee||0).toFixed(2),
          t.note||''
        ]));
      });
      lines.push('');
    }
    
    // Долги
    if(debts.length>0){
      lines.push(csvLine(['=== ДОЛГИ ===']));
      lines.push(csvLine(['Дата','Тип','Кто','Сумма','Валюта','Выплачено','Остаток','Закрыт','Заметка']));
      debts.forEach(d=>{
        const paid=(d.payments||[]).reduce((s,p)=>s+p.amount,0);
        const type=d.type==='my'?'Я должен':d.type==='tome'?'Мне должны':'Транзит';
        lines.push(csvLine([
          dDisp(d.date),type,d.person,
          (d.amount||0).toFixed(2),d.currency||'RUB',
          paid.toFixed(2),(d.amount-paid).toFixed(2),
          d.closed?'Да':'Нет',d.note||''
        ]));
      });
      lines.push('');
      
      // Платежи по долгам
      const allPayments=[];
      debts.forEach(d=>{(d.payments||[]).filter(p=>p.date>=csvFrom&&p.date<=csvTo).forEach(p=>{
        allPayments.push({...p,debtPerson:d.person,debtType:d.type});
      });});
      if(allPayments.length>0){
        lines.push(csvLine(['=== ПЛАТЕЖИ ПО ДОЛГАМ ===']));
        lines.push(csvLine(['Дата','Кто','Тип долга','Сумма','Заметка']));
        allPayments.sort((a,b)=>a.date>b.date?1:-1).forEach(p=>{
          lines.push(csvLine([
            dDisp(p.date),p.debtPerson,
            p.debtType==='my'?'Я должен':p.debtType==='tome'?'Мне должны':'Транзит',
            (p.amount||0).toFixed(2),p.note||''
          ]));
        });
        lines.push('');
      }
    }
    
    // Текущее состояние счетов
    if(accs.length>0){
      lines.push(csvLine(['=== СЧЕТА (текущий баланс) ===']));
      lines.push(csvLine(['Название','Тип','Баланс','Валюта']));
      accs.forEach(a=>{
        lines.push(csvLine([
          `${a.icon||''} ${a.name}`.trim(),
          a.accType==='savings'?'Копилка':'Обычный',
          (a.balance||0).toFixed(2),
          a.currency||'RUB'
        ]));
      });
      lines.push('');
    }
    
    // Цели (текущее состояние)
    if((data.goals||[]).length>0){
      lines.push(csvLine(['=== ЦЕЛИ (текущее состояние) ===']));
      lines.push(csvLine(['Название','Цель','Отложено','%','Валюта','Создана']));
      (data.goals||[]).forEach(g=>{
        const pct=g.target>0?(g.saved/g.target*100).toFixed(1):0;
        lines.push(csvLine([g.name,(g.target||0).toFixed(2),(g.saved||0).toFixed(2),pct+'%',g.currency||'RUB',dDisp(g.date)]));
      });
    }
    
    const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`finance_${csvFrom}_${csvTo}.csv`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    msg('✓ CSV экспортирован');
  };
  
  const setQuickRange=type=>{
    const now=new Date();
    if(type==='month'){
      const start=new Date(now.getFullYear(),now.getMonth(),1);
      setCsvFrom(dStr(start));setCsvTo(today());
    } else if(type==='prevMonth'){
      const start=new Date(now.getFullYear(),now.getMonth()-1,1);
      const end=new Date(now.getFullYear(),now.getMonth(),0);
      setCsvFrom(dStr(start));setCsvTo(dStr(end));
    } else if(type==='year'){
      const start=new Date(now.getFullYear(),0,1);
      setCsvFrom(dStr(start));setCsvTo(today());
    } else if(type==='all'){
      const txs=data.transactions||[];
      if(txs.length>0){
        const dates=txs.map(t=>t.date).sort();
        setCsvFrom(dates[0]);setCsvTo(today());
      }
    }
  };
  const reqNotif=async()=>{
    if(!('Notification' in window)){msg('Уведомления не поддерживаются');return;}
    const p=await Notification.requestPermission();
    setNotif(p);
    if(p==='granted'){upd(d=>({...d,settings:{...d.settings,notifications:true}}));msg('✓ Включены');new Notification('💰 Финансы',{body:'Напоминание в 21:00'});}
  };
  const enableBio=async()=>{
    if(!isPasskeySupported()){msg('Биометрия не поддерживается');return;}
    const id=await registerPasskey('finance-user');
    if(id){setBiometric(true);msg('✓ Биометрия включена');}
    else msg('Не удалось включить');
  };
  const disableBio=()=>{
    setConfirm({text:'Отключить биометрию?',action:()=>{
      localStorage.removeItem('finance-passkey-id');
      setBiometric(false);msg('✓ Отключено');
    }});
  };
  const resetPin=()=>msg('Смена PIN пока отключена: сначала экспорт и перенос ключа без потери данных');
  const SR=({label,sub,children,last})=><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0',borderBottom:last?'none':'1px solid var(--border)',gap:12}}><div style={{minWidth:0,flex:1}}><div style={{fontSize:14}}>{label}</div>{sub&&<div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{sub}</div>}</div>{children}</div>;

  return <div><PH title="Настройки"/>
    <Card>
      <SR label="Бюджет на месяц (₽)" sub="Общий лимит"><input type="number" defaultValue={data.settings.budget} onBlur={e=>sv('budget',e.target.value)} style={SI}/></SR>
      <SR label="Лимит обеда в день (₽)" sub="По умолчанию 400"><input type="number" defaultValue={data.settings.lunchDaily} onBlur={e=>sv('lunchDaily',e.target.value)} style={SI}/></SR>
      <SR label="Рабочих дней" sub="По умолчанию 22" last><input type="number" defaultValue={data.settings.workDays} onBlur={e=>sv('workDays',e.target.value)} style={SI}/></SR>
    </Card>
    <Card>
      <div style={{...LS,marginBottom:12}}>🏠 Виджеты главной</div>
      <div style={{fontSize:12,color:'var(--muted)',marginBottom:12,lineHeight:1.5}}>Скрой что не нужно. Главная станет компактнее.</div>
      {(()=>{
        const widgets=data.settings.homeWidgets||{};
        const items=[
          {k:'today',l:'Сегодня / Вчера',ic:'📊'},
          {k:'week',l:'График за 7 дней',ic:'📈'},
          {k:'accounts',l:'Счета (горизонтальный)',ic:'🏦'},
          {k:'lunch',l:'Обеды (3 цифры)',ic:'🍱'},
          {k:'debts',l:'Долги',ic:'⇄'},
          {k:'goals',l:'Цели',ic:'◎'},
          {k:'recent',l:'Последние операции',ic:'≡'},
        ];
        const toggle=k=>upd(d=>({...d,settings:{...d.settings,homeWidgets:{...(d.settings.homeWidgets||{}),[k]:widgets[k]===false}}}));
        return items.map((it,i)=>{
          const enabled=widgets[it.k]!==false;
          return <div key={it.k} onClick={()=>toggle(it.k)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:i===items.length-1?'none':'1px solid var(--border)',cursor:'pointer'}}>
            <span style={{fontSize:18,width:24,textAlign:'center'}}>{it.ic}</span>
            <span style={{flex:1,fontSize:14,color:enabled?'var(--text)':'var(--muted)'}}>{it.l}</span>
            <div style={{width:38,height:22,background:enabled?'var(--accent)':'var(--s3)',borderRadius:11,position:'relative',transition:'background .2s'}}>
              <div style={{position:'absolute',top:2,left:enabled?18:2,width:18,height:18,background:'#fff',borderRadius:'50%',transition:'left .2s',boxShadow:'0 1px 3px #0006'}}/>
            </div>
          </div>;
        });
      })()}
    </Card>
    {go&&<Card>
      <SR label="↶ Откатить действие" sub={`История изменений · ${(data.history||[]).length} записей`} last>
        <Btn variant="ghost" onClick={()=>go('changelog')} style={{width:'auto',padding:'8px 14px',fontSize:12}}>Открыть</Btn>
      </SR>
    </Card>}
    <Card>
      <div style={{...LS,marginBottom:12}}>🔐 Безопасность</div>
      <SR label="Заблокировать сейчас" sub="Выйти и потребовать PIN">
        <Btn variant="ghost" onClick={async()=>{await localSaveQueue.catch(()=>{});setSession(false);clearEncKey();try{sessionStorage.removeItem('finance-pin-mem')}catch(e){};location.reload();}} style={{width:'auto',padding:'8px 14px',fontSize:12}}>🔒 Выйти</Btn>
      </SR>
      <SR label="PIN-код" sub="Сбросить и создать новый">
        <Btn variant="ghost" onClick={resetPin} style={{width:'auto',padding:'8px 14px',fontSize:12}}>Сбросить</Btn>
      </SR>
      <SR label="Биометрия / Passkey" sub={biometric?'✓ Включена':isPasskeySupported()?'Touch ID, Face ID, Windows Hello':'Не поддерживается браузером'} last>
        {biometric?<Btn variant="ghost" onClick={disableBio} style={{width:'auto',padding:'8px 14px',fontSize:12}}>Отключить</Btn>:isPasskeySupported()?<Btn variant="ghost" onClick={enableBio} style={{width:'auto',padding:'8px 14px',fontSize:12}}>🔐 Включить</Btn>:<span style={{color:'var(--muted2)',fontSize:13}}>—</span>}
      </SR>
    </Card>
    <Card>
      <div style={{...LS,marginBottom:12}}>Уведомления</div>
      <SR label="В 21:00, пока приложение открыто" sub={notif==='granted'?'✓ Включено':notif==='denied'?'✕ Отклонено':'Не включено'} last>
        {notif==='granted'?<span style={{color:'var(--success)',fontSize:20}}>✓</span>:<Btn variant="ghost" onClick={reqNotif} style={{width:'auto',padding:'8px 16px',fontSize:13}}>🔔 Включить</Btn>}
      </SR>
    </Card>
    <Card><div style={{...LS,marginBottom:12}}>Курсы валют</div>{Object.entries(data.rates).filter(([k])=>k!=='RUB').map(([c,r])=><div key={c} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}><span>1 {c}</span><span style={{fontFamily:'var(--mono)',color:'var(--accent)'}}>{r} ₽</span></div>)}<div style={{fontSize:11,color:'var(--muted2)',marginTop:8}}>Обновлены: {data.ratesUpdated?new Date(data.ratesUpdated).toLocaleString('ru'):'никогда'}</div></Card>
    {(data.customCats||[]).length>0&&<Card><div style={{...LS,marginBottom:12}}>Свои категории</div>{data.customCats.map(c=><div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
      <input value={c.icon} onChange={e=>updCat(c.id,'icon',e.target.value)} style={{width:38,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:6,color:'var(--text)',fontSize:18,textAlign:'center'}}/>
      <input value={c.name} onChange={e=>updCat(c.id,'name',e.target.value)} style={{flex:1,background:'var(--s3)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--text)',fontSize:14}}/>
      <input type="color" value={c.color} onChange={e=>updCat(c.id,'color',e.target.value)} style={{width:32,height:32,border:'none',borderRadius:6,cursor:'pointer',background:'none',padding:0}}/>
      <button onClick={()=>delCat(c.id)} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:14,padding:4}}>✕</button>
    </div>)}</Card>}
    <Card>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:csvOpen?14:0}}>
        <div style={{...LS,marginBottom:0}}>📊 Экспорт в CSV (Excel/Sheets)</div>
        <button onClick={()=>setCsvOpen(!csvOpen)} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--accent)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)'}}>{csvOpen?'Скрыть':'Открыть'}</button>
      </div>
      {csvOpen&&<>
        <div style={{fontSize:12,color:'var(--muted)',marginBottom:14,lineHeight:1.5}}>Транзакции, переводы, долги, категории, счета и цели — всё в одном CSV. Открывается в Excel/Google Sheets/Numbers.</div>
        <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',fontFamily:'var(--mono)',letterSpacing:'.08em',marginBottom:6}}>Быстро</div>
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {[{k:'month',l:'Этот месяц'},{k:'prevMonth',l:'Прошлый месяц'},{k:'year',l:'Этот год'},{k:'all',l:'За всё время'}].map(b=><button key={b.k} onClick={()=>setQuickRange(b.k)} style={{background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'var(--sans)'}}>{b.l}</button>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          <DateInput label="С" value={csvFrom} onChange={setCsvFrom}/>
          <DateInput label="По" value={csvTo} onChange={setCsvTo}/>
        </div>
        {csvFrom&&csvTo&&(()=>{
          const txCount=(data.transactions||[]).filter(t=>t.date>=csvFrom&&t.date<=csvTo).length;
          const trCount=(data.transfers||[]).filter(t=>t.date>=csvFrom&&t.date<=csvTo).length;
          return <div style={{fontSize:12,color:'var(--muted)',padding:'8px 12px',background:'var(--s2)',borderRadius:10,marginBottom:14,fontFamily:'var(--mono)'}}>
            В выгрузке: {txCount} {txCount===1?'операция':txCount<5?'операции':'операций'}{trCount>0?`, ${trCount} перевод${trCount===1?'':'ов'}`:''}
          </div>;
        })()}
        <Btn onClick={exportCSV}>📥 Скачать CSV</Btn>
      </>}
    </Card>
    <Card>
      <SR label="Экспорт" sub="JSON бэкап"><Btn variant="ghost" onClick={exp} style={{width:'auto',padding:'8px 16px',fontSize:13}}>📥</Btn></SR>
      <SR label="Импорт" sub="Загрузить JSON" last><label style={{cursor:'pointer'}}><input type="file" accept=".json" style={{display:'none'}} onChange={imp}/><span style={{display:'inline-block',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:12,padding:'8px 16px',fontSize:13,fontWeight:600,color:'var(--text)'}}>📤</span></label></SR>
    </Card>
    <Card><Btn variant="danger" onClick={()=>setConfirm({text:'Удалить все данные? Это необратимо.',action:()=>{setData({...DEFAULT_DATA});msg('✓ Очищено')}})}>Очистить все данные</Btn></Card>
  </div>;
}

/* ═══════════════════ CALENDAR ═══════════════════ */
function CalendarPage({data,cats,toR,setEditTx}) {
  const [date,setDate]=useState(new Date());
  const [selectedDay,setSelectedDay]=useState(null);
  const y=date.getFullYear(),m=date.getMonth();
  const dim=new Date(y,m+1,0).getDate();
  const firstDow=new Date(y,m,1).getDay();
  // Convert Sunday-first (0=Sun) to Monday-first (0=Mon)
  const offset=firstDow===0?6:firstDow-1;
  const txs=getMTx(data.transactions,date);
  const accs=data.accounts||[];
  const dayMap={};
  txs.filter(t=>t.type==='expense').forEach(t=>{
    const d=pD(t.date).getDate();
    if(!dayMap[d])dayMap[d]={total:0,txs:[]};
    dayMap[d].total+=historicalRub(t,toR);
    dayMap[d].txs.push(t);
  });
  const max=Math.max(...Object.values(dayMap).map(v=>v.total),0);
  const total=txs.filter(t=>t.type==='expense').reduce((a,t)=>a+historicalRub(t,toR),0);
  const today_=new Date();
  const isCurMonth=today_.getFullYear()===y&&today_.getMonth()===m;
  const todayDay=isCurMonth?today_.getDate():null;

  const heatColor=v=>{
    if(v===0||max===0) return 'var(--s2)';
    const ratio=v/max;
    if(ratio<0.25) return '#d45b4f25';
    if(ratio<0.5) return '#d45b4f55';
    if(ratio<0.75) return '#d45b4f88';
    return '#d45b4f';
  };

  return <div><PH title="📅 Календарь" sub={fmt(total)}/>
    <MN date={date} onChange={d=>{setDate(new Date(y,m+d,1));setSelectedDay(null);}}/>
    <Card>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:4,marginBottom:8}}>
        {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=><div key={d} style={{textAlign:'center',fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',textTransform:'uppercase',padding:'4px 0'}}>{d}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:4}}>
        {Array.from({length:offset}).map((_,i)=><div key={'e'+i}/>)}
        {Array.from({length:dim},(_,i)=>{
          const d=i+1;
          const dayData=dayMap[d];
          const v=dayData?.total||0;
          const isToday=d===todayDay;
          const isSel=selectedDay===d;
          return <button key={d} onClick={()=>setSelectedDay(isSel?null:d)} style={{
            aspectRatio:'1',background:heatColor(v),border:`1px solid ${isToday?'var(--accent)':isSel?'var(--accent2)':'transparent'}`,
            borderRadius:8,color:v>max*0.5?'#fff':'var(--text)',fontFamily:'var(--mono)',fontSize:11,fontWeight:isToday?700:500,
            cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,padding:2,
            transition:'all .15s',position:'relative'
          }}>
            <span style={{fontSize:11}}>{d}</span>
            {v>0&&<span style={{fontSize:8,opacity:0.85}}>{fN(Math.round(v))}</span>}
          </button>;
        })}
      </div>
    </Card>
    {selectedDay&&dayMap[selectedDay]&&<Card>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
        <span style={{fontSize:14,fontWeight:600}}>{selectedDay} {MONTHS[m]}</span>
        <span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:'var(--danger)'}}>{fmt(dayMap[selectedDay].total)}</span>
      </div>
      <div style={{padding:'0'}}>{dayMap[selectedDay].txs.sort((a,b)=>b.amount-a.amount).map(t=><TxRow key={t.id} t={t} allCats={cats} accounts={accs} onClick={()=>setEditTx(t)}/>)}</div>
    </Card>}
    <div style={{display:'flex',alignItems:'center',gap:12,fontSize:11,color:'var(--muted)',padding:'8px 4px',justifyContent:'center'}}>
      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:14,background:'var(--s2)',borderRadius:3}}/>0</span>
      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:14,background:'#d45b4f25',borderRadius:3}}/>·</span>
      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:14,background:'#d45b4f55',borderRadius:3}}/>··</span>
      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:14,background:'#d45b4f88',borderRadius:3}}/>···</span>
      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:14,background:'#d45b4f',borderRadius:3}}/>max</span>
    </div>
  </div>;
}

/* ═══════════════════ CHANGELOG (UNDO) ═══════════════════ */
function ChangelogPage({data,upd,cats,msg,toR,setConfirm}) {
  const history=data.history||[];
  const accounts=data.accounts||[];
  
  const undo=(entry)=>{
    setConfirm({text:'Откатить это действие?',action:()=>{
      try { upd(d=>{
        if(['add_tx','delete_tx','edit_tx'].includes(entry.type)) return undoTransaction(d,entry);
        let txs=[...d.transactions];
        let accs=[...(d.accounts||[])];
        let debts=[...(d.debts||[])];
        let goals=[...(d.goals||[])];
        let recurring=[...(d.recurring||[])];
        let hist=(d.history||[]).filter(h=>h.id!==entry.id);
        if(entry.type==='delete_tx'&&entry.before){
          txs=[...txs,entry.before];
          if(entry.before.accountId&&entry.before.type!=='lunch'){
            const sign=entry.before.type==='income'?1:-1;
            accs=accs.map(a=>a.id===entry.before.accountId?{...a,balance:a.balance+sign*entry.before.amount}:a);
          }
        } else if(entry.type==='edit_tx'&&entry.before){
          const cur=txs.find(t=>t.id===entry.before.id);
          if(cur){
            if(cur.accountId&&cur.type!=='lunch'){
              const s=cur.type==='income'?-1:1;
              accs=accs.map(a=>a.id===cur.accountId?{...a,balance:a.balance+s*cur.amount}:a);
            }
            if(entry.before.accountId&&entry.before.type!=='lunch'){
              const s=entry.before.type==='income'?1:-1;
              accs=accs.map(a=>a.id===entry.before.accountId?{...a,balance:a.balance+s*entry.before.amount}:a);
            }
            txs=txs.map(t=>t.id===entry.before.id?entry.before:t);
          }
        } else if(entry.type==='delete_debt'&&entry.before){
          debts=[...debts,entry.before];
        } else if(entry.type==='delete_goal'&&entry.before){
          goals=[...goals,entry.before];
        } else if(entry.type==='delete_acc'&&entry.before){
          accs=[...accs,entry.before];
        } else if(entry.type==='delete_recurring'&&entry.before){
          recurring=[...recurring,entry.before];
        }
        return {...d,transactions:txs,accounts:accs,debts,goals,recurring,history:hist};
      });
      msg('✓ Откатено'); } catch(e) {msg(e.message);}
    }});
  };
  
  const clearAll=()=>setConfirm({text:'Очистить историю изменений?',action:()=>{upd(d=>({...d,history:[]}));msg('✓ Очищено');}});
  
  const fmtTime=ts=>{
    const d=new Date(ts);
    const today_=new Date();
    const isToday=d.toDateString()===today_.toDateString();
    const isYest=d.toDateString()===new Date(today_.getTime()-86400000).toDateString();
    const time=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if(isToday) return `Сегодня в ${time}`;
    if(isYest) return `Вчера в ${time}`;
    return `${dDisp(dStr(d))} в ${time}`;
  };

  const describe=entry=>{
    if(entry.type==='delete_tx'){
      const t=entry.before;
      const cat=cats.find(c=>c.id===t.cat);
      return {icon:'🗑',title:`Удалена операция`,detail:`${t.note||cat?.name||'?'} · ${fN(t.amount)} ₽`,color:'var(--danger)'};
    }
    if(entry.type==='edit_tx'){
      const t=entry.before;
      const cat=cats.find(c=>c.id===t.cat);
      return {icon:'✏️',title:`Изменена операция`,detail:`${t.note||cat?.name||'?'} · ${fN(t.amount)} ₽ → ${fN(entry.after.amount)} ₽`,color:'var(--accent)'};
    }
    if(entry.type==='delete_debt'){
      const d=entry.before;
      return {icon:'🗑',title:`Удалён долг`,detail:`${d.person} · ${fN(d.amount)} ₽${d.type==='my'?' (я должен)':d.type==='tome'?' (мне должны)':' (транзит)'}`,color:'var(--danger)'};
    }
    if(entry.type==='delete_goal'){
      const g=entry.before;
      return {icon:'🗑',title:`Удалена цель`,detail:`${g.name} · ${fN(g.target)} ₽`,color:'var(--danger)'};
    }
    if(entry.type==='delete_acc'){
      const a=entry.before;
      return {icon:'🗑',title:`Удалён счёт`,detail:`${a.icon} ${a.name} · ${fN(a.balance)} ₽`,color:'var(--danger)'};
    }
    if(entry.type==='delete_recurring'){
      const r=entry.before;
      return {icon:'🗑',title:`Удалён постоянный расход`,detail:`${r.name}${!r.variable?` · ${fN(r.amount)} ₽`:' · изменяемый'}`,color:'var(--danger)'};
    }
    return {icon:'•',title:'Действие',detail:'',color:'var(--muted)'};
  };

  return <div><PH title="↶ Откат" sub={history.length>0?`${history.length} ${history.length===1?'запись':history.length<5?'записи':'записей'}`:undefined}/>
    <div style={{fontSize:12,color:'var(--muted)',padding:'0 8px 16px',lineHeight:1.5}}>Последние 50 действий с возможностью отката. Удалил случайно — нажми «Откатить» здесь.</div>
    {history.length===0?<Card><Empty icon="↶" text="История пуста" hint="Здесь будут отображаться твои действия"/></Card>:<>
      <Card style={{padding:'4px 16px'}}>{history.map(entry=>{
        const d=describe(entry);
        return <div key={entry.id} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 0',borderBottom:'0.5px solid var(--border)'}}>
          <div style={{width:38,height:38,borderRadius:11,background:d.color+'15',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{d.icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:500,color:d.color}}>{d.title}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.detail}</div>
            <div style={{fontSize:10,color:'var(--muted2)',fontFamily:'var(--mono)',marginTop:2}}>{fmtTime(entry.ts)}</div>
          </div>
          <button onClick={()=>undo(entry)} style={{background:'var(--accent-dim)',border:'1px solid var(--accent)',borderRadius:8,padding:'7px 12px',color:'var(--accent)',fontSize:11,cursor:'pointer',fontFamily:'var(--mono)',flexShrink:0}}>↶ Откатить</button>
        </div>;
      })}</Card>
      <Card><Btn variant="ghost" onClick={clearAll}>Очистить историю</Btn></Card>
    </>}
  </div>;
}
