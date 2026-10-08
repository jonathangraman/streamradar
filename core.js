export const keyOf = (item) => `${item.type || item.media_type}:${item.id}`;
export const isEnglish = item => item?.original_language === 'en';
export function parseRoute(hash){
  const match=/^#detail\/(movie|tv):(\d+)$/.exec(hash);if(match&&Number(match[2])>0)return {view:'detail',key:match[1]+':'+match[2]};
  const actor=/^#actor\/(\d+)$/.exec(hash);if(actor&&Number(actor[1])>0)return {view:'actor',id:Number(actor[1])};
  const view=hash.replace(/^#/,'');return {view:['home','watchlist','foryou','about'].includes(view)?view:'home'};
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
export function contentLabels(item, now=today()) {
  const labels=[];
  if(isStandup(item))labels.push({kind:'standup',text:'STAND-UP'});
  if((item.genre_ids||item.genres?.map(g=>g.id)||[]).includes(99))labels.push({kind:'doc',text:'DOC'});
  const cutoff=new Date(now+'T12:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-90);
  const season=(item.seasons||[]).filter(s=>s.season_number>1&&s.air_date&&s.air_date<=now&&s.air_date>=cutoff.toISOString().slice(0,10)).sort((a,b)=>b.air_date.localeCompare(a.air_date))[0];
  if(season)labels.push({kind:'season',text:'NEW SEASON',description:`Season ${season.season_number} premiered ${formatDate(season.air_date)}; streaming availability may vary.`});
  const episode=item.last_episode_to_air, week=new Date(now+'T12:00:00Z');week.setUTCDate(week.getUTCDate()-7);
  const weekday=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}).toUpperCase()+' '+Number(date.slice(5,7))+'/'+Number(date.slice(8,10));
  const next=item.next_episode_to_air;
  if(next?.season_number>0&&next?.episode_number>0&&next?.air_date>=now&&next.air_date<=shiftedDate(now,7))labels.push({kind:'next',text:`NEXT EP · ${weekday(next.air_date)}`,description:`S${next.season_number} E${next.episode_number} expected ${formatDate(next.air_date)}; streaming availability may vary.`});
  else if(episode?.season_number>0&&episode?.episode_number>0&&episode.air_date<=now&&episode.air_date>=week.toISOString().slice(0,10))labels.push({kind:'episode',text:`NEW EP · AIRED ${weekday(episode.air_date)}`,description:`S${episode.season_number} E${episode.episode_number} aired ${formatDate(episode.air_date)}; streaming availability may vary.`});
  return labels;
}
export function activityDate(item,now=today()){
  const dates=[item.date];
  if(item.type==='tv')dates.push(item.last_episode_to_air?.season_number>0?item.last_episode_to_air.air_date:null,...(item.seasons||[]).filter(s=>s.season_number>0).map(s=>s.air_date));
  return dates.filter(d=>d&&d<=now).sort().at(-1)||item.date||'';
}
export function recentActivityFirst(a,b){return activityDate(b).localeCompare(activityDate(a))||newestFirst(a,b);}
export const legacyTheater={name:'Cinemark Legacy and XD',address:'7201 Central Expy, Suite 100 · Plano, TX 75025',url:'https://www.cinemark.com/theatres/tx-plano/cinemark-legacy-and-xd'};
export const networkIds={food:'143',discovery:'64'};
export const originalNetworks={apple:'2552',netflix:'213',prime:'1024',disney:'2739|453',peacock:'3353',paramount:'4330|67',max:'49|3186',starz:'318',mgm:'6219|922'};
// Network affiliations identify series; movie premieres need separate release evidence.
export const originalsOnlyServices=['prime','disney','paramount','peacock'];
export const originalMovieServices=['prime','disney'];
export function isOriginalSeries(item,service){
  const broadcast=service==='paramount'?16:service==='peacock'?6:null;
  const launch=service==='paramount'?'2014-10-28':'2020-07-15';
  // Network lists include later syndication. Reject pre-service broadcast premieres,
  // but retain streaming originals subsequently aired on a broadcast network.
  if(broadcast&&(item.networks||[]).some(n=>n.id===broadcast)&&(!(item.first_air_date||item.date)||(item.first_air_date||item.date)<launch))return false;
  const ids=(originalNetworks[service]||'').split('|').map(Number);
  return (item.networks||[]).some(n=>ids.includes(n.id));
}
export function isOriginalMovie(item,service){
  if(!originalMovieServices.includes(service))return true;
  const releases=(item.release_dates?.results||[]).find(r=>r.iso_3166_1==='US')?.release_dates||[];
  const dated=releases.filter(r=>/^\d{4}-\d{2}-\d{2}/.test(r.release_date||''));
  const digital=dated.filter(r=>r.type===4).sort((a,b)=>a.release_date.localeCompare(b.release_date));
  if(!digital.length)return false;
  const first=digital[0].release_date.slice(0,10);
  const debut=digital.filter(r=>r.release_date.slice(0,10)===first);
  const name=service==='prime'?/\b(?:amazon|prime video)\b/i:/\b(?:hulu|disney\s*(?:\+|plus))/i;
  let officialHomepage=false;
  try{const host=new URL(item.homepage).hostname;officialHomepage=service==='prime'?/^(?:www\.)?(?:amazon\.com|primevideo\.com)$/.test(host):/^(?:www\.)?(?:disneyplus\.com|hulu\.com)$/.test(host);}catch{}
  const identified=debut.some(r=>name.test(r.note||''))||(officialHomepage&&debut.every(r=>/^(?:internet|digital|streaming)?$/i.test((r.note||'').trim())));
  if(!identified)return false;
  // A later subscription window is not an original premiere. Allow a short awards run.
  return !dated.some(r=>r.release_date.slice(0,10)<first&&(r.type===3||r.type===5||r.type===6||(r.type===2&&r.release_date.slice(0,10)<shiftedDate(first,-31))));
}
export function shiftedDate(now,days){const d=new Date(now+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function catalogQuery({type='movie',service='all',when='now',network='all',kind='all',genre='all',page=1,ids=[]},now=today()){
  const params=new URLSearchParams({language:'en-US',with_original_language:'en',page});
  if(service==='theaters'){
    params.set('region','US');params.set('with_release_type','3');
    params.set('release_date.gte',shiftedDate(now,when==='soon'?1:-42));params.set('release_date.lte',shiftedDate(now,when==='soon'?90:0));
    // Date-only ranking buries recognized releases behind low-information entries.
    // Select popular theatrical candidates, then order them by verified US date in the UI.
    params.set('sort_by','popularity.desc');
    if(when==='soon')params.set('primary_release_date.gte',shiftedDate(now,-180));
  }else if(when==='soon'){
    const field=type==='tv'?'first_air_date':'primary_release_date';
    params.set(field+'.gte',shiftedDate(now,1));params.set(field+'.lte',shiftedDate(now,90));params.set('sort_by',field+'.asc');
    // Original-production affiliations are not promised streaming arrival dates.
    if(service!=='all'){
      if(type==='tv'&&originalNetworks[service])params.set('with_networks',originalNetworks[service]);
      else if(type==='movie'&&service==='apple')params.set('with_companies','194232');
      else {params.set('watch_region','US');params.set('with_watch_providers',ids.join('|'));params.set('with_watch_monetization_types','flatrate');}
    }
  }else{
    for(const [key,value] of Object.entries(discoveryOrder(type,now)))params.set(key,value);
    params.set('watch_region','US');params.set('with_watch_providers',ids.join('|'));params.set('with_watch_monetization_types',service==='all'?'flatrate|free|ads':'flatrate');
    if(service==='max'&&type==='tv'&&networkIds[network])params.set('with_networks',networkIds[network]);
  }
  if(type==='tv'&&originalsOnlyServices.includes(service))params.set('with_networks',originalNetworks[service]);
  if(kind==='doc')params.set('with_genres','99');if(kind==='standup')params.set('with_keywords','9716');
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
export function discoveryOrder(type, now=today()) {
  return type==='tv'?{sort_by:'first_air_date.desc','first_air_date.lte':now}:{sort_by:'primary_release_date.desc','primary_release_date.lte':now};
}
export function calendarEvent(item, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('No confirmed date is available.');
  const clean = s => String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m);
  const end = new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//StreamRadar//Release Calendar//EN','BEGIN:VEVENT',`UID:${keyOf(item)}-${date}@streamradar`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z')}`,`DTSTART;VALUE=DATE:${date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`,`SUMMARY:${clean(item.title)}`,`DESCRIPTION:${clean('Episode or original release date from TMDB; streaming arrival may differ.')}`,'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY',`DESCRIPTION:${clean(item.title)}`,'END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
export const pickGenres=[{id:'all',label:'All genres'},{id:'53',label:'Thriller'},{id:'27',label:'Horror'},{id:'35',label:'Comedy'},{id:'18',label:'Drama'},{id:'80',label:'Crime'},{id:'9648',label:'Mystery'},{id:'10749',label:'Romance'},{id:'28',label:'Action'},{id:'878',label:'Sci-fi & fantasy'},{id:'99',label:'Documentary'},{id:'indie',label:'Indie films'}];
export function pickGenreIds(genre,type){return type==='tv'&&genre==='28'?'10759':type==='tv'&&genre==='878'?'10765':genre;}
export function pickKeyword(genre,type){return genre==='indie'?281237:type==='tv'?({'27':315058,'53':316362,'10749':9840}[genre]||null):null;}
export function matchesPick(item,media,genre){
  if(media!=='all'&&item.type!==media)return false;if(genre==='all')return true;
  const keyword=pickKeyword(genre,item.type);
  if(keyword)return (genre!=='indie'||item.type==='movie')&&(item.keywords?.keywords||item.keywords?.results||[]).some(k=>k.id===keyword);
  return (item.genre_ids||item.genres?.map(g=>g.id)||[]).includes(Number(pickGenreIds(genre,item.type)));
}
export function emptyLibrary() { return {version:2,watchlist:[],seen:[],ratings:{},recs:[],dismissed:[],legacyImported:false}; }
export function migrateLegacy(watchlist=[], seen=[], ratings={}) {
  const state=emptyLibrary();
  state.watchlist=watchlist.map(x=>normalize(x,x.type || 'movie')).filter(Boolean);
  state.seen=seen.map(x=>normalize(x,x.type || 'movie')).filter(Boolean);
  for(const item of [...state.watchlist,...state.seen]) {
    // A legacy numeric rating is ambiguous when both media types share the ID.
    const types=new Set([...state.watchlist,...state.seen].filter(x=>x.id===item.id).map(x=>x.type));
    const value=ratings[keyOf(item)] ?? (types.size===1 ? ratings[item.id] : undefined);
    if(Number.isInteger(value) && value>=1 && value<=5) state.ratings[keyOf(item)]=value;
  }
  return state;
}
export function updateLibrary(state, action, item, stars) {
  const valid=normalize(item); if(!valid) throw new Error('This title has no valid identity.');
  const next=structuredClone(state), key=keyOf(valid);
  if(action==='watch') {
    next.watchlist=next.watchlist.some(x=>keyOf(x)===key) ? next.watchlist.filter(x=>keyOf(x)!==key) : [...next.watchlist,valid];
  } else if(action==='seen' || action==='rate') {
    next.watchlist=next.watchlist.filter(x=>keyOf(x)!==key);
    if(!next.seen.some(x=>keyOf(x)===key))next.seen.push(valid);
    next.recs=next.recs.filter(x=>keyOf(x)!==key);
    if(action==='rate') {
      if(!Number.isInteger(stars)||stars<1||stars>5)throw new Error('Choose a rating from one to five.');
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

export function unseenTitles(titles,library,hide=true){const seen=new Set((library.seen||[]).map(keyOf));return hide?titles.filter(x=>!seen.has(keyOf(x))):titles;}
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
// Source: official Prime title page, verified 2026-10-08. Never infer US offers from a network alone.
export const verifiedUSOffers=[{id:288673,type:'tv',service:'prime',provider_id:9,provider_name:'Amazon Prime Video',start:'2026-10-07',reviewUntil:'2026-11-07',url:'https://www.primevideo.com/detail/0QHLPZ8O1W9VTEDNG03QCGAPI2'}];
export function activeVerifiedOffers(now=today()){return verifiedUSOffers.filter(x=>x.start<=now&&now<=x.reviewUntil);}
export function withVerifiedUSOffers(item,offers={},now=today()){
 const verified=activeVerifiedOffers(now).filter(x=>keyOf(x)===keyOf(item));
 return {...offers,flatrate:[...(offers.flatrate||[]),...verified.filter(x=>!(offers.flatrate||[]).some(p=>p.provider_id===x.provider_id))]};
}

export function matchesPickYear(item,year='all'){
 return year==='all'||String(item.date||item.release_date||item.first_air_date||'').slice(0,4)===String(year);
}
export function rankRecommendations(candidates,seeds=[],prior=new Set()){
 const genres=item=>item.genre_ids||item.genres?.map(g=>g.id)||[];
 const grouped=new Map();
 for(const item of candidates){
  if(!normalize(item))continue;
  const key=keyOf(item),existing=grouped.get(key);
  if(existing){existing.affinity+=item.affinity||0;if(!existing.relatedTo&&item.relatedTo){existing.reason=item.reason;existing.relatedTo=item.relatedTo;}}
  else grouped.set(key,{...item,affinity:item.affinity||0});
 }
 const score=item=>item.affinity*10+(item.affinity?Math.max(0,...seeds.filter(s=>s.type===item.type).map(s=>genres(s).filter(g=>genres(item).includes(g)).length)):0);
 return [...grouped.values()].sort((a,b)=>score(b)-score(a)||Number(prior.has(keyOf(a)))-Number(prior.has(keyOf(b)))||(b.vote_average||0)-(a.vote_average||0));
}
