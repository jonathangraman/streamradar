import test from 'node:test';
import assert from 'node:assert/strict';
import {streamingArrival,streamingArrivalQuery,isOriginalMovie,isEnglish,activityDate,normalize,withVerifiedUSOffers} from '../core.js';
const now='2026-10-29';
const movie={type:'movie',id:1246049,original_language:'fr',release_date:'2025-07-30',release_dates:{results:[{iso_3166_1:'US',release_dates:[
 {type:3,release_date:'2026-02-06T00:00:00Z',note:''},
 {type:4,release_date:'2026-03-10T00:00:00Z',note:''},
 {type:4,release_date:'2026-10-12T00:00:00Z',note:'Paramount+'}
]}]}};
test('Dracula qualifies as a recent Paramount arrival, retains original date and sorts by streaming date',()=>{
 assert.equal(isOriginalMovie(movie,'paramount'),false);
 assert.equal(streamingArrival(movie,'paramount',now),'2026-10-12');
 assert.equal(streamingArrival(movie,'all',now),'2026-10-12');
 assert.equal(streamingArrival(movie,'netflix',now),null);
 const normalized=normalize({...movie,streamingDate:streamingArrival(movie,'paramount',now)},'movie');
 assert.equal(normalized.date,'2025-07-30');assert.equal(activityDate(normalized,now),'2026-10-12');
 assert(isEnglish(normalized));assert(!isEnglish({...movie,type:'tv'}));assert(!isEnglish({...movie,id:123}));
 assert.equal(withVerifiedUSOffers(movie,{},now).flatrate[0].provider_id,2616);
 assert.equal(streamingArrival({...movie,release_dates:{}},'paramount',now),'2026-10-12');
 assert.equal(withVerifiedUSOffers(movie,{},'2026-11-29').flatrate.length,0);
});
test('arrival evidence rejects rentals, other services/regions, unknown notes and out-of-window dates',()=>{
 const candidate=(date,note='Paramount+',type=4,region='US')=>({...movie,id:999,release_dates:{results:[{iso_3166_1:region,release_dates:[{type,release_date:date+'T00:00:00Z',note}]}]}});
 assert.equal(streamingArrival(candidate('2026-10-12'),'paramount',now),'2026-10-12');
 for(const item of [candidate('2026-10-30'),candidate('2026-07-30'),candidate('2026-10-12',''),candidate('2026-10-12','Paramount+ rental'),candidate('2026-10-12','Netflix'),candidate('2026-10-12','Paramount+',3),candidate('2026-10-12','Paramount+',4,'FR')])assert.equal(streamingArrival(item,'paramount',now),null);
 assert.equal(streamingArrival(candidate('2026-07-31'),'paramount',now),'2026-07-31');
});
test('supplemental discovery uses US digital dates and current subscription providers, preserving filters/page',()=>{
 const q=streamingArrivalQuery({service:'paramount',ids:[2616,2303],kind:'movie',genre:'horror',page:3},now);
 assert.equal(q.get('region'),'US');assert.equal(q.get('watch_region'),'US');assert.equal(q.get('with_release_type'),'4');
 assert.equal(q.get('release_date.gte'),'2026-07-31');assert.equal(q.get('release_date.lte'),now);
 assert.equal(q.has('primary_release_date.lte'),false);assert.equal(q.get('with_watch_providers'),'2616|2303');
 assert.equal(q.get('with_watch_monetization_types'),'flatrate');assert.equal(q.get('page'),'3');assert.equal(q.get('with_genres'),'27');
});

test('Prime and Apple arrivals require subscription names rather than their rental stores',()=>{
 const item=note=>({...movie,id:999,release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:4,release_date:'2026-10-12',note}]}]}});
 assert.equal(streamingArrival(item('Amazon Video'),'prime',now),null);
 assert.equal(streamingArrival(item('Apple TV Store'),'apple',now),null);
 assert.equal(streamingArrival(item('Amazon Prime Video'),'prime',now),'2026-10-12');
 assert.equal(streamingArrival(item('Apple TV+'),'apple',now),'2026-10-12');
});
