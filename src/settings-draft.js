import {useState} from 'react';

// Refresh clean fields from the server, retaining only the user's pending edits.
export function useSettingsDraft(settings){
 const [patch,setPatch]=useState({});
 const set=(key,value)=>setPatch(previous=>({...previous,[key]:value}));
 const saved=snapshot=>setPatch(previous=>Object.fromEntries(Object.entries(previous).filter(([key,value])=>!Object.hasOwn(snapshot,key)||!Object.is(value,snapshot[key]))));
 return {value:{...settings,...patch},patch,set,saved};
}
