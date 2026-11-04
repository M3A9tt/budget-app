const names=new Intl.DisplayNames(['ru'],{type:'currency'});
const countries=new Intl.DisplayNames(['ru'],{type:'region'});
const exceptions={EUR:'eu',XDR:'un',XOF:'sn',XAF:'cm',XPF:'pf'};
export function currencyOption(code){
 const region=exceptions[code]||code.slice(0,2).toLowerCase();
 const raw=names.of(code)||code;
 const name=raw.charAt(0).toLocaleUpperCase('ru')+raw.slice(1);
 const country=['eu','un'].includes(region)?(region==='eu'?'Европа':'Международная валюта'):countries.of(region.toUpperCase())||'';
 return {id:code,name,detail:code,search:code+' '+country+' '+(code==='GEL'?'лари Грузия грузинский':''),flag:'/flags/'+region+'.svg'};
}
export function currencyOptions(codes,current){
 const priority=['RUB','USD','EUR','GEL'];
 return codes.map(currencyOption).sort((a,b)=>{
  const rank=code=>priority.includes(code)?priority.indexOf(code):priority.length;
  return rank(a.id)-rank(b.id)||a.name.localeCompare(b.name,'ru');
 }).map(option=>({...option,selected:option.id===current}));
}
