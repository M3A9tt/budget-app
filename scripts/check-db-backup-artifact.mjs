import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileDigest} from './backup-crypto.mjs';
export async function verifyStoredBackup(originalManifest,directory){
 const expected=await readFile(originalManifest),actual=await readFile(join(directory,'manifest.json'));
 if(!expected.equals(actual))throw Error('Stored backup manifest mismatch');
 const manifest=JSON.parse(expected.toString());
 if(manifest.format!=='burget-database-backup'||manifest.version!==1||!/^[a-f0-9]{64}$/.test(manifest.sha256)||await fileDigest(join(directory,'database.burget.enc'))!==manifest.sha256)throw Error('Stored encrypted backup checksum mismatch');
 return {event:'independent_backup_readback_verified',encrypted:true,integrity:'ok',sourceCommit:manifest.sourceCommit};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await verifyStoredBackup(process.argv[2],process.argv[3])));}
 catch{console.error('Independent encrypted copy could not be read back exactly.');process.exitCode=1;}
}
