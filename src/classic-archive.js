import {decryptClassicData, deriveClassicKey, hashClassicPin} from './classic-crypto.js';

const keys = {
  current: 'finance-app-encrypted-v2',
  previous: 'finance-app-encrypted-v2-previous',
  plain: 'finance-app-data'
};

export function readClassicArchive(storage) {
  const values = Object.fromEntries(Object.entries(keys).map(([source, key]) => [source, storage.getItem(key)]));
  return {
    values,
    sources: Object.keys(keys).filter(source => values[source] !== null),
    pinHash: storage.getItem('finance-pin-hash')
  };
}

function parseBudget(data) {
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    throw Error('В этой копии не найдены счета и операции.');
  }
  const {_pinHash, ...budget} = data;
  return budget;
}

export async function unlockClassicArchive(archive, source, pin) {
  if (!archive.sources.includes(source)) throw Error('Эта копия недоступна.');
  const value = archive.values[source];
  if (source === 'plain') {
    if (archive.pinHash && await hashClassicPin(pin) !== archive.pinHash) throw Error('PIN не подошёл.');
    try {
      return parseBudget(JSON.parse(value));
    } catch {
      throw Error('Не удалось прочитать эту копию.');
    }
  }
  let encoded;
  try {
    encoded = JSON.parse(value)?._enc;
    if (typeof encoded !== 'string' || !encoded) throw Error();
  } catch {
    throw Error('Формат этой копии повреждён.');
  }
  const key = await deriveClassicKey(pin);
  let data;
  try {
    data = await decryptClassicData(encoded, key);
  } catch {
    throw Error('PIN не подошёл или копия повреждена.');
  }
  return parseBudget(data);
}

export function classicRecoveryFile(archive, capturedAt = new Date().toISOString()) {
  return {
    format: 'burget-device-recovery',
    version: 1,
    capturedAt,
    entries: Object.fromEntries(archive.sources
      .filter(source => source !== 'plain')
      .map(source => [keys[source], archive.values[source]]))
  };
}
