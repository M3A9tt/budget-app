import {assistantPrompt} from './finance-assistant.js';

export async function runLocalAssistant(analysis,onProgress,signal) {
  signal.throwIfAborted();
  const worker=new Worker(new URL('./finance-model-worker.js',import.meta.url),{type:'module'});
  let stop;
  try {
    return await new Promise((resolve,reject)=>{
      stop=()=>reject(signal.reason);
      signal.addEventListener('abort',stop,{once:true});
      worker.onerror=()=>reject(Error('Локальная модель недоступна.'));
      worker.onmessage=({data})=>{
        if(data.type==='progress')onProgress(data.value);
        if(data.type==='result')resolve(data.value);
        if(data.type==='error')reject(Error('Локальная модель недоступна.'));
      };
      worker.postMessage(assistantPrompt(analysis));
    });
  } finally {
    signal.removeEventListener('abort',stop);
    worker.terminate();
  }
}
