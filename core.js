export const keyOf = (item) => `${item.type || item.media_type}:${item.id}`;
// Dracula (2025) is English-language despite TMDB's French production-language tag.
// Keep this correction tied to movie identity; do not admit unrelated French titles.
export const isEnglish = item => item?.original_language === 'en' || ((item?.type || item?.media_type) === 'movie' && Number(item.id) === 1246049);
export function parseRoute(hash){
  const match=/^#detail\/(movie|tv):(\d+)$/.exec(hash);if(match&&Number(match[2])>0)return {view:'detail',key:match[1]+':'+match[2]};
  const actor=/^#actor\/(\d+)$/.exec(hash);if(actor&&Number(actor[1])>0)return {view:'actor',id:Number(actor[1])};
  const view=hash.replace(/^#/,'');return {view:['home','watchlist','foryou','calendar','about'].includes(view)?view:'home'};
}
export function normalize(item, type) {
  const media = type || item.type || item.media_type || item._type;
  if (!['movie','tv'].includes(media) || !Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0) return null;
  return {...item, id:Number(item.id), type:media, title:String(item.title || item.name || 'Untitled'), poster:item.poster || item.poster_path || '', date:item.date || item.release_date || item.first_air_date || ''};
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Date unknown';
  const date = new Date(value + 'T12:00:00Z');
  return Number.isNaN(date.valueOf()) ? 'Date unknown' : date.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
export const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function isStandup(item) {
  const keywords = item.keywords?.keywords || item.keywords?.results || [];
  return keywords.some(k => k.id===9716 || /^(stand-up comedy|stand up comedy|stand-up special|standup comedy)$/i.test(k.name)) || /\bstand[- ]?up (comedy|special|performance)|\bcomedy special\b/i.test(item.title || item.name || '');
}
export function isNarrativeMovie(item){return (item.type||item.media_type)==='movie'&&!(item.genre_ids||[]).includes(99)&&!(item.genres||[]).some(g=>g.id===99)&&!isStandup(item);}
export function episodeLabelsAllowed(item){return !item.catalogService||item.catalogService==='all'||isOriginalSeries(item,item.catalogService);}
export function seasonDropDate(episodeCount,episodes){
  if(!Number.isInteger(episodeCount)||episodeCount<2||!Array.isArray(episodes))return null;
  const numbered=episodes.filter(e=>Number.isInteger(e.episode_number)&&e.episode_number>0);
  if(numbered.length!==episodeCount||new Set(numbered.map(e=>e.episode_number)).size!==episodeCount)return null;
  const date=numbered[0].air_date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||numbered.some(e=>e.episode_number>episodeCount||e.air_date!==date))return null;
  return date;
}
export function releaseMilestone(item,now=today()) {
  if(item?.type!=='tv'||!episodeLabelsAllowed(item))return null;
  const ep=item.last_episode_to_air;
  const season=(item.seasons||[]).find(s=>s.season_number===ep?.season_number);
  const date=seasonDropDate(season?.episode_count,item.releaseSeasonEpisodes);
  if(date&&date<=now&&date>=shiftedDate(now,-90))return {text:'ALL EPISODES RELEASED',date,kind:'season'};
  return null;
}
export function contentLabels(item, now=today()) {
  const labels=[];
  if(isStandup(item))labels.push({kind:'standup',text:'STAND-UP'});
  if((item.genre_ids||item.genres?.map(g=>g.id)||[]).includes(99))labels.push({kind:'doc',text:'DOC'});
  // Series-level offers cannot establish which seasons or episodes a service carries.
  if(item.catalogService && item.catalogService!=='all' && !isOriginalSeries(item,item.catalogService))return labels;
  const premiereCutoff=shiftedDate(now,-6);
  const season=(item.seasons||[]).filter(s=>s.season_number>1&&s.air_date&&s.air_date<=now&&s.air_date>=premiereCutoff).sort((a,b)=>b.air_date.localeCompare(a.air_date))[0];
  const lastEpisode=item.last_episode_to_air;
  const secondEpisodeAired=season && (
    (lastEpisode?.season_number===season.season_number && lastEpisode.episode_number>=2 && lastEpisode.air_date<=now) ||
    (item.releaseSeasonEpisodes||[]).some(e=>e.episode_number>=2&&e.air_date&&e.air_date<=now&&lastEpisode?.season_number===season.season_number)
  );
  if(season&&!secondEpisodeAired&&!releaseMilestone(item,now))labels.push({kind:'season',text:'SEASON PREMIERE',description:`Season ${season.season_number} premiered ${formatDate(season.air_date)}; streaming availability may vary.`});
  const episode=item.last_episode_to_air, week=new Date(now+'T12:00:00Z');week.setUTCDate(week.getUTCDate()-7);
  const weekday=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}).toUpperCase()+' '+Number(date.slice(5,7))+'/'+Number(date.slice(8,10));
  const next=item.next_episode_to_air;
  if(next?.season_number>0&&next?.episode_number>0&&next?.air_date>=now&&next.air_date<=shiftedDate(now,7))labels.push({kind:'next',text:`NEXT EP · ${weekday(next.air_date)}`,description:`S${next.season_number} E${next.episode_number} expected ${formatDate(next.air_date)}; streaming availability may vary.`});
  else if(episode?.season_number>0&&episode?.episode_number>0&&episode.air_date<=now&&episode.air_date>=week.toISOString().slice(0,10))labels.push({kind:'episode',text:`NEW EP · AIRED ${weekday(episode.air_date)}`,description:`S${episode.season_number} E${episode.episode_number} aired ${formatDate(episode.air_date)}; streaming availability may vary.`});
  return labels;
}
export function activityDate(item,now=today()){
  const dates=[item.date,item.streamingDate];
  if(item.type==='tv'&&(!item.catalogService||item.catalogService==='all'||isOriginalSeries(item,item.catalogService)))dates.push(item.last_episode_to_air?.season_number>0?item.last_episode_to_air.air_date:null,...(item.seasons||[]).filter(s=>s.season_number>0).map(s=>s.air_date));
  return dates.filter(d=>d&&d<=now).sort().at(-1)||item.date||'';
}
export function recentActivityFirst(a,b){return activityDate(b).localeCompare(activityDate(a))||newestFirst(a,b);}
export function normalizeZip(value){const zip=typeof value==='string'?value.trim():'';return /^\d{5}$/.test(zip)&&zip!=='00000'?zip:'';}
export function theaterURL(value){const zip=normalizeZip(value);return zip?'https://www.fandango.com/'+zip+'_movietimes':'';}
export const networkIds={food:'143',discovery:'64'};
export const originalNetworks={apple:'2552',netflix:'213',prime:'1024',disney:'2739|453',peacock:'3353',paramount:'4330|67|6631',max:'49|3186',starz:'318',mgm:'6219|922'};
// Network affiliations identify series; movie premieres need separate release evidence.
export const originalsOnlyServices=Object.keys(originalNetworks);
export const originalMovieServices=originalsOnlyServices;
export function originalServices(service){return service==='all'?originalsOnlyServices:[service];}
export function matchesOriginalSeries(item,service){return originalServices(service).some(id=>isOriginalSeries(item,id));}
const movieOriginalEvidence={
 netflix:{host:/^(?:www\.)?netflix\.com$/,name:/\bnetflix\b/i},
 prime:{host:/^(?:www\.)?(?:amazon\.com|primevideo\.com)$/,name:/\b(?:amazon|prime video)\b/i},
 disney:{host:/^(?:www\.)?(?:disneyplus\.com|hulu\.com)$/,name:/\b(?:hulu|disney\s*(?:\+|plus))/i},
 peacock:{host:/^(?:www\.)?peacocktv\.com$/,name:/\bpeacock\b/i},
 paramount:{host:/^(?:www\.)?(?:paramountplus\.com|sho\.com)$/,name:/(?:\bparamount\s*(?:\+|plus)|\bshowtime\b)/i},
 apple:{host:/^tv\.apple\.com$/,name:/\bapple tv(?:\s*(?:\+|plus))?/i},
 max:{host:/^(?:www\.)?(?:max\.com|hbomax\.com)$/,name:/\b(?:hbo(?: max)?|max)\b/i},
 starz:{host:/^(?:www\.)?starz\.com$/,name:/\bstarz\b/i},
 mgm:{host:/^(?:www\.)?(?:mgmplus\.com|epix\.com)$/,name:/(?:\bmgm\s*(?:\+|plus)|\bepix\b)/i}
};
export function officialMovieService(item,service){
 try{const u=new URL(item.homepage);return u.protocol==='https:'&&movieOriginalEvidence[service]?.host.test(u.hostname)&&u.pathname!=='/';}catch{return false;}
}
export function matchesOriginalMovie(item,service,when='now',now=today()){
 return originalServices(service).some(id=>isOriginalMovie(item,id)||(when==='soon'&&(item.date||item.release_date)>now&&officialMovieService(item,id)));
}
// Only service-named US digital releases count as arrivals: an unlabelled VOD
// date or an official homepage alone cannot establish a subscription start date.
export function streamingArrival(item,service,now=today()){
 const services=originalServices(service);
 const dates=(item.release_dates?.results||[]).find(r=>r.iso_3166_1==='US')?.release_dates||[];
 const namedService=note=>!/\b(?:rent(?:al)?|purchase|buy|pvod|tvod|est|vod|store)\b/i.test(note)&&services.some(id=>{
  const name=id==='prime'?/\b(?:amazon prime(?: video)?|prime video)\b/i:id==='apple'?/\bapple tv\s*(?:\+|plus)/i:movieOriginalEvidence[id]?.name;
  return name?.test(note);
 });
 const candidates=dates.filter(r=>r.type===4&&namedService(r.note||'')).map(r=>r.release_date?.slice(0,10));
 candidates.push(...activeVerifiedOffers(now).filter(x=>keyOf(x)===keyOf(item)&&services.includes(x.service)).map(x=>x.start));
 return candidates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&d>=shiftedDate(now,-90)&&d<=now).sort().at(-1)||null;
}
export function streamingArrivalQuery(options,now=today()){
 const params=catalogQuery({...options,type:'movie'},now);
 params.delete('primary_release_date.lte');params.delete('primary_release_date.gte');
 params.set('region','US');params.set('with_release_type','4');
 params.set('release_date.gte',shiftedDate(now,-90));params.set('release_date.lte',now);
 params.set('sort_by','popularity.desc');
 return params;
}
export const realityGenres=[10764,10767];
export function isRealityTV(item){return (item.type||item.media_type)==='tv'&&(item.genre_ids||item.genres?.map(g=>g.id)||[]).some(id=>realityGenres.includes(id));}
export function matchesReality(item,filter='exclude'){return filter==='include'||(filter==='only'?isRealityTV(item):!isRealityTV(item));}
export const catalogBatchTarget=36;
export const catalogScanLimit=6;
export function isOriginalSeries(item,service){
  const first=item.first_air_date||item.date;
  // Prime's network list can include subsequently acquired/syndicated shows.
  if(service==='prime'&&first&&first<'2013-04-19')return false;
  const broadcast=service==='paramount'?16:service==='peacock'?6:null;
  const launch=service==='paramount'?'2014-10-28':'2020-07-15';
  // Network lists include later syndication. Reject pre-service broadcast premieres,
  // but retain streaming originals subsequently aired on a broadcast network.
  if(broadcast&&(item.networks||[]).some(n=>n.id===broadcast)&&(!(item.first_air_date||item.date)||(item.first_air_date||item.date)<launch))return false;
  const ids=(originalNetworks[service]||'').split('|').map(Number);
  return (item.networks||[]).some(n=>ids.includes(n.id));
}
export function isOriginalMovie(item,service){
  if(!originalMovieServices.includes(service))return false;
  const releases=(item.release_dates?.results||[]).find(r=>r.iso_3166_1==='US')?.release_dates||[];
  const dated=releases.filter(r=>/^\d{4}-\d{2}-\d{2}/.test(r.release_date||''));
  const digital=dated.filter(r=>r.type===4).sort((a,b)=>a.release_date.localeCompare(b.release_date));
  if(!digital.length)return false;
  const first=digital[0].release_date.slice(0,10);
  const debut=digital.filter(r=>r.release_date.slice(0,10)===first);
  const name=movieOriginalEvidence[service].name;
  const officialHomepage=officialMovieService(item,service);
  const identified=debut.some(r=>name.test(r.note||''))||(officialHomepage&&debut.every(r=>/^(?:internet|digital|streaming)?$/i.test((r.note||'').trim())));
  if(!identified)return false;
  // A later subscription window is not an original premiere. Allow a short awards run.
  return !dated.some(r=>r.release_date.slice(0,10)<first&&(r.type===3||r.type===5||r.type===6||(r.type===2&&r.release_date.slice(0,10)<shiftedDate(first,-31))));
}
export function shiftedDate(now,days){const d=new Date(now+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function catalogQuery({type='movie',service='all',when='now',network='all',kind='all',genre='all',page=1,ids=[],scope='originals',reality='exclude'},now=today()){
  const params=new URLSearchParams({language:'en-US',with_original_language:'en',page});
  if(service==='theaters'){
    params.set('region','US');params.set('with_release_type','2|3');
    params.set('release_date.gte',shiftedDate(now,when==='soon'?1:-42));params.set('release_date.lte',shiftedDate(now,when==='soon'?90:0));
    // Retrieve new openings first, then sort by the verified US theatrical date.
    params.set('sort_by',when==='soon'?'popularity.desc':'primary_release_date.desc');
    if(when==='soon')params.set('primary_release_date.gte',shiftedDate(now,-180));
  }else if(when==='soon'){
    const field=type==='tv'?'first_air_date':'primary_release_date';
    params.set(field+'.gte',shiftedDate(now,1));params.set(field+'.lte',shiftedDate(now,90));params.set('sort_by',field+'.asc');
    // Original-production affiliations are not promised streaming arrival dates.
    if(scope==='originals'&&service!=='all'){
      if(type==='tv'&&originalNetworks[service])params.set('with_networks',originalNetworks[service]);
      else if(type==='movie'&&service==='netflix')params.set('sort_by','popularity.desc');
      else if(type==='movie'&&service==='apple')params.set('with_companies','194232');
      // Future originals need no current subscription offer. Verify details after discovery.
      else params.set('sort_by','popularity.desc');
    }else if(service!=='all'){params.set('watch_region','US');params.set('with_watch_providers',ids.join('|'));params.set('with_watch_monetization_types','flatrate');}
  }else{
    for(const [key,value] of Object.entries(discoveryOrder(type,now)))params.set(key,value);
    params.set('watch_region','US');params.set('with_watch_providers',ids.join('|'));params.set('with_watch_monetization_types',service==='all'?'flatrate|free|ads':'flatrate');
    if(service==='max'&&type==='tv'&&networkIds[network])params.set('with_networks',networkIds[network]);
  }
  if(type==='tv'&&service!=='theaters'&&scope==='originals'){
    const networks=service==='all'?[...new Set(originalsOnlyServices.flatMap(id=>originalNetworks[id].split('|')))].join('|'):originalNetworks[service];
    if(networks)params.set('with_networks',service==='max'&&networkIds[network]?networkIds[network]:networks);
  }
  if(type==='tv'){
    if(reality==='exclude')params.set('without_genres',realityGenres.join(','));
    if(reality==='only')params.set('with_genres',realityGenres.join('|'));
  }
  if(kind==='doc')params.set('with_genres',[params.get('with_genres'),'99'].filter(Boolean).join(','));if(kind==='standup')params.set('with_keywords','9716');
  if(kind==='movie'){params.set('without_genres','99');params.set('without_keywords','9716');}
  const filter=browseGenreFilter(genre,type);
  if(filter.genres)params.set('with_genres',[params.get('with_genres'),filter.genres].filter(Boolean).join(','));
  if(filter.keyword)params.set('with_keywords',[params.get('with_keywords'),filter.keyword].filter(Boolean).join(','));
  return params;
}
export function upcomingPremiere(item,now=today()){
  const end=shiftedDate(now,90),inWindow=d=>d>now&&d<=end;
  const first=item.first_air_date||item.date;
  if(inWindow(first))return {date:first,season:1};
  const candidates=(item.seasons||[]).filter(s=>s.season_number>1&&inWindow(s.air_date)).map(s=>({date:s.air_date,season:s.season_number}));
  const next=item.next_episode_to_air;
  if(next?.season_number>1&&next.episode_number===1&&inWindow(next.air_date)){
    const i=candidates.findIndex(s=>s.season===next.season_number);if(i>=0)candidates.splice(i,1);
    candidates.push({date:next.air_date,season:next.season_number});
  }
  return candidates.sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
}
export function upcomingSeasonQuery(options,now=today()){
  const params=catalogQuery({...options,type:'tv',when:'soon'},now);
  params.delete('first_air_date.gte');params.set('first_air_date.lte',now);
  params.set('air_date.gte',shiftedDate(now,1));params.set('air_date.lte',shiftedDate(now,90));params.set('sort_by','popularity.desc');
  return params;
}
export function newestFirst(a,b){return (b.date||'').localeCompare(a.date||'')||keyOf(a).localeCompare(keyOf(b));}
export function theaterNewestFirst(a,b){return (b.theaterDate||'').localeCompare(a.theaterDate||'')||(b.popularity||0)-(a.popularity||0)||newestFirst(a,b);}
export function discoveryOrder(type, now=today()) {
  return type==='tv'?{sort_by:'first_air_date.desc','first_air_date.lte':now}:{sort_by:'primary_release_date.desc','primary_release_date.lte':now};
}
export function calendarEvent(item, date, event=null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('No confirmed date is available.');
  const clean = s => String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m);
  const end = new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//StreamRadar//Release Calendar//EN','BEGIN:VEVENT',`UID:${keyOf(item)}-${date}${event?'-'+[event.kind,event.service,event.season,event.episode].filter(Boolean).join('-'):''}@streamradar`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z')}`,`DTSTART;VALUE=DATE:${date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`,`SUMMARY:${clean(item.title+(event?.label?' — '+event.label:''))}`,`DESCRIPTION:${clean(event?event.source+'; '+(serviceDefinitions.find(s=>s.id===event.service)?.label||'Service availability unconfirmed'):'Episode or original release date from TMDB; streaming arrival may differ.')}`,'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY',`DESCRIPTION:${clean(item.title)}`,'END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
export const pickGenres=[{id:'all',label:'All genres'},{id:'53',label:'Thriller'},{id:'27',label:'Horror'},{id:'35',label:'Comedy'},{id:'18',label:'Drama'},{id:'80',label:'Crime'},{id:'9648',label:'Mystery'},{id:'10749',label:'Romance'},{id:'28',label:'Action'},{id:'878',label:'Sci-fi & fantasy'},{id:'99',label:'Documentary'},{id:'indie',label:'Indie films'}];
export function pickGenreIds(genre,type){return type==='tv'&&genre==='28'?'10759':genre==='878'?(type==='tv'?'10765':'878|14'):genre;}
export function pickKeyword(genre,type){return genre==='indie'?281237:type==='tv'?({'27':315058,'53':316362,'10749':9840}[genre]||null):null;}
export function matchesPick(item,media,genre){
  if(media!=='all'&&item.type!==media)return false;if(genre==='all')return true;
  const keyword=pickKeyword(genre,item.type);
  if(keyword)return (genre!=='indie'||item.type==='movie')&&(item.keywords?.keywords||item.keywords?.results||[]).some(k=>k.id===keyword);
  return pickGenreIds(genre,item.type).split('|').some(id=>(item.genre_ids||item.genres?.map(g=>g.id)||[]).includes(Number(id)));
}
export const validRating=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0.5&&value<=5&&Number.isInteger(value*2);
export function emptyLibrary() { return {version:2,watchlist:[],seen:[],ratings:{},recs:[],dismissed:[],progress:{},legacyImported:false}; }
export function migrateLegacy(watchlist=[], seen=[], ratings={}) {
  const state=emptyLibrary();
  state.watchlist=watchlist.map(x=>normalize(x,x.type || 'movie')).filter(Boolean);
  state.seen=seen.map(x=>normalize(x,x.type || 'movie')).filter(Boolean);
  for(const item of [...state.watchlist,...state.seen]) {
    // A legacy numeric rating is ambiguous when both media types share the ID.
    const types=new Set([...state.watchlist,...state.seen].filter(x=>x.id===item.id).map(x=>x.type));
    const value=ratings[keyOf(item)] ?? (types.size===1 ? ratings[item.id] : undefined);
    if(validRating(value)) state.ratings[keyOf(item)]=value;
  }
  return state;
}
export function updateLibrary(state, action, item, stars) {
  const valid=normalize(item); if(!valid) throw new Error('This title has no valid identity.');
  const next=structuredClone(state), key=keyOf(valid);
  if(action==='watch') {
    next.watchlist=next.watchlist.some(x=>keyOf(x)===key) ? next.watchlist.filter(x=>keyOf(x)!==key) : [...next.watchlist,{...valid,addedAt:new Date().toISOString()}];
  } else if(action==='seen' || action==='rate') {
    next.watchlist=next.watchlist.filter(x=>keyOf(x)!==key);
    next.seen=next.seen.filter(x=>keyOf(x)!==key);next.seen.push({...valid,seenAt:new Date().toISOString()});
    next.recs=next.recs.filter(x=>keyOf(x)!==key);
    if(action==='rate') {
      if(!validRating(stars))throw new Error('Choose a rating from 0.5 to 5 in half-star steps.');
      next.ratings[key]=stars;
    }
  } else if(action==='remove-seen') next.seen=next.seen.filter(x=>keyOf(x)!==key);
  else if(action==='dismiss'){next.dismissed=[...new Set([...(next.dismissed||[]),key])];next.recs=next.recs.filter(x=>keyOf(x)!==key);}
  return next;
}
export function commitLibrary(storage, next) {
  // Commit first: callers must not show success or mutate live state on quota failure.
  storage.setItem('sr_library_v2',JSON.stringify(next)); return next;
}
export function createSequence() { let value=0;return {next:()=>++value,current:id=>id===value,value:()=>value}; }
export const serviceDefinitions = [
  {id:'all',label:'All',match:()=>true},
  {id:'netflix',label:'Netflix',match:n=>/^Netflix(?: Standard with Ads| Kids)?$/i.test(n)},
  {id:'prime',label:'Prime',match:n=>/^Amazon Prime Video(?: with Ads)?$/i.test(n)},
  {id:'disney',label:'Disney/Hulu',match:n=>/^(Disney Plus|Hulu)$/i.test(n)},
  {id:'peacock',label:'Peacock',match:n=>/^Peacock Premium(?: Plus)?$/i.test(n)},
  {id:'paramount',label:'Paramount+ / Showtime',match:n=>/^(?:Paramount(?: Plus|\+)(?: Premium| Essential| with Showtime)?|Showtime)$/i.test(n)},
  {id:'mgm',label:'MGM+',match:n=>/^(MGM Plus|MGM\+|Epix)$/i.test(n)},
  {id:'starz',label:'Starz',match:n=>/^Starz$/i.test(n)},
  {id:'apple',label:'Apple TV',match:n=>/^Apple TV(?: Plus|\+)?$/i.test(n)},
  {id:'max',label:'HBO Max',match:n=>/^(HBO Max|Max)$/i.test(n)},
  {id:'theaters',label:'Theaters',match:()=>false}
];
export function providerIds(catalog, service) {
  const def=serviceDefinitions.find(x=>x.id===service);
  return catalog.filter(p=>def?.match(p.provider_name)).map(p=>p.provider_id);
}

export function unseenTitles(titles,library,hide=true){const seen=new Set((library.seen||[]).map(keyOf));return hide?titles.filter(x=>!seen.has(keyOf(x))||hasNewEpisodes(x,library)):titles;}
export function pickSubscriptionOffers(offers,services=[]){return (offers?.flatrate||[]).filter(p=>!services.length||services.some(id=>serviceDefinitions.find(s=>s.id===id)?.match(p.provider_name)));}

export const browseGenres=[{id:'all',label:'All genres'},{id:'action',label:'Action & Adventure'},{id:'animation',label:'Animation'},{id:'comedy',label:'Comedy'},{id:'crime',label:'Crime'},{id:'doc',label:'Documentaries'},{id:'drama',label:'Drama'},{id:'family',label:'Kids & Family'},{id:'horror',label:'Horror'},{id:'romance',label:'Romance'},{id:'scifi',label:'Sci-Fi & Fantasy'},{id:'thriller',label:'Thriller'},{id:'mystery',label:'Mystery'},{id:'western',label:'Westerns'}];
export function browseGenreFilter(genre,type){
 const movie={action:'28|12',animation:'16',comedy:'35',crime:'80',doc:'99',drama:'18',family:'10751',horror:'27',romance:'10749',scifi:'878|14',thriller:'53',mystery:'9648',western:'37'};
 const keywords={horror:'315058',romance:'9840',thriller:'316362'};
 if(type==='tv'&&keywords[genre])return {keyword:keywords[genre]};
 return {genres:type==='tv'?({action:'10759',scifi:'10765'}[genre]||movie[genre]):movie[genre]};
}
export function matchesBrowseGenre(item,genre){const f=browseGenreFilter(genre,item.type);if(f.keyword)return (item.keywords?.keywords||item.keywords?.results||[]).some(k=>String(k.id)===f.keyword);return !f.genres||f.genres.split('|').some(id=>(item.genre_ids||item.genres?.map(g=>g.id)||[]).includes(Number(id)));}
// Temporary, reviewed US availability corrections while provider indexing catches up.
// Sources: official Prime title page and Netflix Tudum/title page, verified 2026-10-09. Never infer US offers from a network alone.
// Dracula availability/date: https://www.paramountplus.com/sneak-peak/where-to-watch-luc-besson-dracula/
// The Mosquito Bowl: Netflix announcement checked 2026-10-30; include even when discovery ranks it beyond the initial page.
// Nocturne US availability: Apple TV Press and the US title page, checked 2026-10-30.
export const verifiedUSOffers=[{id:292741,type:'tv',service:'apple',provider_id:350,provider_name:'Apple TV',start:'2026-10-30',reviewUntil:'2026-11-30',url:'https://tv.apple.com/us/show/nocturne/umc.cmc.4cfsq1juke72zutv5xp0pw3rj',source:'https://www.apple.com/tv-pr/originals/nocturne/'},{id:259909,type:'tv',season:2,service:'paramount',provider_id:2303,provider_name:'Paramount Plus Premium',start:'2026-10-30',reviewUntil:'2026-11-30',url:'https://www.paramountplus.com/shows/dexter-resurrection/',source:'https://cms-corp.paramount.com/news/dexterr-resurrection-is-back-and-the-stakes-are-killer'},{id:1458300,type:'movie',service:'netflix',provider_id:8,provider_name:'Netflix',start:'2026-11-25',reviewUntil:'2026-12-25',url:'https://www.netflix.com/title/81661161',source:'https://www.netflix.com/tudum/articles/the-mosquito-bowl'},{id:1246049,type:'movie',service:'paramount',provider_id:2616,provider_name:'Paramount Plus Essential',start:'2026-10-12',reviewUntil:'2026-11-28',url:'https://www.paramountplus.com/movies/video/ALVE01M0GJZY0XEXQ8H80T4YJ77ANF/',source:'https://www.paramountplus.com/sneak-peak/where-to-watch-luc-besson-dracula/'},{id:1236045,type:'movie',service:'netflix',provider_id:8,provider_name:'Netflix',start:'2026-10-09',reviewUntil:'2026-11-08',url:'https://www.netflix.com/title/81757047',source:'https://media.netflix.com/en/only-on-netflix/81757047'},{id:285322,type:'tv',service:'netflix',provider_id:8,provider_name:'Netflix',start:'2026-10-08',reviewUntil:'2026-11-08',url:'https://www.netflix.com/title/81652677',source:'https://www.netflix.com/tudum/below'},{id:288673,type:'tv',service:'prime',provider_id:9,provider_name:'Amazon Prime Video',start:'2026-10-07',reviewUntil:'2026-11-07',url:'https://www.primevideo.com/detail/0QHLPZ8O1W9VTEDNG03QCGAPI2'}];
export function activeVerifiedOffers(now=today()){return verifiedUSOffers.filter(x=>x.start<=now&&now<=x.reviewUntil);}
export function withVerifiedUSOffers(item,offers={},now=today()){
 const verified=activeVerifiedOffers(now).filter(x=>keyOf(x)===keyOf(item));
 return {...offers,flatrate:[...(offers.flatrate||[]),...verified.filter(x=>!(offers.flatrate||[]).some(p=>p.provider_id===x.provider_id))]};
}

export function matchesPickYear(item,year='all'){
 return year==='all'||String(item.date||item.release_date||item.first_air_date||'').slice(0,4)===String(year);
}
export function recommendationSeeds(library,media='all'){
 const unique=[...new Map([...library.seen,...library.watchlist].map(x=>[keyOf(x),x])).values()].filter(x=>media==='all'||x.type===media);
 const rated=unique.filter(x=>library.ratings[keyOf(x)]>=4).sort((a,b)=>library.ratings[keyOf(b)]-library.ratings[keyOf(a)]).slice(0,4);
 const interested=library.watchlist.slice().reverse().filter(x=>(media==='all'||x.type===media)&&!library.ratings[keyOf(x)]&&!(library.dismissed||[]).includes(keyOf(x))).slice(0,2);
 return [...new Map([...rated,...interested].map(x=>[keyOf(x),{...x,seedWeight:library.ratings[keyOf(x)]>=4?2*library.ratings[keyOf(x)]-5:1.5,seedReason:library.ratings[keyOf(x)]>=4?'rated':'watchlist'}])).values()];
}
export function tasteProfile(library){
 const weights={};
 for(const item of new Map([...library.watchlist,...library.seen].map(x=>[keyOf(x),x])).values()){
  const rating=library.ratings[keyOf(item)],dismissed=(library.dismissed||[]).includes(keyOf(item));
  const weight=dismissed?-2:rating>=4?rating-2:rating<=2?-3:!rating&&library.watchlist.some(x=>keyOf(x)===keyOf(item))?0.75:0;
  for(const genre of item.genre_ids||item.genres?.map(g=>g.id)||[]){const key=item.type+':'+genre;weights[key]=(weights[key]||0)+weight;}
 }
 return weights;
}
export function rankRecommendations(candidates,seeds=[],prior=new Set(),profile={}){
 const genres=item=>item.genre_ids||item.genres?.map(g=>g.id)||[];
 const grouped=new Map();
 for(const item of candidates){
  if(!normalize(item))continue;
  const key=keyOf(item),existing=grouped.get(key);
  if(existing){existing.affinity+=item.affinity||0;if(!existing.relatedTo&&item.relatedTo){existing.reason=item.reason;existing.relatedTo=item.relatedTo;}}
  else grouped.set(key,{...item,affinity:item.affinity||0});
 }
 const score=item=>item.affinity*10+Math.max(-12,Math.min(12,genres(item).reduce((sum,g)=>sum+(profile[item.type+':'+g]||0),0)))+(item.affinity?Math.max(0,...seeds.filter(s=>s.type===item.type).map(s=>genres(s).filter(g=>genres(item).includes(g)).length)):0);
 return [...grouped.values()].sort((a,b)=>score(b)-score(a)||Number(prior.has(keyOf(a)))-Number(prior.has(keyOf(b)))||(b.vote_average||0)-(a.vote_average||0));
}

export function scheduledVerifiedReleases(now=today()){return verifiedUSOffers.filter(x=>x.start>now&&x.start<=shiftedDate(now,90)&&now<=x.reviewUntil);}
export function hasOfficialNetflixHomepage(item){
 try{const u=new URL(item.homepage);return u.protocol==='https:'&& /^(?:www\.)?netflix\.com$/.test(u.hostname)&&/^\/title\/\d+/.test(u.pathname);}catch{return false;}
}

export function mergeRemembered(item,prior){
 const out={...item};for(const field of ['keywords','seasons','genres','last_episode_to_air','next_episode_to_air','releaseSeasonEpisodes'])out[field]??=prior?.[field];
 return out;
}
export function setEpisodeProgress(library,item,episodes,watched=true){
 if(item?.type!=='tv')throw new Error('Episode tracking is for series.');
 const next=structuredClone(library),key=keyOf(item),old=next.progress?.[key];next.progress||={};
 const state={item:{...item},tracking:true,episodes:{...old?.episodes}};
 for(const ep of episodes){if(!Number.isInteger(ep.season_number)||ep.season_number<1||!Number.isInteger(ep.episode_number)||ep.episode_number<1)throw new Error('Invalid episode.');if(watched&&(!ep.air_date||ep.air_date>today()))throw new Error('This episode has not aired yet.');state.episodes[ep.season_number+':'+ep.episode_number]=watched;}
 next.progress[key]=state;return next;
}
export function hasNewEpisodes(item,library){
 const progress=library.progress?.[keyOf(item)],last=item.last_episode_to_air;
 if(progress?.tracking&&last?.season_number>0&&last.episode_number>0&&last.air_date<=today())return progress.episodes?.[last.season_number+':'+last.episode_number]!==true;
 const seen=library.seen.find(x=>keyOf(x)===keyOf(item));return item.type==='tv'&&seen?.seenAt&&last?.air_date>seen.seenAt.slice(0,10)&&last.air_date<=today();
}
export function filterWatchlist(titles,library,{query='',type='all',service='all',status='all',sort='added'}={}){
 const filtered=titles.filter(x=>(!query||x.title.toLowerCase().includes(query.toLowerCase()))&&(type==='all'||x.type===type)&&(service==='all'||x.subscriptionServices?.includes(service))&&(status==='all'||status==='new'&&hasNewEpisodes(x,library)||status==='tracking'&&library.progress?.[keyOf(x)]?.tracking||status==='available'&&x.subscriptionServices?.length));
 return filtered.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='rating'?(library.ratings[keyOf(b)]||0)-(library.ratings[keyOf(a)]||0):sort==='release'?recentActivityFirst(a,b):(b.addedAt||'').localeCompare(a.addedAt||''));
}
export function resolvedEvent(item,now=today()){
 if(item.calendarEvent?.date>=now)return item.calendarEvent;
 if(item.theaterDate>=now)return {date:item.theaterDate,kind:'theater',label:'US theatrical release',source:'TMDB US release dates'};
 const premiere=upcomingPremiere(item,now),ep=item.next_episode_to_air;
 if(ep?.air_date>=now)return {date:ep.air_date,kind:'episode',label:`Season ${ep.season_number}, episode ${ep.episode_number}`,season:ep.season_number,episode:ep.episode_number,source:'TMDB episode air date; service availability may vary'};
 if(item.upcomingDate>=now||premiere)return {date:item.upcomingDate||premiere.date,kind:'season',label:'Season '+(item.upcomingSeason||premiere?.season)+' premiere',source:'TMDB season air date; service availability may vary'};
 if(item.date>=now)return {date:item.date,kind:'premiere',label:item.type==='tv'?'Series premiere':'Original release',source:'TMDB original release; streaming date unconfirmed'};
 return null;
}
export function movieStreamingEvents(item,service='all',now=today(),days=90){
 const end=shiftedDate(now,days),events=[];
 for(const release of (item.release_dates?.results||[]).find(r=>r.iso_3166_1==='US')?.release_dates||[]){
  const date=release.release_date?.slice(0,10);if(release.type!==4||date<now||date>end||!/^(\d{4}-\d{2}-\d{2})$/.test(date||'')||/\b(?:rent(?:al)?|purchase|buy|pvod|tvod|est|vod|store)\b/i.test(release.note||''))continue;
  for(const id of originalServices(service)){const name=id==='prime'?/\b(?:amazon prime(?: video)?|prime video)\b/i:id==='apple'?/\bapple tv\s*(?:\+|plus)/i:movieOriginalEvidence[id]?.name;if(name?.test(release.note||''))events.push({date,kind:'streaming',service:id,label:'Streaming premiere',source:'TMDB service-named US digital release'});}
 }
 for(const entry of verifiedUSOffers.filter(x=>keyOf(x)===keyOf(item)&&originalServices(service).includes(x.service)&&x.start>=now&&x.start<=end))events.push({date:entry.start,kind:'streaming',service:entry.service,label:'Streaming premiere',source:entry.source||entry.url});
 return [...new Map(events.map(e=>[e.date+':'+e.service,e])).values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function futureMovieQuery(options={},now=today()){
 const q=catalogQuery({...options,type:'movie',when:'soon'},now);
 for(const key of ['primary_release_date.gte','primary_release_date.lte','with_watch_providers','with_watch_monetization_types','watch_region'])q.delete(key);
 q.set('region','US');q.set('with_release_type','4');q.set('release_date.gte',now);q.set('release_date.lte',shiftedDate(now,90));q.set('sort_by','popularity.desc');return q;
}

export function eligibleCalendarSeries(item,saved=false){return saved||(matchesOriginalSeries(item,'all')&&matchesReality(item,'exclude'));}

// Correct only an officially announced US streaming premiere. Later episodes
// retain their source dates; a premiere never proves a whole-season release.
export function correctUSSeriesRelease(data,path,now=today()){
 const match=/^\/tv\/(\d+)(?:\/season\/(\d+))?$/.exec(path);if(!match)return data;
 const entry=verifiedUSOffers.find(x=>x.type==='tv'&&x.season&&x.id===Number(match[1])&&now<=x.reviewUntil);if(!entry)return data;
 const correct=ep=>ep?.season_number===entry.season&&ep.episode_number===1?{...ep,air_date:entry.start,releaseSource:entry.source}:ep;
 if(match[2])return Number(match[2])===entry.season?{...data,air_date:entry.start,episodes:(data.episodes||[]).map(ep=>correct({...ep,season_number:entry.season}))}:data;
 const out={...data,seasons:(data.seasons||[]).map(s=>s.season_number===entry.season?{...s,air_date:entry.start,releaseSource:entry.source}:s),last_episode_to_air:correct(data.last_episode_to_air),next_episode_to_air:correct(data.next_episode_to_air),usSeasonPremiere:{date:entry.start,season:entry.season,service:entry.service,source:entry.source}};
 if(out.next_episode_to_air?.season_number===entry.season&&out.next_episode_to_air.episode_number===1&&entry.start<=now&&(out.last_episode_to_air?.season_number||0)<entry.season){out.last_episode_to_air=out.next_episode_to_air;out.next_episode_to_air=null;}
 return out;
}
