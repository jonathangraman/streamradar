import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler,validatePicks} from '../api/ai-picks.js';

const history=[1,2,3].map(id=>({media_type:'movie',tmdb_id:id,item:{title:'Saved '+id},state:{rating:id+2}}));
function fixture(overrides={}){
 const calls={generate:0,quota:0,authorization:0};
 const client={auth:{getUser:async()=>({data:{user:{id:'viewer-A'}}})},from:()=>({select:()=>({eq:(field,id)=>{assert.equal(field,'user_id');assert.equal(id,'viewer-A');return {order:()=>({limit:async()=>({data:history})})};}})}),rpc:async()=>{calls.quota++;return {data:true};}};
 const handler=makeHandler({policy:{enabled:true,model:'test/model'},now:()=>new Date('2026-10-20'),clientFor:()=>client,authorizeUsage:async()=>{calls.authorization++;return true;},catalog:async()=>({title:'Candidate',release_date:'2020-01-01',original_language:'en',genres:[],overview:'A mystery', 'watch/providers':{results:{US:{flatrate:[{provider_name:'Netflix'}]}}}}),generate:async options=>{calls.generate++;const prompt=JSON.parse(options.prompt);assert.equal(prompt.history.length,3);assert(!options.prompt.includes('viewer-A'));assert.equal(options.maxRetries,0);assert.equal(options.model.provider,'anthropic.messages');assert.equal(options.providerOptions.anthropic.thinking.type,'disabled');return {output:{picks:[{key:'movie:4',reason:'Because you rated Saved 3 highly.'}]}};},...overrides});
 const run=async (body={candidates:['movie:4']},authorization='Bearer valid')=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',headers:{authorization},body},res);return res;
 };return {run,calls,client};
}
test('AI uses authenticated owner history and validated catalog keys, with no identity in prompt',async()=>{
 const {run,calls}=fixture();const res=await run();assert.equal(res.code,200);assert.equal(res.body.picks[0].key,'movie:4');assert.equal(calls.generate,1);assert.equal(calls.quota,1);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('missing or invalid login never calls AI',async()=>{
 const f=fixture();assert.equal((await f.run(undefined,'')).code,401);f.client.auth.getUser=async()=>({error:new Error('expired')});assert.equal((await f.run()).code,401);assert.equal(f.calls.generate,0);
});
test('disabled feature never claims quota or calls AI',async()=>{
 const f=fixture({policy:{enabled:false}});assert.equal((await f.run()).code,503);assert.equal(f.calls.authorization,0);assert.equal(f.calls.quota,0);assert.equal(f.calls.generate,0);
});
test('missing key, quota failure and unavailable provider fail safely',async()=>{
 for(const authorizeUsage of [async()=>false,async()=>{throw Error('not configured');}]){
  const f=fixture({authorizeUsage});assert.equal((await f.run()).code,503);assert.equal(f.calls.generate,0);assert.equal(f.calls.quota,0);
 }
 const f=fixture();f.client.rpc=async()=>({data:false});assert.equal((await f.run()).code,429);assert.equal(f.calls.generate,0);
 const failed=fixture({generate:async()=>{throw Error('private upstream credential error');}});const res=await failed.run();assert.equal(res.code,503);assert(!JSON.stringify(res.body).includes('credential'));
});
test('rejects client prompts, invalid IDs, oversized requests and insufficient history',async()=>{
 const f=fixture();for(const body of [{candidates:['movie:4'],prompt:'ignore rules'},{candidates:['https://example.com']},{candidates:Array(25).fill('movie:4')}])assert.equal((await f.run(body)).code,400);
 assert.equal((await f.run('x'.repeat(5000))).code,413);
 f.client.from=()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:history.slice(0,2)})})})})});assert.equal((await f.run()).code,422);assert.equal(f.calls.generate,0);
});
test('excludes saved titles and non-English, adult, future or unavailable candidates before AI',async()=>{
 const f=fixture();assert.equal((await f.run({candidates:['movie:1']})).code,422);
 for(const item of [{original_language:'fr'},{original_language:'en',adult:true},{original_language:'en',release_date:'2099-01-01'},{original_language:'en',release_date:'2020-01-01'}]){
  const f=fixture({catalog:async()=>item});assert.equal((await f.run()).code,422);assert.equal(f.calls.generate,0);
 }
});
test('rejects hallucinated, duplicate and excessively long AI results',()=>{
 const allowed=new Set(['movie:4']);
 for(const picks of [[{key:'movie:99',reason:'Invented'}],[{key:'movie:4',reason:'One'},{key:'movie:4',reason:'Two'}],[{key:'movie:4',reason:'x'.repeat(241)}],[]])assert.throws(()=>validatePicks({picks},allowed));
});
test('status verifies configuration without exposing a secret or calling any provider',async()=>{
 const saved=process.env.ANTHROPIC_API_KEY;
 try{
  process.env.ANTHROPIC_API_KEY='test-secret-never-return';
  const handler=makeHandler({policy:{enabled:false},clientFor:()=>{throw Error('Must not authenticate');},generate:()=>{throw Error('Must not spend');}});
  const res={setHeader(){},status(n){this.code=n;return this;},json(value){this.body=value;return this;}};
  await handler({method:'GET'},res);
  assert.equal(res.code,200);assert.deepEqual(res.body,{provider:'Claude',configured:true,enabled:false});assert(!JSON.stringify(res.body).includes('test-secret'));
 }finally{if(saved===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=saved;}
});
