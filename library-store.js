// Immutable operation records prevent a stale tab from erasing another tab's
// unsynced edits. Snapshots are caches; operations are the durable write queue.
let serial=0;
export function operationPrefix(scope){return 'sr_ops_v1_'+scope+'_';}
export function readOperations(storage,scope){
 const prefix=operationPrefix(scope),out=[];
 for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;const op=JSON.parse(storage.getItem(key));if(op?.patches)out.push({...op,storageKey:key});}
 return out.sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
}
export function appendOperation(storage,scope,patches,extra={}){
 const existing=readOperations(storage,scope),time=Math.max(Date.now(),...existing.map(x=>x.time+1));
 const id=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+(++serial)+'-'+Math.random().toString(36).slice(2);
 const op={id,time,patches,extra};storage.setItem(operationPrefix(scope)+id,JSON.stringify(op));return op;
}
export function mergePatches(...sets){
 const out={};for(const set of sets)for(const [key,patch] of Object.entries(set||{}))out[key]={...out[key],...patch,item:patch.item||out[key]?.item,state:{...out[key]?.state,...patch.state}};return out;
}
export function queuedPatches(storage,scope){return mergePatches(...readOperations(storage,scope).map(x=>x.patches));}
export function operationExtras(ops,base){return ops.reduce((out,op)=>({...out,...op.extra}),base);}
export function acknowledgeOperations(storage,ops){for(const op of ops)storage.removeItem(op.storageKey);}
const locks=new Map();
export async function withSyncLock(name,fn){
 if(globalThis.navigator?.locks)return navigator.locks.request('streamradar:'+name,fn);
 const prior=locks.get(name)||Promise.resolve(),task=prior.catch(()=>{}).then(fn);locks.set(name,task);try{return await task;}finally{if(locks.get(name)===task)locks.delete(name);}
}
