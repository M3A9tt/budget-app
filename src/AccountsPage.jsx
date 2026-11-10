import {accountBackground} from './appearance.js';
import AccountAppearance from './AccountAppearance.jsx';
import Symbol from './Symbol.jsx';
import AccountVisibility from './AccountVisibility.jsx';
import {orderedAccounts} from './account-balances.js';
import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import {money} from './mini-model.js';
import {AccountTools} from './FinancePanels.jsx';
import AccountForm from './AccountForm.jsx';
import {isSavings} from './savings.js';
export default function AccountsPage({personal=false,data,mutate,busy,onAccount=()=>{},showZero,onShowZero}){
 const [action,setAction]=useState(()=>personal&&!data.accounts.length?'add':''),[localZero,setLocalZero]=useState(false);
 const zero=showZero??localZero,setZero=onShowZero??setLocalZero;
 const accounts=orderedAccounts(data).filter(a=>!isSavings(a)),zeroCount=accounts.filter(a=>a.balance===0).length,visible=accounts.filter(a=>zero||a.balance!==0);
 return <><div className="account-action-bar">{[['add','plus','Новый счёт'],['transfer','repeat','Перевести'],['reconcile','check','Сверить']].map(([id,icon,label])=><button key={id} data-track={'account_'+id} aria-pressed={action===id} disabled={busy||(id!=='add'&&!data.accounts.length)} onClick={()=>{setAction(action===id?'':id);}}><Icon name={icon}/>{label}</button>)}</div>
 {action&&<section className="account-action-panel"><div className="mini-between"><h2>{action==='add'?'Новый счёт':action==='transfer'?'Перевод между счетами':'Остаток по банку'}</h2><button className="mini-text-button" disabled={busy} onClick={()=>setAction('')} aria-label="Закрыть действие">×</button></div>{action==='add'?<AccountForm regularOnly busy={busy} onSave={async values=>{const ok=await mutate(d=>({...d,accounts:[...d.accounts,{id:crypto.randomUUID(),...values}]}),'Счёт добавлен');if(ok)setAction('');return ok;}}/>:<AccountTools key={action} data={data} mutate={async(fn,msg)=>{const ok=await mutate(fn,msg);if(ok)setAction('');return ok;}} busy={busy} action={action}/>}</section>}
 <div className="account-grid">{visible.map((a,i)=><button key={a.id} style={accountBackground(a.colors?.length?a.colors:['#648fa2','#8e7aab'])} className={'account-tile account-tone-'+i%4} data-track="account_open" onClick={()=>onAccount(a.id)}>{personal?<><span className="account-symbol"><Symbol value={a} fallback="wallet"/></span><span className="personal-account-name">{a.name}<small>{a.currency}</small></span><strong>{money(a.balance,a.currency)}</strong><Icon name="arrow" size={17}/></>:<><div className="mini-between"><Symbol value={a} fallback="wallet"/><span>{a.currency}</span></div><h3>{a.name}</h3><strong>{money(a.balance,a.currency)}</strong></>}</button>)}</div><AccountVisibility zero={zero} setZero={setZero} count={zeroCount}/>
 {!accounts.length&&!action&&<div className="experience-empty"><Icon name="wallet" size={36}/><h2>С какого счёта начнём?</h2><p>Добавь карту или наличные и текущий остаток.</p><button className="mini-primary" onClick={()=>setAction('add')}>Добавить счёт</button></div>}
 {accounts.length>0&&!visible.length&&<p className="mini-small mini-muted">{zero?'Нулевых счетов нет.':'Пока все счета пустые. Покажи нулевые счета, чтобы выбрать нужный.'}</p>}
 {!!((data.transfers||[]).length+(data.reconciliations||[]).length)&&<details className="mini-card movement-log account-history"><summary><span className="account-history-icon"><Icon name="repeat"/></span><span className="account-history-heading"><strong>Переводы и исправления остатков</strong><small>Между своими счетами и по данным банка</small></span><span className="account-history-count">{(data.transfers||[]).length+(data.reconciliations||[]).length}</span><Icon name="down" size={16}/></summary><p className="mini-small mini-muted">Перевод перемещает деньги между счетами. Исправление остатка показывает, когда ты указал сумму из банка. Обычные покупки — в общем списке операций.</p><AccountTools data={data} mutate={mutate} busy={busy} action="history"/></details>}</>;
}

export function AccountDetails({account,data,mutate,busy,onBack,onTransfer,onHistory,children}){
 const [reconciling,setReconciling]=useState(false);
 return <>
  <header className="lunch-import-heading lunch-table-heading account-detail-heading"><button type="button" className="icon-button" aria-label="Назад" disabled={busy} onClick={onBack}><Icon name="back"/></button><div className="history-heading"><h1>{account?.name||'Счёт'}</h1></div></header>
  {account?<><div className="account-detail-balance mini-card" style={accountBackground(account.colors)}><Symbol value={account} fallback="wallet"/><span>Текущий остаток</span><strong>{money(account.balance,account.currency)}</strong></div>
  <div className="account-action-bar"><button type="button" onClick={onTransfer} disabled={busy||data.accounts.length<2}><Icon name="repeat"/>Перевести</button><button type="button" aria-expanded={reconciling} onClick={()=>setReconciling(value=>!value)} disabled={busy}><Icon name="check"/>Сверить остаток</button></div>
  {reconciling&&<section className="account-action-panel"><AccountTools data={data} accountId={account.id} action="reconcile" busy={busy} mutate={async(fn,msg)=>{const saved=await mutate(fn,msg);if(saved)setReconciling(false);return saved;}}/></section>}
  <div className="mini-section-title"><h2>Операции</h2><button type="button" className="mini-text-button" onClick={onHistory}>Все операции <Icon name="arrow" size={15}/></button></div>
  {children}
  <AccountAppearance account={account} mutate={mutate} busy={busy}/>
  </>:<p role="status">Счёт больше недоступен.</p>}
 </>;
}
