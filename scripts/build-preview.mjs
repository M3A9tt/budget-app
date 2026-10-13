import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import MiniApp from './src/MiniApp.jsx';createRoot(document.getElementById('root')).render(<MiniApp/>);",resolveDir:process.cwd(),loader:'jsx'},bundle:true,minify:true,write:false,outfile:'preview.js',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101216"><title>Финансы — демонстрация Mini App</title><style>${css}</style></head><body><div id="root"></div><script>window.__BUDGET_DEMO__=true;${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
await writeFile('../finance-miniapp-demo.html',html);
console.log('Standalone demo:',Buffer.byteLength(html),'bytes');
