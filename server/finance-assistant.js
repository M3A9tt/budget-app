import {assistantPrompt,financeAnalysis,verifyAssistantSelection} from '../src/finance-assistant.js';
import {migrateData} from '../src/ledger.js';
import {EMPTY,todayMoscow} from '../src/mini-model.js';
import {RequestError,validateInput} from './request-errors.js';

export function pilotFeatures(env,userId) {
  const eligible=String(env.TELEGRAM_OWNER_ID)===String(userId)||String(env.FINANCE_PILOT_IDS||'').split(',').map(id=>id.trim()).includes(String(userId));
  const assistant=eligible&&env.FINANCE_ASSISTANT_PILOT==='on';
  return {
    receipt:eligible&&env.RECEIPT_OCR_PILOT==='on',
    assistant,
    cloud:assistant&&env.FINANCE_ASSISTANT_WORKERS_FREE==='confirmed'&&typeof env.AI?.run==='function'
  };
}

export async function cloudFinanceAssistant(env,userId,input,readState) {
  if(!pilotFeatures(env,userId).cloud)throw new RequestError('Бесплатная облачная модель недоступна.',503);
  if(input.consent!==true||!Number.isSafeInteger(input.revision)||input.revision<0)throw new RequestError('Подтверди отправку сводки в Cloudflare.');
  const state=await readState(env,userId);
  if(state?.revision!==input.revision)throw new RequestError('Бюджет изменился. Обнови данные перед разбором.',409);
  const data=migrateData(state.data,EMPTY);
  const today=todayMoscow(data.settings.timeZone);
  if(input.asOf!==today)throw new RequestError('Дата бюджета изменилась. Обнови данные перед разбором.',409);
  const analysis=validateInput(()=>financeAnalysis(data,today,input));
  const {messages,schema}=assistantPrompt(analysis);
  let timer;
  try {
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),10_000);});
    const result=await Promise.race([
      env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast',{
        messages,response_format:{type:'json_schema',json_schema:schema},temperature:0,max_tokens:100
      }),timeout
    ]);
    const ids=verifyAssistantSelection(result?.response,analysis);
    return {ids};
  } catch {
    throw new RequestError('Облачный разбор сейчас недоступен. Расчёт Бюрджета показан ниже.',503);
  } finally {
    clearTimeout(timer);
  }
}
