export function telegramClient(){return typeof window!=='undefined'?window.Telegram?.WebApp:null;}
export async function apiRequest(path,options={}) {
  const initData=telegramClient()?.initData;
  const response=await fetch('/api/v1/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(initData?{Authorization:'tma '+initData}:{}),...options.headers}});
  let result;try{result=await response.json();}catch{throw new Error('Сервер приложения ещё не настроен');}
  if(!response.ok){const error=new Error(result.error||'Не удалось сохранить данные');error.status=response.status;throw error;}
  return result;
}
