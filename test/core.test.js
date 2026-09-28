import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {contentLabels,newestFirst,discoveryOrder} from '../core.js';
import {catalogQuery,shiftedDate,legacyTheater,activityDate,recentActivityFirst} from '../core.js';
import {matchesPick,pickKeyword} from '../core.js';
import {isEnglish} from '../core.js';
import {keyOf,parseRoute,normalize,escapeHTML,formatDate,isStandup,calendarEvent,emptyLibrary,migrateLegacy,updateLibrary,commitLibrary,createSequence,providerIds} from '../core.js';
const movie={id:161,type:'movie',title:"Ocean's Eleven",date:'2001-12-07'};
test('English-only uses original language, never translated title or country',()=>{
 assert(isEnglish({original_language:'en',origin_country:['GB']}));
 assert(!isEnglish({title:'An English title',original_language:'ko'}));assert(!isEnglish({title:'Unknown language'}));
 for(const service of ['all','apple','theaters'])for(const type of ['movie','tv'])for(const when of ['now','soon'])assert.equal(catalogQuery({service,type,when}).get('with_original_language'),'en');
});
test('not interested persists canonical identity without affecting a different media type',()=>{
 const initial={...emptyLibrary(),recs:[movie,{...movie,type:'tv'}]};
 const next=updateLibrary(initial,'dismiss',movie);assert.deepEqual(next.dismissed,['movie:161']);assert.equal(next.recs.length,1);assert.equal(next.recs[0].type,'tv');assert.deepEqual(JSON.parse(JSON.stringify(next)).dismissed,['movie:161']);
 assert.equal(updateLibrary(next,'dismiss',movie).dismissed.length,1);assert.equal(initial.recs.length,2);
});
test('pick filters distinguish media, genres and verified independent/TV keywords',()=>{
 assert(matchesPick({...movie,genre_ids:[53]},'movie','53'));assert(!matchesPick({...movie,genre_ids:[53]},'tv','53'));
 assert(matchesPick({...movie,type:'tv',genre_ids:[10759]},'tv','28'));
 assert(!matchesPick(movie,'movie','indie'));assert(matchesPick({...movie,keywords:{keywords:[{id:281237}]}},'movie','indie'));
 assert.equal(pickKeyword('27','tv'),315058);assert(matchesPick({...movie,type:'tv',keywords:{results:[{id:315058}]}},'tv','27'));
});
test('a returning series ranks by its new episode or season rather than its original premiere',()=>{
 const returning={id:1,type:'tv',date:'2001-01-01',last_episode_to_air:{season_number:4,episode_number:3,air_date:'2026-09-27'},next_episode_to_air:{season_number:4,episode_number:4,air_date:'2026-10-01'}};
 const film={id:2,type:'movie',date:'2026-09-26'};
 assert.equal(activityDate(returning,'2026-09-28'),'2026-09-27');assert.equal([film,returning].sort(recentActivityFirst)[0].id,1);
 assert.equal(activityDate({...returning,last_episode_to_air:null,seasons:[{season_number:2,air_date:'2026-09-28'},{season_number:3,air_date:'2027-01-01'}]},'2026-09-28'),'2026-09-28');
 const labels=contentLabels(returning,'2026-09-28');assert(labels.some(x=>x.text==='NEW EPISODE · SUN'));assert(labels.some(x=>x.text==='NEXT EPISODE · THU'));
});
test('theatrical browsing separates current wide releases from upcoming US releases',()=>{
 const now=catalogQuery({service:'theaters'},'2026-09-28'),soon=catalogQuery({service:'theaters',when:'soon'},'2026-09-28');
 assert.equal(now.get('region'),'US');assert.equal(now.get('with_release_type'),'3');assert.equal(now.get('release_date.lte'),'2026-09-28');assert.equal(now.has('watch_region'),false);assert.equal(now.get('sort_by'),'popularity.desc');
 assert.equal(soon.get('release_date.gte'),'2026-09-29');assert.equal(soon.get('release_date.lte'),'2026-12-27');assert.equal(soon.get('sort_by'),'release_date.asc');
 assert.equal(legacyTheater.url,'https://www.cinemark.com/theatres/tx-plano/cinemark-legacy-and-xd');
});
test('network filters require both HBO availability and the requested original network',()=>{
 const q=catalogQuery({type:'tv',service:'max',network:'food',ids:[1899]},'2026-09-28');
 assert.equal(q.get('with_networks'),'143');assert.equal(q.get('watch_region'),'US');assert.equal(q.get('with_watch_providers'),'1899');assert.equal(q.get('with_watch_monetization_types'),'flatrate');
 assert.equal(catalogQuery({type:'tv',service:'max',network:'discovery',ids:[1899]}).get('with_networks'),'64');
 assert.equal(catalogQuery({type:'tv',service:'netflix',network:'food',ids:[8]}).has('with_networks'),false);
});
test('upcoming Apple originals include movie and series metadata without requiring current availability',()=>{
 const film=catalogQuery({service:'apple',type:'movie',when:'soon',ids:[350]},'2026-09-28');
 const tv=catalogQuery({service:'apple',type:'tv',when:'soon',ids:[350]},'2026-09-28');
 assert.equal(film.get('with_companies'),'194232');assert.equal(tv.get('with_networks'),'2552');assert.equal(tv.has('with_watch_providers'),false);assert.equal(film.get('primary_release_date.gte'),'2026-09-29');
 assert.equal(catalogQuery({service:'starz',type:'movie',when:'soon',ids:[43]}).get('with_watch_providers'),'43');
 assert.equal(shiftedDate('2026-12-31',1),'2027-01-01');
});
test('new episode pills exclude future, stale, special and missing episodes',()=>{
 const label=episode=>contentLabels({last_episode_to_air:episode},'2026-09-28').some(x=>x.kind==='episode');
 assert(label({season_number:2,episode_number:3,air_date:'2026-09-27'}));
 for(const episode of [{season_number:2,episode_number:3,air_date:'2026-09-29'},{season_number:2,episode_number:3,air_date:'2026-09-01'},{season_number:0,episode_number:3,air_date:'2026-09-27'},{}])assert.equal(label(episode),false);
});
test('newest discovery excludes future titles and keeps pagination ordered by release date',()=>{
 assert.deepEqual(discoveryOrder('movie','2026-09-28'),{sort_by:'primary_release_date.desc','primary_release_date.lte':'2026-09-28'});
 assert.deepEqual(discoveryOrder('tv','2026-09-28'),{sort_by:'first_air_date.desc','first_air_date.lte':'2026-09-28'});
 assert.deepEqual([{...movie,id:1,date:''},{...movie,id:2,date:'2025-01-01'},{...movie,id:3,date:'2026-01-01'}].sort(newestFirst).map(x=>x.id),[3,2,1]);
});
test('content badges cover both API genre formats and only recently premiered returning seasons',()=>{
 assert.equal(contentLabels({genres:[{id:99}]}).some(x=>x.kind==='doc'),true);
 assert.equal(contentLabels({genre_ids:[99]}).some(x=>x.kind==='doc'),true);
 const seasons=[{season_number:0,air_date:'2026-09-27'},{season_number:1,air_date:'2026-09-27'},{season_number:2,air_date:'2026-07-01'},{season_number:3,air_date:'2026-10-01'}];
 assert.equal(contentLabels({seasons},'2026-09-28').length,0);
 assert.equal(contentLabels({seasons:[...seasons,{season_number:4,air_date:'2026-09-01'}]},'2026-09-28')[0].text,'NEW SEASON');
});
test('MGM+, Starz and Showtime use direct subscriptions without channel add-ons',()=>{
 const catalog=['MGM Plus','Starz','Showtime','MGM+ Amazon Channel','Starz Apple TV channel'].map((provider_name,provider_id)=>({provider_id,provider_name}));
 assert.deepEqual(providerIds(catalog,'mgm'),[0]);assert.deepEqual(providerIds(catalog,'starz'),[1]);assert.deepEqual(providerIds(catalog,'paramount'),[2]);
});
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
