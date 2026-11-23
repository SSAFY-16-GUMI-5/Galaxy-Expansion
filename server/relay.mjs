import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { GalaxyState, MAX_ACTIVE } from '../public/js/galaxy-state.mjs';

const HOST = process.env.GALAXY_HOST ?? '127.0.0.1';
const PORT = Number(process.env.GALAXY_PORT ?? 8787);
const TOKEN = process.env.GALAXY_PRODUCER_TOKEN ?? (HOST === '127.0.0.1' ? 'local-demo-token' : '');
if (!TOKEN) throw new Error('GALAXY_PRODUCER_TOKEN is required when the server is not bound to localhost.');
if (!process.env.GALAXY_PRODUCER_TOKEN) console.warn('Local development token in use; do not expose this server to the internet.');

const state = new GalaxyState();
const producers = new Map();
const server = createServer((req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,active:state.activeCount,stage:state.snapshot().stage.id,viewers:wss.clients.size,limit:MAX_ACTIVE}));
  } else {res.writeHead(404);res.end('Not found');}
});
const wss = new WebSocketServer({server,maxPayload:8192, path:'/ws',perMessageDeflate:false});
const send=(ws,msg)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));};
const publish=(msg)=>{for(const client of wss.clients){if(client.role==='viewer')send(client,msg);}};
const authorized=(input)=>{
  if(typeof input!=='string') return false;
  const actual=Buffer.from(input),expected=Buffer.from(TOKEN);
  return actual.length===expected.length && timingSafeEqual(actual,expected);
};
function rateAllowed(ws){
  const now=Date.now();if(now-ws.windowStart>1000){ws.windowStart=now;ws.windowCount=0;}
  return ++ws.windowCount <= 90;
}
wss.on('connection',(ws)=>{
  ws.role='pending';ws.windowStart=Date.now();ws.windowCount=0;ws.isAlive=true;
  ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',(bytes)=>{
    if(!rateAllowed(ws)){send(ws,{type:'error',message:'Rate limit reached'});ws.close(1008,'Rate limit');return;}
    let msg;
    try{msg=JSON.parse(bytes.toString('utf8'));}catch{send(ws,{type:'error',message:'Invalid JSON'});return;}
    if(!msg || typeof msg!=='object'||Array.isArray(msg)){send(ws,{type:'error',message:'Expected object'});return;}
    if(ws.role==='pending'){
      if(msg.type!=='hello'){send(ws,{type:'error',message:'Send hello first'});return;}
      if(msg.role==='viewer'){
        ws.role='viewer';send(ws,{type:'hello_ack',role:'viewer'});send(ws,state.snapshot());return;
      }
      if(msg.role!=='producer'||!authorized(msg.token)){
        send(ws,{type:'error',message:'Invalid producer credentials'});ws.close(1008,'Unauthorized');return;
      }
      if(typeof msg.participantId!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(msg.participantId)){
        send(ws,{type:'error',message:'Invalid participantId'});ws.close(1008,'Participant');return;
      }
      if(producers.has(msg.participantId)){
        send(ws,{type:'error',message:'Participant already connected'});ws.close(1008,'Duplicate');return;
      }
      ws.role='producer';ws.participantId=msg.participantId;producers.set(ws.participantId,ws);
      send(ws,{type:'hello_ack',role:'producer',participantId:ws.participantId});
      publish({type:'participant_status',participantId:ws.participantId,online:true});return;
    }
    if(ws.role==='viewer'){send(ws,{type:'error',message:'Viewer is read-only'});return;}
    if(!['acquire','release','reset'].includes(msg.type)){send(ws,{type:'error',message:'Unsupported command'});return;}
    // Never trust client-supplied ownership: bind each event to its authenticated connection.
    const result=state.applyEvent({...msg,participantId:ws.participantId});
    if(!result.ok){send(ws,{type:'error',message:result.error});return;}
    send(ws,{type:'ack',revision:result.event.revision,action:msg.type});
    publish({type:'event',event:result.event,stats:state.snapshot()});
  });
  ws.on('close',()=>{
    if(ws.role==='producer'&&producers.get(ws.participantId)===ws){
      producers.delete(ws.participantId);publish({type:'participant_status',participantId:ws.participantId,online:false});
    }
  });
  ws.on('error',e=>console.warn('socket:',e.message));
});
const interval=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
wss.on('close',()=>clearInterval(interval));
server.listen(PORT,HOST,()=>console.log(`Galaxy relay listening on ws://${HOST}:${PORT}/ws`));
