import React,{useEffect,useRef,useState} from 'react';
import {parseMoney} from './ledger.js';
import AppSelect from './AppSelect.jsx';
import {validDate} from './finance-tools.js';
import {receiptDuplicate} from './receipt-fields.js';

const empty={amount:'',date:'',currency:'',note:''};

export default function ReceiptReview({data,draft,today,onApply,onReview}) {
  const input=useRef(null),job=useRef(null),previewUrl=useRef(null);
  const [stage,setStage]=useState('idle'),[progress,setProgress]=useState(null);
  const [found,setFound]=useState(null),[fields,setFields]=useState(empty),[error,setError]=useState('');
  function releasePreview() {
    if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
    previewUrl.current=null;
  }
  useEffect(()=>()=>{job.current?.abort();releasePreview();},[]);

  function reset() {
    job.current?.abort();
    job.current=null;
    releasePreview();
    setStage('idle');
    setFound(null);
    setFields(empty);
    setError('');
    onReview(false);
  }

  async function scan(event) {
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    job.current?.abort();
    releasePreview();
    const controller=new AbortController();
    job.current=controller;
    const timeout=setTimeout(()=>{
      controller.abort();
      if(job.current!==controller)return;
      job.current=null;
      setError('Распознавание заняло слишком много времени. Попробуй другой снимок или заполни форму вручную.');
      setStage('error');
    },45_000);
    setProgress(null);
    setError('');
    setStage('reading');
    onReview(true);
    try {
      const {recognizeReceipt}=await import('./receipt-ocr.js');
      const result=await recognizeReceipt(file,setProgress,controller.signal);
      if(controller.signal.aborted)return;
      previewUrl.current=URL.createObjectURL(file);
      setFound(result);
      setFields({
        amount:result.totals.length===1?result.totals[0]:'',
        date:result.dates.length===1?result.dates[0]:'',
        currency:Object.hasOwn(data.rates,result.currency)?result.currency:'',
        note:result.merchant
      });
      setStage('review');
    } catch(cause) {
      if(controller.signal.aborted)return;
      setError(cause?.name==='ReceiptImageError'?cause.message:'Не удалось распознать чек. Попробуй более чёткий снимок или заполни форму вручную.');
      setStage('error');
    } finally {
      clearTimeout(timeout);
      if(job.current===controller)job.current=null;
    }
  }

  const change=key=>event=>setFields(current=>({...current,[key]:event.target.value}));
  const amount=parseMoney(fields.amount);
  const future=validDate(fields.date)&&fields.date>today;
  const valid=amount>0&&validDate(fields.date)&&fields.date>='1900-01-01'&&!future&&Object.hasOwn(data.rates,fields.currency);
  const duplicate=valid&&receiptDuplicate(data.transactions,fields);
  return <div className="receipt-review">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={scan}/>
    {stage==='idle'?<button type="button" className="mini-text-button" onClick={()=>input.current?.click()}>Распознать чек</button>:<>
      <div className="pilot-actions">
        {stage!=='reading'&&<button type="button" className="mini-text-button" onClick={()=>input.current?.click()}>Выбрать другой снимок</button>}
        <button type="button" className="mini-text-button" onClick={reset}>Отмена</button>
      </div>
      {stage==='reading'&&<p role="status" className="mini-small">{progress===null?'Подготавливаем распознавание…':'Читаем чек · '+progress+'%'}</p>}
      {error&&<p role="alert" className="mini-warning">{error}</p>}
      {stage==='review'&&<div className="mini-form">
        <strong>Проверь данные чека</strong>
        <details><summary>Посмотреть снимок</summary><img src={previewUrl.current} alt="Снимок чека"/></details>
        {!found.totals.length&&<p className="mini-small">Итог не распознан. Введи сумму вручную.</p>}
        {found.totals.length>1&&<div className="pilot-actions" aria-label="Возможные итоги">
          {found.totals.map(value=><button type="button" className="mini-secondary" key={value} onClick={()=>setFields({...fields,amount:value})}>{value.replace('.',',')}</button>)}
        </div>}
        <label>Итог чека<input inputMode="decimal" value={fields.amount} onChange={change('amount')}/></label>
        {found.dates.length>1&&<div className="pilot-actions" aria-label="Возможные даты">
          {found.dates.map(value=><button type="button" className="mini-secondary" key={value} onClick={()=>setFields({...fields,date:value})}>{value}</button>)}
        </div>}
        <label>Дата чека<input type="date" min="1900-01-01" max={today} value={fields.date} onChange={change('date')}/></label>
        {future&&<p className="mini-warning" role="status">Дата чека в будущем. Укажи фактическую дату покупки.</p>}
        <label>Валюта чека<AppSelect aria-label="Валюта чека" value={fields.currency} onChange={change('currency')}><option value="">Выбери валюту</option>{Object.keys(data.rates).map(code=><option key={code}>{code}</option>)}</AppSelect></label>
        <label>Продавец<input value={fields.note} onChange={change('note')} maxLength={100} placeholder="Необязательно"/></label>
        {duplicate&&<p className="mini-warning" role="status">В истории уже есть расход с такой датой, суммой и валютой. Проверь, тот ли это чек.</p>}
        <button type="button" className="mini-secondary" disabled={!valid} onClick={()=>{
          if(!valid)return;
          onApply({
            amount:amount.toFixed(2),date:fields.date,currency:fields.currency,
            note:fields.note.trim()||draft.note,_receipt:true
          });
          reset();
        }}>Перенести в черновик</button>
      </div>}
    </>}
  </div>;
}
