import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as core from '../core.js';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const load=source.slice(source.indexOf('async function loadCatalog('),source.indexOf('async function enrichLabels('));
const limit=source.slice(source.indexOf('async function mapLimit('),source.indexOf('\n',source.indexOf('async function mapLimit(')));
function harness(options={}){
 const nodes=new Map(),calls=[];const $=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
 const context=vm.createContext({...core,URLSearchParams,Promise,Map,Set,Number,Error,$,type:'tv',service:'prime',region:'US',kind:'tv',genre:'all',when:'now',network:'all',scope:'originals',reality:'exclude',page:1,totalPages:1,results:[],loading:false,searchController:null,sequence:core.createSequence(),...options,
  activeVerifiedOffers:()=>[],scheduledVerifiedReleases:()=>[],visibleTitles:x=>x.filter(item=>!options.seen?.has(core.keyOf(item))),card:x=>x.title,errorHTML:x=>'ERROR: '+x,enrichLabels:()=>{},
  api:async path=>{
   calls.push(path);
   if(options.api)return options.api(path);
   if(path.startsWith('/watch/providers/'))return {results:[{provider_id:9,provider_name:'Amazon Prime Video'}]};
   if(path.startsWith('/discover/tv')){const p=Number(new URLSearchParams(path.split('?')[1]).get('page'));return {total_pages:20,results:Array.from({length:7},(_,i)=>({id:p*100+i,name:'Title '+(p*100+i),first_air_date:'2026-01-01',original_language:'en',genre_ids:[18]}))};}
   if(path.startsWith('/tv/')){const id=Number(path.split('/')[2].split('?')[0]);return {id,name:'Title '+id,first_air_date:'2026-01-01',original_language:'en',genre_ids:[18],networks:[{id:1024}]};}
   throw new Error('Unexpected '+path);
  }
 });
 vm.runInContext(limit+'\n'+load,context);return {context,calls,nodes};
}
test('catalog fills sparse pages to 36+ unique matches and Load more advances the consumed cursor',async()=>{
 const {context,calls}=harness();await context.loadCatalog();assert.equal(context.results.length,42);assert.equal(context.page,6);
 assert.equal(new Set(context.results.map(core.keyOf)).size,42);
 await context.loadCatalog(true);assert.equal(context.results.length,84);assert.equal(context.page,12);
 assert(calls.some(x=>x.includes('/discover/tv?')&&new URLSearchParams(x.split('?')[1]).get('page')==='7'));
});
test('hidden watched titles do not count toward filling the visible batch',async()=>{
 const {context}=harness({seen:new Set(['tv:100','tv:101','tv:102','tv:103','tv:104'])});await context.loadCatalog();assert.equal(context.results.length,37);assert.equal(context.page,6);
});
test('catalog stops at the final upstream page instead of requesting nonexistent pages',async()=>{
 const {context,nodes}=harness({api:async path=>path.startsWith('/watch/providers')?{results:[{provider_id:9,provider_name:'Amazon Prime Video'}]}:path.startsWith('/discover/')?{total_pages:1,results:[]}:{}});
 await context.loadCatalog();assert.equal(context.page,1);assert.equal(nodes.get('load-more').hidden,true);
});
test('Full catalog skips originals enforcement but still applies the reality preference',async()=>{
 const data={id:1,name:'Licensed show',type:'tv',first_air_date:'2001-01-01',original_language:'en',genre_ids:[18],networks:[{id:6}]};
 const api=async path=>path.startsWith('/watch/providers')?{results:[{provider_id:9,provider_name:'Amazon Prime Video'}]}:path.startsWith('/discover/')?{total_pages:1,results:[data]}:data;
 const full=harness({scope:'catalog',api});await full.context.loadCatalog();assert.equal(full.context.results.length,1);
 const originals=harness({api});await originals.context.loadCatalog();assert.equal(originals.context.results.length,0);
});
