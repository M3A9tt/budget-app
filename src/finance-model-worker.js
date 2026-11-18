import {CreateMLCEngine,prebuiltAppConfig} from '@mlc-ai/web-llm';

const modelId='Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
const revision='a822ee410075710c9673005eafa017b90136b85d';

self.onmessage=async({data:{messages,schema}})=>{
  try {
    const model=prebuiltAppConfig.model_list.find(entry=>entry.model_id===modelId);
    const engine=await CreateMLCEngine(modelId,{
      appConfig:{model_list:[{...model,model:model.model+'/resolve/'+revision+'/'}]},
      initProgressCallback:report=>self.postMessage({type:'progress',value:Math.round(report.progress*100)})
    });
    const answer=await engine.chat.completions.create({
      messages,response_format:{type:'json_object',schema:JSON.stringify(schema)},temperature:0,max_tokens:100
    });
    self.postMessage({type:'result',value:answer.choices[0]?.message.content});
  } catch {
    self.postMessage({type:'error'});
  }
};
