import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// SQL is never logged. Restore into an isolated database, never the live binding.
export async function verifyDatabaseExport(path){
 const sql=await readFile(path,'utf8'),db=new DatabaseSync(':memory:');
 try{
  db.exec(sql);
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup integrity check failed');
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  for(const name of ['user_finance_state','user_state_backups','user_idempotency'])if(!tables.includes(name))throw Error('Backup is missing a required financial table');
  const fingerprint=createHash('sha256');let profiles=0;
  for(const row of db.prepare('SELECT user_id,revision,data FROM user_finance_state ORDER BY user_id').iterate()){
   const data=JSON.parse(row.data);if(!Array.isArray(data.accounts)||!Array.isArray(data.transactions)||!Number.isSafeInteger(row.revision)||row.revision<0)throw Error('Invalid profile in database backup');
   fingerprint.update(JSON.stringify([row.user_id,row.revision,row.data]));profiles++;
  }
  // The digest authenticates exact stored JSON, including historical amounts and links.
  return {tables:tables.length,profiles,profileDigest:fingerprint.digest('hex'),receipts:db.prepare('SELECT COUNT(*) n FROM user_idempotency').get().n,integrity:'ok'};
 }finally{db.close();}
}
