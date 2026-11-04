// Browser Run can reject a burst before launching a browser. Retry only that
// explicit rejection, once, while the shared render lease remains held.
export async function requestScreenshot(browser,options,{sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxRetryMs=15000}={}){
 for(let attempt=0;attempt<2;attempt++){
  const response=await browser.quickAction('screenshot',options);if(response.ok)return response;
  const reader=response.body?.getReader();let diagnostic='';if(reader){const chunks=[];let total=0;try{while(total<2000){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,2000-total);chunks.push(part);total+=part.length;}}finally{await reader.cancel();}const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}diagnostic=new TextDecoder().decode(bytes);}
  let reason='';try{const parsed=JSON.parse(diagnostic);reason=String(parsed.errors?.[0]?.message||parsed.error||'').slice(0,300);}catch{}
  const retry=response.headers.get('retry-after'),seconds=Number(retry),delay=retry&&Number.isFinite(seconds)?seconds*1000:retry?Date.parse(retry)-Date.now():10000;
  const daily=/for today|daily|per day|time limit exceeded/i.test(reason);
  if(response.status===429&&!attempt&&!daily&&Number.isFinite(delay)&&delay>=0&&delay<=maxRetryMs){await sleep(delay);continue;}
  throw Object.assign(Error(response.status===429?'Лимит сервиса снимков':'Screenshot unavailable'),{screenshotStatus:response.status,screenshotReason:reason});
 }
}
