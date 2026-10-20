import {client,initialSession,recoveryRequested,callbackError} from './auth-client.js';
import {CloudLibrary,mergeGuestLibrary} from './library-sync.js';
import {emptyLibrary,escapeHTML as esc} from './core.js';

export const accountState={user:null,cloud:null,epoch:0};
export function mountAccounts({readGuest,setLibrary,validateLibrary,toast}){
  const dialog=document.getElementById('account-dialog'),content=document.getElementById('account-content');
  let mode=recoveryRequested?'password':'signin',status='Browse as a guest, or sign in to sync your library.',busy=false,identity;
  const message=text=>{const target=document.getElementById('account-message');if(target)target.textContent=text;};
  const render=()=>{
    document.querySelectorAll('[data-account-open]').forEach(b=>{b.textContent=accountState.user?'Account':'Sign in';});
    document.getElementById('storage-status').textContent=accountState.user?status:'Saved on this browser. Sign in to sync across devices.';
    if(accountState.user&&mode!=='password'){
      const guest=readGuest(),count=new Set([...guest.watchlist,...guest.seen].map(x=>x.type+':'+x.id)).size;
      content.innerHTML=`<p class="account-email">${esc(accountState.user.email)}</p><p id="account-sync-status" role="status">${esc(status)}</p><p>Your ratings, saved titles, and suggestions belong to your account.</p><div class="account-actions"><button class="btn-main" data-account-action="sync">Sync now</button><button class="text-button" data-account-action="signout">Sign out</button></div><section class="account-import"><h3>Bring your saved titles</h3><p>${count?count+' titles saved in this browser.':'No guest titles saved in this browser.'} Import only if these saves are yours. Your browser copy stays available, and existing account ratings take priority.</p><button class="text-button" data-account-action="import" ${!count&&!guest.dismissed.length?'disabled':''}>Import this browser’s saves</button><p>Have an exported backup? Use Import backup in My Watchlist while signed in.</p></section><p id="account-message" role="status"></p>`;
    }else{
      const password=mode!=='reset';
      content.innerHTML=`<p>Keep your ratings and watchlist private, sync across devices, and get picks based on your tastes.</p><form id="account-form">${mode==='password'?'':'<label for="account-email">Email<input id="account-email" type="email" name="email" autocomplete="email" maxlength="254" required></label>'}${password?`<label for="account-password">${mode==='password'?'New password':'Password'}<input id="account-password" name="password" type="password" autocomplete="${mode==='signin'?'current-password':'new-password'}" ${mode==='signin'?'':'minlength="10"'} maxlength="128" required></label>`:''}<button class="btn-main" type="submit">${mode==='signup'?'Create private account':mode==='reset'?'Send reset link':mode==='password'?'Save new password':'Sign in'}</button></form><p id="account-message" role="status"></p><div class="account-actions">${mode==='signin'?'<button class="text-button" data-account-action="signup">Create an account</button><button class="text-button" data-account-action="reset">Forgot password?</button>':mode==='password'?'':'<button class="text-button" data-account-action="signin">Back to sign in</button>'}</div><p class="data-note">You can keep browsing without an account. Existing browser saves are imported only when you choose.</p>`;
    }
  };
  const cloud=new CloudLibrary({client,storage:localStorage,onChange:next=>{
    try{setLibrary(validateLibrary(next));}catch{status='Could not read the cloud library. Your existing data has not been deleted.';render();}
  },onStatus:text=>{status=text;document.getElementById('storage-status').textContent=text;const el=document.getElementById('account-sync-status');if(el)el.textContent=text;}});
  accountState.cloud=cloud;
  async function select(session){
    const user=session?.user||null;
    if(identity===user?.id)return;
    identity=user?.id;accountState.epoch++;accountState.user=user;
    status=user?'Loading your private library…':'Saved on this browser.';
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
    const form=new FormData(event.target),email=String(form.get('email')||'').trim(),password=String(form.get('password')||'');
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
        if(result.data.session){await select(result.data.session);render();message('Signed in. Import this browser’s saves below if they belong to you.');}
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
  window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);
  void select(initialSession).then(()=>{render();if(recoveryRequested||callbackError){dialog.showModal();if(callbackError)message(callbackError);}});
}
