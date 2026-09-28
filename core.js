export const keyOf = (item) => `${item.type || item.media_type}:${item.id}`;
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
  return keywords.some(k => /^(stand-up comedy|stand up comedy|stand-up special|standup comedy)$/i.test(k.name)) || /\bstand[- ]?up (comedy|special|performance)|\bcomedy special\b/i.test(item.title || item.name || '');
}
export function contentLabels(item, now=today()) {
  const labels=[];
  if(isStandup(item))labels.push({kind:'standup',text:'STAND-UP'});
  if((item.genre_ids||item.genres?.map(g=>g.id)||[]).includes(99))labels.push({kind:'doc',text:'DOC'});
  const cutoff=new Date(now+'T12:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-30);
  const season=(item.seasons||[]).filter(s=>s.season_number>1&&s.air_date&&s.air_date<=now&&s.air_date>=cutoff.toISOString().slice(0,10)).sort((a,b)=>b.air_date.localeCompare(a.air_date))[0];
  if(season)labels.push({kind:'season',text:'NEW SEASON',description:`Season ${season.season_number} premiered ${formatDate(season.air_date)}; streaming availability may vary.`});
  const episode=item.last_episode_to_air, week=new Date(now+'T12:00:00Z');week.setUTCDate(week.getUTCDate()-7);
  const weekday=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}).toUpperCase();
  if(episode?.season_number>0&&episode?.episode_number>0&&episode.air_date<=now&&episode.air_date>=week.toISOString().slice(0,10))labels.push({kind:'episode',text:`NEW EPISODE · ${weekday(episode.air_date)}`,description:`S${episode.season_number} E${episode.episode_number} aired ${formatDate(episode.air_date)}; streaming availability may vary.`});
  const next=item.next_episode_to_air;
  if(next?.season_number>0&&next?.air_date>now&&next.air_date<=shiftedDate(now,7))labels.push({kind:'next',text:`NEXT EPISODE · ${weekday(next.air_date)}`,description:`S${next.season_number} E${next.episode_number} expected ${formatDate(next.air_date)}; streaming availability may vary.`});
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
export const originalNetworks={apple:'2552',netflix:'213',prime:'1024',disney:'2739|453',peacock:'3353',paramount:'4330',max:'49|3186',starz:'318'};
export function shiftedDate(now,days){const d=new Date(now+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function catalogQuery({type='movie',service='all',when='now',network='all',kind='all',page=1,ids=[]},now=today()){
  const params=new URLSearchParams({language:'en-US',page});
  if(service==='theaters'){
    params.set('region','US');params.set('with_release_type','3');
    params.set('release_date.gte',shiftedDate(now,when==='soon'?1:-42));params.set('release_date.lte',shiftedDate(now,when==='soon'?90:0));
    params.set('sort_by',when==='soon'?'release_date.asc':'popularity.desc');
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
  if(kind==='doc')params.set('with_genres','99');if(kind==='standup')params.set('with_keywords','9716');
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
