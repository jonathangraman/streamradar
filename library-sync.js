import {emptyLibrary,keyOf,normalize,validRating} from './core.js';
import {readOperations,appendOperation,mergePatches,queuedPatches,operationExtras,acknowledgeOperations,withSyncLock} from './library-store.js';

const fields=['watchlisted','seen','rating','dismissed','tracking'];
const savedItem=item=>({id:item.id,type:item.type,title:String(item.title||'Untitled').slice(0,500),poster:item.poster||'',date:item.date||'',original_language:item.original_language||'',genre_ids:item.genre_ids||item.genres?.map(g=>g.id)||[],vote_average:item.vote_average||0,addedAt:item.addedAt||'',seenAt:item.seenAt||''});
export function libraryRecords(library){
  const records=new Map();
  for(const item of [...library.watchlist,...library.seen,...Object.values(library.progress||{}).map(p=>p.item).filter(Boolean)]){
    const key=keyOf(item);
    records.set(key,{media_type:item.type,tmdb_id:item.id,item:savedItem({...records.get(key)?.item,...item,addedAt:records.get(key)?.item?.addedAt||item.addedAt,seenAt:item.seenAt||records.get(key)?.item?.seenAt}),state:{watchlisted:library.watchlist.some(x=>keyOf(x)===key),seen:library.seen.some(x=>keyOf(x)===key),rating:library.ratings[key]||null,dismissed:(library.dismissed||[]).includes(key),tracking:library.progress?.[key]?.tracking===true,...Object.fromEntries(Object.entries(library.progress?.[key]?.episodes||{}).map(([ep,value])=>['ep_'+ep.replace(':','_'),value]))}});
  }
  for(const key of new Set([...Object.keys(library.ratings),...(library.dismissed||[])])){
    if(records.has(key)||!/^(movie|tv):[1-9]\d*$/.test(key))continue;
    const [type,id]=key.split(':');
    records.set(key,{media_type:type,tmdb_id:Number(id),item:null,state:{watchlisted:false,seen:false,rating:library.ratings[key]||null,dismissed:(library.dismissed||[]).includes(key)}});
  }
  return records;
}
export function libraryChanges(before,after){
  const previous=libraryRecords(before),next=libraryRecords(after),changes={};
  for(const key of new Set([...previous.keys(),...next.keys()])){
    const old=previous.get(key),record=next.get(key)||{...old,state:{watchlisted:false,seen:false,rating:null,dismissed:false,tracking:false}};
    const state={};
    for(const field of new Set([...fields,...Object.keys(old?.state||{}),...Object.keys(record.state)])){const value=record.state[field]??(field==='rating'?null:false);if((old?.state[field]??(field==='rating'?null:false))!==value)state[field]=value;}
    if(Object.keys(state).length||record.item&&JSON.stringify(record.item)!==JSON.stringify(old?.item))changes[key]={media_type:record.media_type,tmdb_id:record.tmdb_id,item:record.item||old?.item||null,state};
  }
  return changes;
}
export function recordsToLibrary(rows,pending={},local=emptyLibrary()){
  const records=new Map(rows.map(r=>[r.media_type+':'+r.tmdb_id,r]));
  for(const [key,patch] of Object.entries(pending)){
    const old=records.get(key);
    records.set(key,{...old,...patch,item:patch.item||old?.item,state:{...old?.state,...patch.state}});
  }
  const library={...emptyLibrary(),recs:local.recs||[],recommendationSeed:local.recommendationSeed||null,legacyImported:!!local.legacyImported};
  for(const [key,row] of records){
    const item=row.item?normalize(row.item,row.media_type):null,state=row.state||{};
    if(item&&state.watchlisted)library.watchlist.push(item);
    if(item&&state.seen)library.seen.push(item);
    if(validRating(state.rating))library.ratings[key]=state.rating;
    if(state.dismissed)library.dismissed.push(key);
    if(item&&row.media_type==='tv'&&(state.tracking||Object.keys(state).some(k=>k.startsWith('ep_'))))library.progress[key]={item,tracking:state.tracking===true,episodes:Object.fromEntries(Object.entries(state).filter(([k])=>/^ep_[1-9]\d*_[1-9]\d*$/.test(k)).map(([k,v])=>[k.slice(3).replace('_',':'),v===true]))};
  }
  library.recs=library.recs.filter(x=>!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.dismissed.includes(keyOf(x)));
  return library;
}
// Import adds missing titles and fills missing ratings. Existing account choices win.
export function mergeGuestLibrary(account,guest){
  const merge=(a,b)=>[...new Map([...b,...a].map(x=>[keyOf(x),x])).values()];
  const seen=merge(account.seen,guest.seen);
  return {...account,seen,watchlist:merge(account.watchlist,guest.watchlist).filter(x=>!seen.some(s=>keyOf(s)===keyOf(x))),ratings:{...guest.ratings,...account.ratings},dismissed:[...new Set([...(account.dismissed||[]),...(guest.dismissed||[])])],progress:{...guest.progress,...account.progress},recs:[]};
}

