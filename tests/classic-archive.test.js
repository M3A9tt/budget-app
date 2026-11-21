import test from 'node:test';
import assert from 'node:assert/strict';
import {classicRecoveryFile, readClassicArchive, unlockClassicArchive} from '../src/classic-archive.js';
import {migrateData} from '../src/ledger.js';
import {EMPTY} from '../src/mini-model.js';

const CURRENT = 'finance-app-encrypted-v2';
const PREVIOUS = 'finance-app-encrypted-v2-previous';
const PLAIN = 'finance-app-data';
const PIN = 'finance-pin-hash';
const envelope = _enc => JSON.stringify({_enc,schemaVersion:2});
const device = values => ({getItem: name => Object.hasOwn(values,name) ? values[name] : null});

// Ciphertext written by App.jsx before the archive route was replaced. The test
// never encrypts with the current implementation, so format drift is observable.
const fixture = {
  "pin": "0042",
  "hash": "42e6aed2bca035b1d30e2d5dcc4cbce902b347bf1f698aa6dc166a225c43e15d",
  "current": "LwDcGRoYhTBhA0Bq3Eovso1L0AaqAIMVUUV76YrbkX9dYW8jfMRk1+Z4NASU8RaUeFLT3YJ2mD7OmVw4PnBCZR3Bu2vVlOKP17TOK0CYg7B4xDmLnFWJHMdsODe923kSVKph+dL27kU5jxPYFioiHO4ntq/rVPI5ES4Fd8PsOFsNsQ3QgtIYXZGYA1ax4j1dz2AaXt9pBug1XTSh1WUzsEOpV7GoKSeQi5oU7rPSWGdyYF648df9ZdQpDJVAQkvVM3VVvls/dk6g9XignP728XTm2GBIGpHNovegaHGdUiVourKTtjO37rgSc9WbaYpmUzdg9BY6/5OHZEHNF+2jEc/w7GGo9d5ng3iSzCXFPWwb5BtxpbAAQCHTuP30uGf297PNn6NM37gXEyHfXrvdhw0JVNR8Sqbvu90c/tkoVUR1up6sXYKpKMuGbyA2amKg+KPXys8HT8B3zRvCnAZKv48NZNLYZogD0TN7EDTew97t0Ax9x0D3w0St3l0i694ESOE0KQXtT4Bwghg=",
  "previous": "FUOvxhOPb37zT9332Q0wjPn9jwtn0Zod85BwAkZTa2feh7UGMrGkoehx51kh2vNm8MKSxRKZzc6GuCL3BnYbmpXSEHYFEdLQkhYASU3UGGR/w9tByogxzRLRMr6F54p4vo3iD8PSqbw0ItNwtzE3zgrmf3/Bw/G0KYKBoVXvf6ARQnntKBoTopkPpZB7JFRsfEZjRKcUtbOpCOu3dB29i0Hr5R99gRuzvofLctiVpCGk2uTEGUZhjaDh1Cd+KDwHP3hxP5XcQMtgG79l4pY3ygnQlY10fOMXOCrzy+5EKAKGJgtP7/bGm/mZlstITS7G+Fjo6+qgKFUURc9RkJZy8K3ARA/MpNeImemw71nm5KT8sVr+q/M="
};

test('Classic current JSON keeps balances, record links and local PIN out of the export',async()=>{
  const values = {[CURRENT]:envelope(fixture.current),[PIN]:fixture.hash};
  const before = JSON.stringify(values);
  const archive = readClassicArchive(device(values));
  await assert.rejects(unlockClassicArchive(archive,'current','9999'),/PIN не подошёл/);
  const exported = await unlockClassicArchive(archive,'current',fixture.pin);
  assert.equal(Object.hasOwn(exported,'_pinHash'),false);
  const restored = migrateData(JSON.parse(JSON.stringify(exported)),EMPTY);
  assert.equal(restored.accounts[0].balance,1234.56);
  assert.deepEqual(restored.transactions.map(({id,accountId,amount}) => ({id,accountId,amount})),[{id:'meal',accountId:'bank',amount:65.44}]);
  assert.equal(JSON.stringify(values),before);
});

test('Corrupted current data can be downloaded intact and the previous copy can be opened separately',async()=>{
  const previous = envelope(fixture.previous);
  const archive = readClassicArchive(device({[CURRENT]:'{damaged',[PREVIOUS]:previous,[PIN]:fixture.hash}));
  assert.deepEqual(archive.sources,['current','previous']);
  await assert.rejects(unlockClassicArchive(archive,'current',fixture.pin),/Формат этой копии повреждён/);
  await assert.rejects(unlockClassicArchive(archive,'previous',fixture.pin),/PIN не подошёл/);
  const budget = await unlockClassicArchive(archive,'previous','0041');
  assert.equal(budget.accounts[0].balance,1300);
  assert.deepEqual(budget.transactions,[]);
  assert.deepEqual(classicRecoveryFile(archive,'2026-11-21T00:00:00.000Z').entries,{[CURRENT]:'{damaged',[PREVIOUS]:previous});
});

test('Classic plaintext keeps its existing PIN gate and unavailable archives stay empty',async()=>{
  const payload = JSON.stringify({accounts:[],transactions:[],settings:{},rates:{RUB:1},_pinHash:fixture.hash});
  const archive = readClassicArchive(device({[PLAIN]:payload,[PIN]:fixture.hash}));
  await assert.rejects(unlockClassicArchive(archive,'plain','wrong'),/PIN не подошёл/);
  assert.equal((await unlockClassicArchive(archive,'plain',fixture.pin)).rates.RUB,1);
  assert.deepEqual(classicRecoveryFile(archive).entries,{});
  const unprotected = readClassicArchive(device({[PLAIN]:payload}));
  assert.equal((await unlockClassicArchive(unprotected,'plain','')).rates.RUB,1);
  const empty = readClassicArchive(device({}));
  assert.deepEqual(empty.sources,[]);
  await assert.rejects(unlockClassicArchive(empty,'current',fixture.pin),/недоступна/);
});
