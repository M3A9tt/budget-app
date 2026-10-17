export async function sendBotFile(env,userId,value,filename){
 const form=new FormData();form.set('chat_id',String(userId));form.set('document',new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:filename.endsWith('.txt')?'text/plain':'application/json'}),filename);
 const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok||!result.ok)throw Error('Telegram не принял файл. Повтори отправку.');return result.result;
}
export async function readBotDocument(env,document,max=2_000_000,telegram){
 if(!document?.file_id||!Number.isFinite(document.file_size)||document.file_size>max||document.file_size<1)throw Error('Файл слишком большой или размер неизвестен');
 if(!/\.(json|csv|txt)$/i.test(document.file_name||''))throw Error('Пришли .json, .csv или .txt');
 const file=await telegram(env,'getFile',{file_id:document.file_id});if(!file?.file_path||!/^[-\w/\.]+$/.test(file.file_path)||file.file_path.includes('..')||file.file_path.startsWith('/'))throw Error('Не удалось получить файл Telegram');
 const response=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok)throw Error('Не удалось скачать файл Telegram');
 const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('Файл больше допустимого размера');}chunks.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(buffer);
}
