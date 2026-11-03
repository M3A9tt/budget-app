import React,{useMemo,useState} from 'react';
import Icon from './mini-icons.jsx';
import {counted} from './analytics-report.js';
import {roundMoney} from './ledger.js';
import {money,todayMoscow} from './mini-model.js';
import {parseImportJson,previewJsonImport,commitJsonImport,downloadJson} from './json-import.js';
export const lunchExample=date=>({format:'burget-operations',version:1,operations:[{date,type:'lunch',amount:379,currency:'RUB',note:'Суп, горячее, хлеб'}]});
export function lunchPrompt(date){return `Составь JSON для импорта оплаченного обеда компании в Бюрджет: {"format":"burget-operations","version":1,"operations":[{"date":"${date}","type":"lunch","amount":379,"currency":"RUB","note":"Выбранные блюда"}]}. 379 — пример, замени фактическим итогом выбранных блюд. Дата ${date} — сегодня; для другого дня уточни дату. Не выдумывай сумму и заказ: если прислан весь прайс, спроси, какие блюда и количества выбраны. Не считай все позиции меню заказом. Для нескольких обедов сделай отдельные операции. Не добавляй account, category, paymentMethod или комиссию: это оплата компанией. Личные доплаты сюда не включай. Верни только JSON без Markdown; запись будет подтверждена в приложении.`;}
export default function LunchImport({data,mutate,busy,onClose}){
 const [source,setSource]=useState('file'),[fileName,setFileName]=useState('');
 const [text,setText]=useState(''),[doc,setDoc]=useState(null),[error,setError]=useState(''),[prompt,setPrompt]=useState(false),[excluded,setExcluded]=useState([]);
 const today=todayMoscow(data.settings.timeZone),rows=useMemo(()=>doc?previewJsonImport(data,doc,{excluded}):null,[data,doc,excluded]);
 const selected=rows?.filter(r=>!r.excluded&&!r.error&&!r.duplicate)||[],total=roundMoney(selected.reduce((n,r)=>n+r.transaction.amount,0));
 const check=()=>{try{const value=parseImportJson(text);if(value.operations.length>100)throw Error('За один раз можно проверить до 100 обедов. Раздели файл на части.');if(value.operations.some(r=>r?.type!=='lunch'))throw Error('Здесь принимаются только обеды компании с type: lunch. Личные расходы — в общем импорте.');if(value.operations.some(r=>r.date>today))throw Error('В JSON должны быть уже оплаченные обеды, без будущих дат');setDoc(value);setExcluded([]);setError('');}catch(e){setDoc(null);setError(e.message);}};
 const updateText=value=>{setText(value);setDoc(null);setError('');};
 return <section className="mini-form lunch-import view-slide">
  <header className="lunch-import-heading">
    <button type="button" className="icon-button" aria-label="К таблице обедов" onClick={onClose}><Icon name="back"/></button>
    <div className="history-heading lunch-detail-title"><h1 className="mini-title">Импорт обедов</h1></div>
  </header>
  <div className="mini-tabs lunch-import-sources" role="group" aria-label="Источник JSON">
    <button type="button" aria-pressed={source==='file'} onClick={()=>setSource('file')}><Icon name="file" size={18}/> Файл</button>
    <button type="button" aria-pressed={source==='text'} onClick={()=>setSource('text')}><Icon name="message" size={18}/> Текст</button>
  </div>
  {source==='file'?<label className="lunch-upload view-slide">
    <Icon name="file" size={24}/>
    <strong>{fileName||'Выбрать JSON-файл'}</strong>
    <input type="file" aria-label="Выбрать JSON-файл" accept=".json,application/json" disabled={busy}
      onChange={async e=>{
        const file=e.target.files[0];
        e.target.value='';
        if(!file)return;
        try{
          if(file.size>2_000_000)throw Error('Файл больше 2 МБ');
          updateText(await file.text());
          setFileName(file.name);
        }catch(error){setError(error.message);}
      }}/>
  </label>:<textarea className="view-slide" rows="5" aria-label="Вставить JSON" value={text} onChange={e=>{setFileName('');updateText(e.target.value);}} placeholder="Вставить JSON"/>}
  <button type="button" className="mini-primary" disabled={busy||!text.trim()} onClick={check}><Icon name="check"/> Проверить</button>{error&&<p role="alert">{error}</p>}
 {rows&&<><h3>{counted(selected.length,'новый обед','новых обеда','новых обедов')} · {money(total)}</h3>{rows.filter(r=>!r.excluded).slice(0,100).map(r=><div className="lunch-import-preview-row" key={r.index}><div className="mini-between"><span>{doc.operations[r.index].date} · {r.error||money(doc.operations[r.index].amount)}</span><button type="button" className="mini-text-button" onClick={()=>setExcluded(old=>[...old,r.index])}>Убрать</button></div><p className="mini-small mini-muted">{doc.operations[r.index].note}{r.duplicate?' · Уже есть похожая запись — пропустим':''}</p></div>)}{rows.length>100&&<p className="mini-small">Показаны первые 100 строк. Для удобной проверки раздели большой файл на части.</p>}<button className="mini-primary" disabled={busy||rows.some(r=>r.error)||!selected.length} onClick={async()=>{if(await mutate(d=>commitJsonImport(d,doc,{excluded,affectBalances:false}),'Обеды импортированы')){setDoc(null);setText('');setFileName('');setError('');}}}><Icon name="lunch"/> Записать {counted(selected.length,'обед','обеда','обедов')}</button><p className="mini-small mini-muted">Обеды компании обновят обеденный лимит. Личные счета сохранят свои остатки.</p></>}
 <details className="mini-disclosure lunch-import-help"><summary>Пример и промпт</summary><div className="lunch-import-tools"><button className="mini-text-button" type="button" onClick={()=>downloadJson(lunchExample(today),'burget-lunch-example.json')}><Icon name="download"/> Скачать пример</button><button className="mini-text-button" type="button" onClick={()=>setPrompt(!prompt)}>Показать промпт</button></div>{prompt&&<textarea readOnly rows="6" aria-label="Промпт для обеда" value={lunchPrompt(today)}/>}<pre className="lunch-json-example">{JSON.stringify(lunchExample(today),null,2)}</pre></details></section>;
}
