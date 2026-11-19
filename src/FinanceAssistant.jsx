import React,{useEffect,useRef,useState} from 'react';
import {money} from './mini-model.js';
import {moveDate} from './finance-events.js';
import {paymentDate} from './payment-copy.js';
import {financeAnalysis,verifyAssistantSelection} from './finance-assistant.js';
import {apiRequest} from './mini-api.js';

const rubles=cents=>money(cents/100,'RUB');
const period=([from,to])=>from===to?from:from+' — '+to;

function explain(fact,analysis) {
  switch(fact.id) {
    case 'spent': return 'За период записано расходов на '+rubles(fact.amount)+'.';
    case 'coverage': return 'Записи есть за '+fact.days+' из '+fact.totalDays+' дн. периода и за '+fact.priorDays+' из '+fact.priorTotalDays+' дн. предыдущего.';
    case 'comparison': return fact.amount===0?'Записанные расходы за оба периода совпали.':'В предыдущем периоде записано '+rubles(fact.previous)+'. Сейчас '+(fact.amount>0?'больше':'меньше')+' на '+rubles(Math.abs(fact.amount))+'.';
    case 'category': return 'Самое заметное изменение в том же направлении — '+analysis.categoryName+' ('+(fact.amount>0?'+':'−')+rubles(Math.abs(fact.amount))+').';
    case 'safe': return analysis.safe.shortfall
      ?analysis.baselineShortfall===analysis.safe.shortfall
        ?'Первый дефицит приходится на '+paymentDate(analysis.safe.shortfall)+' и в исходном прогнозе, и с покупкой.'
        :'Без ожидаемых доходов первый дефицит по этому сценарию возникнет '+paymentDate(analysis.safe.shortfall)+'.'
      :'Без ожидаемых доходов после покупки останется '+rubles(fact.onDate)+', а до конца прогноза остаток не опустится ниже '+rubles(fact.minimum)+'.';
    case 'income': return 'С ожидаемыми поступлениями на '+rubles(fact.amount)+' минимальный остаток составит '+rubles(fact.minimum)+'.';
    case 'pace': return 'Прогноз учитывает текущий темп расходов '+rubles(fact.amount)+' в день по записям за '+fact.days+' из последних 30 дней.';
    case 'unknown': return 'У части будущих расходов сумма неизвестна. Вывод предварительный.';
  }
}

function AnalysisResult({analysis,selection}) {
  const essentials=analysis.mode==='spending'?['spent','comparison','coverage']:['safe','income','pace'];
  const ids=selection||analysis.facts.map(fact=>fact.id).filter(id=>!essentials.includes(id));
  const plannedIncome=analysis.facts.find(fact=>fact.id==='income')?.amount;
  return <div className="finance-pilot-result" aria-live="polite">
    {analysis.mode==='spending'?<>
      <strong>Расходы · {period(analysis.period)}</strong>
      <p>{explain(analysis.facts.find(fact=>fact.id==='spent'),analysis)}</p>
      <p>Предыдущий период · {period(analysis.previousPeriod)}</p>
      {analysis.comparisonAvailable&&<p>{explain(analysis.facts.find(fact=>fact.id==='comparison'),analysis)}</p>}
      {!analysis.comparisonAvailable&&<p>Для сравнения нужны записанные расходы в обоих периодах.</p>}
      <p>{explain(analysis.facts.find(fact=>fact.id==='coverage'),analysis)}</p>
    </>:<>
      <strong>{analysis.unknown?'Предварительный прогноз':analysis.safe.shortfall?'Прогноз показывает дефицит':'По прогнозу денег хватит'}</strong>
      <p>{rubles(analysis.amount)} · {paymentDate(analysis.date)} · прогноз до {paymentDate(analysis.lastDay)}</p>
      <strong>Без ожидаемых доходов</strong>
      <dl>
        <dt>Остаток после покупки</dt><dd>{rubles(analysis.safe.balanceOnPurchase)}</dd>
        <dt>Минимальный остаток</dt><dd>{rubles(analysis.safe.minimum)}</dd>
        <dt>Первый дефицит с покупкой</dt><dd>{analysis.safe.shortfall?paymentDate(analysis.safe.shortfall):'Нет'}</dd>
        {analysis.baselineShortfall&&<>
          <dt>Первый дефицит без покупки</dt><dd>{paymentDate(analysis.baselineShortfall)}</dd>
        </>}
      </dl>
      {plannedIncome>0&&<>
        <strong>С ожидаемыми доходами</strong>
        <dl>
          <dt>Минимальный остаток</dt><dd>{rubles(analysis.expected.minimum)}</dd>
          <dt>Первый дефицит с покупкой</dt><dd>{analysis.expected.shortfall?paymentDate(analysis.expected.shortfall):'Нет'}</dd>
        </dl>
      </>}
      <p>В расчёте свободные деньги без накопительных счетов и известные будущие расходы.</p>
      <p>{explain(analysis.facts.find(fact=>fact.id==='pace'),analysis)}</p>
    </>}
    {selection&&<strong>Проверенное объяснение</strong>}
    {ids.length>0&&<ul>{ids.map(id=><li key={id}>{explain(analysis.facts.find(fact=>fact.id===id),analysis)}</li>)}</ul>}
    {selection&&analysis.unknown&&!ids.includes('unknown')&&<p className="mini-warning">У части будущих расходов сумма неизвестна.</p>}
  </div>;
}

