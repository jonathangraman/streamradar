import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,updateLibrary,recommendationSeeds,tasteProfile,rankRecommendations} from '../core.js';
import {CloudLibrary,libraryChanges,recordsToLibrary,mergeGuestLibrary} from '../library-sync.js';
const film=(id,type='movie',genre=18)=>({id,type,title:'Title '+id,date:'2020-01-01',genre_ids:[genre],original_language:'en'});
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function fakeClient(){
 const db=new Map(),preferences=new Map(),history=new Map();let owner='a',offline=false;
 return {db,preferences,history,setOwner:x=>owner=x,setOffline:x=>offline=x,
  async rpc(name,args){
   if(offline)return {error:new Error('offline')};
   if(name==='sync_account_extras'){
    if(args.expected_user!==owner)return {error:new Error('Account changed')};
    if(args.changes.services!==undefined)preferences.set(owner,{services:args.changes.services});
    for(const batch of args.changes.batches||[])history.set(owner+':'+batch.id,{user_id:owner,batch});return {error:null};
   }
   if(name==='delete_own_account'){if(args.expected_user!==owner||args.confirmation!=='DELETE')return {error:new Error('denied')};preferences.delete(owner);for(const [key,row] of history)if(row.user_id===owner)history.delete(key);for(const [key,row] of db)if(row.user_id===owner)db.delete(key);return {error:null};}
   for(const row of args.changes){const key=owner+':'+row.media_type+':'+row.tmdb_id,old=db.get(key);db.set(key,{...row,user_id:owner,state:{...old?.state,...row.state}});}return {error:null};
  },
  from(table){return {select(){return this;},eq(k,v){this.owner=v;return this;},order(){return this;},async maybeSingle(){return offline?{error:new Error('offline')}:{data:preferences.get(this.owner)||null,error:null};},async limit(){return offline?{error:new Error('offline')}:{data:[...history.values()].filter(x=>x.user_id===this.owner),error:null};},async range(){return offline?{error:new Error('offline')}:{data:[...db.values()].filter(x=>x.user_id===this.owner),error:null};}};}
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
test('more/less feedback syncs independently of watched state and ratings, with a reversible clear',async()=>{
 const client=fakeClient(),cloud=new CloudLibrary({client,storage:storage(),onChange:()=>{},onStatus:()=>{}});await cloud.select({id:'a'});
 cloud.save(updateLibrary(cloud.library,'more',film(90)));await cloud.sync();
 assert.equal(cloud.library.feedback['movie:90'],'more');assert.equal(cloud.library.seen.length,0);assert.equal(cloud.library.watchlist.length,0);assert.deepEqual(cloud.library.ratings,{});
 assert.equal(recommendationSeeds(cloud.library)[0].id,90);assert(tasteProfile(cloud.library)['movie:18']>0);
 cloud.save(updateLibrary(cloud.library,'less',film(90)));await cloud.sync();assert(tasteProfile(cloud.library)['movie:18']<0);
 cloud.save(updateLibrary(cloud.library,'less',film(90)));await cloud.sync();assert.equal(cloud.library.feedback['movie:90'],undefined);assert.equal(client.db.get('a:movie:90').state.preference,null);
});
test('service choices and history survive offline reload, reach another device and stay account-scoped',async()=>{
 const client=fakeClient(),disk=storage(),cloud=new CloudLibrary({client,storage:disk,onChange:()=>{},onStatus:()=>{}});await cloud.select({id:'a'});client.setOffline(true);
 const batch={id:'10000000-0000-4000-8000-000000000001',createdAt:'2026-10-20T20:00:00Z',model:'Claude',picks:[film(1)]};
 cloud.save({...cloud.library,services:['netflix','max'],history:[batch]});await cloud.sync();assert.equal(Object.keys(cloud.pendingExtras).length,2);
 const reload=new CloudLibrary({client,storage:disk,onChange:()=>{},onStatus:()=>{}});await reload.select({id:'a'});assert.deepEqual(reload.library.services,['netflix','max']);
 client.setOffline(false);await reload.sync();assert.deepEqual(reload.pendingExtras,{});
 const other=new CloudLibrary({client,storage:storage(),onChange:()=>{},onStatus:()=>{}});await other.select({id:'a'});assert.deepEqual(other.library.services,['netflix','max']);assert.equal(other.library.history[0].id,batch.id);
 client.setOwner('b');await other.select({id:'b'});assert.equal(other.library.services,null);assert.deepEqual(other.library.history,[]);
});
test('account deletion requires typed confirmation and current identity, clears only its local cache',async()=>{
 const client=fakeClient(),disk=storage(),cloud=new CloudLibrary({client,storage:disk,onChange:()=>{},onStatus:()=>{}});await cloud.select({id:'a'});
 cloud.save(updateLibrary(cloud.library,'watch',film(1)));await cloud.sync();disk.setItem('sr_library_v2','guest');disk.setItem('sr_account_v1_b','other account');
 await assert.rejects(cloud.deleteAccount('a','delete'),/Type DELETE/);await assert.rejects(cloud.deleteAccount('b','DELETE'),/Account changed/);assert(disk.getItem('sr_account_v1_a'));
 assert.equal(await cloud.deleteAccount('a','DELETE'),'a');assert.equal(disk.getItem('sr_account_v1_a'),undefined);assert.equal(disk.getItem('sr_account_v1_b'),'other account');assert.equal(disk.getItem('sr_library_v2'),'guest');
});
test('a service edit made during sync survives the older response',async()=>{
 const client=fakeClient(),cloud=new CloudLibrary({client,storage:storage(),onChange:()=>{},onStatus:()=>{}});await cloud.select({id:'a'});
 const original=client.rpc.bind(client);let release,held=false;
 client.rpc=async(name,args)=>{const result=await original(name,args);if(name==='sync_account_extras'&&!held){held=true;await new Promise(resolve=>release=resolve);}return result;};
 cloud.save({...cloud.library,services:['netflix']});await new Promise(resolve=>setTimeout(resolve));
 cloud.save({...cloud.library,services:['max']});release();await cloud.sync();
 assert.deepEqual(client.preferences.get('a').services,['max']);assert.deepEqual(cloud.library.services,['max']);assert.deepEqual(cloud.pendingExtras,{});
});
