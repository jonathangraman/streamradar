import {buildReleasePlan,movieWindowEvents,formatDigitalQuote} from './release-plan.js';
import {mergeRemembered,setEpisodeProgress,hasNewEpisodes,filterWatchlist,resolvedEvent,movieStreamingEvents,futureMovieQuery,episodeLabelsAllowed,streamingArrival,streamingArrivalQuery,matchesOriginalSeries,matchesOriginalMovie,matchesReality,catalogBatchTarget,catalogScanLimit,scheduledVerifiedReleases,browseGenres,matchesBrowseGenre,activeVerifiedOffers,withVerifiedUSOffers,unseenTitles,matchesPickYear,rankRecommendations,pickSubscriptionOffers,upcomingPremiere,upcomingSeasonQuery,isOriginalSeries,keyOf,isEnglish,isNarrativeMovie,pickGenres,pickGenreIds,pickKeyword,matchesPick,parseRoute,normalize,escapeHTML as esc,formatDate,today,shiftedDate,activityDate,recentActivityFirst,contentLabels,releaseMilestone,newestFirst,catalogQuery,normalizeZip,theaterURL,calendarEvent,emptyLibrary,migrateLegacy,updateLibrary,commitLibrary,createSequence,serviceDefinitions,providerIds} from './core.js';
import {legacy} from './legacy-config.js';
import {mountAccounts,accountState} from './accounts.js';
import {client as accountClient} from './auth-client.js';
import {recommendationSeeds,tasteProfile} from './core.js';
import {commitGuestLibrary,readGuestLibrary,mergeGuestLibrary} from './library-sync.js';

const $=id=>document.getElementById(id), IMG='https://image.tmdb.org/t/p/';
let library=emptyLibrary(),type='movie',service='all',kind='all',genre='all',when='now',network='all',page=1,totalPages=1,catalog=[],results=[],searchTimer,searchController,wlTab='watchlist',detailItem=null,installPrompt;
const region='US';
let theaterZip=normalizeZip(readJSON('sr_theater_zip',''));
const preferences=readJSON('sr_preferences_v1',{});
let catalogController=null,homeLoaded=false,homeScroll=0,searchResults=[],searchOfferText=new Map();
let hideWatched=preferences.hideWatched!==false;
let scope=preferences.catalogScope==='catalog'?'catalog':'originals',reality='exclude';
let pickMedia=['all','movie','tv'].includes(preferences.media)?preferences.media:'all',pickGenre=pickGenres.some(g=>g.id===preferences.genre)?preferences.genre:'all';
const pickYears=Array.from({length:new Date().getFullYear()-1899},(_,i)=>String(new Date().getFullYear()-i));
let pickYear=pickYears.includes(String(preferences.year))?String(preferences.year):'all',similarSeed=null;
let pickServices=Array.isArray(preferences.services)?preferences.services.filter(id=>serviceDefinitions.some(s=>s.id===id&&!['all','theaters'].includes(id))):[];
function persistPreferences(){localStorage.setItem('sr_preferences_v1',JSON.stringify({hideWatched,catalogScope:scope,reality,media:pickMedia,genre:pickGenre,year:pickYear,services:pickServices}));}
const visibleTitles=titles=>unseenTitles(titles,library,hideWatched);
function refreshHome(){const q=$('home-search-input').value.trim();if(q)search(q);else loadCatalog();}

const initialRoute=parseRoute(location.hash);
let route={view:'home'},historyDepth=0,loading=false,toastTimer;
const items=new Map(),cache=new Map(),sequence=createSequence(),detailSequence=createSequence(),actorSequence=createSequence();
const remember=item=>{const x=normalize(item);if(x){const merged=mergeRemembered(x,items.get(keyOf(x)));items.set(keyOf(x),merged);return merged;}return x;};
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
  const ttl=/^\/(movie|tv)\/\d+(?:\?|$)/.test(name)?1800000:300000;
  if(hit&&Date.now()-hit.time<ttl)return structuredClone(hit.data);
  const data=await json(url,options);cache.set(url,{time:Date.now(),data});return structuredClone(data);
}
async function mapLimit(values,limit,fn){let index=0;const out=[];await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{while(index<values.length){const i=index++;try{out[i]=await fn(values[i],i);}catch(e){out[i]={_error:e.message};}}}));return out;}

