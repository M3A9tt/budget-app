// Shared text ownership rules. No mutable global state; the current draft and
// the Telegram reply reference remain the source of truth.
export function correctionBelongsToDraft(message,field,promptId){
 const text=String(message?.text||message?.caption||'').trim();
 if(!text||text.startsWith('/'))return false;
 const replyId=message?.reply_to_message?.message_id;
 if(replyId!=null)return promptId!=null&&Number(replyId)===Number(promptId);
 // Telegram's ForceReply normally supplies reply_to_message. Bare text remains
 // accepted only for unambiguous amounts/dates, never for free-form notes.
 if(promptId==null)return true; // Legacy drafts and test transport without ID.
 if(field==='amount')return /^\d+(?:[.,]\d{1,2})?\s*(?:₽|руб(?:лей|ля)?\.?|р\.?)?$/iu.test(text);
 if(field==='date')return /^(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})$/u.test(text);
 return false;
}
export function userSwitchedDialog(update){
 const text=String(update?.message?.text||'').trim();
 if(update?.callback_query?.data?.startsWith('b:'))return true;
 return /^\/(?:start|menu|add|import|settings|history|lunch|payments|accounts|reminders|cancel)(?:\s|$)/iu.test(text);
}
