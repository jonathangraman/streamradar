import {emptyLibrary,keyOf,normalize} from './core.js';

const fields=['watchlisted','seen','rating','dismissed'];
const savedItem=item=>({id:item.id,type:item.type,title:String(item.title||'Untitled').slice(0,500),poster:item.poster||'',date:item.date||'',original_language:item.original_language||'',genre_ids:item.genre_ids||item.genres?.map(g=>g.id)||[],vote_average:item.vote_average||0});
export function libraryRecords(library){
  const records=new Map();
  for(const item of [...library.watchlist,...library.seen]){
    const key=keyOf(item);
    records.set(key,{media_type:item.type,tmdb_id:item.id,item:savedItem(item),state:{watchlisted:library.watchlist.some(x=>keyOf(x)===key),seen:library.seen.some(x=>keyOf(x)===key),rating:library.ratings[key]||null,dismissed:(library.dismissed||[]).includes(key)}});
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
    const old=previous.get(key),record=next.get(key)||{...old,state:{watchlisted:false,seen:false,rating:null,dismissed:false}};
    const state={};
    for(const field of fields)if((old?.state[field]??(field==='rating'?null:false))!==record.state[field])state[field]=record.state[field];
    if(Object.keys(state).length)changes[key]={media_type:record.media_type,tmdb_id:record.tmdb_id,item:record.item||old?.item||null,state};
  }
  return changes;
}
export function recordsToLibrary(rows,pending={},local=emptyLibrary()){
  const records=new Map(rows.map(r=>[r.media_type+':'+r.tmdb_id,r]));
  for(const [key,patch] of Object.entries(pending)){
    const old=records.get(key);
    records.set(key,{...old,...patch,item:patch.item||old?.item,state:{...old?.state,...patch.state}});
  }
  const library={...emptyLibrary(),recs:local.recs||[],recommendationSeed:local.recommendationSeed||null};
  for(const [key,row] of records){
    const item=row.item?normalize(row.item,row.media_type):null,state=row.state||{};
    if(item&&state.watchlisted)library.watchlist.push(item);
    if(item&&state.seen)library.seen.push(item);
    if(Number.isInteger(state.rating)&&state.rating>=1&&state.rating<=5)library.ratings[key]=state.rating;
    if(state.dismissed)library.dismissed.push(key);
  }
  library.recs=library.recs.filter(x=>!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.dismissed.includes(keyOf(x)));
  return library;
}
// Import adds missing titles and fills missing ratings. Existing account choices win.
export function mergeGuestLibrary(account,guest){
  const merge=(a,b)=>[...new Map([...b,...a].map(x=>[keyOf(x),x])).values()];
  const seen=merge(account.seen,guest.seen);
  return {...account,seen,watchlist:merge(account.watchlist,guest.watchlist).filter(x=>!seen.some(s=>keyOf(s)===keyOf(x))),ratings:{...guest.ratings,...account.ratings},dismissed:[...new Set([...(account.dismissed||[]),...(guest.dismissed||[])])],recs:[]};
}

export class CloudLibrary {
  constructor({client,storage,onChange,onStatus}){Object.assign(this,{client,storage,onChange,onStatus});this.user=null;this.epoch=0;this.pending={};this.library=emptyLibrary();this.running=null;this.ready=false;}
  key(){return 'sr_account_v1_'+this.user.id;}
  persist(library=this.library,pending=this.pending){this.storage.setItem(this.key(),JSON.stringify({library,pending}));}
  async select(user){
    this.epoch++;this.user=user;this.running=null;this.ready=false;this.pending={};this.library=emptyLibrary();
    if(!user)return;
    try{const cached=JSON.parse(this.storage.getItem(this.key())||'null');if(cached){this.library=cached.library;this.pending=cached.pending||{};}}catch{this.onStatus('Could not read this account’s offline copy. Retry sync before editing.');return;}
    this.ready=true;this.onChange(this.library);await this.sync();
  }
  save(next){
    if(!this.ready)throw new Error('Your account is still loading. Please retry.');
    const changes=libraryChanges(this.library,next),pending=structuredClone(this.pending);
    for(const [key,patch] of Object.entries(changes))pending[key]={...pending[key],...patch,state:{...pending[key]?.state,...patch.state}};
    this.persist(next,pending);this.library=next;this.pending=pending;this.onStatus(Object.keys(pending).length?'Saved on this device · syncing…':'Synced to your private account');
    void this.sync();
  }
  sync(){
    if(!this.user||!this.ready)return Promise.resolve();
    if(this.running)return this.running;
    const epoch=this.epoch,user=this.user.id;
    const task=this.runSync(epoch,user).catch(()=>{if(this.epoch===epoch)this.onStatus('Saved on this device · cloud unavailable. Changes will retry when connected.');}).finally(()=>{if(this.epoch===epoch)this.running=null;});
    this.running=task;return task;
  }
  async runSync(epoch,user){
    this.onStatus('Syncing your private library…');
    while(Object.keys(this.pending).length){
      const sent=Object.fromEntries(Object.entries(this.pending).slice(0,100));
      const {error}=await this.client.rpc('sync_library_entries',{changes:Object.values(sent).map(patch=>({...patch,expected_user:user}))});
      if(this.epoch!==epoch)return;
      if(error)throw error;
      const pending={...this.pending};
      for(const [key,patch] of Object.entries(sent))if(JSON.stringify(pending[key])===JSON.stringify(patch))delete pending[key];
      this.persist(this.library,pending);this.pending=pending;
    }
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await this.client.from('library_entries').select('media_type,tmdb_id,item,state').eq('user_id',user).order('media_type').order('tmdb_id').range(offset,offset+999);
      if(this.epoch!==epoch)return;
      if(error)throw error;
      rows.push(...data);if(data.length<1000)break;
    }
    if(this.epoch!==epoch)return;
    const next=recordsToLibrary(rows,this.pending,this.library);this.persist(next);this.library=next;this.onChange(next);
    if(Object.keys(this.pending).length)return this.runSync(epoch,user);
    this.onStatus('Synced to your private account');
  }
}
