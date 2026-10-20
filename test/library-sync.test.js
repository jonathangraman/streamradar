import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,updateLibrary,recommendationSeeds,tasteProfile,rankRecommendations} from '../core.js';
import {CloudLibrary,libraryChanges,recordsToLibrary,mergeGuestLibrary} from '../library-sync.js';
const film=(id,type='movie',genre=18)=>({id,type,title:'Title '+id,date:'2020-01-01',genre_ids:[genre],original_language:'en'});
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
function fakeClient(){
 const db=new Map();let owner='a',offline=false;
 return {db,setOwner:x=>owner=x,setOffline:x=>offline=x,
  async rpc(name,{changes}){if(offline)return {error:new Error('offline')};for(const row of changes){const key=owner+':'+row.media_type+':'+row.tmdb_id,old=db.get(key);db.set(key,{...row,user_id:owner,state:{...old?.state,...row.state}});}return {error:null};},
  from(){return {select(){return this;},eq(k,v){this.owner=v;return this;},order(){return this;},async range(){return offline?{error:new Error('offline')}:{data:[...db.values()].filter(x=>x.user_id===this.owner),error:null};}};}
 };
}
test('sync patches preserve removals, rating identity, dismissals and unrelated fields',()=>{
 const start=updateLibrary(emptyLibrary(),'watch',film(1));
 const next=updateLibrary(start,'rate',film(1),5),patch=libraryChanges(start,next)['movie:1'];
 assert.deepEqual(patch.state,{watchlisted:false,seen:true,rating:5});
 const remote=[{media_type:'movie',tmdb_id:1,item:film(1),state:{watchlisted:true,dismissed:true}}];
 const result=recordsToLibrary(remote,{'movie:1':patch});assert.equal(result.watchlist.length,0);assert.equal(result.ratings['movie:1'],5);assert.deepEqual(result.dismissed,['movie:1']);
 const removed=updateLibrary(next,'remove-seen',film(1));assert.equal(libraryChanges(next,removed)['movie:1'].state.seen,false);
});
test('explicit guest import keeps account ratings and original guest data',()=>{
 const guest=updateLibrary(emptyLibrary(),'rate',film(1),2),account=updateLibrary(emptyLibrary(),'rate',film(1),5);
 guest.watchlist.push(film(1,'tv'));const result=mergeGuestLibrary(account,guest);
 assert.equal(result.ratings['movie:1'],5);assert.equal(result.watchlist[0].type,'tv');assert.equal(guest.ratings['movie:1'],2);
});
test('offline changes survive reload, sync on retry, and never replace another title',async()=>{
 const client=fakeClient(),disk=storage();const cloud=new CloudLibrary({client,storage:disk,onChange:()=>{},onStatus:()=>{}});
 await cloud.select({id:'a'});client.setOffline(true);cloud.save(updateLibrary(cloud.library,'watch',film(1)));await cloud.sync();assert.equal(Object.keys(cloud.pending).length,1);
 const reloaded=new CloudLibrary({client,storage:disk,onChange:()=>{},onStatus:()=>{}});await reloaded.select({id:'a'});assert.equal(reloaded.library.watchlist.length,1);
 client.setOffline(false);client.db.set('a:movie:2',{user_id:'a',media_type:'movie',tmdb_id:2,item:film(2),state:{seen:true,rating:4}});await reloaded.sync();
 assert.equal(Object.keys(reloaded.pending).length,0);assert.equal(reloaded.library.watchlist[0].id,1);assert.equal(reloaded.library.ratings['movie:2'],4);
});
test('switching accounts isolates caches and ignores an old account sync response',async()=>{
 const client=fakeClient(),disk=storage(),seen=[];const cloud=new CloudLibrary({client,storage:disk,onChange:x=>seen.push(x),onStatus:()=>{}});
 await cloud.select({id:'a'});cloud.save(updateLibrary(cloud.library,'watch',film(1)));await cloud.sync();
 client.setOwner('b');await cloud.select({id:'b'});assert.equal(cloud.library.watchlist.length,0);
 let resolve;client.rpc=()=>new Promise(r=>{resolve=r;});cloud.save(updateLibrary(cloud.library,'watch',film(2)));await cloud.select(null);resolve({error:null});await new Promise(r=>setTimeout(r));assert.equal(cloud.user,null);assert(!seen.at(-1).watchlist.some(x=>x.id===1));
});
test('quota failure leaves the in-memory library and pending queue unchanged',async()=>{
 const cloud=new CloudLibrary({client:fakeClient(),storage:storage(),onChange:()=>{},onStatus:()=>{}});await cloud.select({id:'a'});cloud.storage.setItem=()=>{throw Error('quota');};
 assert.throws(()=>cloud.save(updateLibrary(cloud.library,'watch',film(1))),/quota/);assert.equal(cloud.library.watchlist.length,0);assert.deepEqual(cloud.pending,{});
});
test('ratings outweigh watchlist interest and dislikes lower matching genres',()=>{
 const library=emptyLibrary();library.seen=[film(1),film(2,'movie',27),film(4)];library.watchlist=[film(3,'tv')];library.ratings={'movie:1':5,'movie:2':1,'movie:4':4};
 const seeds=recommendationSeeds(library);assert.deepEqual(seeds.map(x=>x.id),[1,4,3]);assert(seeds[0].seedWeight>seeds[1].seedWeight);assert(seeds[1].seedWeight>seeds[2].seedWeight);
 assert.equal(recommendationSeeds(library,'tv').length,1);const ranked=rankRecommendations([film(10,'movie',27),film(11)],[],new Set(),tasteProfile(library));assert.equal(ranked[0].id,11);
});
