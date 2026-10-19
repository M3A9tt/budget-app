// A pure, shared interpretation layer for the bot and Mini App.
// Never writes balances or creates transactions.
const boundary='[\\p{L}\\p{N}]';
// Constructor patterns need only regexp syntax escaped. In Unicode mode,
// identity escapes such as \- outside a character class are invalid.
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function accountMentions(text,accounts=[]){
 const candidates=[];
 for(const a of accounts){
  const names=[a.name];
  for(const [root,aliases] of [['сбер',['сбер','сбера']],['альф',['альфа','альфы']],['тинькофф',['тинькофф','тинькоффа']],['т-банк',['т-банк','т-банка']]])
   if(a.name.toLocaleLowerCase('ru').includes(root))names.push(...aliases);
  for(const name of new Set(names)){
   const re=new RegExp('(?<!'+boundary+')'+escape(name)+'(?!'+boundary+')','giu');
   for(const m of text.matchAll(re))candidates.push({account:a,start:m.index,end:m.index+m[0].length});
  }
 }
 candidates.sort((a,b)=>(b.end-b.start)-(a.end-a.start));const chosen=[];
 for(const hit of candidates){
  const overlapping=chosen.filter(x=>hit.start<x.end&&hit.end>x.start);
  if(overlapping.some(x=>x.account.id===hit.account.id))continue;
  if(overlapping.some(x=>x.end-x.start>hit.end-hit.start))continue;
  chosen.push(hit);
 }
 return chosen.sort((a,b)=>a.start-b.start);
}

export function classifyFinancialIntent({memo='',sign='',hasNamedAccount=false,companyLunchEnabled=true,inferredType='expense'}={}){
 const note=String(memo).toLocaleLowerCase('ru');
 const mentionsLunch=/(?<!\p{L})обед(?!\p{L})/u.test(note);
 const explicitlyCompany=/обед\s+(?:компании|от работодателя|за сч[её]т компании)|корпоративн[а-я]*\s+обед|(?:оплачивает|оплатила)\s+компания/u.test(note);
 const paidPersonally=/за сво[ий]|свои деньги|сам оплатил|сам заплатил/u.test(note);
 const companyShortcut=mentionsLunch&&note.trim()==='обед'&&!hasNamedAccount&&companyLunchEnabled;
 const explicitSign=['+','-','−'].includes(sign);
 const companyLunch=mentionsLunch&&!explicitSign&&!paidPersonally&&(!hasNamedAccount||explicitlyCompany)&&(explicitlyCompany||companyShortcut);
 const type=sign==='+'?'income':sign==='-'||sign==='−'?'expense':companyLunch?'lunch':inferredType;
 return {type,mentionsLunch,companyLunch,personalLunch:mentionsLunch&&type==='expense'};
}

const dishWords=/суп|салат|котлет|пюре|картоф|лапш|плов|пирож|булоч|рис|греч|макарон|отбивн|крокет|голуб|рулет|биточ|сосиск|чай|кола|обед|стейк|печень|запеканк/iu;
export function classifyIncomingMessage({message={},orders=[],accounts=[]}={}){
 const value=String(message.text||message.caption||'').trim();
 const forwarded=!!(message.forward_origin||message.forward_date);
 const hasEmployeeOrder=orders.some(o=>o.employeeId&&o.body&&(/\(\d{1,5}\)/u.test(value)||/^\p{Lu}/u.test(o.name)));
 const personalDebit=/^\s*[-−]\s*\d/u.test(value);
 const namedAccount=accountMentions(value,accounts).length>0;
 const companyOrder=!personalDebit&&!namedAccount&&(hasEmployeeOrder||forwarded&&dishWords.test(value));
 return {route:companyOrder?'company-order':'financial-entry',hasEmployeeOrder,forwarded};
}