export default function FinanceAssistant({data,today,query,profile,revision,cloud}) {
  const [mode,setMode]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(today);
  const [analysis,setAnalysis]=useState(null),[request,setRequest]=useState(null),[selection,setSelection]=useState(null);
  const [device,setDevice]=useState('checking'),[error,setError]=useState(''),[progress,setProgress]=useState(''),[cloudConfirm,setCloudConfirm]=useState(false);
  const job=useRef(null);

  useEffect(()=>{
    let active=true;
    const probe=async()=>{
      try {
        const gpu=globalThis.navigator?.gpu;
        const adapter=gpu&&await Promise.race([gpu.requestAdapter(),new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);
        if(active)setDevice(adapter?'ready':'unavailable');
      } catch {
        if(active)setDevice('unavailable');
      }
    };
    if(mode)void probe();
    return()=>{active=false;};
  },[mode]);
  useEffect(()=>()=>{job.current?.abort();job.current=null;},[]);

  function clear() {
    job.current?.abort();
    job.current=null;
    setAnalysis(null);
    setRequest(null);
    setSelection(null);
    setProgress('');
    setError('');
    setCloudConfirm(false);
  }

  function calculate(input) {
    clear();
    try {
      setAnalysis(financeAnalysis(data,today,input));
      setRequest(input);
    } catch(cause) {
      setError(cause.message);
    }
  }

  async function run(source) {
    if(job.current||!analysis||!request)return;
    const controller=new AbortController();
    job.current=controller;
    setCloudConfirm(false);
    setSelection(null);
    setError('');
    setProgress(source==='local'?'Подготавливаем модель…':'Запрашиваем облачное объяснение…');
    const timeout=setTimeout(()=>controller.abort(),source==='local'?180_000:14_000);
    try {
      let response;
      if(source==='local') {
        const {runLocalAssistant}=await import('./finance-assistant-local.js');
        response=await runLocalAssistant(analysis,value=>setProgress(value<100?'Загружаем модель · '+value+'%':'Модель разбирает результат…'),controller.signal);
      } else {
        response=await apiRequest('finance-assistant',{
          method:'POST',signal:controller.signal,headers:{'X-Budget-Profile':profile},
          body:JSON.stringify({...request,consent:true,revision,asOf:today})
        });
      }
      if(controller.signal.aborted)throw Error('timeout');
      const verified=verifyAssistantSelection(response,analysis);
      if(!verified)throw Error('invalid result');
      setSelection(verified);
    } catch(cause) {
      if(job.current!==controller)return;
      if(source==='local')setDevice('failed');
      setError(cause.status===409?cause.message:source==='local'?'Локальная модель не смогла подготовить объяснение. Расчёт Бюрджета доступен.':'Облачное объяснение сейчас недоступно. Расчёт Бюрджета доступен.');
    } finally {
      clearTimeout(timeout);
      if(job.current===controller) {
        job.current=null;
        setProgress('');
      }
    }
  }

  const selectedRange={period:query.period};
  for(const key of ['from','to','accountId'])if(query[key])selectedRange[key]=query[key];
  return <section className="mini-card finance-pilot" aria-label="Финансовый помощник">
    <div className="pilot-actions">
      <button type="button" className="mini-secondary" aria-pressed={mode==='spending'} onClick={()=>{
        setMode('spending');
        calculate({mode:'spending',range:selectedRange});
      }}>Разобрать расходы</button>
      <button type="button" className="mini-secondary" aria-pressed={mode==='purchase'} onClick={()=>{
        setMode('purchase');
        clear();
      }}>Хватит ли на покупку?</button>
    </div>
    {mode==='purchase'&&<form className="mini-form" onSubmit={event=>{
      event.preventDefault();
      calculate({mode:'purchase',amount,date});
    }}>
      <label>Сумма покупки, ₽<input inputMode="decimal" required value={amount} onChange={event=>{setAmount(event.target.value);clear();}}/></label>
      <label>Дата покупки<input type="date" required min={today} max={moveDate(today,30)} value={date} onChange={event=>{setDate(event.target.value);clear();}}/></label>
      <button className="mini-secondary">Рассчитать</button>
    </form>}
    {analysis&&<>
      <AnalysisResult analysis={analysis} selection={selection}/>
      {device==='checking'&&<p role="status" className="mini-small">Проверяем поддержку модели на устройстве…</p>}
      {device==='ready'&&!selection&&<div className="mini-form">
        <p className="mini-small">Первый запуск скачает около 880 МБ. Финансовые данные обрабатываются на устройстве.</p>
        <button type="button" className="mini-secondary" disabled={!!progress} onClick={()=>run('local')}>Объяснить локальной моделью</button>
      </div>}
      {['unavailable','failed'].includes(device)&&!selection&&<div className="mini-form">
        {device==='unavailable'&&<p className="mini-small">На этом устройстве локальная модель недоступна.</p>}
        {device==='failed'&&!cloudConfirm&&<button type="button" className="mini-text-button" disabled={!!progress} onClick={()=>run('local')}>Повторить локальный запуск</button>}
        {cloud&&!cloudConfirm&&<button type="button" className="mini-secondary" disabled={!!progress} onClick={()=>setCloudConfirm(true)}>Объяснить в бесплатном облаке</button>}
        {cloud&&cloudConfirm&&<>
          <p className="mini-small">Cloudflare получит расчётные суммы и показатели без списка операций, названий счетов и комментариев.</p>
          <div className="pilot-actions">
            <button type="button" className="mini-secondary" onClick={()=>run('cloud')}>Отправить сводку и объяснить</button>
            <button type="button" className="mini-text-button" onClick={()=>setCloudConfirm(false)}>Отмена</button>
          </div>
        </>}
      </div>}
    </>}
    {progress&&<div className="pilot-actions">
      <p role="status" className="mini-small">{progress}</p>
      <button type="button" className="mini-text-button" onClick={()=>{
        job.current?.abort();
        job.current=null;
        setProgress('');
      }}>Отмена</button>
    </div>}
    {error&&<p role="alert" className="mini-warning">{error}</p>}
  </section>;
}
