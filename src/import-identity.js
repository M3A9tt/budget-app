import {roundMoney} from './ledger.js';

// Both import formats use the same bank references and similarity rules.
// Similar purchases can be explicitly confirmed; a bank reference cannot.
export function importIdentity(data){
 const purchases=new Set(),references=new Set(),transfers=new Map();
 const reference=(account,id,kind='bank')=>JSON.stringify([kind,account,id]);
 const purchase=t=>JSON.stringify([t.date,roundMoney(t.amount),t.type==='lunch'||t.cat==='lunch'?'lunch':t.type,t.currency||'RUB',t.accountId||'']);
 const movement=t=>JSON.stringify([t.date,roundMoney(t.amount),t.from,t.to]);
 const rememberTransaction=t=>{purchases.add(purchase(t));if(t.externalId)references.add(reference(t.type==='lunch'||t.cat==='lunch'?'':t.accountId,t.externalId,t.type==='lunch'||t.cat==='lunch'?'lunch':'bank'));};
 const rememberTransfer=t=>{const key=movement(t);if(!transfers.has(key))transfers.set(key,new Set());transfers.get(key).add(roundMoney(t.fee||0));if(t.externalId)references.add(reference(t.externalAccountId||t.from,t.externalId));};
 for(const t of data.transactions||[])rememberTransaction(t);
 for(const t of data.transfers||[])rememberTransfer(t);
 return {
  transaction(t){
   const referenceDuplicate=!!(t.externalId&&references.has(reference(t.type==='lunch'||t.cat==='lunch'?'':t.accountId,t.externalId,t.type==='lunch'||t.cat==='lunch'?'lunch':'bank')));
   const duplicate=referenceDuplicate||purchases.has(purchase(t));rememberTransaction(t);return {duplicate,referenceDuplicate};
  },
  transfer(t){
   const referenceDuplicate=!!(t.externalId&&references.has(reference(t.externalAccountId||t.from,t.externalId))),fees=transfers.get(movement(t));
   if(fees&&[...fees].some(fee=>fee!==roundMoney(t.fee||0)))throw Error('Похожий перевод имеет другую комиссию. Сверьте вручную');
   const duplicate=referenceDuplicate||!!fees;rememberTransfer(t);return {duplicate,referenceDuplicate};
  }
 };
}
