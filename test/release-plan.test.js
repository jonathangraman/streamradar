import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReleasePlan,movieWindowEvents,formatDigitalQuote,digitalReleaseDates} from '../release-plan.js';
import handler,{selectStoreMovie,storeQuote} from '../api/digital-prices.js';
const now='2026-10-29';
const film={id:1,type:'movie',title:'Test Film',release_date:'2026-10-01',runtime:120,production_companies:[{name:'Universal Pictures'}],release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:'2026-10-01'},{type:4,release_date:'2026-11-10',note:'PVOD'},{type:4,release_date:'2026-12-20',note:'Peacock'}]}]}};
test('movie journey separates US theatrical, paid digital and service-named subscription stages',()=>{
 const plan=buildReleasePlan(film,now);assert.equal(plan.theaterDate,'2026-10-01');assert.deepEqual(plan.digitalDates,['2026-11-10']);assert.equal(plan.streaming[0].service,'peacock');assert.equal(plan.streaming[0].date,'2026-12-20');assert.equal(plan.expected,null);
 assert.deepEqual(movieWindowEvents(film,now).map(e=>[e.kind,e.date]),[['digital','2026-11-10']]);
 assert.deepEqual(digitalReleaseDates({...film,release_dates:{results:[{iso_3166_1:'FR',release_dates:[{type:4,release_date:'2026-11-10'}]}]}}),[]);
});
test('studio-based destinations never invent dates, expire, or override a named service',()=>{
 const unnamed={...film,release_dates:{results:[]}};
 const plan=buildReleasePlan(unnamed,now);assert.equal(plan.expected.service,'peacock');assert.equal(plan.streaming.length,0);assert.equal(plan.expected.date,undefined);
 assert.equal(buildReleasePlan(unnamed,'2027-02-01').expected,null);
 assert.equal(buildReleasePlan({...unnamed,production_companies:[{name:'Universal Pictures'},{name:'Columbia Pictures'}]},now).expected,null);
 assert.equal(buildReleasePlan({...unnamed,production_companies:[{name:'Independent Films'}]},now).status,'unannounced');
 const netflix={...film,release_dates:{results:[{iso_3166_1:'US',release_dates:[{type:4,release_date:'2026-11-10',note:'Netflix'}]}]}};assert.equal(buildReleasePlan(netflix,now).streaming[0].service,'netflix');assert.equal(buildReleasePlan(netflix,now).expected,null);
});
const store={kind:'feature-movie',currency:'USD',trackName:'Test Film',releaseDate:'2026-10-01',trackTimeMillis:120*60000,trackViewUrl:'https://tv.apple.com/us/movie/test-film/umc.test',trackRentalPrice:19.99,trackHdRentalPrice:19.99,trackPrice:24.99,trackHdPrice:24.99};
test('store lookup disambiguates title/year/runtime and only accepts a US Apple destination',()=>{
 assert.equal(selectStoreMovie(film,[store]),store);
 for(const patch of [{trackName:'Different Film'},{releaseDate:'1990-01-01'},{currency:'EUR'},{kind:'song'},{trackTimeMillis:60*60000},{trackViewUrl:'https://tv.apple.com.evil.test/us/movie/test'},{trackViewUrl:'https://tv.apple.com/gb/movie/test'}])assert.equal(selectStoreMovie(film,[{...store,...patch}]),null);
 assert.equal(selectStoreMovie(film,[store,{...store}]),null);
});
test('rental and purchase quotes stay separate; missing and invalid prices never become invented zero-dollar offers',()=>{
 const quote=storeQuote(film,store,'2026-10-29T12:00:00Z');assert.match(formatDigitalQuote(quote),/Rent from \$19.99/);assert.doesNotMatch(formatDigitalQuote(quote),/Buy from/);
 const buyOnly=storeQuote(film,{...store,trackRentalPrice:-1,trackHdRentalPrice:0});assert.equal(formatDigitalQuote(buyOnly),'Rental price unavailable');assert.equal(buyOnly.rent.length,0);
 assert.match(formatDigitalQuote({matched:false}),/not announced/);assert.match(formatDigitalQuote({matched:false,status:'unavailable'}),/unavailable/);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('price proxy accepts only read-only movie IDs, caches exact matches, and handles missing stores safely',async()=>{
 const original=global.fetch,token=process.env.TMDB_READ_TOKEN;process.env.TMDB_READ_TOKEN='test';
 try{
  let calls=0;global.fetch=async url=>{calls++;const u=new URL(url);return {ok:true,json:async()=>u.hostname==='api.themoviedb.org'?film:{results:[store]}};};
  const r=response();await handler({method:'GET',url:'/api/digital-prices?id=1'},r);assert.equal(r.code,200);assert.equal(r.body.rent[0].amount,19.99);assert.match(r.headers['Cache-Control'],/3600/);assert.equal(calls,2);
  for(const req of [{method:'POST',url:'/api/digital-prices?id=1'},{method:'GET',url:'/api/digital-prices?id=https://evil.test'}]){const r=response();await handler(req,r);assert([400,405].includes(r.code));}assert.equal(calls,2);
  global.fetch=async url=>({ok:true,json:async()=>String(url).includes('themoviedb')?film:{results:[]}});const missing=response();await handler({method:'GET',url:'/api/digital-prices?id=1'},missing);assert.equal(missing.code,200);assert.equal(missing.body.matched,false);
 }finally{global.fetch=original;if(token===undefined)delete process.env.TMDB_READ_TOKEN;else process.env.TMDB_READ_TOKEN=token;}
});
