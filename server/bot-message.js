export const missingEditableMessage=error=>error?.telegramCode===400&&/message to edit not found|message can't be edited|message can not be edited|message_id_invalid|there is no text/i.test(error.telegramDescription||'');
// Telegram cannot remove a photo. Keep it as context and edit the caption;
// long/import previews use a text card rather than truncating financial details.
export async function editBotCard(api,env,userId,previous,text,reply_markup){
 if(!previous?.message_id||previous.photo&&text.length>1024)return undefined;
 const photo=!!previous.photo;
 try{
  const result=await api.telegram(env,photo?'editMessageCaption':'editMessageText',{chat_id:userId,message_id:previous.message_id,...(photo?{caption:text}:{text}),reply_markup});
  return {...(result||{}),message_id:result?.message_id||previous.message_id,...(photo?{photo:true}:{})};
 }catch(error){if(missingEditableMessage(error))return undefined;throw error;}
}
