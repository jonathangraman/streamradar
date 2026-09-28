import {upcomingPremiere,upcomingSeasonQuery,originalsOnlyServices,originalMovieServices,isOriginalSeries,isOriginalMovie,keyOf,isEnglish,isNarrativeMovie,pickGenres,pickGenreIds,pickKeyword,matchesPick,parseRoute,normalize,escapeHTML as esc,formatDate,today,shiftedDate,activityDate,recentActivityFirst,contentLabels,newestFirst,catalogQuery,legacyTheater,calendarEvent,emptyLibrary,migrateLegacy,updateLibrary,commitLibrary,createSequence,serviceDefinitions,providerIds} from './core.js';
import {legacy} from './legacy-config.js';

const $=id=>document.getElementById(id), IMG='https://image.tmdb.org/t/p/';
let library=emptyLibrary(),type='movie',service='all',kind='all',when='now',network='all',page=1,totalPages=1,catalog=[],results=[],searchTimer,searchController,wlTab='watchlist',detailItem=null,installPrompt;
const region='US';
let pickMedia='all',pickGenre='all';
const initialRoute=parseRoute(location.hash);
let route={view:'home'},historyDepth=0,loading=false,toastTimer;
const items=new Map(),cache=new Map(),sequence=createSequence(),detailSequence=createSequence(),actorSequence=createSequence();
const remember=item=>{const x=normalize(item);if(x){const prior=items.get(keyOf(x));for(const field of ['keywords','seasons','genres','last_episode_to_air','next_episode_to_air'])x[field]=x[field]||prior?.[field];items.set(keyOf(x),x);}return x;};
const image=(path,size='w342')=> typeof path==='string'&&/^\/[\w.\/-]+$/.test(path)?IMG+size+path:'';
function poster(item){const src=image(item.poster);return src?`<img src="${src}" alt="" loading="lazy">`:'<div class="no-img" aria-hidden="true">🎬</div>';}
function tags(item,placement){return contentLabels(item).filter(label=>!placement||(placement==='poster'?label.kind==='season':label.kind!=='season')).map(label=>`<span class="content-tag tag-${label.kind}"${label.description?` title="${esc(label.description)}"`:''}>${esc(label.text)}</span>`).join('');}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function errorHTML(message,retry){return `<div class="empty"><p class="error-text">${esc(message)}</p>${retry?`<button class="btn-retry" data-action="${retry}">Try again</button>`:''}</div>`;}
async function json(url,{signal}={}){
  const response=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed. Please retry.');return data;
}
async function api(path,options={}){
  const [name,query='']=path.split('?'),params=new URLSearchParams(query);params.set('path',name);
  const url='/api/tmdb?'+params.toString(),hit=cache.get(url);
  if(hit&&Date.now()-hit.time<300000)return structuredClone(hit.data);
  const data=await json(url,options);cache.set(url,{time:Date.now(),data});return structuredClone(data);
}
async function mapLimit(values,limit,fn){let index=0;const out=[];await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{while(index<values.length){const i=index++;try{out[i]=await fn(values[i],i);}catch(e){out[i]={_error:e.message};}}}));return out;}

