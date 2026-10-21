import {useEffect,useRef} from 'react';
import {apiRequest} from './mini-api.js';
import {TELEMETRY_EVENTS,TELEMETRY_SCREENS} from './telemetry-events.js';
export function useTelemetry(enabled,screen,desktop){
 const context=useRef({enabled,screen,desktop}),queue=useRef([]);context.current={enabled,screen,desktop};
 const track=event=>{const c=context.current;if(!c.enabled||!TELEMETRY_EVENTS.includes(event)||!TELEMETRY_SCREENS.includes(c.screen)||queue.current.length>=40)return;queue.current.push({event,screen:c.screen,device:c.desktop?'desktop':'mobile'});};
 useEffect(()=>{if(!enabled){queue.current=[];return;}track('page_view');},[enabled,screen]);
 useEffect(()=>{
  const click=e=>{const event=e.target.closest?.('[data-track]')?.getAttribute('data-track');if(event)track(event);};
  const flush=async()=>{if(!context.current.enabled||!queue.current.length)return;const events=queue.current.splice(0,40);try{await apiRequest('telemetry',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),events}),keepalive:true});}catch{/* Optional counts must never block financial actions. */}};
  const hidden=()=>{if(document.visibilityState==='hidden')flush();};document.addEventListener('click',click);document.addEventListener('visibilitychange',hidden);const timer=setInterval(flush,10000);
  return()=>{clearInterval(timer);document.removeEventListener('click',click);document.removeEventListener('visibilitychange',hidden);queue.current=[];};
 },[]);return track;
}