function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function validLibrary(data){
  if(!data||data.version!==2||!Array.isArray(data.watchlist)||!Array.isArray(data.seen)||!Array.isArray(data.recs)||!data.ratings||typeof data.ratings!=='object')throw new Error('This is not a StreamRadar backup.');
  const out=migrateLegacy(data.watchlist,data.seen,data.ratings);
  out.progress={};for(const [key,p] of Object.entries(data.progress||{})){const item=p?.item&&normalize(p.item);if(!/^tv:[1-9]\d*$/.test(key)||!item||item.type!=='tv'||keyOf(item)!==key)continue;out.progress[key]={item,tracking:p.tracking===true,episodes:Object.fromEntries(Object.entries(p.episodes||{}).filter(([k,v])=>/^[1-9]\d*:[1-9]\d*$/.test(k)&&typeof v==='boolean'))};}
  for(const [key,value] of Object.entries(data.ratings))if(/^(movie|tv):[1-9]\d*$/.test(key)&&Number.isInteger(value)&&value>=1&&value<=5)out.ratings[key]=value;
  out.dismissed=Array.isArray(data.dismissed)?[...new Set(data.dismissed.filter(k=>/^(movie|tv):[1-9]\d*$/.test(k)))]:[];
  out.recs=data.recs.map(x=>normalize(x)).filter(Boolean).filter(x=>!out.dismissed.includes(keyOf(x)));out.legacyImported=!!data.legacyImported;out.recommendationSeed=data.recommendationSeed?normalize(data.recommendationSeed):null;return out;
}
function save(next){try{if(accountState.user){library=accountState.cloud.save(next);}else library=commitGuestLibrary(localStorage,library,next);}catch(error){throw new Error(error.message||'Could not save on this browser. Free some storage or export your library.');}}
function loadLibrary(){
  const saved=readJSON('sr_library_v2',null);
  try{library=readGuestLibrary(localStorage,saved?validLibrary(saved):migrateLegacy(readJSON('sr_wl',[]),readJSON('sr_seen',[]),readJSON('sr_ratings',{})));}catch{library=emptyLibrary();toast('Could not read your library. Your original data has not been deleted.');}
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
function mutate(action,key,stars){const item=items.get(key);save(updateLibrary(library,action,item,stars));toast(action==='dismiss'?'Not interested saved.':action==='watch'?'Watchlist updated.':action==='remove-seen'?'Removed from Seen It.':'Saved to Seen It.');if(route.view==='watchlist')renderWatchlist();if(route.view==='detail')renderDetailActions();if(route.view==='foryou')renderForYou();const next=[...$('v-'+route.view).querySelectorAll('button[data-action]')].find(b=>b.dataset.key===key&&b.dataset.action===action&&(action!=='rate'||Number(b.dataset.stars)===stars));(next||$('v-'+route.view).querySelector('h1'))?.focus({preventScroll:true});}

function renderServices(){
  $('network-filter').hidden=service!=='max'||when==='soon';
  $('network').value=network;
  $('theater-info').hidden=service!=='theaters';renderTheaterPanels();
  $('home-tabs').hidden=true;
  $('kind').querySelector('[value="tv"]').disabled=service==='theaters';
  $('kind').querySelector('[value="reality"]').disabled=service==='theaters';
  reality=kind==='reality'?'only':'exclude';
  $('kind').value=kind;
  $('genre').value=genre;
  $('catalog-scope').value=scope;$('catalog-scope').disabled=service==='theaters';
  $('when').options[0].textContent=service==='theaters'?'Now in theaters':'Watch now';
  $('svcs').innerHTML=serviceDefinitions.map(s=>`<button class="svc ${service===s.id?'on':''}" data-action="service" data-service="${s.id}" aria-pressed="${service===s.id}"${service===s.id?' style="background:#fff;color:#000"':''}>${esc(s.label)}</button>`).join('');
  const selected=$('svcs').querySelector('.on');if(selected)$('svcs').parentElement.scrollLeft=Math.max(0,selected.offsetLeft-20);
  document.querySelectorAll('[data-action="type"]').forEach(b=>{const on=b.dataset.type===type;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.disabled=(service==='theaters'&&b.dataset.type==='tv')||(service==='max'&&network!=='all'&&when==='now'&&b.dataset.type==='movie');});
}
function finaleLabel(item){
  if(item?.type!=='tv'||!episodeLabelsAllowed(item))return null;
  if(releaseMilestone(item))return null;
  const ep=item.last_episode_to_air;
  if(!ep?.air_date||!Number.isInteger(ep.episode_number)||ep.episode_number<1||!Number.isInteger(ep.season_number)||ep.season_number<1)return null;
  if(ep.air_date<shiftedDate(today(),-30)||ep.air_date>today())return null;
  const season=(item.seasons||[]).find(s=>s.season_number===ep.season_number);
  if(!season||!Number.isInteger(season.episode_count)||season.episode_count<1||ep.episode_number!==season.episode_count)return null;
  const ended=item.status==='Ended'&&!item.next_episode_to_air;
  return {text:ended?'SERIES FINALE':'SEASON FINALE',date:ep.air_date};
}
function posterTags(item){const finale=releaseMilestone(item)||finaleLabel(item);return (finale?`<span class="content-tag tag-season" title="Aired ${esc(formatDate(finale.date))}">${finale.text}</span>`:'')+tags(item,'poster')+(when==='soon'&&item.upcomingSeason>1?`<span class="content-tag tag-season">SEASON ${Number(item.upcomingSeason)} SOON</span>`:'');}
function trailerLink(item){return '/api/trailer?'+new URLSearchParams({type:item.type,id:String(item.id),title:item.title.slice(0,200),year:/^\d{4}/.test(item.date||'')?item.date.slice(0,4):''});}
function card(raw){const item=remember(raw);if(!item)return '';return `<button class="card" data-action="detail" data-key="${keyOf(item)}"><div class="card-img">${poster(item)}<div class="poster-tags">${posterTags(item)}</div>${library.watchlist.some(w=>keyOf(w)===keyOf(item))?'<span class="badge-wl" aria-label="Saved">▣</span>':''}${item.vote_average>0?`<span class="card-rating">★ ${Number(item.vote_average).toFixed(1)}</span>`:''}</div><div class="card-body"><div class="card-tags">${tags(item,'body')}</div><div class="card-title">${esc(item.title)}</div><div class="card-date">${item.type==='tv'?'Series · ':'Movie · '}${when==='soon'&&item.upcomingDate?'Expected':item.streamingDate?'Streaming since':item.theaterDate?'US theatrical':service==='theaters'?'Original release':item.date>today()?'Expected':item.type==='tv'&&activityDate(item)!==item.date?'Latest airing':item.type==='tv'?'First aired':'Released'} ${esc(formatDate((when==='soon'&&item.upcomingDate)||item.streamingDate||item.theaterDate||(item.type==='tv'&&item.date<=today()?activityDate(item):item.date)))}</div></div></button>`;}
async function loadCatalog(more=false){
  const request=sequence.next(),wanted={type,service,region,kind,genre,when,network,scope,reality,page:more?page+1:1};loading=true;
  catalogController?.abort();const controller=new AbortController();catalogController=controller;
  const catalogApi=path=>{if(!sequence.current(request)||controller.signal.aborted)throw new DOMException('Catalog changed','AbortError');return api(path,{signal:controller.signal});};
  searchController?.abort();if(!more){page=1;results=[];$('grid').innerHTML='<div class="loading" role="status">Loading titles…</div>';}
  $('load-more').hidden=true;$('count-lbl').textContent='Loading…';
  try{
    const types=wanted.service==='theaters'?['movie']:wanted.service==='max'&&wanted.network!=='all'?['tv']:wanted.kind==='movie'?['movie']:wanted.kind==='tv'||wanted.reality==='only'&&wanted.service!=='theaters'?['tv']:['movie','tv'];
    const originalMode=wanted.service!=='theaters'&&wanted.scope==='originals';
    const added=new Map(),priorKeys=new Set(results.map(keyOf));let scannedPage=wanted.page,incomplete=false,lastTotalPages=1;
    for(let scan=0;scan<catalogScanLimit;scan++){
      if(!sequence.current(request))return;
      $('count-lbl').textContent=`Finding matching titles… ${added.size} found`;
      const settled=await Promise.allSettled(types.map(async media=>{
        const providerData=await catalogApi(`/watch/providers/${media}?watch_region=US`);
        const ids=providerIds(providerData.results||[],wanted.service);
        if(wanted.service!=='theaters'&&!ids.length)throw new Error('This service is not currently listed in the US provider catalog.');
        const params=catalogQuery({...wanted,type:media,ids});
        const data=await catalogApi(`/discover/${media}?${params}`);
        if(media==='movie'&&wanted.when==='now'&&wanted.service!=='theaters'){
          const arrivals=await catalogApi('/discover/movie?'+streamingArrivalQuery({...wanted,ids},today()));
          data.results=[...(arrivals.results||[]),...(data.results||[])];data.total_pages=Math.max(data.total_pages||1,arrivals.total_pages||1);
        }
        if(media==='movie'&&wanted.when==='soon'&&wanted.service!=='theaters'){const arrivals=await catalogApi('/discover/movie?'+futureMovieQuery(wanted,today()));data.results=[...(arrivals.results||[]),...(data.results||[])];data.total_pages=Math.max(data.total_pages||1,arrivals.total_pages||1);}
        if(media==='tv'&&wanted.when==='now'){
          // First-air sorting alone hides returning shows. Also retrieve series airing recently.
          const recent=new URLSearchParams(params);recent.set('air_date.gte',shiftedDate(today(),-30));recent.set('air_date.lte',today());recent.set('sort_by','popularity.desc');
          const updates=await catalogApi(`/discover/tv?${recent}`);
          data.results=[...(updates.results||[]),...(data.results||[])];data.total_pages=Math.max(data.total_pages||1,updates.total_pages||1);
        }
        if(media==='tv'&&wanted.when==='soon'){
          const returning=await catalogApi('/discover/tv?'+upcomingSeasonQuery({...wanted,ids}));
          data.results=[...(data.results||[]),...(returning.results||[])];data.total_pages=Math.max(data.total_pages||1,returning.total_pages||1);
        }
        return {...data,results:(data.results||[]).map(x=>normalize(x,media)).filter(isEnglish)};
      }));
      if(!sequence.current(request))return;
      const batches=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
      incomplete ||= settled.some(x=>x.status==='rejected');
      if(!batches.length){if(added.size)break;throw settled.find(x=>x.status==='rejected').reason;}
      const data={total_pages:Math.max(...batches.map(d=>d.total_pages||1)),results:batches.flatMap(d=>d.results||[])};
      lastTotalPages=Math.min(data.total_pages||1,500);
      let incoming=[...new Map((data.results||[]).filter(Boolean).map(x=>[keyOf(x),x])).values()].filter(x=>!priorKeys.has(keyOf(x))&&!added.has(keyOf(x)));
      incoming=incoming.filter(item=>matchesReality(item,wanted.service==='theaters'?'include':wanted.reality));
      if(wanted.page===1){
        const corrections=(wanted.when==='now'?activeVerifiedOffers():scheduledVerifiedReleases()).filter(x=>types.includes(x.type)&&(wanted.service==='all'||x.service===wanted.service)&&!incoming.some(i=>keyOf(i)===keyOf(x)));
        for(const entry of corrections){const item=normalize(await catalogApi('/'+entry.type+'/'+entry.id+'?append_to_response=credits,keywords'),entry.type);if(item&&isEnglish(item)&&matchesBrowseGenre(item,wanted.genre)&&(wanted.kind!=='doc'||contentLabels(item).some(l=>l.kind==='doc'))&&(wanted.kind!=='standup'||contentLabels(item).some(l=>l.kind==='standup')))incoming.push({...item,...(wanted.when==='soon'?{upcomingDate:entry.start}:{})});}
        if(!sequence.current(request))return;
      }
      if(wanted.service==='theaters'){
        incoming=await mapLimit(incoming,4,async item=>{
          try{
            const dates=await catalogApi(`/movie/${item.id}/release_dates`),start=shiftedDate(today(),wanted.when==='soon'?1:-42),end=shiftedDate(today(),wanted.when==='soon'?90:0);
            const matches=(dates.results||[]).find(r=>r.iso_3166_1==='US')?.release_dates?.filter(r=>r.type===3).map(r=>r.release_date.slice(0,10)).filter(d=>d>=start&&d<=end).sort()||[];
            return {...item,theaterDate:wanted.when==='soon'?matches[0]:matches.at(-1)};
          }catch{return item;}
        });
        if(!sequence.current(request))return;
      }
      if(originalMode||wanted.kind==='movie'||types.includes('tv')||(wanted.service==='netflix'&&wanted.when==='soon')){
        $('count-lbl').textContent=wanted.kind==='movie'?'Checking movie categories…':'Checking latest season and episode dates…';
        incoming=await mapLimit(incoming,4,async item=>{
          if(!sequence.current(request)||(item.type!=='tv'&&wanted.kind!=='movie'&&!originalMode&&!(wanted.service==='netflix'&&wanted.when==='soon')))return item;
          try{return {...item,...normalize(await catalogApi(`/${item.type}/${item.id}?append_to_response=keywords`),item.type)};}catch{if(wanted.when==='soon')throw new Error('Could not check upcoming dates. Please retry.');if(originalMode)throw new Error('Could not verify originals. Please retry.');return item;}
        });
        if(!sequence.current(request))return;
      }
      if(incoming.some(item=>item?._error)){
        incomplete=true;incoming=incoming.filter(item=>!item?._error);
        if(!incoming.length&&scan===0&&!added.size)throw new Error('Could not verify title dates. Please retry.');
      }
      if(wanted.service!=='theaters'){
        incoming=await mapLimit(incoming,4,async item=>{
          if(item.type==='tv'){if(!originalMode)return item;const collection=wanted.service==='max'&&wanted.network!=='all';return (collection?(item.networks||[]).some(n=>n.id===(wanted.network==='food'?143:64)):matchesOriginalSeries(item,wanted.service))?item:null;}
          if(wanted.when==='soon'&&matchesOriginalMovie(item,wanted.service,'soon'))return item;
          const releases=await catalogApi('/movie/'+item.id+'/release_dates');
          const dated={...item,release_dates:releases};
          if(wanted.when==='soon'){const event=movieStreamingEvents(dated,wanted.service,today())[0];if(event)return {...item,upcomingDate:event.date,calendarEvent:event};}
          const arrival=wanted.when==='now'?streamingArrival(dated,wanted.service,today()):null;
          return arrival?{...item,streamingDate:arrival}:(!originalMode||matchesOriginalMovie(dated,wanted.service))?item:null;
        });
        if(!sequence.current(request))return;
        if(incoming.some(item=>item?._error))incomplete=true;
        incoming=incoming.filter(item=>item&&!item._error);
      }
      if(wanted.when==='soon'){
        incoming=incoming.map(item=>{if(item.type!=='tv')return item;const premiere=upcomingPremiere(item);return premiere?{...item,upcomingDate:premiere.date,upcomingSeason:premiere.season}:null;}).filter(Boolean);
      }
      if(wanted.kind==='standup')incoming=incoming.map(x=>({...x,keywords:{keywords:[{id:9716,name:'stand-up comedy'}]}}));
      if(wanted.kind==='movie')incoming=incoming.filter(isNarrativeMovie);
      if(wanted.kind==='doc')incoming=incoming.filter(item=>contentLabels(item).some(l=>l.kind==='doc'));
      if(wanted.genre!=='all')incoming=incoming.filter(item=>matchesBrowseGenre(item,wanted.genre));
      incoming=incoming.filter(item=>matchesReality(item,wanted.service==='theaters'?'include':wanted.reality));
      for(const item of visibleTitles(incoming))added.set(keyOf(item),{...item,catalogService:wanted.service});
      scannedPage=wanted.page;
      // Display verified matches immediately instead of waiting for every scan pass.
      if(!more&&added.size&&sequence.current(request)){
        const preview=[...added.values()].sort(wanted.when==='soon'
          ?(a,b)=>(a.theaterDate||a.upcomingDate||a.date||'').localeCompare(b.theaterDate||b.upcomingDate||b.date||'')
          :recentActivityFirst);
        $('grid').innerHTML=preview.map(card).join('');
        $('count-lbl').textContent=`Showing ${preview.length} verified titles · finding more…`;
      }
      if(added.size>=catalogBatchTarget||wanted.page>=lastTotalPages||incomplete)break;
      wanted.page++;
    }
    homeLoaded=true;page=scannedPage;totalPages=lastTotalPages;results=[...new Map([...results,...added.values()].map(x=>[keyOf(x),x])).values()];
    if(wanted.when==='soon')results.sort((a,b)=>(a.theaterDate||a.upcomingDate||a.date||'').localeCompare(b.theaterDate||b.upcomingDate||b.date||''));
    else if(wanted.service!=='theaters')results.sort(recentActivityFirst);
    $('grid').innerHTML=visibleTitles(results).map(card).join('')||'<div class="empty">No verified titles match these filters. Choose Reality & talk in Show, or Full catalog for licensed titles.</div>';
    $('count-lbl').textContent=`${visibleTitles(results).length} titles · English · US · ${originalMode?'Originals + new movies · ':wanted.service==='theaters'?'':'Full catalog · '}${wanted.service!=='theaters'?(wanted.reality==='exclude'?'Reality & talk hidden · ':wanted.reality==='only'?'Reality & talk only · ':''):''}${wanted.when==='soon'?'Upcoming movies, series & seasons · next 90 days · dates may change; streaming arrivals may differ':wanted.service==='theaters'?'Current US theatrical releases · popular first':network!=='all'&&service==='max'?'HBO Max · '+(network==='food'?'Food Network':'Discovery')+' · latest episodes & seasons first':'Newest releases, seasons & episodes first'}`;
    if(incomplete)$('count-lbl').textContent+=' · Some results unavailable; retry to check all categories';
    $('load-more').hidden=page>=totalPages;
    enrichLabels([...added.values()],request);
  }catch(e){if(sequence.current(request)){$('grid').innerHTML=errorHTML(e.message,'retry-catalog');$('count-lbl').textContent='Catalog unavailable';}}
  finally{if(sequence.current(request))loading=false;}
}
async function enrichLabels(titles,request){
  await mapLimit(titles,4,async item=>{
    if(!sequence.current(request))return;
    const stored=items.get(keyOf(item));
    const detail=stored?.seasons&&stored?.keywords?stored:await api(`/${item.type}/${item.id}?append_to_response=keywords`);
    if(!sequence.current(request))return;
    let releaseSeasonEpisodes=stored?.releaseSeasonEpisodes;
    const ep=detail.last_episode_to_air;
    const currentSeason=(detail.seasons||[]).find(s=>s.season_number===ep?.season_number);
    if(item.type==='tv'&&currentSeason?.episode_count>1&&currentSeason.episode_count<=40&&ep?.air_date>=shiftedDate(today(),-90)&&ep.air_date<=today()&&!releaseSeasonEpisodes){
      try{const seasonData=await api(`/tv/${item.id}/season/${ep.season_number}`);releaseSeasonEpisodes=seasonData.episodes;}catch{}
    }
    if(!sequence.current(request))return;
    const enriched=remember({...item,keywords:detail.keywords,seasons:detail.seasons,genres:detail.genres,last_episode_to_air:detail.last_episode_to_air,next_episode_to_air:detail.next_episode_to_air,releaseSeasonEpisodes});
    const node=$('grid').querySelector(`[data-key="${keyOf(item)}"] .card-tags`);
    if(node)node.innerHTML=tags(enriched,'body');
    const overlay=$('grid').querySelector(`[data-key="${keyOf(item)}"] .poster-tags`);if(overlay)overlay.innerHTML=posterTags(enriched);
  });
}
function clearSearch(){clearTimeout(searchTimer);searchController?.abort();sequence.next();$('home-search-input').value='';$('home-search-clear').hidden=true;$('browse-controls').hidden=false;$('home-tabs').hidden=false;renderServices();loadCatalog();$('home-search-input').focus();}
function onSearch(){
  clearTimeout(searchTimer);searchController?.abort();catalogController?.abort();sequence.next();const q=$('home-search-input').value.trim();
  $('home-search-clear').hidden=!q;$('browse-controls').hidden=!!q;$('home-tabs').hidden=true;$('load-more').hidden=true;
  if(!q){loadCatalog();return;}
  $('count-lbl').textContent='Searching…';$('grid').innerHTML='<div class="loading">Searching titles…</div>';searchTimer=setTimeout(()=>search(q),300);
}
async function search(q){
  const request=sequence.next();searchController=new AbortController();const signal=searchController.signal;
  try{
    const parts=await Promise.all(['movie','tv'].map(async t=>{const d=await api(`/search/${t}?query=${encodeURIComponent(q)}&page=1`,{signal});return (d.results||[]).map(x=>normalize(x,t)).filter(isEnglish);}));
    if(!sequence.current(request))return;
    const found=visibleTitles(parts.flat()).sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,30);
    searchResults=found;homeLoaded=true;
    $('count-lbl').textContent=`${found.length} English matches · ${region}`;
    $('grid').innerHTML=found.map(item=>{remember(item);return `<button class="search-result" data-action="detail" data-key="${keyOf(item)}">${poster(item)}<span class="info"><strong>${esc(item.title)}</strong><span class="data-note">${esc(item.date.slice(0,4)||'Year unknown')} · ${item.type==='tv'?'Series':'Movie'}</span><span class="card-tags">${tags(item)}</span><p id="offers-${keyOf(item).replace(':','-')}">Checking offers…</p></span></button>`;}).join('')||'<div class="empty">No matching titles. Try another title or spelling.</div>';
    await mapLimit(found,4,async item=>{
      let text;try{const d=await api(`/${item.type}/${item.id}/watch/providers`,{signal}),offer=withVerifiedUSOffers(item,d.results?.[region]||{});
        const subscriptions=(offer?.flatrate||[]).map(p=>p.provider_name);const free=[...(offer?.free||[]),...(offer?.ads||[])].map(p=>p.provider_name);
        text=subscriptions.length?'Subscription: '+subscriptions.join(', '):free.length?'Free / with ads: '+[...new Set(free)].join(', '):offer?.rent?.length||offer?.buy?.length?'Rental / purchase offers available':'No US offers listed';
      }catch{text='Availability could not be checked';}
      searchOfferText.set(keyOf(item),text);
      if(sequence.current(request)){const el=$('offers-'+keyOf(item).replace(':','-'));if(el)el.textContent=text;}
    });
  }catch(e){if(sequence.current(request)){$('count-lbl').textContent='Search unavailable';$('grid').innerHTML=errorHTML(e.message,'retry-search');}}
}

