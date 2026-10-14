import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildSync} from 'esbuild';

// Exercise the real component handlers and effects without a browser or server.
const bundle=buildSync({entryPoints:[new URL('../src/NotificationSettings.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',external:['react']}).outputFiles[0].text;
function panel(initial,mutate){
 const slots=[],effects=[];let index=0,changed=false,props={data:{settings:initial},mutate,busy:false},tree;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment',useState(initial){const slot=index++;if(!(slot in slots))slots[slot]=typeof initial==='function'?initial():initial;return [slots[slot],value=>{const next=typeof value==='function'?value(slots[slot]):value;if(!Object.is(next,slots[slot])){slots[slot]=next;changed=true;}}];},useRef(value){const slot=index++;return slots[slot]??(slots[slot]={current:value});},useEffect(fn,deps){const slot=index++;if(!slots[slot]||deps.some((v,i)=>!Object.is(v,slots[slot][i]))){slots[slot]=deps;effects.push(fn);}}};
 const ctx={module:{exports:{}},exports:{},require:name=>{assert.equal(name,'react');return React;},Intl,Date,console};ctx.exports=ctx.module.exports;
 vm.runInNewContext(bundle,ctx);
 const Component=ctx.module.exports.default;
 function render(){let loops=0;do{changed=false;index=0;tree=Component(props);while(effects.length)effects.shift()();assert.ok(++loops<20);}while(changed);return tree;}
 function find(predicate,node){if(!node)return; if(Array.isArray(node)){for(const child of node){const found=find(predicate,child);if(found)return found;}}else if(typeof node==='object'){if(predicate(node))return node;return node.children?find(predicate,node.children):undefined;}}
 render();return {render,refresh(settings){props={...props,data:{settings}};render();},field:()=>find(n=>n.type==='input'&&n.props.list==='budget-zones',tree),save:()=>find(n=>n.type==='button'&&n.children.includes('Сохранить настройки'),tree)};
}
test('Unsaved reminder setting survives foreground refresh and other module saves',()=>{
 const original={timeZone:'Europe/Moscow',modules:{lunch:true}};
 const app=panel(original,async()=>true);
 app.field().props.onChange({target:{value:'Europe/Riga'}});app.render();
 app.refresh(structuredClone(original));
 assert.equal(app.field().props.value,'Europe/Riga');
 app.refresh({...original,modules:{lunch:false},reserveRub:900});
 assert.equal(app.field().props.value,'Europe/Riga');
});
test('Saving reminders preserves the latest unrelated settings and clean remote changes',async()=>{
 let data={settings:{timeZone:'Europe/Moscow',reportTime:'21:00',reserveRub:500,modules:{lunch:true}}};
 const app=panel(data.settings,async change=>{data=change(data);return true;});
 app.field().props.onChange({target:{value:'Europe/Riga'}});app.render();
 data={settings:{...data.settings,reportTime:'22:15',reserveRub:900,modules:{lunch:false}}};app.refresh(data.settings);
 await app.save().props.onClick();app.refresh(data.settings);
 assert.equal(data.settings.timeZone,'Europe/Riga');assert.equal(data.settings.reportTime,'22:15');assert.equal(data.settings.reserveRub,900);assert.equal(data.settings.modules.lunch,false);
 assert.equal(app.field().props.value,'Europe/Riga');
});
test('Failed save and conflict refresh retain the edited field for retry',async()=>{
 const original={timeZone:'Europe/Moscow',reportTime:'21:00'};
 const app=panel(original,async()=>false);
 app.field().props.onChange({target:{value:'Europe/Riga'}});app.render();
 await app.save().props.onClick();app.render();
 app.refresh({...original,reportTime:'22:00'});
 assert.equal(app.field().props.value,'Europe/Riga');
});
test('Edits made while a save is in flight survive its successful completion',async()=>{
 let release,data={settings:{timeZone:'Europe/Moscow'}};
 const app=panel(data.settings,async change=>{data=change(data);await new Promise(r=>release=r);return true;});
 app.field().props.onChange({target:{value:'Europe/Riga'}});app.render();
 const saving=app.save().props.onClick();
 app.field().props.onChange({target:{value:'Europe/Berlin'}});app.render();
 release();await saving;app.refresh(data.settings);
 assert.equal(data.settings.timeZone,'Europe/Riga');assert.equal(app.field().props.value,'Europe/Berlin');
});
test('Clean fields follow refresh and saved settings survive opening a fresh component',async()=>{
 let data={settings:{timeZone:'Europe/Moscow'}};
 const mutate=async change=>{data=change(data);return true;};
 const app=panel(data.settings,mutate);app.refresh({timeZone:'Europe/Riga'});
 assert.equal(app.field().props.value,'Europe/Riga');
 app.field().props.onChange({target:{value:'Europe/Berlin'}});app.render();await app.save().props.onClick();
 assert.equal(panel(structuredClone(data.settings),mutate).field().props.value,'Europe/Berlin');
});
