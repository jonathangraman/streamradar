const normalized=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\((?:19|20)\d{2}\)/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function selectStoreMovie(movie,results){
 const names=new Set([movie.title,movie.original_title].filter(Boolean).map(normalized));
 const year=Number((movie.release_date||'').slice(0,4));if(!year)return null;
 const matches=results.filter(x=>x.kind==='feature-movie'&&x.currency==='USD'&&names.has(normalized(x.trackName))&&Math.abs(Number((x.releaseDate||'').slice(0,4))-year)<=1);
 if(matches.length!==1)return null;const chosen=matches[0];
 // Runtime disambiguates remakes and different films with the same title/year.
 if(movie.runtime>0&&chosen.trackTimeMillis>0&&Math.abs(chosen.trackTimeMillis/60000-movie.runtime)>12)return null;
 try{const url=new URL(chosen.trackViewUrl);if(url.protocol!=='https:'||!['itunes.apple.com','tv.apple.com'].includes(url.hostname)||!url.pathname.startsWith('/us/'))return null;}catch{return null;}
 return chosen;
}
export function storeQuote(movie,result,checkedAt=new Date().toISOString()){
 const prices=(sd,hd)=>[{format:'SD',amount:sd},{format:'HD',amount:hd}].filter(x=>typeof x.amount==='number'&&Number.isFinite(x.amount)&&x.amount>0&&x.amount<1000);
 return {matched:true,status:'listed',provider:'Apple TV Store',currency:'USD',title:result.trackName,url:result.trackViewUrl,rent:prices(result.trackRentalPrice,result.trackHdRentalPrice),buy:prices(result.trackPrice,result.trackHdPrice),checkedAt,priceNote:'Current US store listing; not a promise of the launch price. Rental and purchase are separate from subscription streaming.'};
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const id=Number(new URL(req.url,'http://localhost').searchParams.get('id'));if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Invalid movie'});
 if(!process.env.TMDB_READ_TOKEN)return res.status(503).json({error:'Movie lookup is not configured.'});
 try{
  const details=await fetch('https://api.themoviedb.org/3/movie/'+id+'?language=en-US',{headers:{Authorization:'Bearer '+process.env.TMDB_READ_TOKEN},signal:AbortSignal.timeout(8000)});if(!details.ok)throw Error('Movie unavailable');const movie=await details.json();
  const target=new URL('https://itunes.apple.com/search');target.search=new URLSearchParams({term:String(movie.title||'').slice(0,200),country:'US',media:'movie',entity:'movie',limit:'25'}).toString();
  const response=await fetch(target,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Store unavailable');const data=await response.json(),match=selectStoreMovie(movie,Array.isArray(data.results)?data.results:[]);
  res.setHeader('Cache-Control',match?'public, s-maxage=3600, stale-while-revalidate=300':'public, s-maxage=300');
  return res.status(200).json(match?storeQuote(movie,match):{matched:false,status:'unannounced',provider:'Apple TV Store',checkedAt:new Date().toISOString(),priceNote:'No unambiguous matching US store price. Future rental and purchase prices may not be announced.'});
 }catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({matched:false,status:'unavailable',error:'Digital prices could not be checked. Please retry.'});}
}
