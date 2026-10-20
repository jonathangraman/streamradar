import {emptyLibrary,keyOf,normalize,cleanServices,cleanHistory} from './core.js';

const fields=['watchlisted','seen','rating','dismissed','preference'];
const savedItem=item=>({id:item.id,type:item.type,title:String(item.title||'Untitled').slice(0,500),poster:item.poster||'',date:item.date||'',original_language:item.original_language||'',genre_ids:item.genre_ids||item.genres?.map(g=>g.id)||[],vote_average:item.vote_average||0});
export function libraryRecords(library){
  const records=new Map();
  for(const item of [...library.watchlist,...library.seen,...(library.feedbackTitles||[])]){
    const key=keyOf(item);
    records.set(key,{media_type:item.type,tmdb_id:item.id,item:savedItem(item),state:{watchlisted:library.watchlist.some(x=>keyOf(x)===key),seen:library.seen.some(x=>keyOf(x)===key),rating:library.ratings[key]||null,dismissed:(library.dismissed||[]).includes(key),preference:library.feedback?.[key]||null}});
  }
  for(const key of new Set([...Object.keys(library.ratings),...(library.dismissed||[]),...Object.keys(library.feedback||{})])){
    if(records.has(key)||!/^(movie|tv):[1-9]\d*$/.test(key))continue;
    const [type,id]=key.split(':');
    records.set(key,{media_type:type,tmdb_id:Number(id),item:null,state:{watchlisted:false,seen:false,rating:library.ratings[key]||null,dismissed:(library.dismissed||[]).includes(key),preference:library.feedback?.[key]||null}});
  }
  return records;
}
export function libraryChanges(before,after){
  const previous=libraryRecords(before),next=libraryRecords(after),changes={};
  for(const key of new Set([...previous.keys(),...next.keys()])){
    const old=previous.get(key),record=next.get(key)||{...old,state:{watchlisted:false,seen:false,rating:null,dismissed:false,preference:null}};
    const state={};
    for(const field of fields)if((old?.state[field]??(['rating','preference'].includes(field)?null:false))!==record.state[field])state[field]=record.state[field];
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
  const library={...emptyLibrary(),recs:local.recs||[],recommendationSeed:local.recommendationSeed||null,services:cleanServices(local.services),history:cleanHistory(local.history)};
  for(const [key,row] of records){
    const item=row.item?normalize(row.item,row.media_type):null,state=row.state||{};
    if(item&&state.watchlisted)library.watchlist.push(item);
    if(item&&state.seen)library.seen.push(item);
    if(Number.isInteger(state.rating)&&state.rating>=1&&state.rating<=5)library.ratings[key]=state.rating;
    if(state.dismissed)library.dismissed.push(key);
    if(['more','less'].includes(state.preference)){library.feedback[key]=state.preference;if(item)library.feedbackTitles.push(item);}
  }
  library.recs=library.recs.filter(x=>!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.dismissed.includes(keyOf(x)));
  return library;
}
// Import adds missing titles and fills missing ratings. Existing account choices win.
export function mergeGuestLibrary(account,guest){
  const merge=(a,b)=>[...new Map([...b,...a].map(x=>[keyOf(x),x])).values()];
  const seen=merge(account.seen,guest.seen);
  return {...account,seen,watchlist:merge(account.watchlist,guest.watchlist).filter(x=>!seen.some(s=>keyOf(s)===keyOf(x))),ratings:{...guest.ratings,...account.ratings},dismissed:[...new Set([...(account.dismissed||[]),...(guest.dismissed||[])])],feedback:{...guest.feedback,...account.feedback},feedbackTitles:merge(account.feedbackTitles||[],guest.feedbackTitles||[]),recs:[]};
}

export class CloudLibrary {
  constructor({client,storage,onChange,onStatus}){Object.assign(this,{client,storage,onChange,onStatus});this.user=null;this.epoch=0;this.pending={};this.pendingExtras={};this.library=emptyLibrary();this.running=null;this.ready=false;}
  key(){return 'sr_account_v1_'+this.user.id;}
  persist(library=this.library,pending=this.pending,pendingExtras=this.pendingExtras){this.storage.setItem(this.key(),JSON.stringify({library,pending,pendingExtras}));}
  async select(user){
    this.epoch++;this.user=user;this.running=null;this.ready=false;this.pending={};this.pendingExtras={};this.library=emptyLibrary();
    if(!user)return;
    try{const cached=JSON.parse(this.storage.getItem(this.key())||'null');if(cached){this.library=cached.library;this.pending=cached.pending||{};this.pendingExtras=cached.pendingExtras||{};}}catch{this.onStatus('Could not read this account’s offline copy. Retry sync before editing.');return;}
    this.ready=true;this.onChange(this.library);await this.sync();
  }
  save(next){
    if(!this.ready)throw new Error('Your account is still loading. Please retry.');
    const changes=libraryChanges(this.library,next),pending=structuredClone(this.pending);
    for(const [key,patch] of Object.entries(changes))pending[key]={...pending[key],...patch,state:{...pending[key]?.state,...patch.state}};
    const extras=structuredClone(this.pendingExtras);
    if(JSON.stringify(next.services??null)!==JSON.stringify(this.library.services??null))extras.services=cleanServices(next.services)||[];
    for(const batch of cleanHistory(next.history))if(!(this.library.history||[]).some(x=>x.id===batch.id)){extras.batches??={};extras.batches[batch.id]=batch;}
    this.persist(next,pending,extras);this.library=next;this.pending=pending;this.pendingExtras=extras;this.onStatus(Object.keys(pending).length||Object.keys(extras).length?'Saved on this device · syncing…':'Synced to your private account');
    void this.sync();
  }
  sync(){
    if(!this.user||!this.ready)return Promise.resolve();
    if(this.running)return this.running;
    const epoch=this.epoch,user=this.user.id;
    const task=this.runSync(epoch,user).catch(()=>{if(this.epoch===epoch)this.onStatus('Saved on this device · cloud unavailable. Changes will retry when connected.');}).finally(()=>{if(this.epoch===epoch)this.running=null;});
    this.running=task;return task;
  }
  async deleteAccount(expectedUser,confirmation){
    if(confirmation!=='DELETE')throw new Error('Type DELETE to confirm.');
    if(!this.user||this.user.id!==expectedUser)throw new Error('Account changed. Please reopen Account.');
    const epoch=this.epoch;
    await this.sync();
    if(this.epoch!==epoch||this.user?.id!==expectedUser)throw new Error('Account changed. Please reopen Account.');
    const {error}=await this.client.rpc('delete_own_account',{expected_user:expectedUser,confirmation});
    if(error)throw error;
    try{this.storage.removeItem('sr_account_v1_'+expectedUser);}catch{/* Server deletion is complete even if this device cannot clear its cache. */}
    return expectedUser;
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
    while(Object.keys(this.pendingExtras).length){
      const sent={};if(this.pendingExtras.services!==undefined)sent.services=this.pendingExtras.services;
      const batches=Object.values(this.pendingExtras.batches||{}).slice(0,5);if(batches.length)sent.batches=batches;
      const {error}=await this.client.rpc('sync_account_extras',{expected_user:user,changes:sent});
      if(this.epoch!==epoch)return;if(error)throw error;
      const extras=structuredClone(this.pendingExtras);
      if(JSON.stringify(extras.services)===JSON.stringify(sent.services))delete extras.services;
      for(const batch of batches)delete extras.batches?.[batch.id];
      if(!Object.keys(extras.batches||{}).length)delete extras.batches;
      this.persist(this.library,this.pending,extras);this.pendingExtras=extras;
    }
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await this.client.from('library_entries').select('media_type,tmdb_id,item,state').eq('user_id',user).order('media_type').order('tmdb_id').range(offset,offset+999);
      if(this.epoch!==epoch)return;
      if(error)throw error;
      rows.push(...data);if(data.length<1000)break;
    }
    if(this.epoch!==epoch)return;
    const [preferences,history]=await Promise.all([
      this.client.from('account_preferences').select('services').eq('user_id',user).maybeSingle(),
      this.client.from('recommendation_history').select('batch').eq('user_id',user).order('created_at',{ascending:false}).limit(20)
    ]);
    if(this.epoch!==epoch)return;
    if(preferences.error||history.error)throw preferences.error||history.error;
    const next=recordsToLibrary(rows,this.pending,this.library);
    next.services=cleanServices(this.pendingExtras.services??preferences.data?.services);
    next.history=cleanHistory([...Object.values(this.pendingExtras.batches||{}),...(history.data||[]).map(row=>row.batch)]);this.persist(next);this.library=next;this.onChange(next);
    if(Object.keys(this.pending).length||Object.keys(this.pendingExtras).length)return this.runSync(epoch,user);
    this.onStatus('Synced to your private account');
  }
}
