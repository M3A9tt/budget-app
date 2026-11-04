export function parseCbrRates(xml){
 const date=xml.match(/<ValCurs\b[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/);
 if(!date)throw Error('Missing rate date');
 const rates={RUB:1};
 for(const row of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)){
  const code=row[1].match(/<CharCode>([A-Z]{3})<\/CharCode>/)?.[1];
  const nominal=Number(row[1].match(/<Nominal>([\d ]+)<\/Nominal>/)?.[1]?.replaceAll(' ',''));
  const value=Number(row[1].match(/<Value>([\d ,\.]+)<\/Value>/)?.[1]?.replaceAll(' ','').replace(',','.'));
  if(code&&nominal>0&&Number.isFinite(value)&&value>0)rates[code]=value/nominal;
 }
 if(!rates.USD||!rates.EUR)throw Error('Incomplete rates');
 return {rates,date:date[3]+'-'+date[2]+'-'+date[1],source:'Банк России',sourceUrl:'https://www.cbr.ru/currency_base/daily/'};
}
export async function fetchExchangeRates(){
 const response=await fetch('https://www.cbr.ru/scripts/XML_daily.asp',{signal:AbortSignal.timeout(8000),cf:{cacheTtl:900,cacheEverything:true}});
 if(!response.ok)throw Error('Rate source unavailable');
 const reader=response.body.getReader();
 const chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072)throw Error('Rate response too large');chunks.push(value);}
 }finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return {...parseCbrRates(new TextDecoder().decode(bytes)),checkedAt:new Date().toISOString()};
}
