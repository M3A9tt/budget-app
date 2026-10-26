import {apiRequest,telegramClient} from './mini-api.js';
import {downloadJson} from './json-import.js';

export async function downloadBackup(data,filename,{revision,beforeRestore=false,demo=false,telegram=telegramClient(),request=apiRequest}={}){
 if(demo||!telegram?.initData){downloadJson(data,filename);return {accepted:true,native:false};}
 if(typeof telegram.downloadFile!=='function'||telegram.isVersionAtLeast?.('8.0')===false)throw Error('Обнови Telegram для скачивания. Сейчас копию можно получить в чате бота: /backup → Скачать полный JSON.');
 const file=await request('backup/download',{method:'POST',body:JSON.stringify({revision,beforeRestore})});
 const url=new URL(file.url);
 if(url.protocol!=='https:'||url.origin!==window.location.origin||!/^burget-(?:backup|before-restore)-\d{4}-\d{2}-\d{2}\.json$/.test(file.file_name||'')||file.revision!==revision)throw Error('Не удалось подготовить ссылку на бэкап. Обнови данные и попробуй ещё раз.');
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Telegram не подтвердил скачивание. Попробуй снова или получи файл в боте командой /backup.')),30000);
  try{telegram.downloadFile({url:url.href,file_name:file.file_name},accepted=>{clearTimeout(timer);resolve({accepted:accepted===true,native:true});});}
  catch{clearTimeout(timer);reject(Error('Telegram не открыл скачивание. Обнови Telegram или получи копию в боте командой /backup.'));}
 });
}
