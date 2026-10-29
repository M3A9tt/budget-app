const prefix='burget-entry-v1:',ttl=24*60*60*1000;
export function saveEntryDraft(owner,draft,storage,now=Date.now()){
 if(!owner)return;try{storage??=globalThis.localStorage;const key=prefix+owner;if(draft)storage.setItem(key,JSON.stringify({at:now,draft}));else storage.removeItem(key);}catch{/* Storage blocked or full: never block financial saves. */}
}
export function loadEntryDraft(owner,storage,now=Date.now()){
 if(!owner)return null;try{storage??=globalThis.localStorage;const key=prefix+owner,record=JSON.parse(storage.getItem(key)||'null');if(!record||now-record.at>ttl||now<record.at||!record.draft||typeof record.draft!=='object'){storage.removeItem(key);return null;}return record.draft;}catch{return null;}
}
export function clearEntryDrafts(storage){try{storage??=globalThis.localStorage;for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix))storage.removeItem(key);}}catch{}}
