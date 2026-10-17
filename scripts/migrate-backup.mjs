import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {migrateData} from '../src/ledger.js';import {EMPTY} from '../src/mini-model.js';
const [source,output]=process.argv.slice(2);if(!source||!output||source===output)throw Error('Usage: node scripts/migrate-backup.mjs ORIGINAL.json NEW.json');
const bytes=fs.readFileSync(source),original=JSON.parse(bytes),data=migrateData(original,EMPTY);
for(const key of ['transactions','accounts','debts','goals','customCats','transfers','recurring','history','lunchDayOff','lunchDayMod','categoryBudgets'])if(original[key]!==undefined)assert.deepEqual(data[key],original[key]);
for(const key of ['settings','rates'])for(const [k,v] of Object.entries(original[key]||{}))assert.deepEqual(data[key][k],v);
delete data._pinHash; // Old local PIN hash is not an authentication credential for the new server.
fs.writeFileSync(output,JSON.stringify(data,null,2),{flag:'wx'});
console.log(JSON.stringify({sourceSha256:createHash('sha256').update(bytes).digest('hex'),counts:Object.fromEntries(['transactions','accounts','customCats','goals','debts','recurring'].map(k=>[k,data[k].length])),unlinked:data.transactions.filter(t=>!t.accountId&&t.cat!=='lunch'&&t.type!=='lunch').length,ambiguousFx:data.migrationWarnings.length,balancesPreserved:true},null,2));
