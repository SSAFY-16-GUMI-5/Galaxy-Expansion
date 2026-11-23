import { GalaxyState, STAGES, stageForCount } from './galaxy-state.mjs';

const $ = (id) => document.getElementById(id);
const dom = {
  mount: $('scene-canvas'), fallback: $('scene-fallback'), sceneLabel: $('scene-status-label'),
  renderState: $('render-state'), active: $('active-count'), allocated: $('allocated-count'), reused: $('reused-count'),
  participants: $('participant-count'), stage: $('current-stage'), progress: $('progress-value'), next: $('next-stage'),
  stagePill: $('scene-stage-pill'), log: $('activity-log'),
  status: $('connection-status'), detail: $('connection-detail'), indicator: $('connection-indicator'),
  mode: $('mode-badge'), name: $('star-name'), color: $('star-color'), size: $('star-size'), sizeLabel: $('size-label'),
  create: $('create-star'), createTen: $('create-ten'), release: $('release-star'), reset: $('reset-demo'),
  wsUrl: $('ws-url'), connect: $('connect-live'), demo: $('demo-mode')
};
let sceneView = null;
let live = false;
let socket = null;
let lastStageId = 1;
const demo = new GalaxyState();
const demoGenerations = new Map();
let nextDemoSlot = 1;
const demoAuthors=['Yuna','Min','Alex'];
const colors=['#5dcaff','#a78bfa','#f8cf86','#59e5c8','#fb789e'];
const demoNames=['Cosmic Seed','Nova','Luminous','Orion','Astra','Lyra','Nebula','Stella'];

