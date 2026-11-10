import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,updateLibrary,setEpisodeProgress,hasNewEpisodes,unseenTitles,filterWatchlist,resolvedEvent,movieStreamingEvents,futureMovieQuery,matchesPick,mergeRemembered,releaseMilestone,seasonDropDate,calendarEvent} from '../core.js';
const now='2026-10-29',show={id:1,type:'tv',title:'A series',original_language:'en',date:'2020-01-01',last_episode_to_air:{season_number:1,episode_number:2,air_date:'2020-01-02'}};

test('full season drops require every numbered episode to share a known date',()=>{
 const episodes=[1,2,3].map(episode_number=>({episode_number,air_date:now}));
 assert.equal(seasonDropDate(3,episodes),now);
 assert.equal(seasonDropDate(3,[...episodes,{episode_number:0,air_date:'2026-10-28'}]),now);
 assert.equal(seasonDropDate(3,episodes.slice(0,2)),null);
 assert.equal(seasonDropDate(3,[...episodes.slice(0,2),{episode_number:4,air_date:now}]),null);
 assert.equal(seasonDropDate(3,[...episodes.slice(0,2),{episode_number:3,air_date:'2026-11-05'}]),null);
 assert.equal(seasonDropDate(3,[...episodes.slice(0,2),{episode_number:3,air_date:null}]),null);
 assert.equal(seasonDropDate(1,episodes.slice(0,1)),null);
});
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

test('calendar discovery hides syndicated broadcast and talk series unless explicitly saved',async()=>{
 const {eligibleCalendarSeries}=await import('../core.js');
 const soap={type:'tv',first_air_date:'1965-11-08',networks:[{id:6},{id:3353}],genres:[{id:18}]};
 const talk={type:'tv',first_air_date:'2020-01-01',networks:[{id:213}],genres:[{id:10767}]};
 assert.equal(eligibleCalendarSeries(soap),false);assert.equal(eligibleCalendarSeries(talk),false);assert.equal(eligibleCalendarSeries(soap,true),true);assert.equal(eligibleCalendarSeries({...talk,genres:[{id:18}]}),true);
});

// Discovery may rank a confirmed release beyond the initially fetched pages.
test('Mosquito Bowl is seeded for upcoming Netflix but never offered before its streaming debut',async()=>{
 const {scheduledVerifiedReleases,activeVerifiedOffers}=await import('../core.js');
 const item={id:1458300,type:'movie'};
 assert(scheduledVerifiedReleases('2026-10-30').some(x=>x.id===item.id&&x.service==='netflix'));
 assert(!activeVerifiedOffers('2026-10-30').some(x=>x.id===item.id));
 assert.deepEqual(movieStreamingEvents(item,'netflix','2026-10-30').map(x=>[x.date,x.service]),[['2026-11-25','netflix']]);
 assert.equal(movieStreamingEvents(item,'paramount','2026-10-30').length,0);
 assert(activeVerifiedOffers('2026-11-25').some(x=>x.id===item.id));
 assert(!scheduledVerifiedReleases('2026-12-26').some(x=>x.id===item.id));
});

test('Paramount Showtime originals include Resurrection and its sourced US premiere without a batch-release claim',async()=>{
 const {matchesOriginalSeries,catalogQuery,correctUSSeriesRelease,activeVerifiedOffers,activityDate,contentLabels,releaseMilestone}=await import('../core.js');
 const raw={id:259909,type:'tv',date:'2025-07-13',networks:[{id:6631}],seasons:[{season_number:1,air_date:'2025-07-13',episode_count:10},{season_number:2,air_date:'2026-11-01',episode_count:10}],last_episode_to_air:{season_number:1,episode_number:10,air_date:'2025-09-07'},next_episode_to_air:{season_number:2,episode_number:1,air_date:'2026-11-01'}};
 assert(matchesOriginalSeries(raw,'paramount'));assert(!matchesOriginalSeries(raw,'prime'));assert(catalogQuery({service:'paramount',type:'tv'}).get('with_networks').split('|').includes('6631'));
 const corrected=correctUSSeriesRelease(raw,'/tv/259909','2026-10-30');assert.equal(corrected.seasons[1].air_date,'2026-10-30');assert.equal(corrected.last_episode_to_air.season_number,2);assert.equal(corrected.last_episode_to_air.episode_number,1);assert.equal(corrected.next_episode_to_air,null);assert.equal(activityDate(corrected,'2026-10-30'),'2026-10-30');assert(contentLabels(corrected,'2026-10-30').some(x=>x.text==='SEASON PREMIERE'));assert.equal(releaseMilestone(corrected,'2026-10-30'),null);
 const season={episodes:[{episode_number:1,air_date:'2026-11-01'},{episode_number:2,air_date:'2026-11-08'}]};const fixed=correctUSSeriesRelease(season,'/tv/259909/season/2','2026-10-30');assert.equal(fixed.episodes[0].air_date,'2026-10-30');assert.equal(fixed.episodes[1].air_date,'2026-11-08');assert.equal(season.episodes[0].air_date,'2026-11-01');
 assert.equal(correctUSSeriesRelease(raw,'/tv/259909','2026-12-01'),raw);assert.equal(correctUSSeriesRelease(raw,'/tv/1405','2026-10-30'),raw);assert(activeVerifiedOffers('2026-10-30').some(x=>x.id===259909));
});
