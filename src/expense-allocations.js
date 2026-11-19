import {categoryCatalog} from './categories.js';

export function supportsExpenseAllocation(tx) {
  return tx.type==='expense'&&tx.cat!=='lunch'&&
    !tx.transferId&&!tx.recurringId&&!tx.installmentPaymentId&&!tx.installmentRefundId&&
    !tx.debtId&&!tx.lunchId&&!tx._lunchCheckDay&&!tx.tags?.includes('обед-за-свои');
}

export function expenseCategoryIds(tx) {
  return tx.categoryAllocations?.map(part=>part.cat)||[tx.cat||'other'];
}

export function expenseCategoryLabel(tx,categories) {
  return expenseCategoryIds(tx).map(id=>categories.find(category=>category.id===id)?.name||'Другое').join(' · ');
}

export function categoryMinorUnits(amount) {
  const minor=Math.round(amount*100);
  if(!Number.isSafeInteger(minor)||minor<0)throw Error('Сумма слишком велика для точного распределения');
  return minor;
}

function distribute(total,weights) {
  const denominator=weights.reduce((sum,weight)=>sum+BigInt(weight),0n);
  const parts=weights.map((weight,index)=>{
    const product=BigInt(total)*BigInt(weight);
    return {index,minor:Number(product/denominator),remainder:product%denominator};
  });
  const left=total-parts.reduce((sum,part)=>sum+part.minor,0);
  const priority=[...parts].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(const part of priority.slice(0,left))part.minor++;
  return parts.map(part=>part.minor);
}

export function allocateExpensePercentages(amount,rows) {
  if(rows.some(row=>!Number.isInteger(row.basisPoints)||row.basisPoints<=0||row.basisPoints>=10000)||
      rows.reduce((sum,row)=>sum+row.basisPoints,0)!==10000)throw Error('Распредели ровно 100% суммы');
  const shares=distribute(categoryMinorUnits(amount),rows.map(row=>row.basisPoints));
  if(shares.some(minor=>minor===0))throw Error('Доля каждой категории должна быть не меньше одной копейки или цента');
  return rows.map(({cat},index)=>({cat,minor:shares[index]}));
}

export function expenseAllocationDraft(parts) {
  const percentages=distribute(10000,parts.map(part=>part.minor));
  return {mode:'amount',rows:parts.map(({cat,minor},index)=>({
    cat,amount:String(minor/100),percent:percentages[index]?String(percentages[index]/100):''
  }))};
}

export function parseAllocationValue(value) {
  const normalized=String(value??'').trim().replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return NaN;
  const number=Number(normalized);
  return number<=1e12?number:NaN;
}

export function draftExpenseAllocations(amount,draft) {
  if(draft.mode==='percent')return allocateExpensePercentages(amount,draft.rows.map(row=>({
    cat:row.cat,basisPoints:Math.round(parseAllocationValue(row.percent)*100)
  })));
  return draft.rows.map(({cat,amount})=>{
    const value=parseAllocationValue(amount);
    if(!(value>0))throw Error('Укажи сумму больше нуля для каждой категории');
    return {cat,minor:categoryMinorUnits(value)};
  });
}

export function validateExpenseAllocations(tx,customCats) {
  if(tx.categoryAllocations===undefined)return;
  const parts=tx.categoryAllocations;
  if(!supportsExpenseAllocation(tx)||!Array.isArray(parts)||parts.length<2||parts[0]?.cat!==tx.cat)
    throw Error('Распределить по категориям можно обычный расход');
  const known=new Set(categoryCatalog(customCats).map(category=>category.id));
  const seen=new Set();
  const total=categoryMinorUnits(tx.amount);
  let allocated=0;
  for(const part of parts) {
    if(!part||!known.has(part.cat)||seen.has(part.cat)||!Number.isSafeInteger(part.minor)||part.minor<=0)
      throw Error('Выбери разные категории и укажи положительную долю каждой');
    seen.add(part.cat);
    if(part.minor>total-allocated)throw Error('Сумма долей превышает сумму операции');
    allocated+=part.minor;
  }
  if(allocated!==total)throw Error('Сумма долей должна совпадать с суммой операции');
  if(!Number.isFinite(tx.amountRub))throw Error('Для распределённого расхода нужен сохранённый рублёвый эквивалент');
  categoryMinorUnits(tx.amountRub);
}

export function expenseCategoryAmounts(tx,amount) {
  if(!tx.categoryAllocations)return [{cat:tx.cat||'other',amount}];
  const parts=tx.categoryAllocations;
  if(amount===tx.amount)return parts.map(({cat,minor})=>({cat,amount:minor/100}));
  const shares=distribute(categoryMinorUnits(amount),parts.map(part=>part.minor));
  return parts.map(({cat},index)=>({cat,amount:shares[index]/100}));
}

export function expenseCategoryAmount(tx,amount,cat) {
  if(!tx.categoryAllocations)return (tx.cat||'other')===cat?amount:0;
  return expenseCategoryAmounts(tx,amount).find(part=>part.cat===cat)?.amount||0;
}
