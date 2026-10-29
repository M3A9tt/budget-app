export async function waitTelegramSDK(timeout=6000){
 const isLaunch=()=>/tgWebApp(Data|Version|Platform)=/.test(location.hash+location.search);
 if(telegramClient()||!isLaunch())return telegramClient();
 const start=Date.now();while(Date.now()-start<timeout){await new Promise(resolve=>setTimeout(resolve,50));if(telegramClient())return telegramClient();}
 const error=new Error('Telegram не загрузился. Проверь соединение и повтори подключение.');error.code='SDK_TIMEOUT';throw error;
}
export function telegramClient(){return typeof window!=='undefined'?window.Telegram?.WebApp:null;}
const pendingState=new Map();
async function request(path,options,initData){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
 const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 try{
  const response=await fetch('/api/v1/'+path,{credentials:'same-origin',...options,signal,headers:{'Content-Type':'application/json',...(initData?{Authorization:'tma '+initData}:{}),...options.headers}});
  let result;try{result=await response.json();}catch(cause){
   if(signal.aborted)throw cause;
   const error=new Error(response.ok?'Сервер вернул нечитаемый ответ. Обновите данные перед повтором действия.':'Сервер временно недоступен. Попробуйте обновить данные.');error.status=response.status;throw error;
  }
  if(!response.ok){const error=new Error(typeof result?.error==='string'?result.error:'Не удалось выполнить запрос');error.status=response.status;error.reference=result.reference;throw error;}
  return result;
 }catch(error){
  if(controller.signal.aborted){const e=new Error('Сервер не ответил за 15 секунд. Проверьте соединение и обновите данные.',{cause:error});e.code='TIMEOUT';throw e;}
  if(error instanceof TypeError&&!error.status)throw new Error('Не удалось связаться с сервером. Проверьте интернет и обновите данные.',{cause:error});
  throw error;
 }finally{clearTimeout(timer);}
}
export async function apiRequest(path,options={}){
 const initData=telegramClient()?.initData;
 // Merge only overlapping, plain GET state requests. Never cache completed data or writes.
 if(path==='state'&&Object.keys(options).length===0){
  const key=initData||'web-session';
  if(!pendingState.has(key))pendingState.set(key,request(path,options,initData).finally(()=>pendingState.delete(key)));
  return structuredClone(await pendingState.get(key));
 }
 // Repeat the exact state payload with the same receipt key after a lost response.
 if(path==='state'&&options.method==='PUT'){
  const stable={...options,headers:{'Idempotency-Key':crypto.randomUUID(),...options.headers}};
  for(let attempt=0;attempt<2;attempt++)try{return await request(path,stable,initData);}catch(error){if(error.status>=400&&error.status<500)throw error;if(options.signal?.aborted||attempt===1){error.uncertain=true;throw error;}}
 }
 return request(path,options,initData);
}
