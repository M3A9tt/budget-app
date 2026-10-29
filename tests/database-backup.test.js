import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {encryptBackup,decryptBackup,backupKeyId,fileDigest} from '../scripts/backup-crypto.mjs';
import {verifyDatabaseExport} from '../scripts/database-recovery.mjs';
import {createDatabaseBackup} from '../scripts/create-db-backup.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const profile={accounts:[{id:'a',currency:'RUB',balance:900.01},{id:'usd',currency:'USD',balance:3.27}],transactions:[{id:'p',amount:99.99,amountRub:99.99,accountAmount:99.99,recurringId:'rent',recurringPeriod:'2026-10'}],recurring:[{id:'rent',amount:99.99}],installments:[{id:'s',payments:[{id:'i',amount:100,paidAmount:30}]}],history:[{id:'h',before:{amount:11.23}}],privateField:'Не публиковать'};
const quoted=x=>"'"+String(x).replaceAll("'","''")+"'";
async function sqlFixture(directory){const path=join(directory,'source.sql'),schema=await readFile(new URL('../server/schema.sql',import.meta.url),'utf8');await writeFile(path,schema+`\nINSERT INTO user_finance_state VALUES('111',7,${quoted(JSON.stringify(profile))},'2026-10-29');\nINSERT INTO user_idempotency VALUES('111','old-payment','hash','{"revision":7}',1);\nINSERT INTO user_state_backups VALUES('111',6,${quoted(JSON.stringify(profile))},'2026-10-28');`);return path;}
test('Encrypted independent backup restores exact money, historical fields, links, revisions and old receipts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'burget-backup-test-'));try{
  const source=await sqlFixture(dir),verification=await verifyDatabaseExport(source),archive=join(dir,'copy.enc'),restored=join(dir,'restored.sql');
  const metadata=await encryptBackup(source,archive,keys.publicKey,{verification,appVersion:'test',schemaVersion:1});
  const bytes=await readFile(archive);assert.ok(!bytes.includes(Buffer.from(profile.privateField)));assert.ok(!bytes.includes(Buffer.from('old-payment')));assert.equal(metadata.keyId,backupKeyId(keys.publicKey));
  await decryptBackup(archive,restored,keys.privateKey);assert.deepEqual(await readFile(restored),await readFile(source));assert.deepEqual(await verifyDatabaseExport(restored),verification);
  const db=new DatabaseSync(':memory:');try{db.exec(await readFile(restored,'utf8'));const row=db.prepare("SELECT revision,data FROM user_finance_state WHERE user_id='111'").get();assert.equal(row.revision,7);assert.deepEqual(JSON.parse(row.data),profile);assert.equal(db.prepare("SELECT COUNT(*) n FROM user_idempotency WHERE id='old-payment'").get().n,1);}finally{db.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Tampered ciphertext, header, truncated archive and wrong key never publish a partial SQL file',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'burget-backup-test-'));try{
  const source=await sqlFixture(dir),archive=join(dir,'copy.enc');await encryptBackup(source,archive,keys.publicKey);const original=await readFile(archive);
  const damaged=Buffer.from(original);damaged[damaged.length-20]^=1;
  const header=Buffer.from(original),position=header.indexOf(Buffer.from('burget-database-backup'));header[position]^=1;
  let i=0;for(const bytes of [damaged,header,original.subarray(0,20)]){const input=join(dir,'bad'+i),output=join(dir,'out'+i++);await writeFile(input,bytes);await assert.rejects(decryptBackup(input,output,keys.privateKey));assert.ok(!(await readdir(dir)).some(f=>f.startsWith(output.split('/').at(-1))));}
  const other=generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'}});await assert.rejects(decryptBackup(archive,join(dir,'wrong.sql'),other.privateKey));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Recovery refuses to overwrite files, export validation rejects a missing financial table, encryption rejects weak keys',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'burget-backup-test-'));try{
  const source=await sqlFixture(dir),archive=join(dir,'copy.enc'),output=join(dir,'owned.sql');await encryptBackup(source,archive,keys.publicKey);await writeFile(output,'keep');await assert.rejects(decryptBackup(archive,output,keys.privateKey));assert.equal(await readFile(output,'utf8'),'keep');
  const incomplete=join(dir,'incomplete.sql');await writeFile(incomplete,'CREATE TABLE user_finance_state(user_id TEXT, revision INTEGER, data TEXT);');await assert.rejects(verifyDatabaseExport(incomplete),/required financial table/);
  const weak=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'}});assert.throws(()=>backupKeyId(weak.publicKey),/3072/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Automated copy uploads only an encrypted database and a safe manifest; export failure removes its temporary plaintext',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'burget-backup-test-'));try{
  const manifest=await createDatabaseBackup({directory:join(dir,'out'),exportDatabase:async path=>{const fixture=await sqlFixture(dir);await writeFile(path,await readFile(fixture));}});
  assert.deepEqual((await readdir(join(dir,'out'))).sort(),['database.burget.enc','manifest.json']);assert.equal(manifest.sha256,await fileDigest(join(dir,'out','database.burget.enc')));assert.equal(manifest.verification.integrity,'ok');assert.ok(!JSON.stringify(manifest).includes('111'));assert.ok(!JSON.stringify(manifest).includes(profile.privateField));
  let plain;await assert.rejects(createDatabaseBackup({directory:join(dir,'failed'),exportDatabase:async path=>{plain=path;await writeFile(path,'private export');throw Error('export unavailable');}}));await assert.rejects(readFile(plain));
 }finally{await rm(dir,{recursive:true,force:true});}
});
