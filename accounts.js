import {client,initialSession,recoveryRequested,callbackError,googleAvailable} from './auth-client.js';
import {CloudLibrary,mergeGuestLibrary} from './library-sync.js';
import {emptyLibrary,escapeHTML as esc} from './core.js';

export const accountState={user:null,cloud:null,epoch:0};
export function mountAccounts({readGuest,setLibrary,validateLibrary,toast}){
  const dialog=document.getElementById('account-dialog'),content=document.getElementById('account-content');
  let mode=recoveryRequested?'password':'signin',status='',busy=false,identity,googleEnabled=false;
  const message=text=>{const target=document.getElementById('account-message');if(target)target.textContent=text;};
  const render=()=>{
    document.querySelectorAll('[data-account-open]').forEach(b=>{b.textContent=accountState.user?'Account':b.dataset.accountOpen||'Sign in';});
    if(accountState.user&&mode!=='password'){
      const guest=readGuest(),count=new Set([...guest.watchlist,...guest.seen].map(x=>x.type+':'+x.id)).size;
      content.innerHTML=`<p class="account-email">${esc(accountState.user.email)}</p><p id="account-sync-status" role="status">${esc(status)}</p><div class="account-actions"><button class="btn-main" data-account-action="sync">Sync now</button><button class="text-button" data-account-action="signout">Sign out</button></div><section class="account-import"><h3>Browser saves</h3><p>${count?count+' titles saved here. ':''}${count||guest.dismissed.length?'Import only your own saves.':'No browser saves to import.'}</p><button class="text-button" data-account-action="import" ${!count&&!guest.dismissed.length?'disabled':''}>Import this browser’s saves</button></section><p id="account-message" role="status"></p>`;
    }else{
      const password=mode!=='reset';
      content.innerHTML=`<form id="account-form">${mode==='password'?'':'<label for="account-email">Email<input id="account-email" type="email" name="email" autocomplete="email" maxlength="254" required></label>'}${password?`<label for="account-password">${mode==='password'?'New password':'Password'}<input id="account-password" name="password" type="password" autocomplete="${mode==='signin'?'current-password':'new-password'}" ${mode==='signin'?'':'minlength="10"'} maxlength="128" required></label>`:''}<button class="btn-main" type="submit">${mode==='signup'?'Create private account':mode==='reset'?'Send reset link':mode==='password'?'Save new password':'Sign in'}</button></form><p id="account-message" role="status"></p><div class="account-actions">${mode==='signin'?'<button class="text-button" data-account-action="signup">Create an account</button><button class="text-button" data-account-action="reset">Forgot password?</button>':mode==='password'?'':'<button class="text-button" data-account-action="signin">Back to sign in</button>'}</div>`;
    }
    if(!accountState.user&&mode!=='password')content.insertAdjacentHTML('beforeend',`<button class="text-button account-google" data-account-action="google" ${googleEnabled?'':'hidden'}>Continue with Google</button>`);
  };
  const cloud=new CloudLibrary({client,storage:localStorage,onChange:next=>{
    try{setLibrary(validateLibrary(next));}catch{status='Could not read the cloud library. Your existing data has not been deleted.';render();}
  },onStatus:text=>{status=text;const el=document.getElementById('account-sync-status');if(el)el.textContent=text;}});
  accountState.cloud=cloud;
  async function select(session){
    const user=session?.user||null;
    if(identity===user?.id)return;
    identity=user?.id;accountState.epoch++;accountState.user=user;
    status=user?'Loading library…':'';
    setLibrary(emptyLibrary());render();
    if(user)await cloud.select(user);
    else{await cloud.select(null);setLibrary(readGuest());}
    render();
  }
  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-account-open]')){mode=recoveryRequested&&mode==='password'?'password':'signin';render();dialog.showModal();return;}
    if(event.target.closest('[data-account-close]')){dialog.close();return;}
    const action=event.target.closest('[data-account-action]')?.dataset.accountAction;
    if(!action||busy)return;
    if(['signin','signup','reset'].includes(action)){mode=action;render();return;}
    busy=true;
    try{
      if(action==='google'){
        const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',scopes:'openid email profile'}});if(error)throw error;
      }
      if(action==='sync'){await cloud.sync();message(status);}
      if(action==='import'){
        const next=mergeGuestLibrary(cloud.library,readGuest());cloud.save(next);setLibrary(next);await cloud.sync();message('Browser saves imported. '+status);
      }
      if(action==='signout'){
        await cloud.sync();const pending=Object.keys(cloud.pending).length;
        const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
        await select(null);dialog.close();toast(pending?'Signed out. Pending changes will resume when you sign back in.':'Signed out.');
      }
    }catch(error){message(error.message||'Please try again.');}finally{busy=false;}
  });
  dialog.addEventListener('submit',async event=>{
    if(event.target.id!=='account-form')return;event.preventDefault();if(busy)return;
    const form=new FormData(event.target),email=String(form.get('email')||'').trim().toLowerCase(),password=String(form.get('password')||'');
    busy=true;event.target.querySelector('button').disabled=true;message('Please wait…');
    try{
      if(mode==='reset'){
        const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});if(error)throw error;
        message('If an account exists, a password reset link will arrive by email.');
      }else if(mode==='password'){
        const {error}=await client.auth.updateUser({password});if(error)throw error;mode='signin';render();message('Password updated.');
      }else{
        const result=mode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/'}}):await client.auth.signInWithPassword({email,password});
        if(result.error)throw result.error;
        if(result.data.session){await select(result.data.session);render();message('Signed in.');}
        else message('Check your email to confirm your account, then sign in.');
      }
    }catch(error){message(error.message||'Could not sign in. Please try again.');}finally{busy=false;content.querySelector('#account-form button')?.removeAttribute('disabled');content.querySelectorAll('[data-account-action]').forEach(b=>{if(b.dataset.accountAction!=='import')b.disabled=false;});}
  });
  // Auth callbacks must stay synchronous; database work runs outside the auth lock.
  client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{
    if(event==='PASSWORD_RECOVERY'){mode='password';render();if(!dialog.open)dialog.showModal();}
    void select(session);
  },0);});
  const refresh=()=>{if(accountState.user&&document.visibilityState==='visible')void cloud.sync();};
  void googleAvailable.then(enabled=>{googleEnabled=enabled;const button=content.querySelector('[data-account-action="google"]');if(button)button.hidden=!enabled;});
  window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);
  void select(initialSession).then(()=>{render();if(recoveryRequested||callbackError){dialog.showModal();if(callbackError)message(callbackError);}});
}
