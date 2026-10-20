import test from 'node:test';
import assert from 'node:assert/strict';
import {generateText} from 'ai';
import {createClaudeModel} from '../lib/claude-provider.js';
const success=()=>Response.json({id:'msg_test',type:'message',role:'assistant',model:'claude-haiku-5-5',content:[{type:'text',text:'Ready'}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:10,output_tokens:2}});
const missing=()=>Response.json({type:'error',error:{type:'invalid_request_error',message:'API key is not scoped to a workspace. Request must include anthropic-workspace-id header.'}},{status:400});
test('identity key discovers only Default workspace and retries the rejected request once',async()=>{
 const calls=[];
 const model=createClaudeModel('claude-haiku-5-5',{apiKey:'test-key',fetchImpl:async(url,options)=>{
  calls.push({url:String(url),options});
  if(calls.length===1)return missing();
  if(calls.length===2)return Response.json({data:[{id:'wrkspc_other',name:'Other'},{id:'wrkspc_default',name:'Default',archived_at:null}]});
  assert.equal(new Headers(options.headers).get('anthropic-workspace-id'),'wrkspc_default');return success();
 }});
 assert.equal((await generateText({model,prompt:'Ready?',maxRetries:0})).text,'Ready');
 assert.equal(calls.length,3);assert(calls[1].url.includes('include_default=true'));assert.equal(calls[2].options.body,calls[0].options.body);
});
test('scoped keys need no discovery; explicit workspace is sent directly',async()=>{
 let count=0;const model=createClaudeModel('claude-haiku-5-5',{apiKey:'test-key',workspaceId:'wrkspc_explicit',fetchImpl:async(url,options)=>{count++;assert.equal(new Headers(options.headers).get('anthropic-workspace-id'),'wrkspc_explicit');return success();}});
 await generateText({model,prompt:'Ready?',maxRetries:0});assert.equal(count,1);
});
test('does not retry ambiguous failures or select a non-default workspace',async()=>{
 for(const mode of ['server','no-default','forbidden']){
  let count=0;const model=createClaudeModel('claude-haiku-5-5',{apiKey:'test-key',fetchImpl:async()=>{
   count++;if(count===1)return mode==='server'?Response.json({error:{message:'Server failed'}},{status:500}):missing();
   return mode==='forbidden'?new Response('',{status:403}):Response.json({data:[{id:'wrkspc_other',name:'Other'}]});
  }});
  await assert.rejects(generateText({model,prompt:'Ready?',maxRetries:0}));assert.equal(count,mode==='server'?1:2);
 }
});
