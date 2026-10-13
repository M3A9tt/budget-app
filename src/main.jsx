import React,{lazy,Suspense} from 'react';
import ReactDOM from 'react-dom/client';
import MiniApp from './MiniApp.jsx';
const Classic=lazy(()=>import('./App.jsx'));
const classic=new URLSearchParams(location.search).get('classic')==='1';
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode>{classic?<Suspense fallback={<div>Загрузка…</div>}><Classic/></Suspense>:<MiniApp/>}</React.StrictMode>);
