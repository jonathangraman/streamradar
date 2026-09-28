import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import tmdb from '../api/tmdb.js';
import ratings from '../api/ratings.js';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
try{process.loadEnvFile(path.join(root,'.env.local'));}catch{}
const files=new Set(['index.html','styles.css','app.js','core.js','legacy-config.js','manifest.json','sw.js','icon-192.png','icon-512.png']);
http.createServer(async(req,res)=>{
  res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/api/tmdb')return tmdb(req,res);if(name==='/api/ratings')return ratings(req,res);
  const file=name==='/'?'index.html':name.slice(1);
  if(!files.has(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/javascript');
  res.setHeader('Cache-Control','no-cache');res.end(fs.readFileSync(path.join(root,file)));
}).listen(8765,'127.0.0.1',()=>console.log('StreamRadar preview: http://127.0.0.1:8765'));
