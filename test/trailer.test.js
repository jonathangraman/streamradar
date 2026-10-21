import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import handler from '../api/trailer.js';

const trailer={site:'YouTube',type:'Trailer',official:true,iso_639_1:'en',iso_3166_1:'US',name:'Official Trailer',key:'abcdefghijk',published_at:'2026-01-01'};
const request={method:'GET',url:'/api/trailer?type=movie&id=161&title=Ocean%27s+Eleven&year=2001'};
function response(){return {headers:{},status(code){this.code=code;return this;},setHeader(key,value){this.headers[key]=value;},json(value){this.body=value;return this;},end(){return this;}};}
async function lookup(fetcher,req=request){
 const original=global.fetch,token=process.env.TMDB_READ_TOKEN;
 process.env.TMDB_READ_TOKEN='test';global.fetch=fetcher;
 try{const res=response();await handler(req,res);return res;}finally{global.fetch=original;if(token===undefined)delete process.env.TMDB_READ_TOKEN;else process.env.TMDB_READ_TOKEN=token;}
}
test('trailer link is a lazy new-tab lookup and keeps the details button separate',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const functions=source.slice(source.indexOf('function trailerLink('),source.indexOf('async function loadCatalog('));
 const context=vm.createContext({URLSearchParams,remember:x=>x,keyOf:()=> 'movie:161',poster:()=>'',posterTags:()=>'',tags:()=>'',library:{watchlist:[]},esc:x=>String(x).replaceAll('&','&amp;'),when:'now',service:'all',today:()=> '2026-01-01',formatDate:x=>x});
 vm.runInContext(functions,context);
 const html=context.card({id:161,type:'movie',title:"Ocean's Eleven",date:'2001-12-07'});
 assert.match(html,/<\/button><a class="card-trailer"/);
 assert.match(html,/href="\/api\/trailer\?type=movie&amp;id=161/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});
test('movie and series links open official English YouTube trailers and cache successful redirects',async()=>{
 for(const type of ['movie','tv']){
  let target;
  const res=await lookup(async url=>{target=new URL(url);return {ok:true,json:async()=>({results:[{...trailer,official:false,key:'notOfficial'},trailer]})};},{...request,url:request.url.replace('type=movie','type='+type)});
  assert.equal(target.pathname,`/3/${type}/161/videos`);assert.equal(target.searchParams.get('language'),'en-US');
  assert.equal(res.code,307);assert.equal(res.headers.Location,'https://www.youtube.com/watch?v=abcdefghijk');assert.match(res.headers['Cache-Control'],/s-maxage=86400/);
 }
});
test('full official trailers outrank teasers and newer full trailers win ties',async()=>{
 const res=await lookup(async()=>({ok:true,json:async()=>({results:[{...trailer,key:'teaser12345',name:'Teaser Trailer',published_at:'2027-01-01'},trailer,{...trailer,key:'newest12345',published_at:'2026-02-01'}]})}));
 assert.equal(res.headers.Location,'https://www.youtube.com/watch?v=newest12345');
});
test('missing or unsuitable trailers fall back to a title-and-year search',async()=>{
 const res=await lookup(async()=>({ok:true,json:async()=>({results:[{...trailer,type:'Clip'},{...trailer,official:false},{...trailer,iso_639_1:'fr'},{...trailer,site:'Vimeo'},{...trailer,key:'evil?url=x'}]})}));
 const destination=new URL(res.headers.Location);
 assert.equal(destination.pathname,'/results');assert.equal(destination.searchParams.get('search_query'),"Ocean's Eleven 2001 official trailer");
});
test('API failures fall back to search without caching the failure',async()=>{
 for(const fetcher of [async()=>({ok:false,status:429}),async()=>{throw new Error('Timed out');}]){
  const res=await lookup(fetcher);assert.equal(res.code,307);assert.equal(new URL(res.headers.Location).pathname,'/results');assert.equal(res.headers['Cache-Control'],'no-store');
 }
});
test('invalid trailer inputs and non-GET requests never reach TMDB',async()=>{
 const never=()=>{throw new Error('Unexpected fetch');};
 for(const url of ['/api/trailer?type=person&id=161&title=Test','/api/trailer?type=movie&id=0&title=Test','/api/trailer?type=movie&id=161','/api/trailer?type=tv&id=161&title=Test&year=bad']){
  const res=await lookup(never,{method:'GET',url});assert.equal(res.code,400);assert.equal(res.headers.Location,undefined);
 }
 assert.equal((await lookup(never,{...request,method:'POST'})).code,405);
});
