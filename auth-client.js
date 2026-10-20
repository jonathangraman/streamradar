import {createClient} from './vendor/supabase.js';
export const recoveryRequested=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
export const callbackError=new URLSearchParams(location.hash.slice(1)).get('error_description');
export const client=createClient('https://gdfuisnznbzwhskhxlcp.supabase.co','sb_publishable_JOffiFiaR-YxRFDE3BNpgQ_MG0wN6P2',{
  auth:{storageKey:'sr_auth_v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}
});
// Consume confirmation/recovery tokens before the app replaces its route fragment.
export const initialSession=await client.auth.getSession().then(({data})=>data.session).catch(()=>null);
