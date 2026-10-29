import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encryptBackup,fileDigest} from './backup-crypto.mjs';
import {verifyDatabaseExport} from './database-recovery.mjs';

export function exportFailure(result){
 const output=String(result.stdout||'')+'\n'+String(result.stderr||'');
 const apiCode=output.match(/\bcode:\s*(\d{4,8})\b/i)?.[1];
 const processCode=['ENOENT','EACCES','ETIMEDOUT','ENOBUFS'].includes(result.error?.code)?result.error.code:'EXPORT_FAILED';
 return Object.assign(Error('Database export failed'),{backupCode:apiCode?'CLOUDFLARE_'+apiCode:processCode,processStatus:Number.isInteger(result.status)?result.status:null});
}
export async function createDatabaseBackup({directory,config='server/wrangler.staging.jsonc',exportDatabase}={}){
 const target=resolve(directory||'database-backup'),temporary=await mkdtemp(join(tmpdir(),'burget-db-backup-'));let stage='prepare';
 try{
  await mkdir(target,{recursive:true,mode:0o700});const sql=join(temporary,'database.sql');
  stage='export';if(exportDatabase)await exportDatabase(sql);else{
   if(!process.env.CLOUDFLARE_API_TOKEN)throw Object.assign(Error('Missing backup credential'),{backupCode:'MISSING_CREDENTIAL'});
   const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','budget-staging','--remote','--skip-confirmation','--config',config,'--output',sql],{encoding:'utf8',timeout:240000,maxBuffer:2*1024*1024});
   // Wrangler prints a signed plaintext download URL. Keep all subprocess output private.
   if(result.status!==0)throw exportFailure(result);
  }
  stage='restore-check';
  const verification=await verifyDatabaseExport(sql),pkg=JSON.parse(await readFile('package.json','utf8'));
  stage='encrypt';
  const metadata=await encryptBackup(sql,join(target,'database.burget.enc'),await readFile('config/backup-public-key.pem','utf8'),{appVersion:pkg.version,sourceCommit:process.env.GITHUB_SHA||null,schemaVersion:1,verification});
  const manifest={format:metadata.format,version:1,createdAt:metadata.createdAt,keyId:metadata.keyId,appVersion:pkg.version,sourceCommit:metadata.sourceCommit,schemaVersion:1,sha256:await fileDigest(join(target,'database.burget.enc')),verification:{integrity:'ok'}};
  stage='manifest';await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return manifest;
 }catch(error){
  const known=['ENOENT','EACCES','EEXIST','ERR_SQLITE_ERROR'];
  throw Object.assign(Error('Independent backup failed'),{backupStage:stage,backupCode:error.backupCode||(known.includes(error.code)?error.code:'FAILED'),processStatus:error.processStatus??null});
 }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const manifest=await createDatabaseBackup({directory:process.argv[2]});console.log(JSON.stringify({event:'independent_backup_ready',appVersion:manifest.appVersion,keyId:manifest.keyId,integrity:'ok',encrypted:true}));}
 catch(error){console.error(JSON.stringify({event:'independent_backup_failed',stage:error.backupStage||'prepare',code:error.backupCode||'FAILED',processStatus:error.processStatus??null}));process.exitCode=1;}
}
