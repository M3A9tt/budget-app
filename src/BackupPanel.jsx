import React,{useState} from 'react';
import {migrateData} from './ledger.js';
import {EMPTY,todayMoscow,money} from './mini-model.js';
import {downloadJson} from './json-import.js';

export function previewBackup(input){
  if(!input||!Array.isArray(input.accounts)||!Array.isArray(input.transactions)||!input.settings||!input.rates)throw Error('Это не полный бэкап Бюрджета: нужны accounts, transactions, settings и rates');
  return migrateData(input,EMPTY);
}

// The screen orders accounts for display; account order alone is not a new financial state.
const backupSignature=data=>JSON.stringify({...data,accounts:[...data.accounts].sort((a,b)=>String(a.id).localeCompare(String(b.id)))});

export default function BackupPanel({data,mutate,busy,demo}){
  const [candidate,setCandidate]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(''),[confirmed,setConfirmed]=useState('');
  const today=todayMoscow(data.settings.timeZone),signature=backupSignature(data),savedCurrent=saved===signature,confirmedCurrent=confirmed===signature;
  const restore=async()=>{
    try {
      setError('');
      if(await mutate(current=>{
        if(!savedCurrent||!confirmedCurrent||backupSignature(current)!==saved)throw Error('Бюджет изменился после скачивания копии. Скачайте свежую копию и подтвердите восстановление ещё раз.');
        return candidate;
      },'Бэкап восстановлен, остатки сохранены'))setCandidate(null);
    } catch(error) {setError(error.message);}
  };
  return <section className="mini-card mini-form">
    <h2>Резервная копия</h2>
    <p className="mini-small mini-muted">Экспорт сохраняет все разделы и настройки. Восстановление заменяет твой бюджет целиком, без пересчёта старых остатков. Для добавления выписки используй импорт операций выше.</p>
    <button disabled={busy} className="mini-secondary" onClick={()=>downloadJson(data,'burget-backup-'+today+'.json')}>Скачать текущий JSON</button>
    <label>Восстановить бэкап<input type="file" disabled={busy||demo} accept=".json,application/json" onChange={async e=>{
      const file=e.target.files[0];e.target.value='';if(!file)return;
      try{if(file.size>5_000_000)throw Error('Бэкап больше 5 МБ');setCandidate(previewBackup(JSON.parse(await file.text())));setSaved('');setConfirmed('');setError('');}
      catch(error){setCandidate(null);setError(error.message);}
    }}/></label>
    {error&&<p role="alert">{error}</p>}
    {candidate&&<>
      <h3>Перед заменой проверь</h3>
      <div className="mini-payment-row"><span>Счета</span><b>{data.accounts.length} → {candidate.accounts.length}</b></div>
      <div className="mini-payment-row"><span>Операции</span><b>{data.transactions.length} → {candidate.transactions.length}</b></div>
      <div className="mini-payment-row"><span>Переводы / планы / цели</span><b>{candidate.transfers.length} / {candidate.recurring.length} / {candidate.goals.length}</b></div>
      <details><summary>Остатки из бэкапа</summary>{candidate.accounts.map(a=><p key={a.id}>{a.name} · {money(a.balance,a.currency)}</p>)}</details>
      {candidate.migrationWarnings.length>0&&<p className="mini-warning">Есть {candidate.migrationWarnings.length} старых валютных операций без фактического списания. Остатки сохраняются, их нельзя угадать.</p>}
      {saved&&!savedCurrent&&<p role="status" className="mini-warning">Бюджет обновился. Перед заменой скачай свежую копию — в предыдущей нет последних изменений.</p>}
      <button className="mini-secondary" disabled={busy} onClick={()=>{downloadJson(data,'burget-before-restore-'+today+'.json');setSaved(signature);setConfirmed('');}}>Скачать копию перед заменой</button>
      <label className="mini-check"><input type="checkbox" disabled={busy||!savedCurrent} checked={confirmedCurrent&&savedCurrent} onChange={e=>setConfirmed(e.target.checked?signature:'')}/>Копию сохранил, понимаю: нынешний бюджет будет заменён данными файла</label>
      <button className="mini-primary" disabled={busy||!savedCurrent||!confirmedCurrent} onClick={restore}>Восстановить проверенный бэкап</button>
      <button className="mini-text-button" disabled={busy} onClick={()=>setCandidate(null)}>Отмена</button>
    </>}
  </section>;
}