function showRoute(next,push=true){
  if(push){historyDepth++;history.pushState({...next,depth:historyDepth},'','#'+next.view+(next.key?'/'+next.key:next.id?'/'+next.id:''));}
  if(route.view==='home'&&next.view!=='home')homeScroll=$('home-scroll').scrollTop;
  route=next;detailSequence.next();actorSequence.next();
  document.querySelectorAll('main.view').forEach(el=>{const active=el.id==='v-'+next.view;el.hidden=!active;el.inert=!active;});
  document.querySelectorAll('.bnav-btn').forEach(b=>{const active=b.dataset.action===(next.view==='calendar'?'upcoming':next.view);b.classList.toggle('on',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(next.view==='home'){if(!homeLoaded)refreshHome();else{renderActiveHome();requestAnimationFrame(()=>$('home-scroll').scrollTop=homeScroll);}}else if(next.view==='detail')loadDetail(next.key);else if(next.view==='actor')loadActor(next.id);else if(next.view==='watchlist')renderWatchlist();else if(next.view==='foryou')renderForYou();else if(next.view==='calendar')renderCalendar();
  requestAnimationFrame(()=>{const heading=$('v-'+next.view).querySelector('h1, .back-control');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
}
function goBack(){if(historyDepth>0)history.back();else showRoute({view:'home'},false);}
window.addEventListener('popstate',e=>{historyDepth=e.state?.depth||0;showRoute(e.state?.view?e.state:parseRoute(location.hash),false);});
history.replaceState({...initialRoute,depth:0},'','#'+initialRoute.view+(initialRoute.key?'/'+initialRoute.key:initialRoute.id?'/'+initialRoute.id:''));

function theaterPanelHTML(scope,editing=false){
  const form=!theaterZip||editing;
  if(scope==='home')return (form?
    '<form class="zip-form" data-zip-form="home"><label for="home-zip">ZIP code</label><div class="zip-controls"><input id="home-zip" name="zip" type="text" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}" maxlength="5" required placeholder="12345" aria-describedby="home-zip-help" value="'+theaterZip+'"><button class="btn-ico" type="submit">Save</button></div></form>':
    '<div class="zip-saved"><span>ZIP <strong>'+theaterZip+'</strong></span><button class="text-button" data-action="change-zip">Change</button><a class="showtime-link" href="'+theaterURL(theaterZip)+'" target="_blank" rel="noopener noreferrer">Showtimes ↗</a></div>')+
    '<small id="home-zip-help">'+(form?'Five-digit US ZIP · saved on this browser. ':'')+'US releases below; local showtimes on Fandango.</small>';
  return '<h2>Find theaters near you</h2>'+ (form?
    '<form class="zip-form" data-zip-form="'+scope+'"><label for="'+scope+'-zip">US ZIP code</label><div class="zip-controls"><input id="'+scope+'-zip" name="zip" type="text" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}" maxlength="5" required placeholder="Enter ZIP code" value="'+theaterZip+'"><button class="btn-ico" type="submit">Save ZIP</button></div></form><small>Enter five digits. Saved on this browser.</small>':
    '<p>Theaters near <strong>'+theaterZip+'</strong> <button class="text-button" data-action="change-zip">Change ZIP</button></p><a class="showtime-link" href="'+theaterURL(theaterZip)+'" target="_blank" rel="noopener noreferrer">Find nearby theaters & showtimes ↗</a>')+
    '<small>'+(scope==='home'?'Titles below are US theatrical releases. ':'')+'Choose a theater and movie on Fandango to check local showtimes.</small>';
}
function renderTheaterPanels(){document.querySelectorAll('[data-theater-scope]').forEach(panel=>{panel.innerHTML=theaterPanelHTML(panel.dataset.theaterScope);});}
document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-zip-form]');if(!form)return;event.preventDefault();
  const input=form.elements.zip,zip=normalizeZip(input.value);
  if(!zip){input.setCustomValidity('Enter a valid five-digit US ZIP code.');input.reportValidity();return;}
  try{localStorage.setItem('sr_theater_zip',JSON.stringify(zip));theaterZip=zip;renderTheaterPanels();
    document.querySelector('[data-theater-scope="'+form.dataset.zipForm+'"] .showtime-link')?.focus();toast('ZIP code saved.');
  }catch{toast('Could not save your ZIP code. Please check browser storage and try again.');}
});
document.addEventListener('input',event=>{if(event.target.matches('[data-zip-form] input'))event.target.setCustomValidity('');});
function ratingControl(item){const value=library.ratings[keyOf(item)]||0;return `<fieldset class="rating-control"><legend>${value?'Your rating: '+value+' of 5':'Rate and mark as seen'}</legend>${[1,2,3,4,5].map(n=>`<button class="${n<=value?'on':''}" data-action="rate" data-key="${keyOf(item)}" data-stars="${n}" aria-label="Rate ${esc(item.title)} ${n} of 5 stars" aria-pressed="${value===n}">★</button>`).join('')}</fieldset>`;}
function renderDetailActions(){if(!detailItem)return;const target=$('detail-actions');if(!target)return;const key=keyOf(detailItem),saved=library.watchlist.some(x=>keyOf(x)===key),date=resolvedEvent(detailItem)?.date;
  target.innerHTML=`<div class="det-actions"><button class="btn-main" data-action="watch" data-key="${key}" aria-pressed="${saved}">${saved?'Remove from watchlist':'Add to watchlist'}</button><button class="btn-ico" data-action="seen" data-key="${key}">Seen It</button><button class="btn-ico" data-action="similar" data-key="${key}"${recommending?' disabled':''}>Find similar titles</button><div class="trailer-calendar-actions">${date>=today()?`<button class="btn-ico" data-action="calendar" data-key="${key}">Add to calendar</button>`:''}<a class="btn-ico trailer-button" href="${esc(trailerLink(detailItem))}" target="_blank" rel="noopener noreferrer" aria-label="Watch trailer for ${esc(detailItem.title)}">▶ Trailer ↗</a></div></div>${ratingControl(detailItem)}${resolvedEvent(detailItem)?`<p class="data-note">Calendar: ${esc(resolvedEvent(detailItem).label)} · ${formatDate(resolvedEvent(detailItem).date)}. ${esc(resolvedEvent(detailItem).source)}</p>`:''}`;
}
async function loadDetail(key){
  const request=detailSequence.next();const [media,id]=String(key).split(':');if(!['movie','tv'].includes(media)||!/^\d+$/.test(id))return;
  $('det-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button><div class="loading">Loading title…</div>';$('det-inner').scrollTop=0;
  try{
    const raw=await api(`/${media}/${id}?language=en-US&append_to_response=credits,keywords`);
    if(!detailSequence.current(request))return;detailItem=remember({...items.get(key),...normalize(raw,media)});const item=detailItem;
    $('det-inner').innerHTML=`<div class="detail-hero">${image(raw.backdrop_path,'w780')?`<img class="bd" src="${image(raw.backdrop_path,'w780')}" alt="">`:''}<div class="detail-grad"></div><button class="back-control" data-action="back">‹ Back</button><div class="det-poster">${poster(item)}</div></div><div class="det-body"><h1 class="det-title" tabindex="-1">${esc(item.title)}</h1><div class="det-meta">${esc(item.date.slice(0,4))} · ${media==='tv'?'Series':'Movie'} ${raw.runtime?' · '+Number(raw.runtime)+' min':''}</div><div class="card-tags">${tags(item)}</div>${raw.next_episode_to_air?.air_date?`<p class="data-note">Next episode: ${esc(formatDate(raw.next_episode_to_air.air_date))} · Season ${Number(raw.next_episode_to_air.season_number)}</p>`:''}<div id="detail-actions"></div>${media==='movie'?`<section class="showtime-panel" data-theater-scope="detail">${theaterPanelHTML('detail')}</section>`:''}<div id="critic-scores" aria-live="polite"><p class="data-note">Loading critic scores…</p></div><p class="det-overview">${esc(raw.overview||'No description available.')}</p><div class="genres">${(raw.genres||[]).map(g=>`<span class="gtag">${esc(g.name)}</span>`).join('')}</div><h2 class="sec-lbl">Where to watch · ${esc(region)}</h2><div id="detail-offers" aria-live="polite"><p class="data-note">Checking availability…</p></div><a class="provider-link" href="https://www.themoviedb.org/${media}/${Number(id)}" target="_blank" rel="noopener noreferrer">More title information ↗</a>${(raw.credits?.cast||[]).length?`<h2 class="sec-lbl">Cast</h2><div class="cast-row">${raw.credits.cast.slice(0,20).map(a=>`<button class="cast-card" data-action="actor" data-id="${Number(a.id)}"><div class="cast-photo">${image(a.profile_path,'w185')?`<img src="${image(a.profile_path,'w185')}" alt="" loading="lazy">`:'🎭'}</div><div class="cast-name">${esc(a.name)}</div><div class="cast-char">${esc(a.character)}</div></button>`).join('')}</div>`:''}</div>`;
    renderDetailActions();if(media==='tv'){document.getElementById('detail-actions').insertAdjacentHTML('afterend','<section id="episode-tracker" class="episode-tracker" aria-label="Episode progress"></section>');renderEpisodeTracker(item,request);}$('det-inner').querySelector('h1').focus({preventScroll:true});
    // Optional services must never block the primary title or each other.
    loadOffers(item,request);loadScores(item,request);if(media==='movie'){document.getElementById('detail-actions').insertAdjacentHTML('afterend','<section id="movie-journey" class="movie-journey" aria-label="Theater to streaming timeline"><h2>Theater → Digital → Streaming</h2><p>Checking release windows…</p></section>');loadMovieJourney(item,request);}
  }catch(e){if(detailSequence.current(request)){
    const saved=items.get(key);$('det-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button>'+errorHTML(e.message,'retry-detail');
    if(saved){detailItem=saved;$('det-inner').insertAdjacentHTML('beforeend',`<div class="det-body"><h1 class="det-title">${esc(saved.title)}</h1><p class="data-note">Saved title. Online details are unavailable.</p><div id="detail-actions"></div></div>`);renderDetailActions();}
  }}
}
async function loadOffers(item,request){
  try{const d=await api(`/${item.type}/${item.id}/watch/providers`);if(!detailSequence.current(request))return;const offers=withVerifiedUSOffers(item,d.results?.[region]||{});
    const groups=[['flatrate','Included with subscription'],['free','Free'],['ads','Free with ads'],['rent','Rent'],['buy','Buy']];
    $('detail-offers').innerHTML=groups.filter(([key])=>offers[key]?.length).map(([key,label])=>`<section class="offer-group"><h3>${label}</h3><div class="provs">${offers[key].map(p=>`<span class="ptag">${esc(p.provider_name)}</span>`).join('')}</div></section>`).join('')||'<p class="data-note">No US streaming offers listed.</p>';
    for(const offer of activeVerifiedOffers().filter(x=>keyOf(x)===keyOf(item))){if(offer.url)$('detail-offers').insertAdjacentHTML('beforeend',`<a class="provider-link" href="${esc(offer.url)}" target="_blank" rel="noopener noreferrer">Watch on ${esc(offer.provider_name)} ↗</a>`);}
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
    const films=visibleTitles([...new Map((credits.cast||[]).filter(isEnglish).map(x=>normalize(x,x.media_type)).filter(Boolean).map(x=>[keyOf(x),x])).values()]).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    $('actor-inner').innerHTML=`<button class="back-control" data-action="back">‹ Back</button><section class="person-header"><div class="person-portrait">${image(person.profile_path,'w342')?`<img src="${image(person.profile_path,'w342')}" alt="${esc(person.name)}">`:'<span aria-hidden="true">🎭</span>'}</div><div><p class="person-eyebrow">${esc(person.known_for_department||'Film & television')}</p><h1 tabindex="-1">${esc(person.name)}</h1>${person.birthday?`<p class="person-fact">Born ${esc(formatDate(person.birthday))}</p>`:''}${person.place_of_birth?`<p class="person-fact">${esc(person.place_of_birth)}</p>`:''}<p class="person-fact">${films.length} screen credits</p></div></section><details class="actor-summary"><summary>Biography</summary><p>${esc(person.biography||'No biography available.')}</p></details><h2 class="sec-lbl">Filmography <span class="section-hint">Newest first</span></h2><div class="grid">${films.map(card).join('')}</div>`;$('actor-inner').querySelector('h1').focus({preventScroll:true});
  }catch(e){if(actorSequence.current(request))$('actor-inner').innerHTML='<button class="back-control" data-action="back">‹ Back</button>'+errorHTML(e.message,'retry-actor');}
}
let metadataEpoch=accountState.epoch;
let watchFilters={query:'',type:'all',service:'all',status:'all',sort:'added'},watchMetadata=new Map(),watchRefresh=0;
function watchlistTitles(){return wlTab==='tracking'?Object.values(library.progress||{}).filter(p=>p.tracking).map(p=>p.item):library[wlTab]||[];}
function renderWatchlist(){
 $('wl-sub').textContent=`${library.watchlist.length} to watch · ${library.seen.length} seen · ${Object.values(library.progress||{}).filter(p=>p.tracking).length} following`;
 document.querySelectorAll('[data-action="wl-tab"]').forEach(b=>{b.classList.toggle('on',b.dataset.tab===wlTab);b.setAttribute('aria-pressed',b.dataset.tab===wlTab);});
 const titles=watchlistTitles().map(x=>({...x,...watchMetadata.get(keyOf(x))}));
 const filtered=filterWatchlist(titles,library,watchFilters);
 $('wl-count').textContent=`${filtered.length} of ${titles.length} titles`;
 $('wl-grid').innerHTML=filtered.map(item=>`<div class="wl-card-wrap">${card(item)}${item.type==='tv'?`<p class="data-note">${library.progress?.[keyOf(item)]?.tracking?Object.values(library.progress[keyOf(item)].episodes).filter(Boolean).length+' episodes watched':'Open title to track episodes'}${hasNewEpisodes(item,library)?' · New episode to watch':''}</p>`:''}${ratingControl(item)}<button class="text-button" data-action="${wlTab==='seen'?'remove-seen':'seen'}" data-key="${keyOf(item)}">${wlTab==='seen'?'Remove from Seen It':'Mark as seen'}</button></div>`).join('')||'<div class="empty">No titles match. Try another filter or search for a title to save.</div>';
 void refreshWatchMetadata(titles);
}
async function refreshWatchMetadata(titles){
 const epoch=accountState.epoch,run=++watchRefresh,missing=titles.filter(x=>!watchMetadata.has(keyOf(x)));
 if(!missing.length)return;$('wl-status').textContent='Checking US subscription availability and new episodes…';
 await mapLimit(missing,4,async item=>{if(accountState.epoch!==epoch)return;
  // Mark in-flight entries so typing a search does not duplicate requests.
  watchMetadata.set(keyOf(item),{});
  try{const [d,offers]=await Promise.all([api(`/${item.type}/${item.id}?append_to_response=keywords`),api(`/${item.type}/${item.id}/watch/providers`)]);if(accountState.epoch!==epoch)return;
   const us=withVerifiedUSOffers(item,offers.results?.US||{}),subscriptionServices=serviceDefinitions.filter(s=>!['all','theaters'].includes(s.id)&&pickSubscriptionOffers(us,[s.id]).length).map(s=>s.id);
   watchMetadata.set(keyOf(item),{...normalize(d,item.type),subscriptionServices});
  }catch{watchMetadata.set(keyOf(item),{availabilityUnknown:true});}
 });
 if(accountState.epoch!==epoch)return;if(route.view==='watchlist'){renderWatchlist();$('wl-status').textContent='Availability checked for this visit. Unknown availability is excluded from service filters.';}
}
function renderActiveHome(){
 if($('home-search-input').value.trim()){
  const found=visibleTitles(searchResults);$('count-lbl').textContent=`${found.length} English matches · ${region}`;
  $('grid').innerHTML=found.map(item=>{remember(item);return `<button class="search-result" data-action="detail" data-key="${keyOf(item)}">${poster(item)}<span class="info"><strong>${esc(item.title)}</strong><span class="data-note">${esc(item.date.slice(0,4)||'Year unknown')} · ${item.type==='tv'?'Series':'Movie'}</span><p id="offers-${keyOf(item).replace(':','-')}">${esc(searchOfferText.get(keyOf(item))||'Checking offers…')}</p></span></button>`;}).join('')||'<div class="empty">No matching titles.</div>';
 }else if(homeLoaded){$('grid').innerHTML=visibleTitles(results).map(card).join('');$('count-lbl').textContent=$('count-lbl').textContent.replace(/^\d+ titles/,visibleTitles(results).length+' titles');}
}
let episodeSequence=0,episodeItems=[];
function renderEpisodeTracker(item,request){
 const target=$('episode-tracker');if(!target)return;
 const seasons=(item.seasons||[]).filter(s=>s.season_number>0),selected=item.last_episode_to_air?.season_number||seasons.find(s=>s.air_date<=today())?.season_number||1;
 target.innerHTML=`<h2>Episode progress</h2><label class="follow-series"><input type="checkbox" data-follow-series="${keyOf(item)}" ${library.progress?.[keyOf(item)]?.tracking?'checked':''}> Follow this series</label><p class="data-note">Watched episodes sync with your library. New episodes can reappear even after Seen It. Air dates may differ by service.</p>${seasons.length?`<label for="episode-season">Season<select id="episode-season">${seasons.map(s=>`<option value="${s.season_number}" ${s.season_number===selected?'selected':''}>Season ${s.season_number}</option>`).join('')}</select></label><button class="text-button" data-action="episodes-caught-up" data-key="${keyOf(item)}">Mark aired episodes in this season watched</button><p id="episode-summary" role="status"></p><div id="episode-list"></div>`:'<p>No season details are available yet.</p>'}`;
 if(seasons.length){$('episode-season').addEventListener('change',()=>loadEpisodeSeason(item,Number($('episode-season').value),request));void loadEpisodeSeason(item,selected,request);}
}
async function loadEpisodeSeason(item,season,request){
 const run=++episodeSequence,epoch=accountState.epoch;$('episode-list').innerHTML='<p>Loading episodes…</p>';episodeItems=[];document.querySelector('[data-action="episodes-caught-up"]').disabled=true;
 try{const data=await api(`/tv/${item.id}/season/${season}`);if(run!==episodeSequence||!detailSequence.current(request)||epoch!==accountState.epoch)return;
  episodeItems=(data.episodes||[]).filter(e=>e.episode_number>0).map(e=>({...e,season_number:season}));renderEpisodes(item);
 }catch{if(run===episodeSequence&&detailSequence.current(request))$('episode-list').innerHTML='<p>Could not load episodes. Choose the season again to retry.</p>';}
}
function renderEpisodes(item){
 if(!$('episode-list'))return;const bulk=document.querySelector('[data-action="episodes-caught-up"]');if(bulk)bulk.disabled=!episodeItems.some(e=>e.air_date&&e.air_date<=today());const watched=library.progress?.[keyOf(item)]?.episodes||{};
 $('episode-summary').textContent=`${episodeItems.filter(e=>watched[e.season_number+':'+e.episode_number]).length} of ${episodeItems.length} episodes watched`;
 $('episode-list').innerHTML=episodeItems.map(e=>{const aired=e.air_date&&e.air_date<=today(),ep=e.season_number+':'+e.episode_number;return `<label class="episode-row"><input type="checkbox" data-episode="${ep}" data-key="${keyOf(item)}" ${watched[ep]?'checked':''} ${!aired?'disabled':''}><span><strong>E${e.episode_number} · ${esc(e.name||'Episode '+e.episode_number)}</strong><small>${e.air_date?formatDate(e.air_date):'Date unannounced'}${!aired?' · Not aired':''}</small></span></label>`;}).join('');
}
let calendarPlans=new Map(),digitalQuotes=new Map();
let calendarEntries=[],calendarPage=0,calendarTotalPages=1,calendarBusy=false,calendarLoaded=false,calendarRun=0;
let calendarFilters={month:today().slice(0,7),service:'all',type:'all',stage:'all',saved:false};
function renderCalendar(){
 const month=$('calendar-month');if(!month.options.length){month.innerHTML=Array.from({length:4},(_,i)=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+i);const value=d.toISOString().slice(0,7);return `<option value="${value}">${d.toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</option>`;}).join('');}
 month.value=calendarFilters.month;
 const saved=new Set([...library.watchlist,...library.seen,...Object.values(library.progress||{}).filter(p=>p.tracking).map(p=>p.item)].map(keyOf));
 const entries=calendarEntries.filter(e=>e.date.slice(0,7)===calendarFilters.month&&(calendarFilters.stage==='all'||e.kind===calendarFilters.stage||calendarFilters.stage==='episode'&&e.kind==='season')&&(calendarFilters.service==='all'||e.service===calendarFilters.service)&&(calendarFilters.type==='all'||e.item.type===calendarFilters.type)&&(!calendarFilters.saved||saved.has(keyOf(e.item)))).sort((a,b)=>a.date.localeCompare(b.date)||a.item.title.localeCompare(b.item.title));
 let date='';$('calendar-list').innerHTML=entries.map(e=>{const header=e.date!==date?`<h2 class="calendar-day">${formatDate(e.date)}</h2>`:'';date=e.date;const serviceName=(e.service==='digital'?'Digital stores':serviceDefinitions.find(s=>s.id===e.service)?.label)||'Service unconfirmed';return header+`<article class="calendar-entry"><div>${e.item.poster?`<img src="${image(e.item.poster,'w154')}" alt="" loading="lazy">`:''}</div><div><button class="calendar-title text-button" data-action="calendar-detail" data-key="${e.key}">${esc(e.item.title)}</button><p>${esc(e.label)} · ${esc(serviceName)}</p><small>${esc(e.source)}</small>${e.item.type==='movie'?`<p class="journey-price">${e.kind==='digital'?esc(formatDigitalQuote(digitalQuotes.get(e.item.id))):esc(journeyDestination(calendarPlans.get(e.item.id)?.plan))}</p>${e.kind==='digital'?`<button class="text-button" data-action="check-price" data-key="${keyOf(e.item)}">Check current rental / purchase price</button>`:''}<button class="text-button" data-action="movie-journey" data-key="${keyOf(e.item)}">Theater → Home timeline</button>`:''}<div><button class="text-button" data-action="calendar-event" data-key="${e.key}">Add to calendar</button></div></div></article>`;}).join('')||'<p class="empty">No confirmed dates match this month and these filters. Try another month or load more releases.</p>';
 renderUndatedPlans();
 $('calendar-count').textContent=`${entries.length} events this month · ${calendarEntries.length} dates found across the next 90 days`;
 $('calendar-more').hidden=calendarPage>=calendarTotalPages||calendarBusy;$('calendar-refresh').disabled=calendarBusy;$('calendar-export').disabled=!entries.length;
 if(!calendarLoaded&&!calendarBusy)void loadStreamingCalendar(true);
}
function addCalendarEntry(item,event){
 if(!event?.date||event.date<today()||event.date>shiftedDate(today(),90))return;
 const key=[keyOf(item),event.date,event.service||'',event.kind,event.season||'',event.episode||''].join('|');
 if(!calendarEntries.some(x=>x.key===key))calendarEntries.push({...event,key,item});
}
async function loadStreamingCalendar(reset=true){
 if(calendarBusy)return;calendarBusy=true;const run=++calendarRun,epoch=accountState.epoch;calendarLoaded=true;
 if(reset){calendarEntries=[];calendarPlans.clear();calendarPage=0;}const nextPage=calendarPage+1;
 $('calendar-status').textContent='Checking confirmed US streaming dates and upcoming episodes…';renderCalendar();
 try{
  const movieQuery=futureMovieQuery({page:nextPage});
  const [movieData,theaterData,soonTheaterData]=await Promise.all([api('/discover/movie?'+movieQuery),api('/discover/movie?'+catalogQuery({service:'theaters',when:'now',kind:'movie',page:nextPage})),api('/discover/movie?'+catalogQuery({service:'theaters',when:'soon',kind:'movie',page:nextPage}))]);
  if(run!==calendarRun||epoch!==accountState.epoch)return;calendarTotalPages=Math.min(Math.max(movieData.total_pages||1,theaterData.total_pages||1,soonTheaterData.total_pages||1),500);
  const corrections=scheduledVerifiedReleases(),savedMovies=reset?[...library.watchlist,...library.seen].filter(x=>x.type==='movie'):[];
  const candidates=[...new Map([...[...(movieData.results||[]),...(theaterData.results||[]),...(soonTheaterData.results||[])].map(x=>normalize(x,'movie')),...savedMovies,...corrections.filter(x=>x.type==='movie')].map(x=>[keyOf(x),x])).values()];let failed=0;
  await mapLimit(candidates,4,async candidate=>{
   if(run!==calendarRun||epoch!==accountState.epoch)return;
   try{const data=await api('/movie/'+candidate.id+'?append_to_response=release_dates'),item=normalize(data,'movie');if(run!==calendarRun||epoch!==accountState.epoch||!isEnglish(item))return;
    calendarPlans.set(item.id,{item,plan:buildReleasePlan(item)});
    for(const event of [...movieStreamingEvents(item),...movieWindowEvents(item)])addCalendarEntry(item,event);
    if(route.view==='calendar')renderCalendar();
   }catch{failed++;}
  });
  if(reset){
   const tracked=[...new Map([...library.watchlist,...library.seen,...Object.values(library.progress||{}).filter(p=>p.tracking).map(p=>p.item)].filter(x=>x.type==='tv').map(x=>[keyOf(x),x])).values()];
   let discovered=[];try{const d=await api('/discover/tv?'+upcomingSeasonQuery({service:'all',scope:'originals',kind:'tv',page:1}));discovered=(d.results||[]).map(x=>normalize(x,'tv'));}catch{failed++;}
   const series=[...new Map([...tracked,...discovered,...corrections.filter(x=>x.type==='tv')].map(x=>[keyOf(x),x])).values()];
   await mapLimit(series,3,async candidate=>{
    if(run!==calendarRun||epoch!==accountState.epoch)return;
    try{const item=normalize(await api('/tv/'+candidate.id),'tv');if(run!==calendarRun||epoch!==accountState.epoch||!isEnglish(item))return;
     const affiliation=serviceDefinitions.find(s=>!['all','theaters'].includes(s.id)&&matchesOriginalSeries(item,s.id))?.id;
     const source='TMDB episode air date; streaming availability may vary';
     const next=item.next_episode_to_air;if(next?.air_date)addCalendarEntry(item,{date:next.air_date,kind:'episode',season:next.season_number,episode:next.episode_number,label:`S${next.season_number} E${next.episode_number} · ${next.name||'Episode'}`,service:affiliation,source});
     const premiere=upcomingPremiere(item);if(premiere)addCalendarEntry(item,{date:premiere.date,kind:'season',season:premiere.season,label:'Season '+premiere.season+' premiere',service:affiliation,source:'TMDB season air date; streaming availability may vary'});
     const seasons=[...new Set([next?.season_number,premiere?.season])].filter(n=>n>0);
     for(const season of seasons){const data=await api(`/tv/${item.id}/season/${season}`);if(run!==calendarRun||epoch!==accountState.epoch)return;for(const ep of data.episodes||[])if(ep.episode_number>0)addCalendarEntry(item,{date:ep.air_date,kind:'episode',season,episode:ep.episode_number,label:`S${season} E${ep.episode_number} · ${ep.name||'Episode'}`,service:affiliation,source});}
    }catch{failed++;}
   });
  }
  if(run!==calendarRun||epoch!==accountState.epoch)return;
  // Prefer a concrete episode over an equivalent broad season-premiere entry.
  calendarEntries=calendarEntries.filter(e=>e.kind!=='season'||!calendarEntries.some(x=>x.kind==='episode'&&keyOf(x.item)===keyOf(e.item)&&x.date===e.date&&x.season===e.season));
  calendarPage=nextPage;$('calendar-status').textContent=`Checked ${calendarPage} movie / theatrical discovery page${calendarPage===1?'':'s'} plus saved titles and series. ${failed?'Some sources failed; refresh to retry. ':''}Streaming dates require service-named US release evidence. Coverage depends on source metadata; Load more checks additional movies.`;
 }catch(error){if(run===calendarRun)$('calendar-status').textContent='Could not finish checking releases. '+error.message+' Use Refresh to retry; any dates already found remain visible.';}
 finally{if(run===calendarRun){calendarBusy=false;if(route.view==='calendar')renderCalendar();}}
}
function exportCalendar(){
 const saved=new Set([...library.watchlist,...library.seen,...Object.values(library.progress||{}).filter(p=>p.tracking).map(p=>p.item)].map(keyOf));
 const entries=calendarEntries.filter(e=>e.date.slice(0,7)===calendarFilters.month&&(calendarFilters.stage==='all'||e.kind===calendarFilters.stage||calendarFilters.stage==='episode'&&e.kind==='season')&&(calendarFilters.service==='all'||e.service===calendarFilters.service)&&(calendarFilters.type==='all'||e.item.type===calendarFilters.type)&&(!calendarFilters.saved||saved.has(keyOf(e.item))));
 const events=entries.map(e=>calendarEvent(e.item,e.date,e).split('BEGIN:VEVENT')[1].split('END:VEVENT')[0]);
 download(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//StreamRadar//Calendar//EN',...events.map(e=>'BEGIN:VEVENT'+e+'END:VEVENT'),'END:VCALENDAR',''].join('\r\n'),'streamradar-'+calendarFilters.month+'.ics','text/calendar');
}

function journeyDestination(plan){
 if(!plan)return 'Streaming destination not announced';
 const next=plan.streaming.find(e=>e.date>=today())||plan.streaming.at(-1);
 if(next)return `${next.serviceName} · ${formatDate(next.date)} (listed streaming date)`;
 if(plan.expected)return `Likely ${plan.expected.serviceName} · date not announced (studio-based estimate)`;
 return 'Subscription service and date not announced';
}
function renderUndatedPlans(){
 const target=$('calendar-undated');if(!target)return;
 if(!['all','streaming','theater'].includes(calendarFilters.stage)||calendarFilters.type==='tv'){target.innerHTML='';return;}
 const saved=new Set([...library.watchlist,...library.seen,...Object.values(library.progress||{}).filter(p=>p.tracking).map(p=>p.item)].map(keyOf));
 const pending=[...calendarPlans.values()].filter(({item,plan})=>!plan.streaming.length&&plan.theaterDate&&plan.theaterDate>=shiftedDate(today(),-42)&&plan.theaterDate<=shiftedDate(today(),90)&&(!calendarFilters.saved||saved.has(keyOf(item)))&&(calendarFilters.service==='all'||calendarFilters.service==='theaters'||plan.expected?.service===calendarFilters.service)).sort((a,b)=>a.plan.theaterDate.localeCompare(b.plan.theaterDate));
 target.innerHTML=pending.length?`<h2 class="calendar-day">After theaters · streaming date pending</h2><p class="data-note">These recent/upcoming theatrical movies have no confirmed streaming date. They are kept outside dated calendar events. Studio expectations are estimates, not title-specific announcements.</p>`+pending.map(({item,plan})=>`<article class="journey-pending"><button class="text-button" data-action="movie-journey" data-key="${keyOf(item)}">${esc(item.title)}</button><p>${plan.theaterDate<=today()?'In theaters since':'US theaters'} ${formatDate(plan.theaterDate)}</p><p>${esc(journeyDestination(plan))}</p>${plan.digitalDates.length?`<small>Digital rental / purchase: ${formatDate(plan.digitalDates[0])} · ${esc(formatDigitalQuote(digitalQuotes.get(item.id)))}</small>`:'<small>Digital date and price not announced</small>'}</article>`).join(''):'';
}
let priceRequests=new Map();
async function checkDigitalPrice(id,force=false){
 const hit=digitalQuotes.get(id);if(!force&&hit&&Date.now()-hit.cachedAt<3600000)return hit;
 if(priceRequests.has(id))return priceRequests.get(id);
 const task=json('/api/digital-prices?'+new URLSearchParams({id:String(id)})).catch(()=>({matched:false,status:'unavailable'})).then(quote=>{const saved={...quote,cachedAt:Date.now()};digitalQuotes.set(id,saved);return saved;}).finally(()=>priceRequests.delete(id));priceRequests.set(id,task);return task;
}
function renderMovieJourney(item){
 const target=$('movie-journey'),entry=calendarPlans.get(item.id);if(!target||!entry)return;const plan=entry.plan,quote=digitalQuotes.get(item.id);
 target.innerHTML=`<h2>Theater → Digital → Streaming</h2><p class="data-note">US release windows · all services, whether you subscribe or not.</p><ol class="release-timeline"><li><strong>Theaters</strong><p>${plan.theaterDate?formatDate(plan.theaterDate):'US theatrical date not announced'}</p><small>US theatrical release metadata</small></li><li><strong>Digital rental / purchase</strong><p>${plan.digitalDates.length?plan.digitalDates.map(formatDate).join(' · '):'Digital release date not announced'}</p><small>Listed US digital dates; rental/purchase availability must be confirmed with the store.</small><p>${quote?esc(formatDigitalQuote(quote)):'Checking current digital prices…'}</p>${quote?.matched?`<a class="text-button" href="${esc(quote.url)}" target="_blank" rel="noopener noreferrer">Check Apple TV Store ↗</a><small>Current US store listing checked ${esc(new Date(quote.checkedAt).toLocaleString())}. Prices can change; a future launch price is not confirmed.</small>`:'<small>Separate payment before/instead of subscription streaming. Future prices may not be announced.</small>'}<button class="text-button" data-action="check-price" data-key="${keyOf(item)}">Refresh digital price</button></li><li><strong>Subscription streaming</strong>${plan.streaming.length?plan.streaming.map(event=>`<p>${esc(event.serviceName)} · ${formatDate(event.date)}${event.date<=today()?' · Listed release has passed':''}</p>`).join(''):`<p>${esc(journeyDestination(plan))}</p>`}${plan.expected?`<small>${esc(plan.expected.company)} production credit; US distributor and title-specific rights may differ. No exact date is predicted.</small><a class="text-button" href="${esc(plan.expected.source)}" target="_blank" rel="noopener noreferrer">Streaming-deal source ↗</a>`:'<small>Service-named US release dates or official announcements. Inclusion in a subscription is separate from rental/purchase; confirm current availability below.</small>'}</li></ol>`;
}
async function loadMovieJourney(item,request){
 try{const dates=await api('/movie/'+item.id+'/release_dates');if(!detailSequence.current(request))return;
  const full={...item,release_dates:dates};calendarPlans.set(item.id,{item:full,plan:buildReleasePlan(full)});renderMovieJourney(item);
  void checkDigitalPrice(item.id).then(()=>{if(detailSequence.current(request))renderMovieJourney(item);});
 }catch{if(detailSequence.current(request)&&$('movie-journey'))$('movie-journey').innerHTML='<h2>Theater → Digital → Streaming</h2><p>Could not check release windows. Reopen the title to retry. No dates or prices have been assumed.</p>';}
}

function renderForYou(){
  const seeds=recommendationSeeds(library);
  $('fy-inner').innerHTML=`<div class="filter-row pick-filters"><label for="pick-media">Type<select id="pick-media"><option value="all">Movies & series</option><option value="movie">Movies</option><option value="tv">Series</option></select></label><label for="pick-genre">Genre<select id="pick-genre">${pickGenres.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}</select></label><label for="pick-year">Year<select id="pick-year"><option value="all">Any year</option>${pickYears.map(y=>`<option value="${y}">${y}</option>`).join('')}</select></label></div>${similarSeed?`<p class="similar-context">Similar to <strong>${esc(similarSeed.title)}</strong> <button class="text-button" data-action="clear-similar"${recommending?' disabled':''}>Back to personal picks</button></p>`:''}<fieldset class="pick-services"><legend>My services</legend><p>No selection means any subscription service.</p>${serviceDefinitions.filter(s=>!['all','theaters'].includes(s.id)).map(s=>`<label><input type="checkbox" value="${s.id}" ${pickServices.includes(s.id)?'checked':''} ${recommending?'disabled':''}>${esc(s.label)}</label>`).join('')}</fieldset><div class="pick-actions"><button class="gen-btn" data-action="recommend"${recommending?' disabled':''}>${recommending?'Finding picks…':'Refresh picks'}</button> <button class="gen-btn ai-picks-button" data-action="ai-recommend"${recommending||!accountState.user?' disabled':''}>Get AI picks</button></div><p class="data-note">${accountState.user?'Optional AI: sends a limited selection of your saved titles and ratings to an AI provider. Your email is not sent. Optional; regular picks are always available.':'Sign in to try optional AI picks based on your private library.'}</p><p class="data-note" role="status">${esc(aiNotice)}</p><p class="data-note">${similarSeed?'Suggestions based on this title.':seeds.length?'Picks based on your ratings and watchlist. Ratings carry more weight; low ratings reduce similar genres.':'Pick a type and genre to discover titles. Rate favorites 4–5 stars for personal recommendations.'} Year means the movie release or series premiere. Filters apply when you refresh. Not interested choices are saved with your library.</p>`+unseenTitles(library.recs,library,true).filter(isEnglish).filter(x=>!(library.dismissed||[]).includes(keyOf(x))).map(item=>{
    const saved=library.watchlist.some(x=>keyOf(x)===keyOf(item));
    return `<article class="rec-card">${card(item)}<p class="rec-why">${esc(item.reason||'A title to explore.')}</p><div class="rec-actions"><button class="text-button" data-action="watch" data-key="${keyOf(item)}" aria-pressed="${saved}">${saved?'Remove from watchlist':'Add to watchlist'}</button><button class="text-button" data-action="dismiss" data-key="${keyOf(item)}">Not interested</button><button class="text-button" data-action="seen" data-key="${keyOf(item)}">Seen It</button></div>${ratingControl(item)}</article>`;
  }).join('');
  $('pick-year').value=pickYear;$('pick-year').disabled=recommending;$('pick-year').addEventListener('change',e=>{pickYear=e.target.value;try{persistPreferences();}catch{toast('Could not save filter preferences.');}});
  document.querySelectorAll('.pick-services input').forEach(el=>el.addEventListener('change',()=>{pickServices=[...document.querySelectorAll('.pick-services input:checked')].map(x=>x.value);try{persistPreferences();}catch{toast('Could not save filter preferences.');}}));
  $('pick-media').value=pickMedia;$('pick-genre').value=pickGenre;
  $('pick-media').disabled=recommending||!!similarSeed;$('pick-genre').disabled=recommending;
  $('pick-media').addEventListener('change',e=>{pickMedia=e.target.value;if(pickMedia==='tv'&&pickGenre==='indie'){pickGenre='all';$('pick-genre').value='all';}try{persistPreferences();}catch{toast('Could not save filter preferences.');}});
  $('pick-genre').addEventListener('change',e=>{pickGenre=e.target.value;if(pickGenre==='indie'){pickMedia='movie';$('pick-media').value='movie';}try{persistPreferences();}catch{toast('Could not save filter preferences.');}});
}
let recommending=false,aiNotice='';
async function recommend(useAI=false){
  if(recommending)return;
  if(useAI&&!accountState.user){toast('Sign in to use AI picks.');return;}
  recommending=true;aiNotice=useAI?'Finding titles for AI to compare…':'';
  const chosenMedia=pickMedia,chosenGenre=pickGenre,chosenYear=pickYear,chosenServices=[...pickServices],selectedSeed=similarSeed,accountEpoch=accountState.epoch,sourceLibrary=structuredClone(library);
  try{persistPreferences();}catch{toast('Preferences could not be saved; using them for these picks.');}renderForYou();
  try{
    const seeds=selectedSeed?[selectedSeed]:recommendationSeeds(sourceLibrary,chosenMedia);
    const excluded=new Set([...library.watchlist,...library.seen,...seeds].map(keyOf).concat(library.dismissed||[]));
    const requests=seeds.flatMap(seed=>['recommendations','similar'].map(endpoint=>({seed,endpoint})));
    const batches=await mapLimit(requests,3,async({seed,endpoint})=>{
      const d=await api('/'+seed.type+'/'+seed.id+'/'+endpoint);
      return (d.results||[]).map(x=>normalize(x,seed.type)).filter(isEnglish).map(x=>({...x,relatedTo:keyOf(seed),affinity:(endpoint==='recommendations'?4:2)*(seed.seedWeight||3)/3,reason:selectedSeed?'Similar to '+seed.title:seed.seedReason==='watchlist'?'Because '+seed.title+' is on your watchlist':'Because you rated '+seed.title+' '+sourceLibrary.ratings[keyOf(seed)]+'/5'}));
    });
    const related=batches.filter(Array.isArray).flat();
    if(accountState.epoch!==accountEpoch)return;
    // Explicit similarity never falls back to unrelated popular discoveries.
    const types=selectedSeed?[]:chosenMedia==='all'?['movie','tv']:[chosenMedia];
    const discoveries=await mapLimit(types,2,async media=>{
      const p=new URLSearchParams({language:'en-US',watch_region:'US',with_watch_monetization_types:'flatrate',sort_by:'popularity.desc',page:'1'});
      const dateField=media==='tv'?'first_air_date':'primary_release_date';
      p.set(dateField+'.lte',chosenYear==='all'?today():[chosenYear+'-12-31',today()].sort()[0]);
      if(chosenYear!=='all')p.set(dateField+'.gte',chosenYear+'-01-01');
      const providers=await api('/watch/providers/'+media+'?watch_region=US');
      p.set('with_watch_providers',[...new Set((chosenServices.length?chosenServices:['all']).flatMap(s=>providerIds(providers.results||[],s)))].join('|'));
      const keyword=pickKeyword(chosenGenre,media);
      if(keyword)p.set('with_keywords',keyword);else if(chosenGenre!=='all')p.set('with_genres',pickGenreIds(chosenGenre,media));
      const d=await api('/discover/'+media+'?'+p);
      return (d.results||[]).map(x=>normalize(x,media)).filter(isEnglish).map(x=>({...x,...(keyword?{keywords:{keywords:[{id:keyword}]}}:{}),affinity:0,reason:'A US streaming discovery matching your filters'}));
    });
    if([...batches,...discoveries].length&&[...batches,...discoveries].every(x=>x._error))throw new Error('Picks are temporarily unavailable. Please retry.');
    const prior=new Set(library.recs.map(keyOf));
    let candidates=rankRecommendations([...related,...discoveries.filter(Array.isArray).flat()],seeds,prior,selectedSeed?{}:tasteProfile(sourceLibrary)).filter(x=>!excluded.has(keyOf(x))&&isEnglish(x)&&matchesPickYear(x,chosenYear)&&(chosenMedia==='all'||x.type===chosenMedia)&&x.date&&x.date<=today());
    const checked=await mapLimit(candidates.slice(0,70),4,async item=>{
      if(accountState.epoch!==accountEpoch)return null;
      // Recommendation responses omit keywords: hydrate before checking TV horror/thriller or indie.
      const full=pickKeyword(chosenGenre,item.type)?{...item,...normalize(await api('/'+item.type+'/'+item.id+'?append_to_response=keywords'),item.type)}:item;
      if(!matchesPick(full,chosenMedia,chosenGenre))return null;
      const data=await api('/'+item.type+'/'+item.id+'/watch/providers');
      const offers=pickSubscriptionOffers(withVerifiedUSOffers(item,data.results?.US||{}),chosenServices);if(!offers.length)return null;
      return {...full,reason:item.reason+'. Included with '+[...new Set(offers.map(p=>p.provider_name))].join(', ')+'.'};
    });
    if(checked.length&&checked.every(x=>x?._error))throw new Error('Could not check streaming availability. Please retry.');
    let picks=checked.filter(x=>x&&!x._error&&!(library.dismissed||[]).includes(keyOf(x))&&!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.watchlist.some(s=>keyOf(s)===keyOf(x))).slice(0,12);
    if(accountState.epoch!==accountEpoch)return;
    if(useAI&&picks.length){
      try{
        const cloud=accountState.cloud;
        await cloud?.sync();
        if(accountState.epoch!==accountEpoch)return;
        if(!cloud?.ready||Object.keys(cloud.pending).length)throw new Error('Sync your saved titles first, then try AI picks again.');
        const {data:{session}}=await accountClient.auth.getSession();
        if(!session)throw new Error('Sign in to use AI picks.');
        const pool=checked.filter(x=>x&&!x._error&&!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.watchlist.some(s=>keyOf(s)===keyOf(x))&&!(library.dismissed||[]).includes(keyOf(x))).slice(0,24);
        aiNotice='AI is comparing titles with your ratings and watchlist…';if(route.view==='foryou')renderForYou();
        const response=await fetch('/api/ai-picks',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({candidates:pool.map(keyOf)}),signal:AbortSignal.timeout(85000)});
        const result=await response.json();
        if(accountState.epoch!==accountEpoch)return;
        if(!response.ok)throw new Error(result.error||'AI picks are unavailable.');
        const allowed=new Map(pool.map(x=>[keyOf(x),x])),used=new Set();
        if(!Array.isArray(result.picks)||!result.picks.length||result.picks.length>12)throw new Error('AI returned an invalid selection.');
        const aiPicks=result.picks.map(p=>{
          if(!allowed.has(p.key)||used.has(p.key)||typeof p.reason!=='string'||p.reason.length>240)throw new Error('AI returned an invalid selection.');
          used.add(p.key);const item=allowed.get(p.key);
          const availability=item.reason.match(/Included with .*$/)?.[0]||'';
          return {...item,reason:'AI pick: '+p.reason+' '+availability};
        });
        picks=aiPicks;aiNotice='AI picks based on your saved titles and ratings. Regular Refresh picks is always available.';
      }catch(e){if(accountState.epoch!==accountEpoch)return;aiNotice=(e.name==='TimeoutError'?'AI took too long.':e.message)+' Showing regular picks.';}
    }
    if(accountState.epoch!==accountEpoch)return;
    picks=picks.filter(x=>!library.seen.some(s=>keyOf(s)===keyOf(x))&&!library.watchlist.some(s=>keyOf(s)===keyOf(x))&&!(library.dismissed||[]).includes(keyOf(x)));
    save({...library,recs:picks,recommendationSeed:selectedSeed});picks.forEach(remember);if(!picks.length)toast('No unseen streaming matches. Try Any year, another genre, or more services.');
  }catch(e){toast(e.message);}finally{recommending=false;if(route.view==='foryou')renderForYou();}
}
function download(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
  const a=b.dataset.action,key=b.dataset.key;
  try{
    if(a==='calendar-detail'){const entry=calendarEntries.find(x=>x.key===key);if(entry){remember({...entry.item,calendarEvent:{date:entry.date,kind:entry.kind,label:entry.label,service:entry.service,source:entry.source,season:entry.season,episode:entry.episode}});showRoute({view:'detail',key:keyOf(entry.item)});}}else if(a==='movie-journey'){const plan=calendarPlans.get(Number(key.split(':')[1]));if(plan){remember(plan.item);showRoute({view:'detail',key:keyOf(plan.item)});}}else if(a==='check-price'){await checkDigitalPrice(Number(key.split(':')[1]),true);if(route.view==='calendar')renderCalendar();else if(route.view==='detail'&&detailItem?.type==='movie')renderMovieJourney(detailItem);}else if(a==='calendar-refresh'){await loadStreamingCalendar(true);}else if(a==='calendar-more'){await loadStreamingCalendar(false);}else if(a==='calendar-export'){exportCalendar();}else if(a==='calendar-event'){const event=calendarEntries.find(x=>x.key===key);if(event)download(calendarEvent(event.item,event.date,event),'streamradar-event.ics','text/calendar');}
    else if(a==='episodes-caught-up'){const item=items.get(key);save(setEpisodeProgress(library,item,episodeItems.filter(e=>e.air_date&&e.air_date<=today()),true));renderEpisodes(item);toast('Episode progress saved.');}
    else if(a==='change-zip'){const panel=b.closest('[data-theater-scope]');panel.innerHTML=theaterPanelHTML(panel.dataset.theaterScope,true);panel.querySelector('input').focus();}
    else if(a==='detail')showRoute({view:'detail',key});else if(a==='actor')showRoute({view:'actor',id:Number(b.dataset.id)});
    else if(a==='upcoming')showRoute({view:'calendar'});else if(['home','watchlist','foryou','about'].includes(a))showRoute({view:a});else if(a==='back')goBack();
    else if(['watch','seen','remove-seen','rate','dismiss'].includes(a))mutate(a,key,Number(b.dataset.stars));
    else if(a==='service'){service=b.dataset.service;network='all';if(service==='theaters'){type='movie';kind='movie';}renderServices();loadCatalog();}
    else if(a==='type'){type=b.dataset.type;renderServices();loadCatalog();}
    else if(a==='clear-search')clearSearch();else if(a==='retry-search')search($('home-search-input').value.trim());
    else if(a==='retry-catalog')loadCatalog();else if(a==='more'&&!loading)loadCatalog(true);
    else if(a==='retry-detail')loadDetail(route.key);else if(a==='retry-actor')loadActor(route.id);
    else if(a==='retry-offers')loadOffers(detailItem,detailSequence.value());else if(a==='retry-scores')loadScores(detailItem,detailSequence.value());
    else if(a==='wl-tab'){wlTab=b.dataset.tab;renderWatchlist();}else if(a==='recommend')await recommend();else if(a==='ai-recommend')await recommend(true);
    else if(a==='similar'){if(recommending)return;similarSeed=items.get(key);if(!similarSeed)return;pickMedia=similarSeed.type;pickGenre='all';pickYear='all';save({...library,recs:[],recommendationSeed:similarSeed});showRoute({view:'foryou'});await recommend();}
    else if(a==='clear-similar'){if(recommending)return;similarSeed=null;save({...library,recs:[],recommendationSeed:null});await recommend();}
    else if(a==='calendar'){const item=items.get(key);download(calendarEvent(item,resolvedEvent(item)?.date,resolvedEvent(item)),'streamradar-event.ics','text/calendar');toast('Open the calendar file to add your reminder.');}
    else if(a==='export')download(JSON.stringify(library,null,2),'streamradar-backup.json','application/json');
    else if(a==='legacy-import')await importLegacy();
    else if(a==='install'){if(installPrompt){await installPrompt.prompt();installPrompt=null;}else toast('Use your browser’s Install app or Add to Home Screen option.');}
  }catch(e){toast(e.message||'That action could not be completed.');}
});
$('calendar-service').innerHTML='<option value="all">All services (owned or not)</option><option value="digital">Digital rental / purchase</option><option value="theaters">Theaters</option>'+serviceDefinitions.filter(s=>!['all','theaters'].includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.label)}</option>`).join('');
for(const [id,field] of [['calendar-month','month'],['calendar-service','service'],['calendar-type','type'],['calendar-stage','stage']])$(id).addEventListener('change',event=>{calendarFilters[field]=event.target.value;renderCalendar();});
$('calendar-saved').addEventListener('change',event=>{calendarFilters.saved=event.target.checked;renderCalendar();});
for(const [id,field] of [['wl-search','query'],['wl-type','type'],['wl-service','service'],['wl-status-filter','status'],['wl-sort','sort']])$(id).addEventListener(field==='query'?'input':'change',event=>{watchFilters[field]=event.target.value;renderWatchlist();});
$('wl-service').innerHTML='<option value="all">All services</option>'+serviceDefinitions.filter(s=>!['all','theaters'].includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.label)}</option>`).join('');
document.addEventListener('change',event=>{
 const checkbox=event.target;if(checkbox.dataset.followSeries){const item=items.get(checkbox.dataset.followSeries);try{const next=setEpisodeProgress(library,item,[]);next.progress[keyOf(item)].tracking=checkbox.checked;save(next);toast(checkbox.checked?'Following series.':'Series unfollowed.');}catch(e){checkbox.checked=!checkbox.checked;toast(e.message);}}
 if(checkbox.dataset.episode){const item=items.get(checkbox.dataset.key),ep=episodeItems.find(e=>e.season_number+':'+e.episode_number===checkbox.dataset.episode);try{save(setEpisodeProgress(library,item,[ep],checkbox.checked));const follow=document.querySelector('[data-follow-series]');if(follow)follow.checked=true;$('episode-summary').textContent=`${Object.values(library.progress[keyOf(item)].episodes).filter(Boolean).length} episodes watched across this series`; }catch(e){checkbox.checked=!checkbox.checked;toast(e.message);}}
});
window.addEventListener('storage',event=>{
 if(!event.key?.startsWith('sr_'))return;
 try{if(accountState.user){accountState.cloud.reconcile();}else{loadLibrary();if(route.view==='home')renderActiveHome();else if(route.view==='watchlist')renderWatchlist();else if(route.view==='detail'){renderDetailActions();if(detailItem?.type==='tv')renderEpisodes(detailItem);}}}catch{toast('Could not refresh changes from another tab. Your saved operations remain on this device.');}
});
$('hide-watched').checked=hideWatched;
$('hide-watched').addEventListener('change',()=>{const prior=hideWatched;hideWatched=$('hide-watched').checked;try{persistPreferences();refreshHome();}catch{hideWatched=prior;$('hide-watched').checked=prior;toast('Could not save your preference.');}});
$('home-search-input').addEventListener('input',onSearch);
$('home-search-input').addEventListener('keydown',e=>{if(e.key==='Escape'){clearSearch();}if(e.key==='Enter'){clearTimeout(searchTimer);search($('home-search-input').value.trim());}});

