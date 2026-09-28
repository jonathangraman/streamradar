import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {keyOf,parseRoute,normalize,escapeHTML,formatDate,isStandup,calendarEvent,emptyLibrary,migrateLegacy,updateLibrary,commitLibrary,createSequence,providerIds} from '../core.js';
const movie={id:161,type:'movie',title:"Ocean's Eleven",date:'2001-12-07'};
test('reloadable routes preserve title and actor identity and reject malformed paths',()=>{assert.deepEqual(parseRoute('#detail/movie:161'),{view:'detail',key:'movie:161'});assert.deepEqual(parseRoute('#actor/1461'),{view:'actor',id:1461});assert.deepEqual(parseRoute('#detail/movie:0'),{view:'home'});});
test('movies and series sharing an ID remain independent through add/rate/remove',()=>{
  let state=updateLibrary(emptyLibrary(),'watch',movie);const tv={...movie,type:'tv',title:'A series'};
  state=updateLibrary(state,'watch',tv);assert.equal(state.watchlist.length,2);
  state=updateLibrary(state,'rate',movie,5);assert.equal(state.watchlist.length,1);assert.equal(state.watchlist[0].type,'tv');assert.equal(state.ratings['movie:161'],5);assert.equal(state.ratings['tv:161'],undefined);
});
test('quote-containing titles remain data and markup is escaped',()=>{const x=normalize({...movie,title:'A "quote" & <img onerror=bad>’s'});assert.equal(x.title,'A "quote" & <img onerror=bad>’s');assert.equal(escapeHTML("Ocean's <Eleven>"),'Ocean&#39;s &lt;Eleven&gt;');assert(!readFileSync(new URL('../app.js',import.meta.url),'utf8').includes('onclick='));});
test('zero and recommendation-index IDs are rejected',()=>{assert.equal(normalize({...movie,id:0}),null);assert.equal(normalize({...movie,id:'rec_0'}),null);assert.throws(()=>updateLibrary(emptyLibrary(),'seen',{...movie,id:0}));});
test('recommendation ratings remain attached to canonical identity after list removal',()=>{
 const a={...movie,id:1},b={...movie,id:2};let state={...emptyLibrary(),recs:[a,b]};state=updateLibrary(state,'rate',a,4);assert.equal(state.recs[0].id,2);assert.equal(state.ratings[keyOf(b)],undefined);state=updateLibrary(state,'seen',b);assert.equal(state.seen.length,2);
});
test('storage failure never commits a pretend success',()=>{const current=emptyLibrary();const next=updateLibrary(current,'watch',movie);assert.throws(()=>commitLibrary({setItem(){throw new Error('Quota exceeded');}},next));assert.equal(current.watchlist.length,0);});
test('local save survives serialization and reload',()=>{let raw;const next=commitLibrary({setItem(k,v){assert.equal(k,'sr_library_v2');raw=v;}},updateLibrary(emptyLibrary(),'rate',movie,5));assert.deepEqual(JSON.parse(raw),next);});
test('legacy migration preserves valid titles, rejects broken recommendations and avoids ambiguous ratings',()=>{const result=migrateLegacy([movie,{...movie,type:'tv'},{...movie,id:'rec_0'}],[],{'161':5});assert.equal(result.watchlist.length,2);assert.deepEqual(result.ratings,{});assert.equal(migrateLegacy([movie],[],{'161':5}).ratings['movie:161'],5);});
test('date-only formatting is stable in Chicago and across year boundaries',()=>{const old=process.env.TZ;process.env.TZ='America/Chicago';assert.equal(formatDate('2026-09-28'),'Sep 28, 2026');assert.equal(formatDate('2026-01-01'),'Jan 1, 2026');process.env.TZ=old;});
test('stand-up uses keywords or explicit titles, not comedy plus TV movie genres',()=>{assert.equal(isStandup({title:'A romantic comedy',genre_ids:[35,10770]}),false);assert.equal(isStandup({title:'An ordinary title',keywords:{keywords:[{name:'stand-up comedy'}]}}),true);assert.equal(isStandup({title:'My Stand-Up Special'}),true);assert.equal(isStandup({title:'Stand Up to Cancer'}),false);});
test('provider IDs follow current catalog and exclude third-party channels',()=>{const catalog=[{provider_id:2303,provider_name:'Paramount Plus Premium'},{provider_id:2616,provider_name:'Paramount Plus Essential'},{provider_id:582,provider_name:'Paramount+ Amazon Channel'}];assert.deepEqual(providerIds(catalog,'paramount'),[2303,2616]);});
test('stale async response cannot pass the current request guard',async()=>{const sequence=createSequence();let visible;const old=sequence.next();const latest=sequence.next();if(sequence.current(latest))visible='new';await Promise.resolve();if(sequence.current(old))visible='old';assert.equal(visible,'new');});
test('calendar export supports distant dates and escapes untrusted text',()=>{const event=calendarEvent({...movie,title:'Hello,\nBEGIN:bad'},'2027-12-31');assert(event.includes('DTSTART;VALUE=DATE:20271231'));assert(event.includes('DTEND;VALUE=DATE:20280101'));assert(event.includes('TRIGGER:-P1D'));assert(event.includes('Hello\\,\\nBEGIN:bad'));});
test('service worker falls back on 404 and never caches API/personal responses',async()=>{
 const events={},stored=new Map([['/',new Response('cached shell')]]);let result;
 const context={URL,Response,self:{location:{origin:'https://example.test'},addEventListener:(n,fn)=>events[n]=fn},caches:{open:async()=>({match:async k=>stored.get(k),put:async()=>{}})},fetch:async()=>new Response('missing',{status:404})};
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 events.fetch({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:p=>result=p});assert.equal(await (await result).text(),'cached shell');
 let intercepted=false;events.fetch({request:{url:'https://example.test/api/tmdb?path=/search/movie',method:'GET',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
