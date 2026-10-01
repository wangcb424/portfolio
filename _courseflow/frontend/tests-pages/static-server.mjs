// Local test fixture only. Chromium's page offline emulation does not reliably
// disconnect its service-worker target, so this server can also fail real fetches.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist'),base='/portfolio/courseflow/';
let disconnected=false;
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4189');
  if(req.method==='POST'&&url.pathname==='/__test__/network'){
    disconnected=url.searchParams.get('offline')==='true';res.writeHead(204).end();return;
  }
  if(disconnected){req.socket.destroy();return;}
  if(!url.pathname.startsWith(base)){res.writeHead(404).end();return;}
  const file=resolve(root,decodeURIComponent(url.pathname.slice(base.length))||'index.html');
  if(!file.startsWith(`${root}${sep}`)){res.writeHead(403).end();return;}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);}
  catch{res.writeHead(404).end();}
}).listen(4189,'127.0.0.1');
