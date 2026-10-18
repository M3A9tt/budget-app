import AccountVisibility from './AccountVisibility.jsx';
import {orderedAccounts} from './account-balances.js';
import React,{useState} from 'react';
import Icon from './mini-icons.jsx';
import {money} from './mini-model.js';
import {AccountTools} from './FinancePanels.jsx';
import AccountForm from './AccountForm.jsx';
import {isSavings} from './savings.js';
export default function AccountsPage({data,mutate,busy}){
 const [action,setAction]=useState(''),[picked,setPicked]=useState(''),[zero,setZero]=useState(false);
 const accounts=orderedAccounts(data).filter(a=>!isSavings(a)),zeroCount=accounts.filter(a=>a.balance===0).length,visible=accounts.filter(a=>zero?a.balance===0:a.balance!==0);
 return <><div className="account-action-bar">{[['add','plus','Новый счёт'],['transfer','repeat','Перевести'],['reconcile','check','Сверить']].map(([id,icon,label])=><button key={id} data-track={'account_'+id} aria-pressed={action===id} disabled={busy||(id!=='add'&&!data.accounts.length)} onClick={()=>{setPicked('');setAction(action===id?'':id);}}><Icon name={icon}/>{label}</button>)}</div>
 {action&&<section className="account-action-panel"><div className="mini-between"><h2>{action==='add'?'Новый счёт':action==='transfer'?'Перевод между счетами':'Остаток по банку'}</h2><button className="mini-text-button" onClick={()=>setAction('')} aria-label="Закрыть действие">×</button></div>{action==='add'?<AccountForm regularOnly busy={busy} onSave={async values=>{const ok=await mutate(d=>({...d,accounts:[...d.accounts,{id:crypto.randomUUID(),...values}]}),'Счёт добавлен');if(ok)setAction('');return ok;}}/>:<AccountTools data={data} accountId={picked} mutate={async(fn,msg)=>{const ok=await mutate(fn,msg);if(ok)setAction('');return ok;}} busy={busy} action={action}/>}</section>}
 <AccountVisibility zero={zero} setZero={setZero} count={zeroCount}/><div className="account-grid">{visible.map((a,i)=><button key={a.id} className={'account-tile account-tone-'+i%4} data-track="account_reconcile" onClick={()=>{setPicked(a.id);setAction('reconcile');window.scrollTo?.({top:0,behavior:'smooth'});}}><div className="mini-between"><Icon name="wallet"/><span>{a.currency}</span></div><h3>{a.name}</h3><strong>{money(a.balance,a.currency)}</strong></button>)}</div>
 {!accounts.length&&<div className="experience-empty"><Icon name="wallet" size={36}/><h2>С какого счёта начнём?</h2><p>Добавь карту или наличные и текущий остаток.</p><button className="mini-primary" onClick={()=>setAction('add')}>Добавить счёт</button></div>}
 {accounts.length>0&&!visible.length&&<p className="mini-small mini-muted">{zero?'Нулевых счетов нет.':'Пока все счета пустые. Открой вкладку «Нулевые», чтобы выбрать счёт.'}</p>}
 {!!((data.transfers||[]).length+(data.reconciliations||[]).length)&&<details className="mini-card movement-log account-history"><summary><span className="account-history-icon"><Icon name="repeat"/></span><span className="account-history-heading"><strong>Переводы и исправления остатков</strong><small>Между своими счетами и по данным банка</small></span><span className="account-history-count">{(data.transfers||[]).length+(data.reconciliations||[]).length}</span><Icon name="down" size={16}/></summary><p className="mini-small mini-muted">Перевод перемещает деньги между счетами. Исправление остатка показывает, когда ты указал сумму из банка. Обычные покупки — в «Истории».</p><AccountTools data={data} mutate={mutate} busy={busy} action="history"/></details>}</>;
}
