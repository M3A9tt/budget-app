export function parseEntry(text, accounts, categories, date, defaults={}) {
  const value=text.trim(),lower=value.toLocaleLowerCase('ru');
  const hits=accounts.filter(a=>lower.includes(a.name.toLocaleLowerCase('ru')));
  if(hits.length>1)throw new Error('Названо несколько счетов — выберите один');
  // Remove the explicit account name before finding the amount: a bank name may contain digits.
  const accountName=hits[0]?.name,working=accountName?value.replace(new RegExp(accountName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu'),''):value;
  const match=working.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?=\s|$)/);
  if(!match)throw new Error('Например: кофе 180 или обед 379,50');
  const amount=Number(match[1].replace(',','.'));if(!Number.isFinite(amount)||!amount)throw new Error('Сумма должна быть больше нуля');
  const note=(working.slice(0,match.index)+working.slice(match.index+match[0].length)).trim(),memo=note.toLocaleLowerCase('ru');
  const ownLunch=/обед/.test(memo)&&/за сво[ий]|свои деньги|сам оплатил/.test(memo);
  const lunch=/обед/.test(memo)&&!ownLunch,income=/зарплат|аванс|доход/.test(memo);
  const preferred=accounts.find(a=>a.id===defaults.accountId&&(a.currency||'RUB')==='RUB'&&a.accType!=='savings');
  const account=hits[0]||(accounts.length===1?accounts[0]:preferred);
  if(!lunch&&accounts.length&&!account)throw new Error('Допишите название счёта, например: кофе 180 Сбер');
  const keywords=[['health',/аптек|таблет|врач|стомат|лекар/],['transport',/проезд|метро|такси|автобус/],['food',/кофе|продукт|еда|магазин|хлеб/],['housing',/жкх|квартплат|электрич/],['fun',/игра|кино/]];
  const cat=categories.find(c=>memo.includes(c.name.toLocaleLowerCase('ru')))?.id||keywords.find(([,re])=>re.test(memo))?.[0]||'other';
  return {type:lunch?'lunch':income?'income':'expense',cat:lunch?'lunch':income?'income':ownLunch?'food':cat,amount,currency:'RUB',date,note:note||'Покупка',paymentMethod:/сбп/.test(memo)?'sbp':/налич/.test(memo)?'cash':/карт/.test(memo)?'card':/перевод/.test(memo)?'bank':(account?.id===defaults.accountId?defaults.paymentMethod:'unknown')||'unknown',tags:ownLunch?['обед-за-свои']:[],accountId:lunch?undefined:account?.id};
}
