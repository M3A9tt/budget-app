import './finance-pilot.css';
import AppErrorBoundary from './AppErrorBoundary.jsx';
import React, {lazy, Suspense} from 'react';
import ReactDOM from 'react-dom/client';
import MiniApp from './MiniApp.jsx';

const ClassicArchive = lazy(() => import('./ClassicArchive.jsx'));
const classic = new URLSearchParams(location.search).get('classic') === '1';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <React.StrictMode>
      {classic
        ? <Suspense fallback={<p className="mini-loading" role="status">Открываем архив…</p>}><ClassicArchive /></Suspense>
        : <MiniApp />}
    </React.StrictMode>
  </AppErrorBoundary>
);
