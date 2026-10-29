import {getPicture,uploadPicture} from './bot-pictures.js';
// Persist the photo step before sending the full text so a text retry does not
// resend the image. Rendering is optional; failure must never suppress a report.
export async function sendSummary(env,userId,data,report,send,{progress={},checkpoint=async()=>{},picture=getPicture,upload=uploadPicture,priority='interactive'}={}){
 if(report.visual&&!progress.photoSent&&env.BROWSER){
  try{
   const card=await picture(env,userId,{data},{kind:'summary',from:report.from,to:report.to,title:report.title},undefined,{priority});
   await upload(env,userId,card,undefined,false,report.title+'\n'+(report.from===report.to?report.from:report.from+' — '+report.to));
   progress.photoSent=true;
  }catch{/* Full text remains available when rendering or photo delivery fails. */}
  if(progress.photoSent)await checkpoint(progress);
 }
 await send(env,'sendMessage',{chat_id:userId,text:report.text});
}
