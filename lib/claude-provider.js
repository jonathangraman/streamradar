import {createAnthropic} from '@ai-sdk/anthropic';

// Identity-linked keys need a workspace header. Scoped keys work without it.
// Only retry an explicit pre-generation 400 for a missing workspace: never
// retry a completed/ambiguous inference or choose an arbitrary workspace.
export function createClaudeModel(id,{apiKey=process.env.ANTHROPIC_API_KEY?.trim(),workspaceId=process.env.ANTHROPIC_WORKSPACE_ID?.trim(),fetchImpl=fetch}={}){
 const headers=workspaceId?{'anthropic-workspace-id':workspaceId}:{};
 return createAnthropic({baseURL:'https://api.anthropic.com/v1',apiKey,headers,fetch:async(url,options)=>{
  const response=await fetchImpl(url,options);
  if(response.status!==400||workspaceId||!String(url).endsWith('/messages'))return response;
  const error=await response.clone().json().catch(()=>null);
  const message=String(error?.error?.message||'').toLowerCase();
  if(!message.includes('workspace')||!message.includes('header'))return response;
  const listed=await fetchImpl('https://api.anthropic.com/v1/organizations/workspaces?include_default=true&limit=1000',{headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(8000)});
  if(!listed.ok)return response;
  const data=await listed.json();
  const defaults=(data.data||[]).filter(w=>w.name==='Default'&&!w.archived_at&&/^wrkspc_[a-zA-Z0-9]+$/.test(w.id));
  if(defaults.length!==1)return response;
  const retryHeaders=new Headers(options?.headers);retryHeaders.set('anthropic-workspace-id',defaults[0].id);
  return fetchImpl(url,{...options,headers:retryHeaders});
 }})(id);
}
