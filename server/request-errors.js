// Keep invalid input distinct from persistence and delivery failures.
export class RequestError extends Error {
 constructor(message,status=400){super(message);this.status=status;}
}
export function parseJsonObject(text){
 let input;try{input=JSON.parse(text);}catch{throw new RequestError('Неверный JSON запроса');}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new RequestError('Нужен JSON-объект');
 return input;
}
export async function readRequestText(request,maxBytes=1_550_000){
 if(Number(request.headers.get('Content-Length')||0)>maxBytes)throw new RequestError('Запрос больше допустимого размера',413);
 if(!request.body)return '';
 const reader=request.body.getReader(),decoder=new TextDecoder(),chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>maxBytes){await reader.cancel();throw new RequestError('Запрос больше допустимого размера',413);}
   chunks.push(decoder.decode(value,{stream:true}));
  }
  chunks.push(decoder.decode());return chunks.join('');
 }finally{reader.releaseLock();}
}
export const readJsonObject=async request=>parseJsonObject(await readRequestText(request));
export function validateInput(action,status=400){
 try{return action();}catch(error){throw new RequestError(error.message,status);}
}