$('catalog-scope').addEventListener('change',()=>{scope=$('catalog-scope').value;try{persistPreferences();}catch{toast('Could not save catalog preference.');}renderServices();loadCatalog();});
$('when').addEventListener('change',()=>{when=$('when').value;network='all';renderServices();loadCatalog();});
$('network').addEventListener('change',()=>{network=$('network').value;if(network!=='all'){type='tv';kind='tv';}renderServices();loadCatalog();});
$('genre').innerHTML=browseGenres.map(g=>`<option value="${g.id}">${esc(g.label)}</option>`).join('');
$('genre').addEventListener('change',()=>{genre=$('genre').value;if(genre==='doc'&&kind==='movie')kind='doc';try{persistPreferences();}catch{toast('Could not save genre preference.');}renderServices();loadCatalog();});
$('kind').addEventListener('change',()=>{kind=$('kind').value;if(kind==='movie'&&genre==='doc')genre='all';if(kind==='movie'&&network!=='all')network='all';renderServices();loadCatalog();});
$('import-backup').addEventListener('change',async e=>{
  try{const accountEpoch=accountState.epoch;const file=e.target.files[0];if(!file)return;if(file.size>5_000_000)throw new Error('Backup is too large.');const imported=validLibrary(JSON.parse(await file.text()));if(accountState.epoch!==accountEpoch)throw new Error('Account changed. Select the backup again for the intended account.');const merge=(a,b)=>[...new Map([...a,...b].map(x=>[keyOf(x),x])).values()];save({...mergeGuestLibrary(library,imported),recs:library.recs.filter(x=>!imported.dismissed.includes(keyOf(x)))});[...library.watchlist,...library.seen].forEach(remember);renderWatchlist();toast('Backup merged with your library.');}catch(e){toast(e.message);}finally{e.target.value='';}
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
const updateNetworkStatus=()=>{$('offline').hidden=navigator.onLine;};window.addEventListener('online',updateNetworkStatus);window.addEventListener('offline',updateNetworkStatus);updateNetworkStatus();
loadLibrary();similarSeed=library.recommendationSeed||null;renderServices();loadCatalog();if(initialRoute.view!=='home')showRoute(initialRoute,false);
await importLegacy();
mountAccounts({readGuest:()=>{const saved=readJSON('sr_library_v2',null);return readGuestLibrary(localStorage,saved?validLibrary(saved):migrateLegacy(readJSON('sr_wl',[]),readJSON('sr_seen',[]),readJSON('sr_ratings',{})));},validateLibrary:validLibrary,toast,setLibrary:next=>{
  library=next;if(metadataEpoch!==accountState.epoch){metadataEpoch=accountState.epoch;watchMetadata.clear();calendarPlans.clear();calendarEntries=[];calendarLoaded=false;calendarRun++;calendarBusy=false;}similarSeed=next.recommendationSeed||null;[...library.watchlist,...library.seen,...library.recs].forEach(remember);
  if(route.view==='watchlist')renderWatchlist();else if(route.view==='foryou')renderForYou();else if(route.view==='detail'){renderDetailActions();if(detailItem?.type==='tv')renderEpisodes(detailItem);}else if(route.view==='home')renderActiveHome();else if(route.view==='calendar')renderCalendar();
}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
