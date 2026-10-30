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
 const context=vm.createContext({...core,AbortController,DOMException,catalogController:null,homeLoaded:false,URLSearchParams,Promise,Map,Set,Number,Error,$,type:'tv',service:'prime',region:'US',kind:'tv',genre:'all',when:'now',network:'all',scope:'originals',reality:'exclude',page:1,totalPages:1,results:[],loading:false,searchController:null,sequence:core.createSequence(),...options,
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
test('default movie catalog finds older theatrical films through recent streaming discovery',async()=>{
 const film={id:999,title:'New to Paramount',original_language:'en',release_date:'2025-01-01',genre_ids:[27]};
 const calls=[];
 const {context}=harness({service:'paramount',kind:'movie',today:()=> '2026-10-29',api:async path=>{
  calls.push(path);
  if(path.startsWith('/watch/providers/'))return {results:[{provider_id:2616,provider_name:'Paramount Plus Essential'}]};
  if(path.startsWith('/discover/movie'))return {total_pages:1,results:path.includes('with_release_type=4')?[film]:[]};
  if(path.endsWith('/release_dates'))return {results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:'2025-01-01',note:''},{type:4,release_date:'2026-10-12',note:'Paramount+'}]}]};
  if(path.startsWith('/movie/999?'))return film;
  throw new Error('Unexpected '+path);
 }});
 await context.loadCatalog();assert.equal(context.results.length,1);assert.equal(context.results[0].streamingDate,'2026-10-12');
 assert(calls.some(x=>x.includes('release_date.gte=2026-07-31')));
});
test('official Dracula correction survives missing discovery and French language metadata',async()=>{
 const {context}=harness({service:'paramount',kind:'movie',today:()=> '2026-10-29',api:async path=>{
  if(path.startsWith('/watch/providers/'))return {results:[{provider_id:2616,provider_name:'Paramount Plus Essential'}]};
  if(path.startsWith('/discover/'))return {total_pages:1,results:[]};
  if(path.endsWith('/release_dates'))return {results:[]};
  if(path.startsWith('/movie/1246049?'))return {id:1246049,title:'Dracula',original_language:'fr',release_date:'2025-07-30',genre_ids:[27]};
  throw new Error('Unexpected '+path);
 }});
 context.activeVerifiedOffers=()=>core.activeVerifiedOffers('2026-10-29');
 await context.loadCatalog();assert.equal(context.results.length,1);assert.equal(context.results[0].title,'Dracula');assert.equal(context.results[0].streamingDate,'2026-10-12');
});
test('cancelling a catalog run stops the remaining queued movie release requests',async()=>{
 let firstRelease,finishRelease;const started=new Promise(r=>firstRelease=r),blocked=new Promise(r=>finishRelease=r);let requests=0;
 const films=Array.from({length:20},(_,i)=>({id:i+1,title:'Film '+i,original_language:'en',release_date:'2026-01-01',genre_ids:[18]}));
 const {context}=harness({service:'paramount',kind:'movie',api:async path=>{
  if(path.startsWith('/watch/providers/'))return {results:[{provider_id:2616,provider_name:'Paramount Plus Essential'}]};
  if(path.startsWith('/discover/'))return {total_pages:1,results:films};
  if(path.endsWith('/release_dates')){requests++;firstRelease();await blocked;return {results:[]};}
  return films.find(x=>x.id===Number(path.split('/')[2].split('?')[0]));
 }});
 const loading=context.loadCatalog();await started;context.sequence.next();context.catalogController.abort();const atCancel=requests;finishRelease();await loading;assert.equal(requests,atCancel);assert(requests<20);
});

test('theaters always includes limited releases and their US dates in now and coming soon',async()=>{
 for(const when of ['now','soon']){
  const date=core.shiftedDate(core.today(),when==='now'?0:7);
  const film={id:1458300,title:'The Mosquito Bowl',original_language:'en',release_date:'2026-10-29',genre_ids:[18]};
  const {context,calls}=harness({service:'theaters',type:'movie',kind:'movie',when,api:async path=>{
   if(path.startsWith('/watch/providers'))return {results:[]};
   if(path.startsWith('/discover/movie'))return {total_pages:1,results:new URLSearchParams(path.split('?')[1]).get('with_release_type')==='2'?[film]:[]};
   if(path.endsWith('/release_dates'))return {results:[{iso_3166_1:'US',release_dates:[{type:2,release_date:date+'T00:00:00Z'}]}]};
   return film;
  }});
  await context.loadCatalog();
  assert.equal(context.results.length,1);assert.equal(context.results[0].id,1458300);assert.equal(context.results[0].theaterDate,date);
  assert(calls.some(x=>x.startsWith('/discover/movie')&&new URLSearchParams(x.split('?')[1]).get('with_release_type')==='2|3'));
 }
});

test('now in theaters sorts verified US opening dates newest first across loaded pages',async()=>{
 const today=core.today(),old=core.shiftedDate(today,-7),older=core.shiftedDate(today,-14);
 const films=[{id:1,title:'Older popular movie',original_language:'en',release_date:'2026-01-01',popularity:100},{id:2,title:'Newest limited movie',original_language:'en',release_date:'2001-01-01',popularity:1},{id:3,title:'Oldest movie',original_language:'en',release_date:today,popularity:200}];
 const {context}=harness({service:'theaters',type:'movie',kind:'movie',api:async path=>{
  if(path.startsWith('/watch/providers'))return {results:[]};
  if(path.startsWith('/discover/'))return {total_pages:1,results:films};
  const id=Number(path.split('/')[2].split('?')[0]);
  if(path.endsWith('/release_dates'))return {results:[{iso_3166_1:'US',release_dates:[{type:id===2?2:3,release_date:({1:old,2:today,3:older})[id]}]}]};
  return films.find(x=>x.id===id);
 }});
 await context.loadCatalog();assert.deepEqual(Array.from(context.results,x=>x.id),[2,1,3]);
});
