import {currencyOptions,currencyOption} from './currency-catalog.js';
import EntryMoney from './EntryMoney.jsx';
import {apiRequest} from './mini-api.js';
import React,{useEffect,useState} from 'react';
import EntryPicker from './EntryPicker.jsx';
import Icon from './mini-icons.jsx';
import {parseMoney} from './ledger.js';

const currencyLabel=code=><span className="selected-currency"><img src={currencyOption(code).flag} width="28" height="21" alt=""/><span>{currencyOption(code).name}</span></span>;
const format=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8,useGrouping:false}).format(value);
const formatAmount=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2,useGrouping:false}).format(value);
export default function CurrencyConverter({data,onRecord,initial,entryType,onReturn}){
 const [live,setLive]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true;
  async function load(){
   if(active)setLoading(true);
   try{
    const result=await apiRequest('exchange-rates');
    if(!result.date||!result.rates||Object.values(result.rates).some(rate=>!Number.isFinite(rate)||rate<=0))throw Error('Некорректные курсы');
    if(active){setLive(result);setError('');}
   }catch{if(active)setError('Источник временно недоступен');}
   finally{if(active)setLoading(false);}
  }
  load();const timer=setInterval(load,15*60*1000);
  return ()=>{active=false;clearInterval(timer);};
 },[refresh]);
 const rates=live?.rates||data.rates;
 const currencies=Object.keys(rates).filter(code=>Number.isFinite(rates[code])&&rates[code]>0);
 const [from,setFrom]=useState(initial?.from||(currencies.includes('USD')?'USD':currencies[0]));
 const [to,setTo]=useState(initial?.to||(currencies.includes('RUB')?'RUB':currencies[0]));
 const [input,setInput]=useState(initial?.amount||'1'),[side,setSide]=useState('from');
 const standard=rates[from]/rates[to];
 const rate=standard;
 const amount=parseMoney(input);
 const valid=Number.isFinite(rate)&&rate>0&&Number.isFinite(amount);
 const result=valid?(side==='from'?amount*rate:amount/rate):NaN;
 const resultValid=valid&&Number.isFinite(result);
 const fromValue=side==='from'?input:resultValid?formatAmount(result):'';
 const toValue=side==='to'?input:resultValid?formatAmount(result):'';
 const pick=(setter,value)=>setter(value);
 const recordCurrency=data.rates[to]?to:(initial?.from&&data.rates[initial.from]?initial.from:'RUB');
 const recordAmount=recordCurrency===to?toValue:resultValid?formatAmount((side==='to'?amount:amount*rate)*rates[to]/rates[recordCurrency]):'';
 const recordValid=resultValid&&Number.isFinite(parseMoney(recordAmount))&&parseMoney(recordAmount)>0;
 const options=current=>currencyOptions(currencies,current);
 return <section className="currency-converter">{onReturn&&<button type="button" className="mini-text-button" onClick={onReturn}><Icon name="back" size={17}/>К записи</button>}
 <div className="converter-source"><span role="status">{loading?'Обновляем курсы…':live?'Банк России · курс на '+live.date.split('-').reverse().join('.'):'Курсы из настроек · актуальность не подтверждена'}</span><button type="button" className="icon-button" aria-label="Обновить курсы" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><Icon name="refresh"/></button></div>
 {error&&<p role="alert" className="mini-warning">{error}. {live?'Показаны последние полученные курсы на '+live.date:'Показаны курсы из настроек приложения.'}</p>}
  <div className="converter-pair">
   <div className="converter-side"><EntryPicker label="Из валюты" value={currencyLabel(from)} options={options(from)} onChange={value=>pick(setFrom,value)}/><EntryMoney id="converter-from" label={'Сумма в '+from} amount={fromValue} unit={from} onAmount={e=>{setSide('from');setInput(e.target.value);}}/></div>
   <button type="button" className="icon-button" aria-label="Поменять валюты местами" onClick={()=>{setFrom(to);setTo(from);setSide(side==='from'?'to':'from');}}><Icon name="repeat"/></button>
   <div className="converter-side"><EntryPicker label="В валюту" value={currencyLabel(to)} options={options(to)} onChange={value=>pick(setTo,value)}/><EntryMoney id="converter-to" label={'Сумма в '+to} amount={toValue} unit={to} onAmount={e=>{setSide('to');setInput(e.target.value);}}/></div>
  </div>
  <p className="mini-small mini-muted">Курс обмена банка может отличаться от официального.</p>
  {onRecord&&<div className="converter-actions">{(entryType?[[entryType,'Использовать '+recordAmount+' '+recordCurrency]]:[['income','Записать доход'],['expense','Записать расход']]).map(([type,label])=><button type="button" className="mini-secondary" key={type} disabled={!recordValid} onClick={()=>onRecord({type,amount:recordAmount,currency:recordCurrency,note:'Конвертация '+fromValue+' '+from+' → '+toValue+' '+to})}><Icon name={type==='income'?'up':'down'} size={18}/>{label}</button>)}</div>}
  {onRecord&&!data.rates[to]&&<p className="mini-small mini-muted">В запись: {recordAmount} {recordCurrency}</p>}
  {input.trim()&&!resultValid&&<p role="alert">Проверь сумму и курс. Курс должен быть больше нуля.</p>}
 </section>;
}
