import {readFileSync,readdirSync,createReadStream} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';

const require=createRequire(import.meta.url);
const core=dirname(require.resolve('tesseract.js-core'));
const tesseract=dirname(require.resolve('tesseract.js/package.json'));
const assets=new Map([
  ['worker.min.js',join(tesseract,'dist/worker.min.js')],
  ['LICENSE-tesseract.txt',join(tesseract,'LICENSE.md')],
  ['LICENSE-tesseract-core.txt',join(core,'LICENSE')],
  ...readdirSync(core).filter(name=>/^tesseract-core.*-lstm\.wasm\.js$/.test(name)).map(name=>[name,join(core,name)]),
  ...['rus','eng'].map(language=>[language+'.traineddata.gz',
    join(dirname(require.resolve('@tesseract.js-data/'+language)),'4.0.0_best_int',language+'.traineddata.gz')])
]);

export default function ocrAssets() {
  return {
    name:'receipt-ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr',(request,response,next)=>{
        const name=request.url?.slice(1),file=assets.get(name);
        if(!file)return next();
        response.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':'application/octet-stream');
        createReadStream(file).on('error',next).pipe(response);
      });
    },
    generateBundle() {
      for(const [name,file] of assets)this.emitFile({type:'asset',fileName:'ocr/'+name,source:readFileSync(file)});
    }
  };
}
