import {navigationCommand,BOT_SECTIONS} from './bot-navigation.js';
// Shared text ownership rules. No mutable global state; the current draft and
// the Telegram reply reference remain the source of truth.
export function correctionBelongsToDraft(message,field,promptId){
 const text=String(message?.text||message?.caption||'').trim();
 if(!text||text.startsWith('/')||userSwitchedDialog({message}))return false;
 const replyId=message?.reply_to_message?.message_id;
 if(replyId!=null)return promptId!=null&&Number(replyId)===Number(promptId);
 // Telegram's ForceReply normally supplies reply_to_message. Bare text remains
 // accepted only for unambiguous amounts/dates, never for free-form notes.
 // If the old draft has no stored prompt ID, only strictly parseable scalar
 // fields may consume bare text. Unknown free-form notes never take ownership.
 if(field==='amount')return /^\d+(?:[.,]\d{1,2})?\s*(?:₽|руб(?:лей|ля)?\.?|р\.?)?$/iu.test(text);
 if(field==='date')return /^(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})$/u.test(text);
 return false;
}
export function userSwitchedDialog(update){
 const text=navigationCommand(String(update?.message?.text||'').trim());
 if(update?.callback_query?.data?.startsWith('b:'))return true;
 return Object.hasOwn(BOT_SECTIONS,text)||['/start','/menu','/add','/import','/app','/summary','/cancel','Отмена'].includes(text);
}
