import test from 'node:test';
import assert from 'node:assert/strict';
import tmdb from '../api/tmdb.js';
import ratings from '../api/ratings.js';
function response(){return {headers:{},status(n){this.code=n;return this;},json(d){this.body=d;return this;},setHeader(k,v){this.headers[k]=v;}};}
test('movie-category exclusions reach TMDB rather than filtering only the first page',async()=>{
 const original=global.fetch;process.env.TMDB_READ_TOKEN='test';let target;
 global.fetch=async url=>{target=new URL(url);return {ok:true,json:async()=>({results:[]})};};
 try{await tmdb({method:'GET',url:'/api/tmdb?path=/discover/movie&without_genres=99&without_keywords=9716'},response());assert.equal(target.searchParams.get('without_genres'),'99');assert.equal(target.searchParams.get('without_keywords'),'9716');}finally{global.fetch=original;}
});
test('English-only applies to discovery, search, recommendations and actor credits',async()=>{
 const original=global.fetch;process.env.TMDB_READ_TOKEN='test';let target;
 const titles=[{id:1,original_language:'en'},{id:2,original_language:'fr'},{id:3,title:'English translated name'}];
 global.fetch=async url=>{target=new URL(url);return {ok:true,json:async()=>({results:titles,cast:titles})};};
 try{for(const path of ['/discover/movie','/discover/tv','/search/movie','/search/tv','/movie/161/recommendations','/movie/161/similar','/tv/161/similar','/person/1461/combined_credits']){
   const r=response();await tmdb({method:'GET',url:'/api/tmdb?path='+path+'&with_original_language=fr'},r);assert.equal(r.code,200);
   assert.deepEqual((path.endsWith('/combined_credits')?r.body.cast:r.body.results).map(x=>x.id),[1]);
   if(path.startsWith('/discover/'))assert.equal(target.searchParams.get('with_original_language'),'en');
 }}finally{global.fetch=original;}
});
test('catalog proxy rejects arbitrary URLs, invalid pages and writes',async()=>{
 for(const url of ['/api/tmdb?path=https://evil.test','/api/tmdb?path=/account','/api/tmdb?path=/search/movie&page=-1']){const r=response();process.env.TMDB_READ_TOKEN='test';await tmdb({method:'GET',url},r);assert.equal(r.code,400);}
 const r=response();await tmdb({method:'POST',url:'/api/tmdb?path=/search/movie'},r);assert.equal(r.code,405);
});
test('missing credentials report service unavailable without leaking a key',async()=>{const old=process.env.TMDB_READ_TOKEN;delete process.env.TMDB_READ_TOKEN;const r=response();await tmdb({method:'GET',url:'/api/tmdb?path=/search/movie'},r);assert.equal(r.code,503);if(old)process.env.TMDB_READ_TOKEN=old;});
test('proxy forwards only allowlisted filters and enforces safe append',async()=>{
 const original=global.fetch;process.env.TMDB_READ_TOKEN='test';let target;
 global.fetch=async url=>{target=new URL(url);return {ok:true,json:async()=>({results:[]})};};
 try{const r=response();await tmdb({method:'GET',url:'/api/tmdb?path=/movie/161&append_to_response=account&api_key=evil'},r);assert.equal(r.code,200);assert.equal(target.hostname,'api.themoviedb.org');assert.equal(target.searchParams.get('api_key'),null);assert.equal(target.searchParams.get('append_to_response'),'credits,keywords');assert.equal(target.searchParams.get('include_adult'),'false');}finally{global.fetch=original;}
});
test('upstream failure is never returned as an empty successful catalog',async()=>{const original=global.fetch;global.fetch=async()=>({ok:false,status:429});try{const r=response();await tmdb({method:'GET',url:'/api/tmdb?path=/search/movie'},r);assert.equal(r.code,429);}finally{global.fetch=original;}});
test('ratings reject broken IDs and omit unused provider fields',async()=>{
 let r=response();await ratings({method:'GET',url:'/api/ratings?id=rec_0&type=movie'},r);assert.equal(r.code,400);
 const original=global.fetch;process.env.MDBLIST_API_KEY='test';global.fetch=async()=>({ok:true,json:async()=>({ratings:[{source:'imdb',value:7},{source:'unrelated',value:99}],private:'omit'})});
 try{r=response();await ratings({method:'GET',url:'/api/ratings?id=161&type=movie'},r);assert.equal(r.code,200);assert.equal(r.body.ratings.length,1);assert.equal(r.body.private,undefined);}finally{global.fetch=original;}
});
