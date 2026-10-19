import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
const code=buildSync({entryPoints:[new URL('../src/MiniApp.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react']}).outputFiles[0].text;
// Run the real screen handlers with in-memory hooks; no server or personal profile involved.
function app(){
 const slots=[],layouts=[],listeners=new Map();let index=0,tree,scroll=0;
 const React={Fragment:'fragment',Suspense:'suspense',lazy:()=>function Deferred(){},createElement:(type,props,...children)=>({type,props:props||{},children}),
 useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},
 useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useMemo:fn=>fn(),useEffect:()=>{},
 useLayoutEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((d,n)=>!Object.is(d,old.deps[n]))){old?.cleanup?.();slots[i]={deps};layouts.push(()=>slots[i].cleanup=fn());}}};
 const window={__BUDGET_DEMO__:true,location:{search:''},matchMedia:()=>({matches:false}),get scrollY(){return scroll;},scrollTo:({top})=>scroll=top,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const context={module:{exports:{}},exports:{},require:()=>React,window,location:window.location,Intl,Date,URLSearchParams,structuredClone,crypto,console,setTimeout:()=>0};context.exports=context.module.exports;vm.runInNewContext(code,context);
 const render=()=>{index=0;tree=context.module.exports.default();while(layouts.length)layouts.shift()();return tree;};
 const find=(predicate,node=tree)=>{if(!node)return;if(Array.isArray(node)){for(const n of node){const result=find(predicate,n);if(result)return result;}}else if(typeof node==='object'){if(predicate(node))return node;return find(predicate,node.children);}};
 const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='object'&&node?text(node.children):node??'';
 render();return {render,find,button:label=>find(n=>n.type==='button'&&text(n)===label),component:name=>find(n=>n.type?.name===name),scrollTo:n=>{scroll=n;listeners.get('scroll')?.();},get scroll(){return scroll;}};
}
test('Editing returns to the filtered history at its prior position; successful save keeps one linked operation',async()=>{
 const a=app();a.button('История').props.onClick();a.render();const rows=a.component('Transactions'),tx=rows.props.txs[0];assert.ok(tx);
 const search=a.find(n=>n.props['aria-label']==='Поиск операций');search.props.onChange({target:{value:tx.note}});a.render();a.scrollTo(460);
 a.component('Transactions').props.onEdit(tx);a.render();assert.equal(a.scroll,0);
 let composer=a.component('EntryComposer');composer.props.setDraft({...composer.props.draft,amount:String(tx.amount+1)});a.render();composer=a.component('EntryComposer');await composer.props.onSave({preventDefault(){}});a.render();
 assert.equal(a.scroll,460);assert.equal(a.find(n=>n.props['aria-label']==='Поиск операций').props.value,tx.note);
 const edited=a.component('Transactions').props.txs.find(t=>t.id===tx.id);assert.equal(edited.amount,tx.amount+1);assert.equal(a.component('Transactions').props.txs.filter(t=>t.id===tx.id).length,1);
});
test('A new unsaved entry survives tab switching without saving or duplicating a transaction',()=>{
 const a=app();a.button('Записать').props.onClick();a.render();let composer=a.component('EntryComposer');const initialCount=composer.props.data.transactions.length;
 composer.props.setDraft({...composer.props.draft,amount:'287,50',note:'Не потерять'});a.render();a.button('История').props.onClick();a.render();a.button('Записать').props.onClick();a.render();composer=a.component('EntryComposer');
 assert.equal(composer.props.draft.amount,'287,50');assert.equal(composer.props.draft.note,'Не потерять');assert.equal(composer.props.data.transactions.length,initialCount);
 a.find(n=>n.type==='button'&&n.props['aria-label']==='Назад').props.onClick();a.render();assert.ok(a.find(n=>n.props['data-page']==='history'));
});

test('All operations from home clear stale history filters and search',()=>{
 const a=app();a.button('История').props.onClick();a.render();a.button('Доходы').props.onClick();a.find(n=>n.props['aria-label']==='Поиск операций').props.onChange({target:{value:'никогда не найдёт'}});a.render();a.button('Главная').props.onClick();a.render();a.component('HomeOverview').props.recentContent.props.action.props.onClick();a.render();assert.equal(a.find(n=>n.props['aria-label']==='Поиск операций').props.value,'');assert.ok(a.component('Transactions').props.txs.some(t=>t.type==='expense'));
});
test('Transfer draft survives navigation and saves to transfer history without a personal expense',async()=>{
 const a=app();a.button('Записать').props.onClick();a.render();a.button('Перевод').props.onClick();a.render();let form=a.component('TransferForm');const before=form.props.data.transactions.length,accounts=form.props.data.accounts;form.props.setDraft({...form.props.draft,from:accounts[0].id,to:accounts[1].id,amount:'250'});a.render();a.button('История').props.onClick();a.render();a.button('Записать').props.onClick();a.render();form=a.component('TransferForm');assert.equal(form.props.draft.amount,'250');await form.props.onSave({...form.props.draft,id:form.props.draft.transferId});a.render();a.button('Записать').props.onClick();a.render();const composer=a.component('EntryComposer');assert.equal(composer.props.data.transfers.length,1);assert.equal(composer.props.data.transactions.length,before);assert.equal(composer.props.data.accounts.find(x=>x.id===accounts[0].id).balance,accounts[0].balance-250);
});
