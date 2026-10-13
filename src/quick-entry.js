export function parseEntry(text, accounts, categories, date) {
  const value=text.trim();
  const match=value.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?=\s|$)/);
  if (!match) throw new Error('Например: кофе 180 или обед 379,50');
  const amount=Number(match[1].replace(',','.'));
  if (!amount) throw new Error('Сумма должна быть больше нуля');
  const note=(value.slice(0,match.index)+value.slice(match.index+match[0].length)).trim();
  const lower=note.toLocaleLowerCase('ru');
  const lunch=/обед/.test(lower);
  const income=/зарплат|аванс|доход/.test(lower);
  const hits=accounts.filter(a=>lower.includes(a.name.toLocaleLowerCase('ru')));
  if (hits.length>1) throw new Error('Названо несколько счетов — выберите один');
  const account=hits[0] || (accounts.length===1?accounts[0]:null);
  if (!lunch && accounts.length && !account) throw new Error('Допишите название счёта, например: кофе 180 Сбер');
  const keywords=[['health',/аптек|таблет|врач|стомат|лекар/],['transport',/проезд|метро|такси|автобус/],['food',/кофе|продукт|еда|магазин|хлеб/],['housing',/жкх|квартплат|электрич/],['fun',/игра|кино/]];
  const cat=categories.find(c=>lower.includes(c.name.toLocaleLowerCase('ru')))?.id || keywords.find(([,re])=>re.test(lower))?.[0] || 'other';
  return {type:lunch?'lunch':income?'income':'expense',cat:lunch?'lunch':income?'income':cat,amount,currency:'RUB',date,note:note||'Покупка',paymentMethod:/сбп/.test(lower)?'sbp':/налич/.test(lower)?'cash':/карт/.test(lower)?'card':'unknown',tags:[],accountId:lunch?undefined:account?.id};
}
