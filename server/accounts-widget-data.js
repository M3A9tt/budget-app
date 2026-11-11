import {accountTotals,isSavingAccount,orderedAccounts} from '../src/account-balances.js';
import {money} from '../src/mini-model.js';
import {activityEntries,filterActivity,transferDetails} from '../src/activity-history.js';
import {categoryCatalog} from '../src/categories.js';

const clip=value=>Array.from(value).slice(0,64).join('');

export function widgetAccounts(data){
 const visible=orderedAccounts(data).filter(account=>!account.archived);
 return [...visible.filter(account=>!isSavingAccount(account)),...visible.filter(isSavingAccount)];
}

function accountsCard(data,visible,account,offset){
 if(account){
  const categories=categoryCatalog(data.customCats);
  const recent=filterActivity(activityEntries(data),data,categories,{accountId:account.id,includeCompanyLunch:false});
  const rows=recent.slice(offset,offset+5).map(item=>{
   const transfer=item.type==='transfer';
   const outgoing=transfer?item.from===account.id:item.type==='expense';
   const incoming=transfer?item.to===account.id:item.type==='income';
   const label=transfer?transferDetails(data,item).route:
    item.note||categories.find(category=>category.id===item.cat)?.name||'Операция';
   return [clip(label),(outgoing?'−':incoming?'+':'')+money(item.amount,item.currency),
    outgoing?'expense':incoming?'income':'',null,item.date.split('-').reverse().join('.')];
  });
  return {total:recent.length,card:{title:clip(account.name),mark:'chart',dateLabel:'Операции по счёту',label:'Остаток',
   sum:money(account.balance,account.currency),rows,count:'',foot:rows.length?'':'Операций пока нет'}};
 }
 const {spendable,savings}=accountTotals({...data,accounts:visible});
 const rows=visible.slice(offset,offset+6).map(account=>[
  isSavingAccount(account)?`${clip(account.name)} · ${account.savingsKind==='deposit'?'вклад':'накопления'}`:clip(account.name),
  money(account.balance,account.currency),account.balance<0?'expense':'',
 ]);
 return {total:visible.length,card:{
  title:'Счета',mark:'chart',dateLabel:'',label:'На обычных счетах',
  sum:money(spendable),rows,count:visible.length>rows.length?`Показано ${rows.length} из ${visible.length}`:'',
  foot:savings?`Отложено отдельно · ${money(savings)}`:'',
 }};
}

export function accountWidgetData(data,revision,{index,offset=0}={}){
 const accounts=widgetAccounts(data);
 if(index===undefined&&offset>=accounts.length)offset=0;
 const account=accounts[index];
 if(index!==undefined&&!account)return JSON.stringify({error:'Счёт недоступен. Открой список заново.'});
 const {card,total}=accountsCard(data,accounts,account,offset);
 const command=account?`budget-account:${revision}:${index}:`:'budget-account:list:';
 const fit=()=>new TextEncoder().encode(JSON.stringify(card)).length<=1024;
 if(!account)card.rows.forEach((row,position)=>row.push(`budget-account:${revision}:${offset+position}`));
 do{
  const end=offset+card.rows.length;
  card.controls=account?[['← К счетам','budget-account:list:0']]:[];
  if(offset)card.controls.push(['К началу',command+'0']);
  if(end<total&&card.rows.length)card.controls.push(['Дальше →',command+end]);
  card.count=card.rows.length&&card.rows.length<total?`${offset+1}–${end} из ${total}`:'';
  if(fit())break;
  card.rows.pop();
 }while(card.rows.length);
 return JSON.stringify(card);
}

