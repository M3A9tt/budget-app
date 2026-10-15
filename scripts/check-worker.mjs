import {build} from 'esbuild';

// Validate imports and bundle syntax locally, without contacting Cloudflare.
const result=await build({entryPoints:['server/worker.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',loader:{'.css':'text'}});
console.log(`Worker bundled locally: ${result.outputFiles[0].contents.length} bytes`);
