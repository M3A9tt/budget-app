export function telegramClient(){return typeof window!=='undefined'?window.Telegram?.WebApp:null;}
const pendingState=new Map();
async function request(path,options,initData){
 const response=await fetch('/api/v1/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(initData?{Authorization:'tma '+initData}:{}),...options.headers}});
 let result;try{result=await response.json();}catch{throw new Error('Сервер приложения ещё не настроен');}
 if(!response.ok){const error=new Error(result.error||'Не удалось сохранить данные');error.status=response.status;throw error;}
 return result;
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
  for(let attempt=0;attempt<2;attempt++)try{return await request(path,stable,initData);}catch(error){if(error.status&&error.status<500)throw error;if(attempt===1){error.uncertain=true;throw error;}}
 }
 return request(path,options,initData);
}
