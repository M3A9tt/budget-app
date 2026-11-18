import React from 'react';
import EntryPicker from './EntryPicker.jsx';
import Icon from './mini-icons.jsx';
import {categoryMinorUnits,draftExpenseAllocations,expenseAllocationDraft,parseAllocationValue} from './expense-allocations.js';
import {money} from './mini-model.js';

export default function EntryAllocations({allocation,onChange,categories,amount,currency,disabled}) {
  if(!allocation)return <button type="button" className="mini-text-button entry-allocation-toggle" onClick={()=>onChange({
    mode:'amount',rows:[{cat:categories.find(item=>item.selected)?.id||'',amount:'',percent:''},{cat:'',amount:'',percent:''}]
  })}><Icon name="plus" size={16}/>Разделить по категориям</button>;

  const {mode,rows}=allocation;
  const percent=mode==='percent';
  const entered=rows.reduce((sum,row)=>{
    const value=parseAllocationValue(row[mode]);
    return sum+(Number.isFinite(value)?categoryMinorUnits(value):0);
  },0);
  const target=percent?10000:Number.isFinite(amount)&&amount>0?categoryMinorUnits(amount):0;
  const remaining=target-entered;
  let preview=[];
  if(remaining===0&&amount>0){
    try{preview=draftExpenseAllocations(amount,allocation);}catch{/* A part may be empty or round to zero. */}
  }
  const switchMode=nextMode=>{
    if(nextMode===mode)return;
    if(!preview.length){onChange({...allocation,mode:nextMode});return;}
    const prepared=expenseAllocationDraft(preview);
    const updated=rows.map((row,index)=>({...row,[nextMode]:prepared.rows[index][nextMode]}));
    onChange({mode:nextMode,rows:updated});
  };
  const formatted=percent?new Intl.NumberFormat('ru-RU').format(Math.abs(remaining)/100)+'%':money(Math.abs(remaining)/100,currency);
  const changeRow=(index,patch)=>onChange({...allocation,rows:rows.map((row,i)=>i===index?{...row,...patch}:row)});
  return <section className="entry-allocation" aria-label="Распределение покупки">
    <div className="entry-allocation-head">
      <strong>Распределение покупки</strong>
      <div className="entry-timing" role="group" aria-label="Ввод долей">
        {['amount','percent'].map(key=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>switchMode(key)}>{key==='amount'?'Суммы':'Проценты'}</button>)}
      </div>
    </div>
    {rows.map((row,index)=><div className="entry-allocation-row" key={index}>
      <EntryPicker compact label={'Категория '+(index+1)} value={categories.find(item=>item.id===row.cat)?.name||'Выбрать категорию'} disabled={disabled} options={categories.map(item=>({...item,selected:item.id===row.cat,disabled:rows.some((other,i)=>i!==index&&item.id===other.cat)}))} onChange={cat=>changeRow(index,{cat})}/>
      <label className="entry-allocation-part">
        <span>{percent?'Доля, %':'Сумма, '+(currency==='RUB'?'₽':currency)}</span>
        <input aria-label={(percent?'Процент':'Сумма')+' категории '+(index+1)} inputMode="decimal" value={row[mode]||''} onChange={event=>changeRow(index,{[mode]:event.target.value})}/>
        {percent&&preview[index]&&<small>{money(preview[index].minor/100,currency)}</small>}
      </label>
      {rows.length>2&&<button type="button" className="mini-text-button entry-allocation-remove" aria-label={'Удалить категорию '+(index+1)} onClick={()=>onChange({...allocation,rows:rows.filter((_,i)=>i!==index)})}>×</button>}
    </div>)}
    <div className="entry-allocation-head">
      <button type="button" className="mini-text-button" disabled={rows.length>=categories.length} onClick={()=>onChange({...allocation,rows:[...rows,{cat:'',amount:'',percent:''}]})}><Icon name="plus" size={16}/>Добавить категорию</button>
      <span className={remaining<0?'mini-warning':''} role="status">
        {!(amount>0)?'Укажи сумму покупки':remaining===0?(!preview.length?'Проверь доли':rows.some(row=>!row.cat)?'Выбери все категории':'Вся сумма распределена'):(remaining>0?'Осталось ':'Сверх суммы ')+formatted}
      </span>
    </div>
    <button type="button" className="mini-text-button" onClick={()=>onChange(null)}>Оставить одну категорию</button>
  </section>;
}
