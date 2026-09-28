export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const u=new URL(req.url,'http://localhost'),id=u.searchParams.get('id'),type=u.searchParams.get('type');
  if(!/^\d{1,12}$/.test(id||'')||!['movie','tv'].includes(type))return res.status(400).json({error:'Invalid title'});
  if(!process.env.MDBLIST_API_KEY)return res.status(503).json({error:'Critic ratings are not configured.'});
  const target=new URL('https://mdblist.com/api/');target.searchParams.set('apikey',process.env.MDBLIST_API_KEY);target.searchParams.set('tm',id);target.searchParams.set('m',type==='movie'?'movie':'show');
  try{
    const response=await fetch(target,{signal:AbortSignal.timeout(8000)}),data=await response.json();
    if(!response.ok||data.error||!Array.isArray(data.ratings))return res.status(502).json({error:'Critic ratings are temporarily unavailable.'});
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ratings:data.ratings.filter(r=>['imdb','tomatoes','tomatoesaudience','metacritic'].includes(r.source)),fetchedAt:new Date().toISOString()});
  }catch{return res.status(504).json({error:'Critic ratings request timed out.'});}
}
