export function allowedUsers(env){
 return [...new Set([env.TELEGRAM_OWNER_ID,...String(env.TELEGRAM_ALLOWED_IDS||'').split(',')].map(x=>String(x||'').trim()).filter(x=>/^[1-9]\d*$/.test(x)&&Number.isSafeInteger(Number(x))))];
}
export const isAllowedUser=(env,id)=>allowedUsers(env).includes(String(id));
