import {today,shiftedDate,movieStreamingEvents,serviceDefinitions} from './core.js';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const directSubscriptionNote=note=>/\b(?:netflix|peacock|hulu|disney\s*(?:\+|plus)|paramount\s*(?:\+|plus)|hbo(?: max)?|mgm\s*(?:\+|plus)|starz|amazon prime|prime video|apple tv\s*(?:\+|plus))\b/i.test(note||'')||/\b(?:Disney|Paramount|Apple TV|MGM)\+/i.test(note||'');
export function digitalReleaseDates(item){
 const dates=(item.release_dates?.results||[]).find(x=>x.iso_3166_1==='US')?.release_dates||[];
 return [...new Set(dates.filter(x=>x.type===4&&!directSubscriptionNote(x.note)&&validDate(x.release_date?.slice(0,10))).map(x=>x.release_date.slice(0,10)))].sort();
}
// These are studio-credit hints, not a claim about a particular film's US
// distributor or date. Only the two sourced output arrangements are inferred.
const destinationRules=[
 {service:'peacock',minYear:2026,companies:['Universal Pictures','Focus Features','DreamWorks Animation','Illumination'],source:'https://www.nbcuniversal.com/article/peacock-showcases-powerhouse-slate-todays-nbcuniversal-upfront',reviewed:'2026-10-29',reviewUntil:'2027-01-27',basis:'NBCUniversal first streaming window; studio credit does not prove distribution rights for this title.'},
 {service:'netflix',minYear:2022,companies:['Columbia Pictures','TriStar Pictures','Screen Gems','Sony Pictures Animation','Sony Pictures'],source:'https://www.sonypictures.com/corp/press_releases/2026/0115',reviewed:'2026-10-29',reviewUntil:'2027-01-27',basis:'Sony/Netflix US first subscription window; studio credit does not prove distribution rights for this title.'}
];
export function buildReleasePlan(item,now=today()){
 const releases=(item.release_dates?.results||[]).find(x=>x.iso_3166_1==='US')?.release_dates||[];
 const theaterDates=[...new Set(releases.filter(x=>[2,3].includes(x.type)&&validDate(x.release_date?.slice(0,10))).map(x=>x.release_date.slice(0,10)))].sort();
 const wide=releases.filter(x=>x.type===3&&validDate(x.release_date?.slice(0,10))).map(x=>x.release_date.slice(0,10)).sort();
 const streaming=movieStreamingEvents(item,'all',shiftedDate(now,-365),455).map(e=>({...e,status:'listed',serviceName:serviceDefinitions.find(s=>s.id===e.service)?.label||e.service}));
 const companies=new Set((item.production_companies||[]).map(x=>x.name));
 const releaseYear=Number((wide[0]||theaterDates[0]||item.release_date||'').slice(0,4));
 const hints=destinationRules.filter(r=>releaseYear>=r.minYear&&now<=r.reviewUntil&&r.companies.some(c=>companies.has(c))).map(r=>({...r,company:r.companies.find(c=>companies.has(c)),serviceName:serviceDefinitions.find(s=>s.id===r.service)?.label||r.service}));
 // Conflicting studio credits do not resolve a destination. Dated title-specific
 // evidence outranks any generic production-company inference.
 const expected=!streaming.length&&new Set(hints.map(h=>h.service)).size===1?hints[0]:null;
 return {theaterDate:wide[0]||theaterDates[0]||null,digitalDates:digitalReleaseDates(item),streaming,expected,status:streaming.length?'listed':expected?'expected':'unannounced'};
}
export function movieWindowEvents(item,now=today()){
 const plan=buildReleasePlan(item,now),end=shiftedDate(now,90),events=[];
 if(plan.theaterDate>=now&&plan.theaterDate<=end)events.push({date:plan.theaterDate,kind:'theater',service:'theaters',label:'US theatrical release',source:'TMDB US theatrical release date'});
 for(const date of plan.digitalDates.filter(d=>d>=now&&d<=end))events.push({date,kind:'digital',service:'digital',label:'Digital release · rental / purchase window',source:'TMDB US digital release; rental/purchase availability and prices require store confirmation'});
 return events;
}
export function formatDigitalQuote(quote){
 if(!quote?.matched)return quote?.status==='unavailable'?'Price lookup unavailable':'Price not announced or no matching US store listing';
 const prices=[];if(quote.rent?.length)prices.push('Rent from $'+Math.min(...quote.rent.map(x=>x.amount)).toFixed(2));if(quote.buy?.length)prices.push('Buy from $'+Math.min(...quote.buy.map(x=>x.amount)).toFixed(2));
 return prices.join(' · ')||'Rental / purchase prices unavailable';
}
