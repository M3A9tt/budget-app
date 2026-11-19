import {createWorker} from 'tesseract.js';
import {receiptFields} from './receipt-fields.js';

const acceptedTypes=['image/jpeg','image/png','image/webp'];
class ReceiptImageError extends Error {
  constructor(message) {
    super(message);
    this.name='ReceiptImageError';
  }
}

async function receiptCanvas(file) {
  if(file.size===0||file.size>10_000_000||!acceptedTypes.includes(file.type)) {
    throw new ReceiptImageError('Выбери JPG, PNG или WebP размером до 10 МБ.');
  }
  const signature=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const header=String.fromCharCode(...signature);
  const matches={
    'image/jpeg':signature[0]===255&&signature[1]===216&&signature[2]===255,
    'image/png':header.startsWith('\x89PNG\r\n\x1a\n'),
    'image/webp':header.startsWith('RIFF')&&header.slice(8)==='WEBP'
  };
  if(!matches[file.type])throw new ReceiptImageError('Файл повреждён или имеет другой формат.');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new ReceiptImageError('Не удалось открыть снимок.'));
      image.src=url;
    });
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height||width*height>24_000_000)throw new ReceiptImageError('Слишком большое изображение. Обрежь снимок до границ чека.');
    const scale=Math.min(1,3200/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));
    canvas.height=Math.max(1,Math.round(height*scale));
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw Error('Не удалось подготовить снимок.');
    context.fillStyle='white';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recognizeReceipt(file,onProgress,signal) {
  const canvas=await receiptCanvas(file);
  signal.throwIfAborted();
  const assets=new URL(import.meta.env.BASE_URL+'ocr/',location.origin).href;
  let worker,rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const stop=()=>rejectAbort(signal.reason);
  signal.addEventListener('abort',stop,{once:true});
  try {
    const run=async()=>{
      worker=await createWorker(['rus','eng'],1,{
        workerPath:assets+'worker.min.js', corePath:assets, langPath:assets,
        workerBlobURL:false, errorHandler:error=>rejectAbort(Error(String(error))),
        logger:message=>{if(!signal.aborted)onProgress(message.status==='recognizing text'?Math.round(message.progress*100):null);}
      });
      if(signal.aborted) {
        await worker.terminate();
        signal.throwIfAborted();
      }
      const {data:{text}}=await worker.recognize(canvas);
      return receiptFields(text);
    };
    return await Promise.race([run(),aborted]);
  } finally {
    signal.removeEventListener('abort',stop);
    await worker?.terminate();
  }
}
