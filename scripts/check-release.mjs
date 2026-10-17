import {execFileSync} from 'node:child_process';
import {releases,validateReleases} from '../src/release-notes.js';
validateReleases(releases);
const base=process.env.RELEASE_BASE||'HEAD^';
execFileSync('git',['rev-parse','--verify',base],{stdio:'ignore'});
const hasFile=execFileSync('git',['ls-tree','--name-only',base,'src/releases.json'],{encoding:'utf8'}).trim();
if(!hasFile){console.log('Initial release notes validated');process.exit(0);}
const previous=JSON.parse(execFileSync('git',['show',base+':src/releases.json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(previous[0]?.id===releases[0].id)throw Error('Каждая новая выкладка требует нового патчноута в src/releases.json');
const kept=releases.find(r=>r.id===previous[0].id);
if(!kept||JSON.stringify(kept)!==JSON.stringify(previous[0]))throw Error('Добавьте новый патчноут первым элементом, сохранив предыдущий');
console.log('New release notes validated: '+releases[0].id);
