import React,{useState,useRef} from 'react';
import {migrateData} from './ledger.js';
import {EMPTY,todayMoscow,money} from './mini-model.js';
import {downloadBackup} from './backup-download.js';
import {telegramClient} from './mini-api.js';

export function previewBackup(input){
  if(!input||!Array.isArray(input.accounts)||!Array.isArray(input.transactions)||!input.settings||!input.rates)throw Error('Это не полный бэкап Бюрджета: нужны accounts, transactions, settings и rates');
  return migrateData(input,EMPTY);
}

// The screen orders accounts for display; account order alone is not a new financial state.
const backupSignature=data=>JSON.stringify({...data,accounts:[...data.accounts].sort((a,b)=>String(a.id).localeCompare(String(b.id)))});

export default function BackupPanel({data,revision,mutate,busy,demo}){
  const exportLock=useRef(false);
  const [exporting,setExporting]=useState(''),[status,setStatus]=useState('');
  const disabled=busy||!!exporting;
  const [candidate,setCandidate]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(''),[confirmed,setConfirmed]=useState('');
  const today=todayMoscow(data.settings.timeZone),signature=backupSignature(data),savedCurrent=saved===signature,confirmedCurrent=confirmed===signature;
  const saveCopy=async(beforeRestore=false)=>{
    if(exportLock.current||busy)return;
    exportLock.current=true;setExporting(beforeRestore?'before':'current');setError('');setStatus('');
    if(beforeRestore){setSaved('');setConfirmed('');}
    try{
      const filename=(beforeRestore?'burget-before-restore-':'burget-backup-')+today+'.json';
      const result=await downloadBackup(data,filename,{revision,beforeRestore,demo});
      if(!result.accepted){setStatus('Скачивание отменено. Копия не сохранена.');return;}
      setStatus(result.native?'Скачивание начато в Telegram. Убедись, что файл сохранился.':'Скачивание начато. Сохрани JSON-файл.');
      if(beforeRestore){setSaved(signature);setConfirmed('');}
    }catch(error){setError(error.message);}finally{exportLock.current=false;setExporting('');}
  };
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
    <button disabled={disabled} className="mini-secondary" onClick={()=>saveCopy()}>{exporting==='current'?'Готовим скачивание…':'Скачать текущий JSON'}</button>
    {telegramClient()?.initData&&!demo&&<p className="mini-small mini-muted">Telegram предложит сохранить файл. Если скачивание недоступно: в чате бота отправь /backup и выбери «Скачать полный JSON».</p>}
    {status&&<p role="status" className="mini-small">{status}</p>}
    <label>Восстановить бэкап<input type="file" disabled={disabled||demo} accept=".json,application/json" onChange={async e=>{
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
      <button className="mini-secondary" disabled={disabled} onClick={()=>saveCopy(true)}>{exporting==='before'?'Готовим скачивание…':'Скачать копию перед заменой'}</button>
      <label className="mini-check"><input type="checkbox" disabled={disabled||!savedCurrent} checked={confirmedCurrent&&savedCurrent} onChange={e=>setConfirmed(e.target.checked?signature:'')}/>Копию сохранил, понимаю: нынешний бюджет будет заменён данными файла</label>
      <button className="mini-primary" disabled={disabled||!savedCurrent||!confirmedCurrent} onClick={restore}>Восстановить проверенный бэкап</button>
      <button className="mini-text-button" disabled={disabled} onClick={()=>setCandidate(null)}>Отмена</button>
    </>}
  </section>;
}
