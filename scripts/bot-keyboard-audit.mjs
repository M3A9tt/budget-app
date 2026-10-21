import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=process.cwd(),out=resolve(process.env.AUDIT_SCREENSHOT_DIR||'docs/audit-4.2.1');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const before=process.env.AUDIT_BEFORE_REF||'7e3cbdf3be1e9c7669115481014acec5fb42bbc0',temporary=await mkdtemp(join(tmpdir(),'burget-bot-audit-')),old=join(temporary,'before');
await mkdir(out,{recursive:true});
try{
 git('worktree','add','--detach',old,before);await symlink(join(root,'node_modules'),join(old,'node_modules'),'junction');
 for(const [label,source,sha] of [['before',old,git('rev-parse',before)],['after',root,git('rev-parse','HEAD')]]){
  const result=await build({stdin:{contents:"export * from './server/bot-navigation.js';export {botView} from './server/bot-views.js';export {compactMenuRows} from './server/bot-chat.js';export {EMPTY} from './src/mini-model.js';",resolveDir:source},bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'text'}});
  const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
  const data=structuredClone(api.EMPTY);data.settings.modules={lunch:true};
  const screen=api.botView(data,'more',{},true),routes=screen.actions;
  const buttons=routes.map((r,i)=>[{text:r.label,...(r.command==='/app'?{web_app:{url:'https://budget.example/'}}:{callback_data:'audit:'+i})}]);
  const rows=api.compactMenuRows(buttons,routes,'more'),menuCalls=[];
  if(api.configureMiniAppMenu)await api.configureMiniAppMenu({MINI_APP_URL:'https://budget.example/'},'111',async(env,method,body)=>menuCalls.push({method,body}));
  await writeFile(join(out,label+'.json'),JSON.stringify({sha,fixture:{modules:{lunch:true},owner:true},menuTitle:screen.title,inlineKeyboard:rows,replyKeyboard:api.botKeyboard('https://budget.example/',data),nativeMiniAppMenuConfigured:menuCalls.some(c=>c.method==='setChatMenuButton'&&c.body.menu_button.type==='web_app'),menuCalls},null,2)+'\n');
  console.log(label+': inline rows '+rows.length+', reply rows '+api.botKeyboard('https://budget.example/',data).keyboard.length);
 }
}finally{git('worktree','remove','--force',old);await rm(temporary,{recursive:true,force:true});}
