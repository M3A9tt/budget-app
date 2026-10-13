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
 return request(path,options,initData);
}
