import {readFile,rm} from 'node:fs/promises';
import {decryptBackup} from './backup-crypto.mjs';
import {verifyDatabaseExport} from './database-recovery.mjs';

const [archive,keyPath,output]=process.argv.slice(2);
if(!archive||!keyPath||!output)throw Error('Usage: node scripts/restore-db-backup.mjs ARCHIVE PRIVATE_KEY NEW_SQL_PATH');
let created=false;
try{
 const meta=await decryptBackup(archive,output,await readFile(keyPath,'utf8'));created=true;
 const verified=await verifyDatabaseExport(output);
 if(JSON.stringify(verified)!==JSON.stringify(meta.verification))throw Error('Restored database differs from the verified export');
 console.log(JSON.stringify({event:'backup_restored_locally',integrity:verified.integrity,appVersion:meta.appVersion,sourceCommit:meta.sourceCommit}));
}catch{if(created)await rm(output,{force:true});console.error('Restore failed. Check the archive and recovery key. No live database was changed.');process.exitCode=1;}
