export function failedDelivery(previous,error,now=Date.now()){
 const code=Number.isInteger(error.telegramCode)&&error.telegramCode>=100&&error.telegramCode<=599?error.telegramCode:null;
 const phase=previous?.phase==='delivered'?'delivered':[400,403].includes(code)?'blocked':code===429||error.definitelyNotSent===true?'queued':'uncertain';
 return {...previous,phase,code:code||'UNKNOWN',retryAt:now+Math.max(30,Math.min(86400,Number(error.retryAfter)||30))*1000};
}
export function telegramFailureCode(error){return error.telegramCode===429?'rate_limited':error.telegramCode===403?'forbidden':error.telegramCode===400?'bad_request':error.telegramCode>=500?'unavailable':'unknown';}
