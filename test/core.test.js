import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {contentLabels,newestFirst,discoveryOrder} from '../core.js';
import {catalogQuery,shiftedDate,legacyTheater,activityDate,recentActivityFirst} from '../core.js';
import {matchesPick,pickKeyword} from '../core.js';
import {isEnglish} from '../core.js';
import {isNarrativeMovie} from '../core.js';
import {keyOf,parseRoute,normalize,escapeHTML,formatDate,isStandup,calendarEvent,emptyLibrary,migrateLegacy,updateLibrary,commitLibrary,createSequence,providerIds} from '../core.js';
const movie={id:161,type:'movie',title:"Ocean's Eleven",date:'2001-12-07'};
test('Movies excludes docs and stand-up while retaining ordinary comedy films',()=>{
 assert(isNarrativeMovie({...movie,genre_ids:[35]}));
 for(const item of [{...movie,genre_ids:[99]},{...movie,genre_ids:[],genres:[{id:99}]},{...movie,keywords:{keywords:[{id:9716}]}},{...movie,keywords:{keywords:[{name:'stand-up special'}]}},{...movie,title:'A Comedy Special'},{...movie,type:'tv'}])assert.equal(isNarrativeMovie(item),false);
 for(const service of ['all','netflix','theaters'])for(const when of ['now','soon']){
  const q=catalogQuery({service,when,kind:'movie'});assert.equal(q.get('without_genres'),'99');assert.equal(q.get('without_keywords'),'9716');
 }
 assert.equal(catalogQuery({kind:'all'}).has('without_genres'),false);assert.equal(catalogQuery({kind:'doc'}).get('with_genres'),'99');assert.equal(catalogQuery({kind:'standup'}).get('with_keywords'),'9716');
});
test('season badge includes day 90 but excludes day 91 and future season premieres',()=>{
 const now='2026-09-28',label=air_date=>contentLabels({seasons:[{season_number:2,air_date}]},now).some(x=>x.kind==='season');
 assert(label(shiftedDate(now,-90)));assert(!label(shiftedDate(now,-91)));assert(label(now));assert(!label(shiftedDate(now,1)));
});
test('weekly episodes produce a single dated pill, including scheduled episodes today',()=>{
 const item={last_episode_to_air:{season_number:2,episode_number:1,air_date:'2026-09-23'},next_episode_to_air:{season_number:2,episode_number:2,air_date:'2026-09-30'}};
 assert.deepEqual(contentLabels(item,'2026-09-28').map(x=>x.text),['NEXT EP · WED 9/30']);
 assert.deepEqual(contentLabels(item,'2026-09-30').map(x=>x.text),['NEXT EP · WED 9/30']);
 assert.deepEqual(contentLabels({...item,next_episode_to_air:null},'2026-09-28').map(x=>x.text),['NEW EP · AIRED WED 9/23']);
});
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
 const labels=contentLabels(returning,'2026-09-28');assert.equal(labels.filter(x=>['episode','next'].includes(x.kind)).length,1);assert(labels.some(x=>x.text==='NEXT EP · THU 10/1'));
});
test('theatrical browsing separates current wide releases from upcoming US releases',()=>{
 const now=catalogQuery({service:'theaters'},'2026-09-28'),soon=catalogQuery({service:'theaters',when:'soon'},'2026-09-28');
 assert.equal(now.get('region'),'US');assert.equal(now.get('with_release_type'),'3');assert.equal(now.get('release_date.lte'),'2026-09-28');assert.equal(now.has('watch_region'),false);assert.equal(now.get('sort_by'),'popularity.desc');
 assert.equal(soon.get('release_date.gte'),'2026-09-29');assert.equal(soon.get('release_date.lte'),'2026-12-27');assert.equal(soon.get('sort_by'),'popularity.desc');assert.equal(soon.get('primary_release_date.gte'),'2026-04-01');assert.equal(soon.get('with_original_language'),'en');
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
 const seasons=[{season_number:0,air_date:'2026-09-27'},{season_number:1,air_date:'2026-09-27'},{season_number:2,air_date:'2026-06-01'},{season_number:3,air_date:'2026-10-01'}];
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

import {isOriginalSeries,isOriginalMovie,originalsOnlyServices,originalNetworks} from '../core.js';
test('original series filter keeps service networks and excludes broadcast catalogs on every page',()=>{
 for(const service of originalsOnlyServices){
  for(const when of ['now','soon'])for(const page of [1,2]){
   const q=catalogQuery({service,type:'tv',when,page,ids:[9]});
   assert.equal(q.get('with_networks'),originalNetworks[service]);
   if(when==='now'){assert.equal(q.get('watch_region'),'US');assert.equal(q.get('with_watch_monetization_types'),'flatrate');}
  }
  assert(!isOriginalSeries({networks:[{id:2},{id:16}]},service)); // ABC/CBS
  assert(!isOriginalSeries({networks:[{id:16},{id:6}]},service)); // CBS/NBC
  assert(isOriginalSeries({networks:[{id:Number(originalNetworks[service].split('|')[0])}]},service));
  assert(!isOriginalSeries({},service));
 }
 assert(!isOriginalSeries({networks:[{id:3353},{id:6}],first_air_date:'1965-11-08'},'peacock'));
 assert(isOriginalSeries({networks:[{id:3353},{id:6}],first_air_date:'2023-01-12'},'peacock'));
 assert(!isOriginalSeries({networks:[{id:3353},{id:6}]},'peacock'));
 assert(!isOriginalSeries({networks:[{id:4330},{id:16}]},'paramount'));
 assert(isOriginalSeries({networks:[{id:67}]},'paramount')); // Keep requested Showtime originals
 assert(!catalogQuery({service:'all',type:'tv'}).has('with_networks'));
});
test('movie originals require first-release evidence, never provider availability alone',()=>{
 const release=(type,date,note='')=>({type,release_date:date+'T00:00:00.000Z',note});
 const item=(releases,homepage='')=>({homepage,release_dates:{results:[{iso_3166_1:'US',release_dates:releases}]}});
 assert(isOriginalMovie(item([release(1,'2026-09-01'),release(4,'2026-09-12','Prime Video')]),'prime'));
 assert(isOriginalMovie(item([release(4,'2026-09-12','Hulu')]),'disney'));
 assert(isOriginalMovie(item([release(4,'2026-09-12','internet')],'https://www.disneyplus.com/movies/togo/abc'),'disney'));
 assert(!isOriginalMovie(item([release(4,'2026-09-12','internet')],'https://www.disneyplus.com.evil.test/movie'),'disney'));
 assert(!isOriginalMovie(item([release(4,'2026-09-01','Netflix'),release(4,'2026-09-12','Prime Video')]),'prime'));
 assert(!isOriginalMovie(item([release(3,'2026-09-01'),release(4,'2026-09-12','Prime Video')]),'prime'));
 assert(!isOriginalMovie(item([release(6,'2026-09-01','ABC'),release(4,'2026-09-12','Hulu')]),'disney'));
 assert(!isOriginalMovie(item([release(4,'2026-09-12','')]),'prime'));
 assert(!isOriginalMovie({},'disney'));
 assert(isOriginalMovie(item([release(2,'2026-09-01'),release(4,'2026-09-12','Prime Video')]),'prime'));
 assert(!isOriginalMovie(item([release(2,'2026-01-01'),release(4,'2026-09-12','Prime Video')]),'prime'));
});

import {upcomingPremiere,upcomingSeasonQuery} from '../core.js';
test('MGM+ upcoming uses MGM+/Epix networks rather than existing subscription offers',()=>{
 const q=catalogQuery({service:'mgm',type:'tv',when:'soon',ids:[34]});
 assert.equal(q.get('with_networks'),'6219|922');assert(!q.has('with_watch_providers'));
});
test('upcoming season discovery retains network and pagination without requiring a new series',()=>{
 const q=upcomingSeasonQuery({service:'starz',page:2},'2026-09-28');
 assert.equal(q.get('with_networks'),'318');assert.equal(q.get('page'),'2');assert(!q.has('first_air_date.gte'));
 assert.equal(q.get('first_air_date.lte'),'2026-09-28');assert.equal(q.get('air_date.gte'),'2026-09-29');assert.equal(q.get('air_date.lte'),'2026-12-27');
 assert(!q.has('with_watch_providers'));assert.equal(q.get('with_original_language'),'en');
});
test('upcoming titles rank by a future season premiere, excluding ordinary episodes and undated seasons',()=>{
 const now='2026-09-28',item={first_air_date:'2020-07-12',seasons:[{season_number:3,air_date:'2026-12-04'}]};
 assert.deepEqual(upcomingPremiere(item,now),{date:'2026-12-04',season:3});
 assert.deepEqual(upcomingPremiere({first_air_date:'2026-10-11',seasons:[{season_number:1,air_date:'2026-10-10'}]},now),{date:'2026-10-11',season:1});
 assert.equal(upcomingPremiere({first_air_date:'2020-01-01',next_episode_to_air:{season_number:2,episode_number:3,air_date:'2026-10-02'}},now),null);
 for(const air_date of ['',now,'2026-12-28'])assert.equal(upcomingPremiere({first_air_date:'2020-01-01',seasons:[{season_number:2,air_date}]},now),null);
 assert.deepEqual(upcomingPremiere({...item,next_episode_to_air:{season_number:3,episode_number:1,air_date:'2026-12-05'}},now),{date:'2026-12-05',season:3});
});

import {unseenTitles,matchesPickControls,pickSubscriptionOffers} from '../core.js';
test('hide watched uses movie/series identity and can be turned off without changing the library',()=>{
 const titles=[{id:1,type:'movie'},{id:1,type:'tv'},{id:2,type:'movie'}],library={seen:[titles[0]]};
 assert.deepEqual(unseenTitles(titles,library),titles.slice(1));assert.deepEqual(unseenTitles(titles,library,false),titles);assert.equal(library.seen.length,1);
});
test('recommendation controls exclude unknown score/runtime and match TV episode duration and moods',()=>{
 const film={type:'movie',runtime:90,vote_average:7.5,vote_count:100,genre_ids:[35]};
 assert(matchesPickControls(film,{score:7,runtime:90,mood:'fun'}));
 assert(!matchesPickControls(film,{score:8}));assert(!matchesPickControls({...film,vote_count:2},{score:7}));
 assert(!matchesPickControls({...film,runtime:0},{runtime:120}));assert(!matchesPickControls(film,{mood:'tense'}));
 assert(matchesPickControls({type:'tv',episode_run_time:[45],genres:[{id:9648}]},{runtime:60,mood:'tense'}));
 assert(!matchesPickControls({type:'tv',runtime:30},{runtime:60}));
});
test('selected subscriptions exclude rental and channel add-on offers from recommendations',()=>{
 const offers={flatrate:[{provider_name:'Amazon Prime Video'},{provider_name:'Starz Amazon Channel'},{provider_name:'Starz'}],rent:[{provider_name:'Netflix'}]};
 assert.deepEqual(pickSubscriptionOffers(offers,['starz']).map(x=>x.provider_name),['Starz']);
 assert.deepEqual(pickSubscriptionOffers(offers,['prime','starz']).map(x=>x.provider_name),['Amazon Prime Video','Starz']);
 assert.equal(pickSubscriptionOffers(offers,['netflix']).length,0);assert.equal(pickSubscriptionOffers(null,['prime']).length,0);
});

import {matchesBrowseGenre,activeVerifiedOffers,withVerifiedUSOffers} from '../core.js';
test('browse genre filters map movie genres and TV keywords across current and future queries',()=>{
 for(const when of ['now','soon'])for(const page of [1,2]){
  assert.equal(catalogQuery({type:'movie',genre:'horror',when,page}).get('with_genres'),'27');
  const tv=catalogQuery({type:'tv',service:'prime',genre:'horror',when,page});assert.equal(tv.get('with_keywords'),'315058');assert.equal(tv.get('with_networks'),'1024');
 }
 assert.equal(upcomingSeasonQuery({service:'starz',genre:'comedy'}).get('with_genres'),'35');
 assert.equal(catalogQuery({type:'tv',genre:'action'}).get('with_genres'),'10759');
 assert.equal(catalogQuery({type:'movie',genre:'scifi'}).get('with_genres'),'878|14');
 assert.equal(catalogQuery({type:'tv',kind:'standup',genre:'horror'}).get('with_keywords'),'9716,315058');
 assert(matchesBrowseGenre({type:'tv',keywords:{results:[{id:315058}]}},'horror'));
 assert(!matchesBrowseGenre({type:'tv',genre_ids:[18]},'horror'));
 assert(matchesBrowseGenre({type:'movie',genre_ids:[14]},'scifi'));
});
test('verified US corrections are title-specific, dated and do not duplicate upstream offers',()=>{
 const item={type:'tv',id:288673},now='2026-10-08';
 assert.equal(activeVerifiedOffers('2026-10-06').length,0);assert.equal(activeVerifiedOffers('2026-11-08').length,0);
 assert.equal(withVerifiedUSOffers(item,{},now).flatrate[0].provider_name,'Amazon Prime Video');
 assert.equal(withVerifiedUSOffers({type:'movie',id:288673},{},now).flatrate.length,0);
 assert.equal(withVerifiedUSOffers(item,{flatrate:[{provider_id:9,provider_name:'Amazon Prime Video'}]},now).flatrate.length,1);
});
