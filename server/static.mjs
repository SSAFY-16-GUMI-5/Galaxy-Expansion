import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.zip':'application/zip'};

export async function servePublic(req,res){
  let path;
  try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
  catch{res.writeHead(400);res.end('Invalid URL');return;}
  const file=resolve(root,`.${path==='/'?'/index.html':path}`);
  if(file!==root && !file.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes)}
  catch{res.writeHead(404);res.end('Not found')}
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);
  createServer(servePublic).listen(port,'0.0.0.0',()=>console.log(`Galaxy web: http://localhost:${port}`));
}