function nowLabel(){return new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});}
function escapeNode(value){const el=document.createElement('span');el.textContent=String(value);return el.textContent;}
function logEvent(title,description,kind='create'){
  const el=document.createElement('div');el.className='activity-item';
  const icon=document.createElement('div');icon.className='activity-icon '+kind;icon.textContent=({create:'✦',release:'↩',reuse:'↻',stage:'✧'})[kind]||'✦';
  const body=document.createElement('div');body.className='activity-body';
  const strong=document.createElement('strong');strong.textContent=title;
  const p=document.createElement('p');p.textContent=description;
  const time=document.createElement('span');time.className='activity-time';time.textContent=nowLabel();
  body.append(strong,p);el.append(icon,body,time);dom.log.prepend(el);
  while(dom.log.children.length>12)dom.log.lastElementChild.remove();
}
function updateUI(snapshot){
  const count=snapshot.activeCount;const stage=stageForCount(count);
  dom.active.textContent=count.toLocaleString('en-US');
  dom.allocated.textContent=snapshot.pooledCount.toLocaleString('en-US');
  dom.reused.textContent=snapshot.reuseCount.toLocaleString('en-US');
  dom.participants.textContent=snapshot.participants;
  dom.stage.textContent=`${String(stage.id).padStart(2,'0')} / 04`;
  dom.stagePill.textContent=`STAGE ${String(stage.id).padStart(2,'0')} · ${stage.name}`;
  const next=STAGES[stage.id];
  const progress=next?((count-stage.min)/(next.min-stage.min))*100:100;
  dom.progress.style.width=`${Math.min(100,Math.max(0,progress))}%`;
  dom.next.textContent=next?`다음 단계까지 별 ${next.min-count}개`:'최종 성장 단계에 도달했습니다';
  document.querySelectorAll('.stage-item').forEach(item=>{
    const id=Number(item.dataset.stage);item.classList.toggle('current',id===stage.id);item.classList.toggle('done',id<stage.id);
  });
  if(stage.id!==lastStageId){
    logEvent(`Expansion: ${stage.title}`,`현재 활성 별 ${count}개 · Stage ${stage.id} 진입`,'stage');lastStageId=stage.id;
  }
  sceneView?.setSnapshot(snapshot);
}
function report(result){
  if(!result.ok){logEvent('Event rejected',result.error,'release');return false;}
  const e=result.event;
  if(e.type==='acquire')logEvent(e.star.reused?'Object Reused':'Star Created',`${e.star.name} · ${e.star.participantId} · Slot ${e.star.poolSlotId}`,e.star.reused?'reuse':'create');
  if(e.type==='release')logEvent('Object Released',`${e.participantId} · Slot ${e.poolSlotId}`,'release');
  if(e.type==='reset')logEvent('Pool Reset',`${e.participantId} objects cleared`,'release');
  return true;
}
function applyDemo(event,quiet=false){
  const result=demo.applyEvent(event);if(!quiet)report(result);return result;
}
function seedDemo(){
  for(let i=0;i<7;i++){
    const author=demoAuthors[i%demoAuthors.length];const slot=String(nextDemoSlot++);
    applyDemo({type:'acquire',participantId:author,poolSlotId:slot,generation:1,data:{name:`${demoNames[i%demoNames.length]} ${i+1}`,type:'star',color:colors[i%colors.length],size:0.6+(i%4)*0.3}},true);
    demoGenerations.set(`${author}:${slot}`,1);
  }
  lastStageId=1;
  updateUI(demo.snapshot());
  logEvent('Universe initialized','7 active cosmic objects · demo mode','stage');
}
function createStar(quiet=false){
  const name=dom.name.value.trim()||'Unnamed Star';
  const author='visitor';
  const reusable=[...demo.slots.values()].find(s=>s.participantId===author&&!s.active);
  const slot=reusable?.poolSlotId ?? String(nextDemoSlot++);
  const generation=reusable?reusable.generation+1:1;
  const event={type:'acquire',participantId:author,poolSlotId:slot,generation,data:{name,color:dom.color.value,size:Number(dom.size.value),type:'star'}};
  const result=applyDemo(event,quiet);if(!result.ok)return false;
  demoGenerations.set(`${author}:${slot}`,generation);return true;
}
function setMode(isLive,status,description){
  live=isLive;dom.status.textContent=status;dom.detail.textContent=description;
  dom.mode.textContent=isLive?'LIVE':'DEMO';dom.create.disabled=isLive;dom.createTen.disabled=isLive;
  dom.release.disabled=isLive;dom.reset.disabled=isLive;
  dom.connect.hidden=isLive;dom.demo.hidden=!isLive;
  dom.indicator.style.background=isLive?'#70e9b5':'#96a4ff';
}
function exitLive(){
  if(socket){socket.onclose=null;socket.close();socket=null;}
  setMode(false,'DEMO MODE','로컬 시뮬레이션 실행 중');
  lastStageId=stageForCount(demo.activeCount).id;updateUI(demo.snapshot());
  logEvent('Demo mode resumed','Local sandbox active','stage');
}
function connectLive(){
  const endpoint=dom.wsUrl.value.trim()||'ws://127.0.0.1:8787/ws';
  if(!/^wss?:\/\//.test(endpoint)){logEvent('Connection error','ws:// 또는 wss:// 주소를 입력하십시오','release');return;}
  if(location.protocol==='https:'&&endpoint.startsWith('ws://')){logEvent('Secure connection required','HTTPS 페이지에서는 wss:// 연결을 사용하십시오','release');return;}
  if(socket)socket.close();
  let ws;try{ws=new WebSocket(endpoint)}catch(e){logEvent('Connection error',e.message,'release');return;}
  socket=ws;dom.status.textContent='CONNECTING';dom.detail.textContent='WebSocket 세션 연결 중';
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',role:'viewer'}));
  ws.onmessage=(message)=>{
    let data;try{data=JSON.parse(message.data)}catch{return;}
    if(data.type==='hello_ack'&&data.role==='viewer'){
      setMode(true,'LIVE CONNECTED',endpoint);logEvent('Relay connected',endpoint,'stage');
    }
    if(data.type==='snapshot'){lastStageId=stageForCount(data.activeCount).id;updateUI(data);}
    if(data.type==='event'){
      const e=data.event;
      if(e.type==='acquire') logEvent(e.star.reused?'Object Reused':'Star Created',`${e.star.name} · ${e.star.participantId}`,e.star.reused?'reuse':'create');
      if(e.type==='release') logEvent('Object Released',`${e.participantId} · Slot ${e.poolSlotId}`,'release');
      if(e.type==='reset') logEvent('Pool Reset',`${e.participantId} objects cleared`,'release');
      updateUI(data.stats);
    }
    if(data.type==='participant_status')logEvent(data.online?'Participant joined':'Participant offline',data.participantId,'stage');
    if(data.type==='error')logEvent('Relay error',data.message,'release');
  };
  ws.onerror=()=>logEvent('WebSocket error','서버 주소와 연결 상태를 확인하십시오','release');
  ws.onclose=()=>{
    if(socket!==ws)return;
    socket=null;dom.status.textContent='DISCONNECTED';dom.detail.textContent='연결이 종료되었습니다. DEMO 버튼으로 전환하십시오.';
    dom.connect.hidden=false;dom.demo.hidden=false;
    logEvent('Connection lost','Relay server disconnected','release');
  };
}
dom.create.addEventListener('click',()=>{if(live)return;createStar();updateUI(demo.snapshot());});
dom.createTen.addEventListener('click',()=>{if(live)return;for(let i=0;i<10;i++){if(!createStar(true))break;}updateUI(demo.snapshot());logEvent('Batch created','Up to 10 objects acquired','create');});
dom.release.addEventListener('click',()=>{
  if(live)return;
  const active=[...demo.slots.values()].filter(s=>s.active);
  const last=active.findLast(s=>s.participantId==='visitor')??active.at(-1);
  if(!last){logEvent('Nothing to release','No active stars','release');return;}
  report(demo.applyEvent({type:'release',participantId:last.participantId,poolSlotId:last.poolSlotId,generation:last.generation}));
  updateUI(demo.snapshot());
});
dom.reset.addEventListener('click',()=>{
  if(live)return;for(const author of [...new Set([...demo.slots.values()].map(s=>s.participantId))])demo.applyEvent({type:'reset',participantId:author});
  nextDemoSlot=1;demoGenerations.clear();lastStageId=1;updateUI(demo.snapshot());logEvent('Universe reset','All demo objects cleared','release');
});
dom.size.addEventListener('input',()=>{dom.sizeLabel.textContent=Number(dom.size.value).toFixed(1);});
dom.connect.addEventListener('click',connectLive);
dom.demo.addEventListener('click',exitLive);
dom.wsUrl.value=location.hostname==='localhost'||location.hostname==='127.0.0.1'?'ws://127.0.0.1:8787/ws':'';

// Three.js is a browser-only module imported lazily, so the non-rendering UI remains useful if CDN access fails.
async function createRenderer(){
  const THREE=await import('three');
  const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');
  const {EffectComposer}=await import('three/addons/postprocessing/EffectComposer.js');
  const {RenderPass}=await import('three/addons/postprocessing/RenderPass.js');
  const {UnrealBloomPass}=await import('three/addons/postprocessing/UnrealBloomPass.js');
  const {OutputPass}=await import('three/addons/postprocessing/OutputPass.js');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#030611');
  scene.fog=new THREE.FogExp2('#030611',0.0018);
  const camera=new THREE.PerspectiveCamera(53,1,0.1,1500);camera.position.set(0,12,19);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  dom.mount.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=3;controls.maxDistance=190;
  controls.autoRotate=true;controls.autoRotateSpeed=.23;controls.enablePan=false;
  renderer.domElement.addEventListener('pointerdown',()=>{controls.autoRotate=false;});
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(100,100),1.0,.55,.14));
  composer.addPass(new OutputPass());
  const MAX=1200;
  const geometry=new THREE.SphereGeometry(1,16,12);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
  // Single Points draw call for many luminous halos.
  const glowGeo=new THREE.BufferGeometry();
  const glPos=new Float32Array(MAX*3),glColor=new Float32Array(MAX*3),glSize=new Float32Array(MAX);
  glowGeo.setAttribute('position',new THREE.BufferAttribute(glPos,3).setUsage(THREE.DynamicDrawUsage));
  glowGeo.setAttribute('color',new THREE.BufferAttribute(glColor,3).setUsage(THREE.DynamicDrawUsage));
  glowGeo.setAttribute('aSize',new THREE.BufferAttribute(glSize,1).setUsage(THREE.DynamicDrawUsage));
  glowGeo.setDrawRange(0,0);
  const glowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
    vertexColors:false,uniforms:{uPixelRatio:{value:Math.min(devicePixelRatio||1,1.6)}},
    vertexShader:`attribute vec3 color; attribute float aSize; varying vec3 vColor; uniform float uPixelRatio; void main(){vColor=color; vec4 v=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*v; gl_PointSize=clamp(aSize*320.0*uPixelRatio/max(1.0,-v.z),4.0,95.0);}`,
    fragmentShader:`varying vec3 vColor; void main(){vec2 p=gl_PointCoord*2.0-1.0; float d=length(p); float a=pow(max(0.0,1.0-d),3.8)*0.75; if(d>1.0)discard; gl_FragColor=vec4(vColor*a,a);}`});
  const glows=new THREE.Points(glowGeo,glowMaterial);glows.frustumCulled=false;scene.add(glows);
  // Backdrop: deterministic deep-space dust with subtle layers.
  const bgCount=1500,bgPos=new Float32Array(bgCount*3),bgCol=new Float32Array(bgCount*3);
  for(let i=0;i<bgCount;i++){
    const a=i*2.3999632297,r=90+((i*37)%120),h=((i*71)%200)-100;
    bgPos[i*3]=Math.cos(a)*r;bgPos[i*3+1]=h;bgPos[i*3+2]=Math.sin(a)*r;
    const tint=i%6;bgCol[i*3]=tint===0?.48:.2;bgCol[i*3+1]=tint===0?.55:.32;bgCol[i*3+2]=.64;
  }
  const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.BufferAttribute(bgPos,3));starsGeo.setAttribute('color',new THREE.BufferAttribute(bgCol,3));
  scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({size:.34,transparent:true,opacity:.75,vertexColors:true,sizeAttenuation:true,depthWrite:false})));
  const actors=new Map();const tmp=new THREE.Object3D();const tint=new THREE.Color();
  let stageId=1,desiredDistance=19,lastTime=performance.now();
  function hash(input){let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;}
  function pointFor(star,index,total,stage){
    const seed=hash(star.key+':'+star.generation),a=index*2.3999632+seed*2*Math.PI;
    const t=total<=1?.5:(index+.5)/total;
    if(stage===1){const r=1.2+Math.sqrt(t)*4.2;return new THREE.Vector3(Math.cos(a)*r,(seed-.5)*3,Math.sin(a)*r);}
    if(stage===2){const cluster=index%3,b=cluster*2*Math.PI/3;const radius=3.5+Math.sqrt(t)*5.5;
      return new THREE.Vector3(Math.cos(b)*5+Math.cos(a)*radius,(seed-.5)*5,Math.sin(b)*5+Math.sin(a)*radius);}
    const arm=index%(stage===3?3:4),arms=stage===3?3:4;
    const radius=2+Math.sqrt(t)*(stage===3?23:43);
    const theta=arm*2*Math.PI/arms+radius*(stage===3?.18:.12)+(seed-.5)*.36;
    return new THREE.Vector3(Math.cos(theta)*radius,(seed-.5)*(stage===3?5:8)*Math.sqrt(t),Math.sin(theta)*radius);
  }
  function setSnapshot(snapshot){
    const stars=snapshot.stars??[];stageId=snapshot.stage?.id||stageForCount(stars.length).id;
    desiredDistance=([19,32,59,109][stageId-1]||19);
    const activeKeys=new Set(stars.map(s=>s.key));
    for(const key of actors.keys())if(!activeKeys.has(key))actors.delete(key);
    for(let i=0;i<Math.min(MAX,stars.length);i++){
      const star=stars[i];const target=pointFor(star,i,stars.length,stageId);
      let actor=actors.get(star.key);
      if(!actor){actor={pos:target.clone().multiplyScalar(1.2),target,scale:.02,size:star.size,color:new THREE.Color(star.color),generation:star.generation,star};actors.set(star.key,actor);}
      else{if(actor.generation!==star.generation){actor.scale=.02;actor.generation=star.generation;}
        actor.target=target;actor.size=star.size;actor.color.set(star.color);actor.star=star;}
    }
  }
  function resize(){
    const w=Math.max(1,dom.mount.clientWidth),h=Math.max(1,dom.mount.clientHeight);
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);composer.setSize(w,h);
  }
  const observer=new ResizeObserver(resize);observer.observe(dom.mount);resize();
  function animate(time){
    const dt=Math.min(.05,(time-lastTime)/1000||.016);lastTime=time;
    const distance=camera.position.length();
    if(controls.autoRotate){const newDistance=THREE.MathUtils.damp(distance,desiredDistance,1.3,dt);camera.position.setLength(newDistance);}
    controls.update();
    let i=0;
    for(const actor of actors.values()){
      if(i>=MAX)break;
      actor.pos.lerp(actor.target,1-Math.exp(-dt*2.2));actor.scale=THREE.MathUtils.damp(actor.scale,1,5,dt);
      tmp.position.copy(actor.pos);tmp.scale.setScalar(Math.max(.001,actor.size*.35*actor.scale));tmp.updateMatrix();
      mesh.setMatrixAt(i,tmp.matrix);mesh.setColorAt(i,actor.color);
      const j=i*3;glPos[j]=actor.pos.x;glPos[j+1]=actor.pos.y;glPos[j+2]=actor.pos.z;
      glColor[j]=actor.color.r;glColor[j+1]=actor.color.g;glColor[j+2]=actor.color.b;
      glSize[i]=actor.size*actor.scale; i++;
    }
    mesh.count=i;mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    glowGeo.attributes.position.needsUpdate=true;glowGeo.attributes.color.needsUpdate=true;glowGeo.attributes.aSize.needsUpdate=true;
    glowGeo.setDrawRange(0,i);
    composer.render();requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  return {setSnapshot};
}
seedDemo();
createRenderer().then(view=>{
  sceneView=view;view.setSnapshot(demo.snapshot());dom.sceneLabel.classList.add('hidden');dom.renderState.textContent='WEBGL 3D';
}).catch(e=>{
  console.error('[galaxy] 3D initialization failed:',e);
  dom.sceneLabel.classList.add('hidden');dom.fallback.hidden=false;dom.renderState.textContent='UNAVAILABLE';
});
