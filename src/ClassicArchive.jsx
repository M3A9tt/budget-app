import React, {useState} from 'react';
import {BrandSymbol} from './Brand.jsx';
import {classicRecoveryFile, readClassicArchive, unlockClassicArchive} from './classic-archive.js';
import {downloadJson} from './json-import.js';
import {todayMoscow} from './mini-model.js';

const labels = {current: 'Текущая копия', previous: 'Предыдущая копия', plain: 'Старая локальная копия'};

function readDevice() {
  try { return {archive: readClassicArchive(window.localStorage)}; }
  catch { return {error: 'Браузер не предоставил доступ к локальному архиву.'}; }
}

export default function ClassicArchive() {
  const [{archive, error: storageError}] = useState(readDevice);
  const [source, setSource] = useState(archive?.sources[0]);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const needsPin = source !== 'plain' || !!archive?.pinHash;

  function selectSource(event) {
    setSource(event.target.value);
    setBudget(null);
    setPin('');
    setError('');
    setStatus('');
  }

  async function unlock(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setBudget(null);
    setError('');
    setStatus('');
    try { setBudget(await unlockClassicArchive(archive, source, pin)); }
    catch (failure) { setError(failure.message); }
    finally { setPin(''); setBusy(false); }
  }

  function download(device = false) {
    setError('');
    setStatus('');
    try {
      downloadJson(device ? classicRecoveryFile(archive) : budget, device
        ? 'burget-device-recovery.json'
        : 'burget-archive-' + todayMoscow() + '.json');
      setStatus('Скачивание начато. Проверь, что файл сохранился.');
    } catch { setError('Не удалось скачать файл. Открой архив в браузере, где он был сохранён.'); }
  }

  return <main className="mini-shell">
    <section className="mini-card mini-form auth-gate">
      <BrandSymbol />
      <h1>Архив Бюрджета</h1>
      <p className="mini-muted">Здесь можно выгрузить данные старой версии, сохранённые в этом браузере.</p>
      {storageError && <p role="alert">{storageError}</p>}
      {archive && !source && <p>На этом устройстве архив не найден. Если данные были в другом браузере, открой архив там.</p>}
      {source && <>
        <form onSubmit={unlock}>
          {archive.sources.length > 1 && <label>Копия архива<select value={source} onChange={selectSource} disabled={busy}>
            {archive.sources.map(id => <option key={id} value={id}>{labels[id]}</option>)}
          </select></label>}
          {!budget && <>
            {needsPin && <label>PIN архива<input type="password" autoComplete="off" value={pin} onChange={event => setPin(event.target.value)} required disabled={busy} /></label>}
            <button className="mini-primary" disabled={busy}>{busy ? 'Открываем…' : 'Открыть копию'}</button>
          </>}
        </form>
        {budget && <>
          <p>Счета · {budget.accounts.length} / Операции · {budget.transactions.length}</p>
          <button type="button" className="mini-primary" onClick={() => download()}>Скачать архив JSON</button>
          <p className="mini-small mini-muted">В рабочем Бюрджете открой «Настройки → Резервная копия», чтобы проверить файл перед восстановлением. Восстановление заменит текущий бюджет.</p>
        </>}
        {archive.sources.some(id => id !== 'plain') && <p><button type="button" className="mini-text-button" disabled={busy} onClick={() => download(true)}>Скачать зашифрованные копии</button></p>}
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
      </>}
      <p><a className="mini-text-button" href="/">Открыть Бюрджет</a></p>
    </section>
  </main>;
}
