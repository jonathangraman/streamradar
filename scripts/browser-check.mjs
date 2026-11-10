// Deterministic browser regression checks. Start npm start first, then run
// npm run test:browser (install Chromium once with npx playwright install chromium).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
let server;
if(!process.env.BASE_URL){server=spawn(process.execPath,['scripts/dev-server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'8766'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Preview server exited '+code)));});}
process.on('exit',()=>server?.kill());
const now=new Date(),day=offset=>{const d=new Date(now);d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10);};
const movie={id:1246049,type:'movie',title:'Dracula',original_language:'fr',release_date:'2025-07-30',genre_ids:[27],genres:[{id:27,name:'Horror'}],vote_average:7.3,runtime:130};
const upcoming={id:2,type:'movie',title:'Upcoming Test Film',original_language:'en',release_date:day(-30),genre_ids:[18],genres:[{id:18,name:'Drama'}]};
const show={id:42,type:'tv',name:'Review Series',title:'Review Series',original_language:'en',first_air_date:'2020-01-01',genre_ids:[18],genres:[{id:18,name:'Drama'}],networks:[{id:4330}],seasons:[{season_number:1,air_date:'2020-01-01',episode_count:2},{season_number:2,air_date:day(7),episode_count:1}],last_episode_to_air:{season_number:1,episode_number:2,air_date:day(-1)},next_episode_to_air:{season_number:2,episode_number:1,air_date:day(7),name:'New season'}};
const dates=id=>({results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:'2025-01-01',note:''},{type:4,release_date:id===2?day(14):day(-10),note:'Paramount+'}]}]});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}),errors=[];
context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
await context.route('**/api/tmdb?*',async route=>{
 const q=new URL(route.request().url()).searchParams,path=q.get('path');let data={results:[]};
 if(path.startsWith('/watch/providers/'))data={results:[{provider_id:2616,provider_name:'Paramount Plus Essential'},{provider_id:8,provider_name:'Netflix'}]};
 else if(path==='/discover/movie')data={page:1,total_pages:1,results:q.get('release_date.gte')===day(0)?[upcoming]:[movie]};
 else if(path==='/discover/tv')data={page:1,total_pages:1,results:[show]};
 else if(path==='/search/movie')data={results:[movie]};
 else if(path==='/search/tv')data={results:[show]};
 else if(path.endsWith('/watch/providers'))data={results:{US:{flatrate:[{provider_id:2616,provider_name:'Paramount Plus Essential'}]}}};
 else if(path.endsWith('/release_dates'))data=dates(Number(path.split('/')[2]));
 else if(path.startsWith('/tv/42/season/')){const season=Number(path.split('/').at(-1));data={episodes:season===1?[{episode_number:1,name:'Pilot',air_date:'2020-01-01'},{episode_number:2,name:'Second',air_date:day(-1)}]:[{episode_number:1,name:'New season',air_date:day(7)}]};}
 else if(path.startsWith('/movie/')){const id=Number(path.split('/')[2]);data={...(id===1246049?movie:id===2?upcoming:{id,type:'movie',title:'Other movie',original_language:'en',release_date:'2020-01-01'}),release_dates:dates(id)};}
 else if(path.startsWith('/tv/'))data={...show,id:Number(path.split('/')[2]),external_ids:{imdb_id:'tt0944947'}};
 await route.fulfill({json:data});
});
await context.route('**/api/digital-prices?*',r=>r.fulfill({json:{matched:true,status:'listed',provider:'Apple TV Store',currency:'USD',url:'https://tv.apple.com/us/movie/test/umc.test',rent:[{format:'HD',amount:19.99}],buy:[{format:'HD',amount:24.99}],checkedAt:new Date().toISOString()}}));
await context.route('**/api/ratings?*',r=>{
 const {searchParams}=new URL(r.request().url());
 const ratings=searchParams.get('type')==='tv'?
  [{source:'imdb',value:9.2},{source:'tomatoes',value:89,url:'/tv/game_of_thrones'},{source:'tomatoesaudience',value:85},{source:'metacritic',value:86,url:'/tv/game-of-thrones'}]:
  [{source:'imdb',value:7},{source:'tomatoes',value:80,url:'//untrusted.test/m/example'},{source:'metacritic',value:75}];
 return r.fulfill({json:{ratings}});
});
await context.route('**/api/ai-picks*',r=>r.fulfill({json:{enabled:false}}));
await context.route('**/auth/v1/settings',r=>r.fulfill({json:{external:{google:false}}}));
const base=process.env.BASE_URL||'http://127.0.0.1:8766';
const page=await context.newPage();await page.goto(base);
await page.locator('#grid .card[data-key="tv:42"]').waitFor();
await page.locator('#grid .card[data-key="tv:42"]').click();
const scores=page.locator('#critic-scores');
const scoreLink=source=>scores.locator('.score-'+source);
await scoreLink('imdb').waitFor();
assert.equal(await scoreLink('imdb').getAttribute('href'),'https://www.imdb.com/title/tt0944947/');
assert.equal(await scoreLink('tomatoes').getAttribute('href'),'https://www.rottentomatoes.com/tv/game_of_thrones');
assert.equal(await scoreLink('tomatoesaudience').getAttribute('href'),await scoreLink('tomatoes').getAttribute('href'));
const metacriticURL='https://www.metacritic.com/tv/game-of-thrones';
await context.route(metacriticURL,r=>r.fulfill({body:'Review page'}));
const reviewTab=page.waitForEvent('popup');
await scoreLink('metacritic').click();
const reviewPage=await reviewTab;
assert.equal(reviewPage.url(),metacriticURL);
await reviewPage.close();
await page.locator('#episode-list .episode-row').first().waitFor();
await page.getByLabel('Follow this series').check();
await page.locator('[data-episode="1:1"]').check();
await page.getByRole('button',{name:'Add to watchlist',exact:true}).click();
await page.getByRole('button',{name:'WATCHLIST',exact:true}).click();
await page.locator('#wl-search').fill('Review');assert.equal(await page.locator('#wl-grid .card').count(),1);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);assert((await page.locator('#wl-grid .card').first().boundingBox()).width<150);await page.screenshot({path:'/tmp/streamradar-watchlist-mobile.png',fullPage:true});
const watchlistHeaderTop=(await page.locator('#v-watchlist .wl-hdr').boundingBox()).y;await page.locator('#v-watchlist').evaluate(el=>{el.scrollTop=160;});assert((await page.locator('#v-watchlist .wl-hdr').boundingBox()).y<watchlistHeaderTop-50);await page.locator('#v-watchlist').evaluate(el=>{el.scrollTop=0;});
await page.locator('#wl-type').selectOption('movie');assert.equal(await page.locator('#wl-grid .card').count(),0);
await page.locator('#wl-type').selectOption('tv');assert.equal(await page.locator('#wl-grid .card').count(),1);
await page.locator('#wl-grid .card').click();await page.locator('[data-episode="1:1"]').waitFor();assert(await page.locator('[data-episode="1:1"]').isChecked());
await page.reload();await page.locator('[data-episode="1:1"]').waitFor();assert(await page.locator('[data-episode="1:1"]').isChecked());
// An account refresh while searching must retain the actual search models.
await page.getByRole('button',{name:'HOME',exact:true}).click();await page.getByRole('searchbox',{name:'Search movies and series',exact:true}).fill('Dracula');await page.locator('#grid .search-result').first().waitFor();
assert.match(await page.locator('#grid').innerText(),/Dracula/);
// Import a valid backup through the real file-input listener.
await page.getByRole('button',{name:'WATCHLIST',exact:true}).click();
await page.locator('#import-backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:2,watchlist:[{id:2,type:'movie',title:'Imported movie',original_language:'en',date:'2020-01-01'}],seen:[],ratings:{},recs:[],dismissed:[]}))});
await page.getByText('Backup merged with your library.',{exact:true}).waitFor();
await page.locator('#wl-search').fill('');await page.locator('#wl-type').selectOption('all');assert.equal(await page.locator('#wl-grid .card').count(),2);
await page.getByRole('button',{name:'UPCOMING',exact:true}).click();
await page.waitForFunction(()=>!document.getElementById('calendar-refresh').disabled,{},{timeout:15000});
await page.locator('#calendar-month').selectOption(day(14).slice(0,7));
await page.locator('.calendar-entry').filter({hasText:'Upcoming Test Film'}).filter({hasText:'Streaming premiere'}).waitFor();
const downloadPromise=page.waitForEvent('download');await page.locator('.calendar-entry').filter({hasText:'Upcoming Test Film'}).filter({hasText:'Streaming premiere'}).getByRole('button',{name:'Add to calendar',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'streamradar-event.ics');
await page.locator('.calendar-entry').filter({hasText:'Upcoming Test Film'}).filter({hasText:'Streaming premiere'}).getByRole('button',{name:'Upcoming Test Film',exact:true}).click();await page.getByRole('button',{name:'Add to calendar',exact:true}).waitFor();assert.match(await page.locator('#detail-actions').innerText(),/Streaming premiere/);await page.getByRole('button',{name:'Rate Upcoming Test Film 4.5 of 5 stars',exact:true}).click();await page.getByText('Your rating: 4.5 of 5',{exact:true}).waitFor();assert.equal(await page.locator('#movie-journey').isVisible(),false);await page.getByRole('button',{name:'Release timeline',exact:true}).click();await page.locator('#movie-journey').filter({hasText:'Rent from $19.99'}).waitFor();assert.doesNotMatch(await page.locator('#movie-journey').innerText(),/Buy from/);
await page.getByRole('button',{name:'Close release timeline',exact:true}).click();assert.equal(await page.locator('#movie-journey-dialog').isVisible(),false);
assert.equal(await scoreLink('imdb').getAttribute('href'),'https://www.imdb.com/find/?q=Upcoming%20Test%20Film');
assert.equal(await scoreLink('tomatoes').getAttribute('href'),'https://www.rottentomatoes.com/search?search=Upcoming%20Test%20Film');
assert.equal(await scoreLink('metacritic').getAttribute('href'),'https://www.metacritic.com/search/Upcoming%20Test%20Film/');
const detailDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Add to calendar',exact:true}).click();assert.equal((await detailDownload).suggestedFilename(),'streamradar-event.ics');
await page.reload();await page.getByText('Your rating: 4.5 of 5',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Rate Upcoming Test Film 4.5 of 5 stars',exact:true}).getAttribute('aria-pressed'),'true');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
// Two stale tabs write different titles concurrently; neither save may disappear.
const second=await context.newPage();await Promise.all([page.goto(base+'/#detail/movie:3'),second.goto(base+'/#detail/movie:4')]);
await Promise.all([page.getByRole('button',{name:'Add to watchlist',exact:true}).waitFor(),second.getByRole('button',{name:'Add to watchlist',exact:true}).waitFor()]);
await Promise.all([page.getByRole('button',{name:'Add to watchlist',exact:true}).click(),second.getByRole('button',{name:'Add to watchlist',exact:true}).click()]);
await page.getByRole('button',{name:'WATCHLIST',exact:true}).click();await page.locator('#wl-search').fill('');await page.locator('#wl-type').selectOption('all');
assert.equal(await page.locator('#wl-grid .card[data-key="movie:3"][data-action="detail"]').count(),1);assert.equal(await page.locator('#wl-grid .card[data-key="movie:4"][data-action="detail"]').count(),1);
await page.getByRole('button',{name:'UPCOMING',exact:true}).click();await page.locator('#calendar-month').selectOption(day(14).slice(0,7));
assert.equal(await page.getByRole('button',{name:'UPCOMING',exact:true}).getAttribute('aria-current'),'page');
await page.screenshot({path:'/tmp/streamradar-upcoming-mobile.png',fullPage:true});
await page.setViewportSize({width:1365,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
await page.screenshot({path:'/tmp/streamradar-upcoming-desktop.png',fullPage:true});
assert.deepEqual(errors,[]);
await page.screenshot({path:process.env.BROWSER_SCREENSHOT||'/tmp/streamradar-mobile-check.png',fullPage:true});
await context.close();await browser.close();server?.kill();console.log('PASS: mobile navigation, episode persistence, watchlist filters, backup import, upcoming streaming events, calendar download, detail date and no page errors.');
