import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,updateLibrary,setEpisodeProgress,hasNewEpisodes,unseenTitles,filterWatchlist,resolvedEvent,movieStreamingEvents,futureMovieQuery,matchesPick,mergeRemembered,releaseMilestone,calendarEvent} from '../core.js';
const now='2026-10-29',show={id:1,type:'tv',title:'A series',original_language:'en',date:'2020-01-01',last_episode_to_air:{season_number:1,episode_number:2,air_date:'2020-01-02'}};
test('seen followed series resurfaces for an unwatched episode and hides when caught up',()=>{
 let library=updateLibrary(emptyLibrary(),'seen',show);
 library=setEpisodeProgress(library,show,[{season_number:1,episode_number:1,air_date:'2020-01-01'}]);assert(hasNewEpisodes(show,library));assert.equal(unseenTitles([show],library).length,1);
 library=setEpisodeProgress(library,show,[{season_number:1,episode_number:2,air_date:'2020-01-02'}]);assert(!hasNewEpisodes(show,library));assert.equal(unseenTitles([show],library).length,0);
 assert.throws(()=>setEpisodeProgress(library,show,[{season_number:1,episode_number:3,air_date:'2099-01-01'}]),/not aired/);
});
test('watchlist search, type, service, new-episode and rating filters compose',()=>{
 const movie={id:2,type:'movie',title:'A film',subscriptionServices:['netflix'],addedAt:'2026-01-01'},series={...show,subscriptionServices:['paramount'],addedAt:'2026-02-01'};
 const library=setEpisodeProgress(emptyLibrary(),series,[]);library.ratings={'movie:2':5,'tv:1':2};
 assert.deepEqual(filterWatchlist([movie,series],library,{query:'film',type:'movie',service:'netflix'}).map(x=>x.id),[2]);
 assert.deepEqual(filterWatchlist([movie,series],library,{status:'new'}).map(x=>x.id),[1]);
 assert.deepEqual(filterWatchlist([movie,series],library,{sort:'rating'}).map(x=>x.id),[2,1]);
 assert.deepEqual(filterWatchlist([movie,series],library).map(x=>x.id),[1,2]);
});
test('calendar resolves returning-season and US theater dates ahead of old original release',()=>{
 assert.equal(resolvedEvent({...show,upcomingDate:'2026-11-15',upcomingSeason:2},now).date,'2026-11-15');
 assert.equal(resolvedEvent({type:'movie',date:'2025-01-01',theaterDate:'2026-11-01'},now).date,'2026-11-01');
 const item={id:3,type:'movie',date:'2025-01-01',calendarEvent:{date:'2026-11-12',kind:'streaming',label:'Streaming premiere',service:'paramount',source:'Official announcement'}};
 assert.equal(resolvedEvent(item,now).date,'2026-11-12');const ics=calendarEvent(item,'2026-11-12',item.calendarEvent);assert(ics.includes('DTSTART;VALUE=DATE:20261112'));assert(ics.includes('Official announcement'));
});
test('upcoming streaming calendar accepts named subscription windows after theatrical release, excluding rentals and foreign-region dates',()=>{
 const item={id:999,type:'movie',date:'2025-01-01',release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:4,release_date:'2026-11-12',note:'Paramount+'},{type:4,release_date:'2026-11-13',note:'Apple TV Store'},{type:4,release_date:'2026-11-14',note:'Prime Video rental'}]},{iso_3166_1:'FR',release_dates:[{type:4,release_date:'2026-11-14',note:'Netflix'}]}]}};
 assert.deepEqual(movieStreamingEvents(item,'all',now).map(x=>[x.date,x.service]),[['2026-11-12','paramount']]);
 const q=futureMovieQuery({service:'paramount',genre:'horror'},now);assert(!q.has('primary_release_date.gte'));assert(!q.has('with_watch_providers'));assert.equal(q.get('with_genres'),'27');
});
test('fantasy movie matches recommendations and previous-provider arrival dates are not inherited',()=>{
 assert(matchesPick({type:'movie',genre_ids:[14]},'movie','878'));
 const merged=mergeRemembered({id:3,type:'movie',catalogService:'netflix'},{id:3,type:'movie',streamingDate:'2026-10-12',catalogService:'paramount'});assert.equal(merged.streamingDate,undefined);
});
test('licensed series cannot show a batch-release milestone for an unverified service season',()=>{
 const item={...show,catalogService:'netflix',networks:[{id:6}],seasons:[{season_number:1,episode_count:2}],releaseSeasonEpisodes:[{episode_number:1,air_date:now},{episode_number:2,air_date:now}]};assert.equal(releaseMilestone(item,now),null);
});
