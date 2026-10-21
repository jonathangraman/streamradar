function officialTrailerURL(videos){
  const trailers=(Array.isArray(videos)?videos:[]).filter(video=>video?.site==='YouTube'&&video.type==='Trailer'&&video.official===true&&video.iso_639_1==='en'&&/^[\w-]{11}$/.test(video.key||''));
  trailers.sort((a,b)=>Number(/teaser|announcement/i.test(a.name||''))-Number(/teaser|announcement/i.test(b.name||''))||Number(b.iso_3166_1==='US')-Number(a.iso_3166_1==='US')||String(b.published_at||'').localeCompare(String(a.published_at||'')));
  return trailers.length?'https://www.youtube.com/watch?v='+trailers[0].key:'';
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const params=new URL(req.url,'http://localhost').searchParams,type=params.get('type'),id=Number(params.get('id')),title=(params.get('title')||'').trim(),year=params.get('year')||'';
  if(!['movie','tv'].includes(type)||!Number.isSafeInteger(id)||id<=0||!title||title.length>200||(year&&!/^\d{4}$/.test(year)))return res.status(400).json({error:'Invalid title'});
  const query=[title,year,type==='tv'?'series official trailer':'official trailer'].filter(Boolean).join(' ');
  let destination='https://www.youtube.com/results?'+new URLSearchParams({search_query:query}),cacheControl='no-store';
  if(process.env.TMDB_READ_TOKEN){
    try{
      const upstream=await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?language=en-US`,{headers:{Authorization:'Bearer '+process.env.TMDB_READ_TOKEN},signal:AbortSignal.timeout(8000)});
      if(upstream.ok){
        const data=await upstream.json(),trailer=officialTrailerURL(data.results);
        destination=trailer||destination;
        cacheControl=trailer?'public, max-age=300, s-maxage=86400':'public, max-age=60, s-maxage=900';
      }
    }catch{/* A lookup failure still leaves the user with a useful trailer search. */}
  }
  res.setHeader('Cache-Control',cacheControl);
  res.setHeader('Location',destination);
  return res.status(307).end();
}