function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function validLibrary(data){
  if(!data||data.version!==2||!Array.isArray(data.watchlist)||!Array.isArray(data.seen)||!Array.isArray(data.recs)||!data.ratings||typeof data.ratings!=='object')throw new Error('This is not a StreamRadar backup.');
  const out=migrateLegacy(data.watchlist,data.seen,data.ratings);
  out.dismissed=Array.isArray(data.dismissed)?[...new Set(data.dismissed.filter(k=>/^(movie|tv):[1-9]\d*$/.test(k)))]:[];
  out.recs=data.recs.map(x=>normalize(x)).filter(Boolean).filter(x=>!out.dismissed.includes(keyOf(x)));out.legacyImported=!!data.legacyImported;return out;
}
function save(next){try{library=commitLibrary(localStorage,next);}catch{throw new Error('Could not save on this browser. Free some storage or export your library.');}}
function loadLibrary(){
  const saved=readJSON('sr_library_v2',null);
  try{library=saved?validLibrary(saved):migrateLegacy(readJSON('sr_wl',[]),readJSON('sr_seen',[]),readJSON('sr_ratings',{}));}catch{library=emptyLibrary();toast('Could not read your library. Your original data has not been deleted.');}
  [...library.watchlist,...library.seen,...library.recs].forEach(remember);
  // No paid API key is required by this version; remove the obsolete exposed copy.
  try{localStorage.removeItem('sr_ak');}catch{}
}
async function importLegacy(){
  let device;try{device=localStorage.getItem('sr_device_id');}catch{return;}
  if(!device||library.legacyImported)return;
  $('storage-status').textContent='Recovering this browser’s existing library… New changes are saved locally.';
  try{
    const tables=await Promise.all(['watchlist','seen_it','ratings'].map(async table=>{
      const response=await fetch(`${legacy.url}/rest/v1/${table}?select=*&device_id=eq.${encodeURIComponent(device)}`,{headers:{apikey:legacy.key,Authorization:'Bearer '+legacy.key},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Import unavailable');const data=await response.json();if(!Array.isArray(data))throw new Error('Unexpected library response');return data;
    }));
    const convert=rows=>rows.map(r=>({id:r.tmdb_id,type:r.media_type,title:r.title,poster:r.poster,date:r.release_date}));
    const old=migrateLegacy(convert(tables[0]),convert(tables[1]),Object.fromEntries(tables[2].map(r=>[r.item_key,r.stars])));
    const merge=(a,b)=>[...new Map([...a,...b].map(x=>[keyOf(x),x])).values()];
    const next={...library,watchlist:merge(old.watchlist,library.watchlist),seen:merge(old.seen,library.seen),ratings:{...old.ratings,...library.ratings},legacyImported:true};
    // Local seen state wins over an older remote watchlist record.
    next.watchlist=next.watchlist.filter(x=>!next.seen.some(s=>keyOf(s)===keyOf(x)));save(next);
    [...library.watchlist,...library.seen].forEach(remember);$('storage-status').textContent='Existing library recovered. New changes are saved on this browser; export a backup.';$('legacy-retry').hidden=true;
    if(route.view==='watchlist')renderWatchlist();
  }catch{$('storage-status').textContent='Old cloud records could not be imported. They have not been deleted. New changes are saved on this browser.';$('legacy-retry').hidden=false;}
}
function mutate(action,key,stars){const item=items.get(key);save(updateLibrary(library,action,item,stars));toast(action==='dismiss'?'Not interested saved. This title will not be suggested again on this browser.':action==='watch'?'Watchlist saved on this browser.':action==='remove-seen'?'Removed from Seen It.':'Saved to Seen It.');if(route.view==='watchlist')renderWatchlist();if(route.view==='detail')renderDetailActions();if(route.view==='foryou')renderForYou();const next=[...$('v-'+route.view).querySelectorAll('button[data-action]')].find(b=>b.dataset.key===key&&b.dataset.action===action&&(action!=='rate'||Number(b.dataset.stars)===stars));(next||$('v-'+route.view).querySelector('h1'))?.focus({preventScroll:true});}

function renderServices(){
  $('network-filter').hidden=service!=='max'||when==='soon';
  $('network').value=network;
  $('theater-info').hidden=service!=='theaters';
  $('home-tabs').hidden=true;
  $('kind').querySelector('[value="tv"]').disabled=service==='theaters';
  $('kind').value=kind;
  $('when').options[0].textContent=service==='theaters'?'Now in theaters':'Watch now';
  $('svcs').innerHTML=serviceDefinitions.map(s=>`<button class="svc ${service===s.id?'on':''}" data-action="service" data-service="${s.id}" aria-pressed="${service===s.id}"${service===s.id?' style="background:#fff;color:#000"':''}>${esc(s.label)}</button>`).join('');
  const selected=$('svcs').querySelector('.on');if(selected)$('svcs').parentElement.scrollLeft=Math.max(0,selected.offsetLeft-20);
  document.querySelectorAll('[data-action="type"]').forEach(b=>{const on=b.dataset.type===type;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.disabled=(service==='theaters'&&b.dataset.type==='tv')||(service==='max'&&network!=='all'&&when==='now'&&b.dataset.type==='movie');});
}
function posterTags(item){return tags(item,'poster')+(when==='soon'&&item.upcomingSeason>1?`<span class="content-tag tag-season">SEASON ${Number(item.upcomingSeason)} SOON</span>`:'');}
function card(raw){const item=remember(raw);if(!item)return '';return `<button class="card" data-action="detail" data-key="${keyOf(item)}"><div class="card-img">${poster(item)}<div class="poster-tags">${posterTags(item)}</div>${library.watchlist.some(w=>keyOf(w)===keyOf(item))?'<span class="badge-wl" aria-label="Saved">▣</span>':''}${item.vote_average>0?`<span class="card-rating">★ ${Number(item.vote_average).toFixed(1)}</span>`:''}</div><div class="card-body"><div class="card-tags">${tags(item,'body')}</div><div class="card-title">${esc(item.title)}</div><div class="card-date">${item.type==='tv'?'Series · ':'Movie · '}${when==='soon'&&item.upcomingDate?'Expected':item.theaterDate?'US theatrical':service==='theaters'?'Original release':item.date>today()?'Expected':item.type==='tv'&&activityDate(item)!==item.date?'Latest airing':item.type==='tv'?'First aired':'Released'} ${esc(formatDate((when==='soon'&&item.upcomingDate)||item.theaterDate||(item.type==='tv'&&item.date<=today()?activityDate(item):item.date)))}</div></div></button>`;}
async function loadCatalog(more=false){
  const request=sequence.next(),wanted={type,service,region,kind,when,network,page:more?page+1:1};loading=true;
  searchController?.abort();if(!more){page=1;results=[];$('grid').innerHTML='<div class="loading" role="status">Loading titles…</div>';}
  $('load-more').hidden=true;$('count-lbl').textContent='Loading…';
  try{
    const types=wanted.service==='theaters'?['movie']:wanted.service==='max'&&wanted.network!=='all'?['tv']:wanted.kind==='movie'?['movie']:wanted.kind==='tv'?['tv']:['movie','tv'];
    const batches=await Promise.all(types.map(async media=>{
      const providerData=await api(`/watch/providers/${media}?watch_region=US`);
      const ids=providerIds(providerData.results||[],wanted.service);
      if(wanted.service!=='theaters'&&!ids.length)throw new Error('This service is not currently listed in the US provider catalog.');
      const params=catalogQuery({...wanted,type:media,ids});
      const data=await api(`/discover/${media}?${params}`);
      if(media==='tv'&&wanted.when==='now'){
        // First-air sorting alone hides returning shows. Also retrieve series airing recently.
        const recent=new URLSearchParams(params);recent.set('air_date.gte',shiftedDate(today(),-30));recent.set('air_date.lte',today());recent.set('sort_by','popularity.desc');
        const updates=await api(`/discover/tv?${recent}`);
        data.results=[...(updates.results||[]),...(data.results||[])];data.total_pages=Math.max(data.total_pages||1,updates.total_pages||1);
      }
      if(media==='tv'&&wanted.when==='soon'){
        const returning=await api('/discover/tv?'+upcomingSeasonQuery({...wanted,ids}));
        data.results=[...(data.results||[]),...(returning.results||[])];data.total_pages=Math.max(data.total_pages||1,returning.total_pages||1);
      }
      return {...data,results:(data.results||[]).filter(isEnglish).map(x=>normalize(x,media))};
    }));
    if(!sequence.current(request))return;
    const data={total_pages:Math.max(...batches.map(d=>d.total_pages||1)),results:batches.flatMap(d=>d.results||[])};
    let incoming=[...new Map((data.results||[]).filter(Boolean).map(x=>[keyOf(x),x])).values()];
    if(wanted.service==='theaters'){
      incoming=await mapLimit(incoming,4,async item=>{
        try{
          const dates=await api(`/movie/${item.id}/release_dates`),start=shiftedDate(today(),wanted.when==='soon'?1:-42),end=shiftedDate(today(),wanted.when==='soon'?90:0);
          const matches=(dates.results||[]).find(r=>r.iso_3166_1==='US')?.release_dates?.filter(r=>r.type===3).map(r=>r.release_date.slice(0,10)).filter(d=>d>=start&&d<=end).sort()||[];
          return {...item,theaterDate:wanted.when==='soon'?matches[0]:matches.at(-1)};
        }catch{return item;}
      });
      if(!sequence.current(request))return;
    }
    if(originalsOnlyServices.includes(wanted.service)||wanted.kind==='movie'||types.includes('tv')){
      $('count-lbl').textContent=wanted.kind==='movie'?'Checking movie categories…':'Checking latest season and episode dates…';
      incoming=await mapLimit(incoming,4,async item=>{
        if(!sequence.current(request)||(item.type!=='tv'&&wanted.kind!=='movie'&&!originalMovieServices.includes(wanted.service)))return item;
        try{return {...item,...normalize(await api(`/${item.type}/${item.id}?append_to_response=credits,keywords`),item.type)};}catch{if(wanted.when==='soon')throw new Error('Could not check upcoming dates. Please retry.');if(originalsOnlyServices.includes(wanted.service))throw new Error('Could not verify originals. Please retry.');return item;}
      });
      if(!sequence.current(request))return;
    }
    if(incoming.some(item=>item?._error))throw new Error(incoming.find(item=>item?._error)._error);
    if(originalsOnlyServices.includes(wanted.service)){
      incoming=await mapLimit(incoming,4,async item=>{
        if(item.type==='tv')return isOriginalSeries(item,wanted.service)?item:null;
        if(!originalMovieServices.includes(wanted.service))return item;
        try{const releases=await api('/movie/'+item.id+'/release_dates');return isOriginalMovie({...item,release_dates:releases},wanted.service)?item:null;}catch{throw new Error('Could not verify originals. Please retry.');}
      });
      if(!sequence.current(request))return;
      incoming=incoming.filter(Boolean);
    }
    if(wanted.when==='soon'){
      incoming=incoming.map(item=>{if(item.type!=='tv')return item;const premiere=upcomingPremiere(item);return premiere?{...item,upcomingDate:premiere.date,upcomingSeason:premiere.season}:null;}).filter(Boolean);
    }
    if(wanted.kind==='standup')incoming=incoming.map(x=>({...x,keywords:{keywords:[{id:9716,name:'stand-up comedy'}]}}));
    if(wanted.kind==='movie')incoming=incoming.filter(isNarrativeMovie);
    page=wanted.page;totalPages=Math.min(data.total_pages||1,500);results=[...new Map([...results,...incoming].map(x=>[keyOf(x),x])).values()];
    if(wanted.when==='soon')results.sort((a,b)=>(a.theaterDate||a.upcomingDate||a.date||'').localeCompare(b.theaterDate||b.upcomingDate||b.date||''));
    else if(wanted.service!=='theaters')results.sort(recentActivityFirst);
    $('grid').innerHTML=results.map(card).join('')||'<div class="empty">No dated premieres match these filters. Upcoming dates may not be announced or listed yet.</div>';
    $('count-lbl').textContent=`${results.length} titles · English · US · ${originalsOnlyServices.includes(wanted.service)?(originalMovieServices.includes(wanted.service)?'Originals only · ':'Original series only · '):''}${wanted.when==='soon'?'Upcoming movies, series & seasons · next 90 days · dates may change; streaming arrivals may differ':wanted.service==='theaters'?'Current US theatrical releases · popular first':network!=='all'&&service==='max'?'HBO Max · '+(network==='food'?'Food Network':'Discovery')+' · latest episodes & seasons first':'Newest releases, seasons & episodes first'}`;
    $('load-more').hidden=page>=totalPages;
    enrichLabels(results,request);
  }catch(e){if(sequence.current(request)){$('grid').innerHTML=errorHTML(e.message,'retry-catalog');$('count-lbl').textContent='Catalog unavailable';}}
  finally{if(sequence.current(request))loading=false;}
}
async function enrichLabels(titles,request){
  await mapLimit(titles,4,async item=>{
    if(!sequence.current(request))return;
    const detail=await api(`/${item.type}/${item.id}?append_to_response=credits,keywords`);
    if(!sequence.current(request))return;
    const enriched=remember({...item,keywords:detail.keywords,seasons:detail.seasons,genres:detail.genres,last_episode_to_air:detail.last_episode_to_air,next_episode_to_air:detail.next_episode_to_air});
    const node=$('grid').querySelector(`[data-key="${keyOf(item)}"] .card-tags`);
    if(node)node.innerHTML=tags(enriched,'body');
    const overlay=$('grid').querySelector(`[data-key="${keyOf(item)}"] .poster-tags`);if(overlay)overlay.innerHTML=posterTags(enriched);
  });
}
function clearSearch(){clearTimeout(searchTimer);searchController?.abort();sequence.next();$('home-search-input').value='';$('home-search-clear').hidden=true;$('browse-controls').hidden=false;$('home-tabs').hidden=false;renderServices();loadCatalog();$('home-search-input').focus();}
function onSearch(){
  clearTimeout(searchTimer);searchController?.abort();sequence.next();const q=$('home-search-input').value.trim();
  $('home-search-clear').hidden=!q;$('browse-controls').hidden=!!q;$('home-tabs').hidden=true;$('load-more').hidden=true;
  if(!q){loadCatalog();return;}
  $('count-lbl').textContent='Searching…';$('grid').innerHTML='<div class="loading">Searching titles…</div>';searchTimer=setTimeout(()=>search(q),300);
}
async function search(q){
  const request=sequence.next();searchController=new AbortController();const signal=searchController.signal;
  try{
    const parts=await Promise.all(['movie','tv'].map(async t=>{const d=await api(`/search/${t}?query=${encodeURIComponent(q)}&page=1`,{signal});return (d.results||[]).filter(isEnglish).map(x=>normalize(x,t)).filter(Boolean);}));
    if(!sequence.current(request))return;
    const found=parts.flat().sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,30);
    $('count-lbl').textContent=`${found.length} English matches · ${region}`;
    $('grid').innerHTML=found.map(item=>{remember(item);return `<button class="search-result" data-action="detail" data-key="${keyOf(item)}">${poster(item)}<span class="info"><strong>${esc(item.title)}</strong><span class="data-note">${esc(item.date.slice(0,4)||'Year unknown')} · ${item.type==='tv'?'Series':'Movie'}</span><span class="card-tags">${tags(item)}</span><p id="offers-${keyOf(item).replace(':','-')}">Checking offers…</p></span></button>`;}).join('')||'<div class="empty">No matching titles. Try another title or spelling.</div>';
    await mapLimit(found,4,async item=>{
      let text;try{const d=await api(`/${item.type}/${item.id}/watch/providers`,{signal}),offer=d.results?.[region];
        const subscriptions=(offer?.flatrate||[]).map(p=>p.provider_name);const free=[...(offer?.free||[]),...(offer?.ads||[])].map(p=>p.provider_name);
        text=subscriptions.length?'Subscription: '+subscriptions.join(', '):free.length?'Free / with ads: '+[...new Set(free)].join(', '):offer?.rent?.length||offer?.buy?.length?'Rental / purchase offers available':'No US offers listed';
      }catch{text='Availability could not be checked';}
      if(sequence.current(request)){const el=$('offers-'+keyOf(item).replace(':','-'));if(el)el.textContent=text;}
    });
  }catch(e){if(sequence.current(request)){$('count-lbl').textContent='Search unavailable';$('grid').innerHTML=errorHTML(e.message,'retry-search');}}
}

function showRoute(next,push=true){
  if(push){historyDepth++;history.pushState({...next,depth:historyDepth},'','#'+next.view+(next.key?'/'+next.key:next.id?'/'+next.id:''));}
  route=next;detailSequence.next();actorSequence.next();
  document.querySelectorAll('main.view').forEach(el=>{const active=el.id==='v-'+next.view;el.hidden=!active;el.inert=!active;});
  document.querySelectorAll('.bnav-btn').forEach(b=>{const active=b.dataset.action===next.view;b.classList.toggle('on',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(next.view==='detail')loadDetail(next.key);else if(next.view==='actor')loadActor(next.id);else if(next.view==='watchlist')renderWatchlist();else if(next.view==='foryou')renderForYou();
  requestAnimationFrame(()=>{const heading=$('v-'+next.view).querySelector('h1, .back-control');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
}
function goBack(){if(historyDepth>0)history.back();else showRoute({view:'home'},false);}
window.addEventListener('popstate',e=>{historyDepth=e.state?.depth||0;showRoute(e.state?.view?e.state:parseRoute(location.hash),false);});
history.replaceState({...initialRoute,depth:0},'','#'+initialRoute.view+(initialRoute.key?'/'+initialRoute.key:initialRoute.id?'/'+initialRoute.id:''));

function ratingControl(item){const value=library.ratings[keyOf(item)]||0;return `<fieldset class="rating-control"><legend>${value?'Your rating: '+value+' of 5':'Rate and mark as seen'}</legend>${[1,2,3,4,5].map(n=>`<button class="${n<=value?'on':''}" data-action="rate" data-key="${keyOf(item)}" data-stars="${n}" aria-label="Rate ${esc(item.title)} ${n} of 5 stars" aria-pressed="${value===n}">★</button>`).join('')}</fieldset>`;}
function renderDetailActions(){if(!detailItem)return;const target=$('detail-actions');if(!target)return;const key=keyOf(detailItem),saved=library.watchlist.some(x=>keyOf(x)===key),date=detailItem.next_episode_to_air?.air_date||detailItem.date;
  target.innerHTML=`<div class="det-actions"><button class="btn-main" data-action="watch" data-key="${key}" aria-pressed="${saved}">${saved?'Remove from watchlist':'Add to watchlist'}</button><button class="btn-ico" data-action="seen" data-key="${key}">Seen It</button>${date>=today()?`<button class="btn-ico" data-action="calendar" data-key="${key}">Add to calendar</button>`:''}</div>${ratingControl(detailItem)}`;
}
async function loadDetail(key){
  const request=detailSequence.next();const [media,id]=String(key).split(':');if(!['movie','tv'].includes(media)||!/^\d+$/.test(id))return;
  $('det-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button><div class="loading">Loading title…</div>';$('det-inner').scrollTop=0;
  try{
    const raw=await api(`/${media}/${id}?language=en-US&append_to_response=credits,keywords`);
    if(!detailSequence.current(request))return;detailItem=remember(normalize(raw,media));const item=detailItem;
    $('det-inner').innerHTML=`<div class="detail-hero">${image(raw.backdrop_path,'w780')?`<img class="bd" src="${image(raw.backdrop_path,'w780')}" alt="">`:''}<div class="detail-grad"></div><button class="back-control" data-action="back">‹ Back</button><div class="det-poster">${poster(item)}</div></div><div class="det-body"><h1 class="det-title" tabindex="-1">${esc(item.title)}</h1><div class="det-meta">${esc(item.date.slice(0,4))} · ${media==='tv'?'Series':'Movie'} ${raw.runtime?' · '+Number(raw.runtime)+' min':''}</div><div class="card-tags">${tags(item)}</div>${raw.next_episode_to_air?.air_date?`<p class="data-note">Next episode: ${esc(formatDate(raw.next_episode_to_air.air_date))} · Season ${Number(raw.next_episode_to_air.season_number)}</p>`:''}<div id="detail-actions"></div>${media==='movie'?`<section class="showtime-panel"><p class="person-eyebrow">YOUR THEATER</p><h2>${legacyTheater.name}</h2><p>${legacyTheater.address}</p><a class="showtime-link" href="${legacyTheater.url}" target="_blank" rel="noopener noreferrer">Check live showtimes & tickets ↗</a><small>Browse the theater’s current schedule.</small></section>`:''}<div id="critic-scores" aria-live="polite"><p class="data-note">Loading critic scores…</p></div><p class="det-overview">${esc(raw.overview||'No description available.')}</p><div class="genres">${(raw.genres||[]).map(g=>`<span class="gtag">${esc(g.name)}</span>`).join('')}</div><h2 class="sec-lbl">Where to watch · ${esc(region)}</h2><div id="detail-offers" aria-live="polite"><p class="data-note">Checking availability…</p></div><a class="provider-link" href="https://www.themoviedb.org/${media}/${Number(id)}" target="_blank" rel="noopener noreferrer">More title information ↗</a>${(raw.credits?.cast||[]).length?`<h2 class="sec-lbl">Cast</h2><div class="cast-row">${raw.credits.cast.slice(0,20).map(a=>`<button class="cast-card" data-action="actor" data-id="${Number(a.id)}"><div class="cast-photo">${image(a.profile_path,'w185')?`<img src="${image(a.profile_path,'w185')}" alt="" loading="lazy">`:'🎭'}</div><div class="cast-name">${esc(a.name)}</div><div class="cast-char">${esc(a.character)}</div></button>`).join('')}</div>`:''}</div>`;
    renderDetailActions();$('det-inner').querySelector('h1').focus({preventScroll:true});
    // Optional services must never block the primary title or each other.
    loadOffers(item,request);loadScores(item,request);
  }catch(e){if(detailSequence.current(request)){
    const saved=items.get(key);$('det-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button>'+errorHTML(e.message,'retry-detail');
    if(saved){detailItem=saved;$('det-inner').insertAdjacentHTML('beforeend',`<div class="det-body"><h1 class="det-title">${esc(saved.title)}</h1><p class="data-note">Saved title. Online details are unavailable.</p><div id="detail-actions"></div></div>`);renderDetailActions();}
  }}
}
async function loadOffers(item,request){
  try{const d=await api(`/${item.type}/${item.id}/watch/providers`);if(!detailSequence.current(request))return;const offers=d.results?.[region]||{};
    const groups=[['flatrate','Included with subscription'],['free','Free'],['ads','Free with ads'],['rent','Rent'],['buy','Buy']];
    $('detail-offers').innerHTML=groups.filter(([key])=>offers[key]?.length).map(([key,label])=>`<section class="offer-group"><h3>${label}</h3><div class="provs">${offers[key].map(p=>`<span class="ptag">${esc(p.provider_name)}</span>`).join('')}</div></section>`).join('')||'<p class="data-note">No US streaming offers listed.</p>';
    if(offers.link){const u=new URL(offers.link);if(u.protocol==='https:'&&u.hostname==='www.themoviedb.org')$('detail-offers').insertAdjacentHTML('beforeend',`<a class="provider-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">Open watch options ↗</a>`);}

  }catch(e){if(detailSequence.current(request))$('detail-offers').innerHTML='<p class="data-note error-text">Availability could not be checked. Please retry.</p><button class="text-button" data-action="retry-offers">Retry availability</button>';}
}
async function loadScores(item,request){
  try{const d=await json(`/api/ratings?id=${item.id}&type=${item.type}`);if(!detailSequence.current(request))return;
    const icons={imdb:'⭐',tomatoes:'🍅',tomatoesaudience:'🍿',metacritic:'Ⓜ'};
    const names={imdb:['IMDb','/10',10],tomatoes:['Rotten Tomatoes','%',100],tomatoesaudience:['RT Audience','%',100],metacritic:['Metacritic','/100',100]};
    const scores=(d.ratings||[]).filter(r=>names[r.source]&&r.value!==null&&r.value!==''&&Number.isFinite(Number(r.value))&&Number(r.value)>=0&&Number(r.value)<=names[r.source][2]);
    $('critic-scores').innerHTML=scores.length?`<div class="scores-row">${scores.map(r=>`<div class="score-pill score-${r.source}"><span class="score-icon" aria-hidden="true">${icons[r.source]}</span><div><div class="sp-lbl">${names[r.source][0]}</div><div class="sp-val">${esc(r.value)}<small>${names[r.source][1]}</small></div></div></div>`).join('')}</div>`:'<p class="data-note">No critic scores listed for this title.</p>';
  }catch{if(detailSequence.current(request))$('critic-scores').innerHTML='<p class="data-note">Critic scores are temporarily unavailable.</p><button class="text-button" data-action="retry-scores">Retry scores</button>';}
}
async function loadActor(id){
  const request=actorSequence.next();$('actor-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button><div class="loading">Loading actor…</div>';$('actor-inner').scrollTop=0;
  try{const [person,credits]=await Promise.all([api(`/person/${Number(id)}`),api(`/person/${Number(id)}/combined_credits`)]);if(!actorSequence.current(request))return;
    const films=[...new Map((credits.cast||[]).filter(isEnglish).map(x=>normalize(x,x.media_type)).filter(Boolean).map(x=>[keyOf(x),x])).values()].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    $('actor-inner').innerHTML=`<button class="back-control" data-action="back">‹ Back</button><section class="person-header"><div class="person-portrait">${image(person.profile_path,'w342')?`<img src="${image(person.profile_path,'w342')}" alt="${esc(person.name)}">`:'<span aria-hidden="true">🎭</span>'}</div><div><p class="person-eyebrow">${esc(person.known_for_department||'Film & television')}</p><h1 tabindex="-1">${esc(person.name)}</h1>${person.birthday?`<p class="person-fact">Born ${esc(formatDate(person.birthday))}</p>`:''}${person.place_of_birth?`<p class="person-fact">${esc(person.place_of_birth)}</p>`:''}<p class="person-fact">${films.length} screen credits</p></div></section><details class="actor-summary"><summary>Biography</summary><p>${esc(person.biography||'No biography available.')}</p></details><h2 class="sec-lbl">Filmography <span class="section-hint">Newest first</span></h2><div class="grid">${films.map(card).join('')}</div>`;$('actor-inner').querySelector('h1').focus({preventScroll:true});
  }catch(e){if(actorSequence.current(request))$('actor-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button>'+errorHTML(e.message,'retry-actor');}
}
function renderWatchlist(){
  $('wl-sub').textContent=`${library.watchlist.length} to watch · ${library.seen.length} seen`;
  document.querySelectorAll('[data-action="wl-tab"]').forEach(b=>{b.classList.toggle('on',b.dataset.tab===wlTab);b.setAttribute('aria-pressed',b.dataset.tab===wlTab);});
  $('wl-grid').innerHTML=[...library[wlTab]].sort(newestFirst).map(item=>`<div class="wl-card-wrap">${card(item)}${ratingControl(item)}<button class="text-button" data-action="${wlTab==='seen'?'remove-seen':'seen'}" data-key="${keyOf(item)}">${wlTab==='seen'?'Remove from Seen It':'Mark as seen'}</button></div>`).join('')||'<div class="empty">No titles here yet. Search for a title to get started.</div>';
}
function renderForYou(){
  const seeds=[...library.seen,...library.watchlist].filter(x=>library.ratings[keyOf(x)]>=4);
  $('fy-inner').innerHTML=`<div class="filter-row pick-filters"><label for="pick-media">Type<select id="pick-media"><option value="all">Movies & series</option><option value="movie">Movies</option><option value="tv">Series</option></select></label><label for="pick-genre">Genre<select id="pick-genre">${pickGenres.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}</select></label></div><button class="gen-btn" data-action="recommend"${recommending?' disabled':''}>${recommending?'Finding picks…':'Refresh picks'}</button><p class="data-note">${seeds.length?'Related to your 4–5-star ratings, with matching streaming discoveries.':'Pick a type and genre to discover titles. Rate favorites 4–5 stars for personal recommendations.'} Filters apply when you refresh. Not interested choices stay saved on this browser.</p>`+library.recs.filter(isEnglish).filter(x=>!(library.dismissed||[]).includes(keyOf(x))).map(item=>{
    const saved=library.watchlist.some(x=>keyOf(x)===keyOf(item));
    return `<article class="rec-card">${card(item)}<p class="rec-why">${esc(item.reason||'A title to explore.')}</p><div class="rec-actions"><button class="text-button" data-action="watch" data-key="${keyOf(item)}" aria-pressed="${saved}">${saved?'Remove from watchlist':'Add to watchlist'}</button><button class="text-button" data-action="dismiss" data-key="${keyOf(item)}">Not interested</button><button class="text-button" data-action="seen" data-key="${keyOf(item)}">Seen It</button></div>${ratingControl(item)}</article>`;
  }).join('');
  $('pick-media').value=pickMedia;$('pick-genre').value=pickGenre;
  $('pick-media').disabled=recommending;$('pick-genre').disabled=recommending;
  $('pick-media').addEventListener('change',e=>{pickMedia=e.target.value;if(pickMedia==='tv'&&pickGenre==='indie'){pickGenre='all';$('pick-genre').value='all';}});
  $('pick-genre').addEventListener('change',e=>{pickGenre=e.target.value;if(pickGenre==='indie'){pickMedia='movie';$('pick-media').value='movie';}});
}
let recommending=false;
async function recommend(){
  if(recommending)return;recommending=true;const chosenMedia=pickMedia,chosenGenre=pickGenre;renderForYou();
  try{
    const seeds=[...library.seen,...library.watchlist].filter(x=>library.ratings[keyOf(x)]>=4&&(chosenMedia==='all'||x.type===chosenMedia)).slice(0,5);
    const excluded=new Set([...library.watchlist,...library.seen].map(keyOf).concat(library.dismissed||[]));
    const batches=await mapLimit(seeds,3,async seed=>{const d=await api(`/${seed.type}/${seed.id}/recommendations`);return (d.results||[]).filter(isEnglish).map(x=>({...normalize(x,seed.type),reason:'Because you liked '+seed.title}));});
    let related=batches.filter(Array.isArray).flat();
    if(chosenGenre==='indie')related=[];
    const types=chosenMedia==='all'?['movie','tv']:[chosenMedia];
    const discoveries=await mapLimit(types,2,async media=>{
      const p=new URLSearchParams({language:'en-US',with_original_language:'en',watch_region:'US',with_watch_monetization_types:'flatrate|free|ads',sort_by:'popularity.desc',page:'1'});
      p.set(media==='tv'?'first_air_date.lte':'primary_release_date.lte',today());
      const providers=await api(`/watch/providers/${media}?watch_region=US`);p.set('with_watch_providers',providerIds(providers.results||[],'all').join('|'));
      const keyword=pickKeyword(chosenGenre,media);
      if(keyword)p.set('with_keywords',keyword);else if(chosenGenre!=='all')p.set('with_genres',pickGenreIds(chosenGenre,media));
      const d=await api(`/discover/${media}?${p}`);
      return (d.results||[]).filter(isEnglish).map(x=>({...normalize(x,media),...(keyword?{keywords:{keywords:[{id:keyword}]}}:{}),reason:'A US streaming discovery matching your filters.'}));
    });
    if(discoveries.every(x=>x._error)&&!related.length)throw new Error('Picks are temporarily unavailable. Please retry.');
    const prior=new Set(library.recs.map(keyOf));
    const candidates=[...new Map([...related,...discoveries.filter(Array.isArray).flat()].filter(x=>normalize(x)&&!excluded.has(keyOf(x))&&matchesPick(x,chosenMedia,chosenGenre)).map(x=>[keyOf(x),x])).values()];
    candidates.sort((a,b)=>Number(prior.has(keyOf(a)))-Number(prior.has(keyOf(b))));
    // Recheck dismissals made while requests were running.
    const picks=candidates.filter(x=>!(library.dismissed||[]).includes(keyOf(x))&&!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.watchlist.some(s=>keyOf(s)===keyOf(x))).slice(0,12);
    save({...library,recs:picks});picks.forEach(remember);if(!picks.length)toast('No new matches for these filters. Try another genre or type.');
  }catch(e){toast(e.message);}finally{recommending=false;if(route.view==='foryou')renderForYou();}
}
function download(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
  const a=b.dataset.action,key=b.dataset.key;
  try{
    if(a==='detail')showRoute({view:'detail',key});else if(a==='actor')showRoute({view:'actor',id:Number(b.dataset.id)});
    else if(['home','watchlist','foryou','about'].includes(a))showRoute({view:a});else if(a==='back')goBack();
    else if(['watch','seen','remove-seen','rate','dismiss'].includes(a))mutate(a,key,Number(b.dataset.stars));
    else if(a==='service'){service=b.dataset.service;network='all';if(service==='theaters'){type='movie';kind='movie';}renderServices();loadCatalog();}
    else if(a==='type'){type=b.dataset.type;renderServices();loadCatalog();}
    else if(a==='clear-search')clearSearch();else if(a==='retry-search')search($('home-search-input').value.trim());
    else if(a==='retry-catalog')loadCatalog();else if(a==='more'&&!loading)loadCatalog(true);
    else if(a==='retry-detail')loadDetail(route.key);else if(a==='retry-actor')loadActor(route.id);
    else if(a==='retry-offers')loadOffers(detailItem,detailSequence.value());else if(a==='retry-scores')loadScores(detailItem,detailSequence.value());
    else if(a==='wl-tab'){wlTab=b.dataset.tab;renderWatchlist();}else if(a==='recommend')await recommend();
    else if(a==='calendar'){const item=items.get(key);download(calendarEvent(item,item.next_episode_to_air?.air_date||item.date),'streamradar-event.ics','text/calendar');toast('Open the calendar file to add your reminder.');}
    else if(a==='export')download(JSON.stringify(library,null,2),'streamradar-backup.json','application/json');
    else if(a==='legacy-import')await importLegacy();
    else if(a==='install'){if(installPrompt){await installPrompt.prompt();installPrompt=null;}else toast('Use your browser’s Install app or Add to Home Screen option.');}
  }catch(e){toast(e.message||'That action could not be completed.');}
});
$('home-search-input').addEventListener('input',onSearch);
$('home-search-input').addEventListener('keydown',e=>{if(e.key==='Escape'){clearSearch();}if(e.key==='Enter'){clearTimeout(searchTimer);search($('home-search-input').value.trim());}});

$('when').addEventListener('change',()=>{when=$('when').value;network='all';if(when==='soon'&&service!=='theaters'&&['movie','tv'].includes(kind))kind='all';renderServices();loadCatalog();});
$('network').addEventListener('change',()=>{network=$('network').value;if(network!=='all'){type='tv';kind='tv';}renderServices();loadCatalog();});
$('kind').addEventListener('change',()=>{kind=$('kind').value;if(kind==='movie'&&network!=='all')network='all';renderServices();loadCatalog();});
$('import-backup').addEventListener('change',async e=>{
  try{const file=e.target.files[0];if(!file)return;if(file.size>5_000_000)throw new Error('Backup is too large.');const imported=validLibrary(JSON.parse(await file.text()));const merge=(a,b)=>[...new Map([...a,...b].map(x=>[keyOf(x),x])).values()];save({...library,watchlist:merge(library.watchlist,imported.watchlist),seen:merge(library.seen,imported.seen),ratings:{...library.ratings,...imported.ratings},dismissed:[...new Set([...(library.dismissed||[]),...(imported.dismissed||[])])],recs:library.recs.filter(x=>!imported.dismissed.includes(keyOf(x)))});[...library.watchlist,...library.seen].forEach(remember);renderWatchlist();toast('Backup merged with your library.');}catch(e){toast(e.message);}finally{e.target.value='';}
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
const updateNetworkStatus=()=>{$('offline').hidden=navigator.onLine;};window.addEventListener('online',updateNetworkStatus);window.addEventListener('offline',updateNetworkStatus);updateNetworkStatus();
loadLibrary();renderServices();loadCatalog();importLegacy();if(initialRoute.view!=='home')showRoute(initialRoute,false);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
