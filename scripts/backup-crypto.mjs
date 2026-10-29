import {createReadStream,createWriteStream} from 'node:fs';
import {open,readFile,rename,rm,stat} from 'node:fs/promises';
import {createHash,createCipheriv,createDecipheriv,createPublicKey,createPrivateKey,publicEncrypt,privateDecrypt,randomBytes,constants} from 'node:crypto';
import {createGzip,createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';

const MAGIC=Buffer.from('BURGETBK1\n'),MAX_HEADER=16384;
const rsaOptions=key=>({key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING});
export function backupKeyId(key){const publicKey=createPublicKey(key);if(publicKey.asymmetricKeyType!=='rsa'||publicKey.asymmetricKeyDetails.modulusLength<3072)throw Error('Backup requires an RSA key of at least 3072 bits');return createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');}
export async function fileDigest(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export async function encryptBackup(source,destination,publicKey,metadata={}){
 const keyId=backupKeyId(publicKey),key=randomBytes(32),iv=randomBytes(12),size=(await stat(source)).size;
 const header=Buffer.from(JSON.stringify({format:'burget-database-backup',version:1,createdAt:new Date().toISOString(),...metadata,keyId,algorithm:'RSA-OAEP-SHA256/AES-256-GCM/gzip',size,sha256:await fileDigest(source),iv:iv.toString('base64'),encryptedKey:publicEncrypt(rsaOptions(publicKey),key).toString('base64')}));
 if(header.length>MAX_HEADER)throw Error('Backup metadata too large');
 const prefix=Buffer.alloc(MAGIC.length+4);MAGIC.copy(prefix);prefix.writeUInt32BE(header.length,MAGIC.length);
 const handle=await open(destination,'wx',0o600),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
 try{
  await handle.writeFile(Buffer.concat([prefix,header]));
  await pipeline(createReadStream(source),createGzip(),cipher,createWriteStream(destination,{fd:handle.fd,autoClose:false,start:prefix.length+header.length}));
  // Append using an explicit offset: the stream and FileHandle have separate positions.
  const end=(await handle.stat()).size;await handle.write(cipher.getAuthTag(),0,16,end);await handle.sync();
 }catch(error){await handle.close();await rm(destination,{force:true});throw error;}finally{key.fill(0);await handle.close().catch(()=>{});}
 return JSON.parse(header.toString());
}
export async function decryptBackup(source,destination,privateKey){
 const handle=await open(source,'r'),temporary=destination+'.partial-'+randomBytes(8).toString('hex');let key;
 try{
  const size=(await handle.stat()).size,prefix=Buffer.alloc(MAGIC.length+4);await handle.read(prefix,0,prefix.length,0);
  if(!prefix.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Unknown backup format');
  const length=prefix.readUInt32BE(MAGIC.length);if(!length||length>MAX_HEADER||size<prefix.length+length+17)throw Error('Truncated backup');
  const header=Buffer.alloc(length);await handle.read(header,0,length,prefix.length);const meta=JSON.parse(header.toString());
  if(meta.format!=='burget-database-backup'||meta.version!==1||meta.algorithm!=='RSA-OAEP-SHA256/AES-256-GCM/gzip'||!Number.isSafeInteger(meta.size)||meta.size<0||!/^[a-f0-9]{64}$/.test(meta.sha256)||backupKeyId(createPrivateKey(privateKey))!==meta.keyId)throw Error('Backup metadata or key mismatch');
  key=privateDecrypt(rsaOptions(privateKey),Buffer.from(meta.encryptedKey,'base64'));if(key.length!==32)throw Error('Invalid backup key');
  const tag=Buffer.alloc(16);await handle.read(tag,0,16,size-16);const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'base64'));decipher.setAAD(header);decipher.setAuthTag(tag);
  const hash=createHash('sha256');let bytes=0;const check=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>meta.size)return callback(Error('Backup size mismatch'));hash.update(chunk);callback(null,chunk);}});
  await pipeline(createReadStream(source,{start:prefix.length+length,end:size-17}),decipher,createGunzip(),check,createWriteStream(temporary,{flags:'wx',mode:0o600}));
  if(bytes!==meta.size||hash.digest('hex')!==meta.sha256)throw Error('Backup checksum mismatch');
  // Never replace an existing SQL file or expose partially authenticated plaintext.
  const target=await open(destination,'wx',0o600);await target.close();
  try{await rename(temporary,destination);}catch(error){await rm(destination,{force:true});throw error;}
  return meta;
 }finally{key?.fill(0);await handle.close();await rm(temporary,{force:true});}
}