const extraChanges=(before,after)=>Object.fromEntries(Object.entries(extras(after)).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(extras(before)[key])));
const extras=library=>({recs:library.recs||[],recommendationSeed:library.recommendationSeed||null,legacyImported:!!library.legacyImported});
export function readGuestLibrary(storage,fallback=emptyLibrary()){
 const raw=storage.getItem('sr_guest_base_v1'),base=raw?JSON.parse(raw):fallback,ops=readOperations(storage,'guest');
 return recordsToLibrary([...libraryRecords(base).values()],mergePatches(...ops.map(x=>x.patches)),operationExtras(ops,{...base,...extras(base)}));
}
export function commitGuestLibrary(storage,before,next){
 if(!storage.getItem('sr_guest_base_v1'))storage.setItem('sr_guest_base_v1',JSON.stringify(JSON.parse(storage.getItem('sr_library_v2')||'null')||before));
 appendOperation(storage,'guest',libraryChanges(before,next),extraChanges(before,next));
 const merged=readGuestLibrary(storage,before);try{storage.setItem('sr_library_v2',JSON.stringify(merged));}catch{/* The immutable operation is already durable. */}return merged;
}
export class CloudLibrary {
 constructor({client,storage,onChange,onStatus}){Object.assign(this,{client,storage,onChange,onStatus});this.user=null;this.epoch=0;this.pending={};this.library=emptyLibrary();this.running=null;this.ready=false;}
 key(){return 'sr_account_v1_'+this.user.id;}
 scope(){return 'account_'+this.user.id;}
 persist(library=this.library){this.storage.setItem(this.key(),JSON.stringify({library,pending:{}}));}
 reconcile(notify=true){
  if(!this.user||!this.ready)return;
  const cached=JSON.parse(this.storage.getItem(this.key())||'null'),ops=readOperations(this.storage,this.scope());
  this.pending=mergePatches(...ops.map(x=>x.patches));
  this.library=recordsToLibrary([...libraryRecords(cached?.library||this.library).values()],this.pending,operationExtras(ops,cached?.library||this.library));
  if(notify)this.onChange(this.library);
 }
 async select(user){
  this.epoch++;this.user=user;this.running=null;this.ready=false;this.pending={};this.library=emptyLibrary();
  if(!user)return;
  try{const cached=JSON.parse(this.storage.getItem(this.key())||'null');if(cached){this.library=cached.library;if(Object.keys(cached.pending||{}).length){appendOperation(this.storage,this.scope(),cached.pending);this.persist();}}this.ready=true;this.reconcile(false);}catch{this.ready=false;this.onStatus('Could not read this account’s offline copy. Retry sync before editing.');return;}
  this.onChange(this.library);await this.sync();
 }
 save(next){
  if(!this.ready)throw new Error('Your account is still loading. Please retry.');
  const changes=libraryChanges(this.library,next);appendOperation(this.storage,this.scope(),changes,extraChanges(this.library,next));
  this.reconcile(false);try{this.persist();}catch{/* Pending operations remain durable. */}
  this.onStatus(Object.keys(this.pending).length?'Saved on this device · syncing…':'Synced to your private account');void this.sync();return this.library;
 }
 sync(){
  if(!this.user||!this.ready)return Promise.resolve();if(this.running)return this.running;
  const epoch=this.epoch,user=this.user.id;
  const task=withSyncLock('sync:'+user,()=>this.runSync(epoch,user)).catch(()=>{if(this.epoch===epoch)this.onStatus('Saved on this device · cloud unavailable. Changes will retry when connected.');}).finally(()=>{if(this.epoch===epoch)this.running=null;});this.running=task;return task;
 }
 async runSync(epoch,user){
  if(this.epoch!==epoch)return;this.onStatus('Syncing your private library…');
  const sentOps=readOperations(this.storage,this.scope()),pending=mergePatches(...sentOps.map(x=>x.patches)),changes=Object.values(pending);
  for(let i=0;i<changes.length;i+=100){const {error}=await this.client.rpc('sync_library_entries',{changes:changes.slice(i,i+100).map(patch=>({...patch,expected_user:user}))});if(this.epoch!==epoch)return;if(error)throw error;}
  const rows=[];
  for(let offset=0;;offset+=1000){const {data,error}=await this.client.from('library_entries').select('media_type,tmdb_id,item,state').eq('user_id',user).order('media_type').order('tmdb_id').range(offset,offset+999);if(this.epoch!==epoch)return;if(error)throw error;rows.push(...data);if(data.length<1000)break;}
  if(this.epoch!==epoch)return;
  const allOps=readOperations(this.storage,this.scope()),sentIds=new Set(sentOps.map(x=>x.id)),remaining=allOps.filter(x=>!sentIds.has(x.id));
  const next=recordsToLibrary(rows,mergePatches(...remaining.map(x=>x.patches)),operationExtras(allOps,this.library));
  this.persist(next);acknowledgeOperations(this.storage,sentOps);this.library=next;this.pending=mergePatches(...remaining.map(x=>x.patches));this.onChange(next);
  if(remaining.length)return this.runSync(epoch,user);this.onStatus('Synced to your private account');
 }
}
