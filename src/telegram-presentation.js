export const escapeHtml=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function telegramPresentation(text){
 const lines=String(text).split('\n');if(lines.length<2)return {text:String(text)};
 const heading=lines.shift(),icon=/обновление/i.test(heading)?'✨':/итог|сводка|расходы/i.test(heading)?'📊':/обед/i.test(heading)?'🍽':/план/i.test(heading)?'📅':'📝';
 const decorated=lines.map(line=>{const escaped=escapeHtml(line);if(/^[^:]{1,65}: .*(?:₽|RUB|USD|EUR)/.test(line)){const colon=escaped.indexOf(':');return escaped.slice(0,colon+1)+' <b>'+escaped.slice(colon+2)+'</b>';}return escaped;});
 return {text:`${icon} <b>${escapeHtml(heading)}</b>\n${decorated.join('\n')}`,parse_mode:'HTML'};
}
