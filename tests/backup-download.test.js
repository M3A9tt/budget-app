import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadBackup} from '../src/backup-download.js';

const file={url:'https://budget.test/api/v1/backup/file?token=test-ticket',file_name:'burget-backup-2026-10-26.json',revision:7};
async function inTelegram(fn){const original=globalThis.window;globalThis.window={location:{origin:'https://budget.test'}};try{await fn();}finally{if(original===undefined)delete globalThis.window;else globalThis.window=original;}}
test('Telegram export uses an HTTPS native download and accepts only the callback result',()=>inTelegram(async()=>{
 let callback,params,requestBody;
 const telegram={initData:'signed-init-data',isVersionAtLeast:()=>true,downloadFile:(p,cb)=>{params=p;callback=cb;}};
 const pending=downloadBackup({},file.file_name,{revision:7,telegram,request:async(path,options)=>{assert.equal(path,'backup/download');requestBody=JSON.parse(options.body);return file;}});
 await new Promise(setImmediate);assert.deepEqual(requestBody,{revision:7,beforeRestore:false});assert.deepEqual(params,{url:file.url,file_name:file.file_name});callback(true);
 assert.deepEqual(await pending,{accepted:true,native:true});
 const cancelled=downloadBackup({},file.file_name,{revision:7,beforeRestore:true,telegram,request:async()=>file});await new Promise(setImmediate);callback(false);assert.deepEqual(await cancelled,{accepted:false,native:true});
}));
test('Unsupported Telegram, unsafe links, stale revision and network errors never report a saved backup',()=>inTelegram(async()=>{
 const old={initData:'signed',isVersionAtLeast:()=>false,downloadFile:()=>assert.fail('unsupported method')};
 await assert.rejects(downloadBackup({},'backup.json',{telegram:old}),/Обнови Telegram/);
 const tg={initData:'signed',isVersionAtLeast:()=>true,downloadFile:()=>assert.fail('invalid file must not download')};
 for(const patch of [{url:'blob:local-file'},{url:'https://other.test/private.json'},{revision:6},{file_name:'../../private.json'}])await assert.rejects(downloadBackup({},'backup.json',{revision:7,telegram:tg,request:async()=>({...file,...patch})}));
 await assert.rejects(downloadBackup({},'backup.json',{revision:7,telegram:tg,request:async()=>{throw Error('offline');}}),/offline/);
}));
