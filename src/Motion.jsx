import React,{useEffect,useRef} from 'react';
export function SmoothDetails({children,...props}){
 const ref=useRef(null),animation=useRef(null),target=useRef(false);
 useEffect(()=>()=>animation.current?.cancel(),[]);
 function toggle(event){const el=ref.current,summary=event.target.closest('summary');if(!summary||summary.parentElement!==el)return;event.preventDefault();
 const start=el.getBoundingClientRect().height;target.current=animation.current?!target.current:!el.open;const opening=target.current;
 if(animation.current){animation.current.onfinish=null;animation.current.cancel();animation.current=null;}
 if(!el.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){el.open=opening;el.style.overflow='';return;}
 el.open=opening;const end=el.getBoundingClientRect().height;el.open=true;el.style.overflow='hidden';
 const run=el.animate([{height:start+'px'},{height:end+'px'}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});animation.current=run;
 run.onfinish=()=>{if(animation.current!==run)return;el.open=opening;el.style.overflow='';animation.current=null;};
 }
 return <details {...props} ref={ref} onClick={toggle}>{children}</details>;
}
