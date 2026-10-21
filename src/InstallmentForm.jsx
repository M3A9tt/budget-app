import React,{useId,useRef,useState} from 'react';
import {orderedAccounts} from './account-balances.js';
import {createInstallment,installmentSchedule} from './finance-tools.js';
import {money,todayMoscow} from './mini-model.js';
import {sumMoney} from './ledger.js';

const dateLabel=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export default function InstallmentForm({data,mutate,busy,cats}){
 const accounts=orderedAccounts(data),currencies=[...new Set(accounts.map(a=>a.currency||'RUB'))],initialCurrency=currencies.includes('RUB')?'RUB':currencies[0]||'RUB';
 const blank=()=>({id:crypto.randomUUID(),name:'',total:'',count:'',firstDate:todayMoscow(data.settings.timeZone),cadence:'monthly',accountId:'',cat:'other',obligationKind:'installment',currency:initialCurrency});
 const [draft,setDraft]=useState(blank),[step,setStep]=useState(1),[schedule,setSchedule]=useState([]),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const prefix=useId(),heading=useRef(null),saving=useRef(false);
 const set=(key,value)=>{setDraft(d=>({...d,[key]:value,...(key==='currency'?{accountId:''}:{})}));setError('');};
 const field=(key,label,props={})=><label htmlFor={prefix+key}>{label}<input id={prefix+key} name={key} value={draft[key]} onChange={e=>set(key,e.target.value)} {...props}/></label>;
 const focusHeading=()=>requestAnimationFrame(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:'start',behavior:'smooth'});});
 const preview=e=>{e.preventDefault();try{if(!draft.name.trim())throw Error('Напиши, за что платишь');const rows=installmentSchedule(draft),available=accounts.filter(a=>(a.currency||'RUB')===draft.currency);setDraft(d=>({...d,accountId:available.some(a=>a.id===d.accountId)?d.accountId:available.length===1?available[0].id:''}));setSchedule(rows);setError('');setStep(2);focusHeading();}catch(e){setError(e.message);}};
 const save=async e=>{e.preventDefault();if(saving.current||busy)return;saving.current=true;setError('');try{const account=data.accounts.find(a=>a.id===draft.accountId);if(!account||(account.currency||'RUB')!==draft.currency)throw Error('Выбери счёт в валюте графика');if(await mutate(d=>createInstallment(d,draft),'График добавлен. Деньги пока не списаны.')){setDraft(blank());setStep(1);setSchedule([]);setOpen(false);}}catch(e){setError(e.message);}finally{saving.current=false;}};
 return <details className="mini-card mini-disclosure installment-create" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Добавить сплит, рассрочку или кредит</summary>
 {!accounts.length?<p className="mini-small mini-muted">Сначала добавь счёт в разделе «Счета» — с него будут оплачиваться платежи.</p>:<form className="mini-form" onSubmit={step===1?preview:save}>
 <div className="installment-steps" aria-label={`Шаг ${step} из 2`}><span className={step===1?'current':''}>1 · Что осталось</span><span className={step===2?'current':''}>2 · Проверка</span></div>
 <h3 ref={heading} tabIndex={-1}>{step===1?'Оставшиеся платежи':'Проверь график'}</h3>
 {step===1?<>
 {field('name','За что платишь?',{required:true,maxLength:100,placeholder:'Например, телефон или заказ в Маркете',autoComplete:'off'})}
 <div className="installment-amount">{field('total','Осталось заплатить',{required:true,inputMode:'decimal',placeholder:'9 000', 'aria-describedby':prefix+'amount-hint'})}<label htmlFor={prefix+'currency'}>Валюта<select aria-label="Валюта" id={prefix+'currency'} value={draft.currency} onChange={e=>set('currency',e.target.value)}>{currencies.map(c=><option key={c} value={c}>{c==='RUB'?'₽':c}</option>)}</select></label></div>
 <p className="installment-hint" id={prefix+'amount-hint'}>Только неоплаченная часть, включая известные проценты и комиссии.</p>
 <div className="installment-fields">{field('count','Осталось платежей',{required:true,type:'number',inputMode:'numeric',min:1,max:600,step:1,placeholder:'3'})}<label htmlFor={prefix+'cadence'}>Как часто<select aria-label="Как часто" id={prefix+'cadence'} value={draft.cadence} onChange={e=>set('cadence',e.target.value)}><option value="monthly">Раз в месяц</option><option value="biweekly">Раз в 2 недели</option><option value="weekly">Раз в неделю</option></select></label></div>
 {field('firstDate','Ближайший неоплаченный платёж',{type:'date',required:true})}
 <details className="installment-example"><summary>Если часть уже оплачена</summary><p>Телефон стоит 12 000 ₽. Первые 3 000 ₽ уже оплатил — введи <b>9 000 ₽</b> и <b>3 оставшихся платежа</b>. Дата — следующего списания. Уже оплаченные части в этот график не добавляй.</p></details>
 <p className="installment-hint">Разделим остаток на равные части. Частоту и дату возьми из графика банка или сервиса.</p>
 <button className="mini-primary" disabled={busy}>Посмотреть график</button>
 </>:<>
 <div className="installment-preview-total"><span>{draft.name}</span><strong>{money(sumMoney(schedule,p=>p.amount),draft.currency)}</strong><small>осталось · {schedule.length} платежей</small></div>
 <ol className="installment-preview">{schedule.slice(0,3).map((p,i)=><li key={p.date}><span><small>Платёж {i+1}</small>{dateLabel(p.date)}</span><b>{money(p.amount,draft.currency)}</b></li>)}</ol>
 {schedule.length>3&&<details className="obligation-schedule"><summary>Ещё {schedule.length-3} платежей · до {dateLabel(schedule.at(-1).date)}</summary><ol className="installment-preview" start={4}>{schedule.slice(3).map((p,i)=><li key={p.date}><span><small>Платёж {i+4}</small>{dateLabel(p.date)}</span><b>{money(p.amount,draft.currency)}</b></li>)}</ol></details>}
 <label htmlFor={prefix+'accountId'}>С какого счёта платить<select required aria-label="С какого счёта платить" id={prefix+'accountId'} value={draft.accountId} onChange={e=>set('accountId',e.target.value)}><option value="">Выбрать счёт…</option>{accounts.filter(a=>(a.currency||'RUB')===draft.currency).map(a=><option value={a.id} key={a.id}>{a.name} · {money(a.balance,a.currency)}</option>)}</select></label>
 <details className="installment-example"><summary>Тип и категория</summary><label htmlFor={prefix+'kind'}>Тип графика<select aria-label="Тип графика" id={prefix+'kind'} value={draft.obligationKind} onChange={e=>set('obligationKind',e.target.value)}><option value="installment">Рассрочка</option><option value="split">Сплит</option><option value="loan">Кредит</option><option value="mortgage">Ипотека</option></select></label><label htmlFor={prefix+'cat'}>Категория расходов<select aria-label="Категория расходов" id={prefix+'cat'} value={draft.cat} onChange={e=>set('cat',e.target.value)}>{cats.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label></details>
 <p className="installment-hint">Сейчас деньги не спишутся. Подтверди каждый платёж после списания. Всю покупку отдельным расходом не добавляй.</p>
 <div className="installment-actions"><button type="button" className="mini-secondary" disabled={busy} onClick={()=>{setStep(1);setError('');focusHeading();}}>Назад</button><button className="mini-primary" disabled={busy}>Создать график</button></div>
 </>}{error&&<p className="mini-warning" role="alert">{error}</p>}
 </form>}
 </details>;
}
