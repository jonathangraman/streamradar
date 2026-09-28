const allowed = /^\/(?:discover\/(?:movie|tv)|search\/(?:movie|tv)|watch\/providers\/(?:movie|tv)|movie\/\d+\/release_dates|(?:movie|tv)\/\d+(?:\/(?:watch\/providers|recommendations))?|person\/\d+(?:\/combined_credits)?)$/;
const params = new Set(['language','query','page','watch_region','region','with_watch_providers','with_watch_monetization_types','with_keywords','with_genres','without_genres','without_keywords','with_networks','with_companies','air_date.gte','air_date.lte','sort_by','primary_release_date.gte','primary_release_date.lte','first_air_date.gte','first_air_date.lte','with_release_type','release_date.gte','release_date.lte','append_to_response','include_adult']);
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const url=new URL(req.url,'http://localhost'), path=url.searchParams.get('path');
  if(!path||!allowed.test(path))return res.status(400).json({error:'Unsupported request'});
  if(!process.env.TMDB_READ_TOKEN)return res.status(503).json({error:'Catalog is not configured. Please try again later.'});
  const target=new URL('https://api.themoviedb.org/3'+path);
  for(const [key,value] of url.searchParams)if(params.has(key))target.searchParams.set(key,value);
  if((target.searchParams.get('query')||'').length>200)return res.status(400).json({error:'Search is too long'});
  const page=Number(target.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>500)return res.status(400).json({error:'Invalid page'});
  if(target.searchParams.has('append_to_response'))target.searchParams.set('append_to_response','credits,keywords');
  target.searchParams.set('include_adult','false');
  if(path.startsWith('/discover/'))target.searchParams.set('with_original_language','en');
  try {
    const upstream=await fetch(target,{headers:{Authorization:'Bearer '+process.env.TMDB_READ_TOKEN},signal:AbortSignal.timeout(10000)});
    if(!upstream.ok)return res.status(upstream.status===429?429:502).json({error:upstream.status===429?'Catalog is busy. Please retry shortly.':'Catalog is temporarily unavailable.'});
    const data=await upstream.json();
    if(path.startsWith('/search/')||path.endsWith('/recommendations')||path.startsWith('/discover/'))data.results=(data.results||[]).filter(item=>item.original_language==='en');
    if(path.endsWith('/combined_credits'))data.cast=(data.cast||[]).filter(item=>item.original_language==='en');
    res.setHeader('Cache-Control',path.startsWith('/search/')?'private, max-age=60':'public, s-maxage=900, stale-while-revalidate=300');
    return res.status(200).json({...data,_fetchedAt:new Date().toISOString()});
  }catch{return res.status(504).json({error:'Catalog request timed out. Please retry.'});}
}
