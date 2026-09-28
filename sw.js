const CACHE='streamradar-shell-20260928-4';
const SHELL=['/','/index.html','/styles.css','/app.js','/core.js','/legacy-config.js','/manifest.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('streamradar-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||(!SHELL.includes(url.pathname)&&event.request.mode!=='navigate'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(!response.ok)throw new Error('Shell unavailable');
      try{await cache.put(event.request.mode==='navigate'?'/':url.pathname,response.clone());}catch{/* Storage pressure must not discard a working online response. */}return response;
    }catch{
      return await cache.match(event.request.mode==='navigate'?'/':url.pathname)||new Response('StreamRadar is offline. Reconnect to load the app.',{status:503,headers:{'Content-Type':'text/plain'}});
    }
  })());
});
