import test from 'node:test';
import assert from 'node:assert/strict';
import { GalaxyState, stageForCount, validateEvent } from '../public/js/galaxy-state.mjs';
const acquire=(slot,participantId='alice',generation=1)=>({type:'acquire',participantId,poolSlotId:slot,generation,data:{name:'Blue Star',color:'#38bdf8',size:1.2,type:'star'}});
test('stage thresholds use currently active stars',()=>{
  assert.deepEqual([0,9,10,29,30,99,100,1000].map(x=>stageForCount(x).id),[1,1,2,2,3,3,4,4]);
});
test('acquire-release-reuse maintains slot identity with generation increment',()=>{
  const s=new GalaxyState();
  assert.equal(s.applyEvent(acquire('1')).ok,true);
  assert.equal(s.activeCount,1);
  assert.equal(s.applyEvent({type:'release',participantId:'alice',poolSlotId:'1',generation:1}).ok,true);
  assert.equal(s.activeCount,0);
  assert.equal(s.applyEvent(acquire('1','alice',2)).ok,true);
  assert.equal(s.snapshot().stars[0].key,'alice:1');
  assert.equal(s.snapshot().reuseCount,1);
  assert.equal(s.snapshot().pooledCount,1);
});
test('saved state restores active stars and the generation of released slots', () => {
  const original = new GalaxyState();
  original.applyEvent(acquire('visible', 'bob'));
  original.applyEvent(acquire('reusable'));
  original.applyEvent({ type: 'release', participantId: 'alice', poolSlotId: 'reusable', generation: 1 });

  const restored = GalaxyState.fromSavedState(JSON.parse(JSON.stringify(original.toSavedState())));
  assert.deepEqual(restored.snapshot(), original.snapshot());
  assert.equal(restored.applyEvent(acquire('reusable')).ok, false);
  assert.equal(restored.applyEvent(acquire('reusable', 'alice', 2)).event.revision, 4);
  assert.equal(restored.reuseCount, 1);
});
test('active slot and stale release are rejected',()=>{
  const s=new GalaxyState(); s.applyEvent(acquire('a'));
  assert.equal(s.applyEvent(acquire('a')).ok,false);
  assert.equal(s.applyEvent({type:'release',participantId:'alice',poolSlotId:'a',generation:2}).ok,false);
});
test('multiple participants can use the same slot ID',()=>{
  const s=new GalaxyState();s.applyEvent(acquire('1','alice'));s.applyEvent(acquire('1','bob'));
  assert.equal(s.activeCount,2);assert.equal(s.participants,2);
});
test('invalid properties and unknown events are blocked',()=>{
  assert.match(validateEvent({...acquire('1'),data:{name:'A',size:0,color:'#xyzabc',type:'star'}}),/color/);
  assert.match(validateEvent({...acquire('1'),type:'delete'}),/Unknown/);
});
test('growth and shrink are driven by activeCount, not cumulative acquisitions',()=>{
  const s=new GalaxyState();for(let i=0;i<10;i++)s.applyEvent(acquire(String(i)));
  assert.equal(s.snapshot().stage.id,2);
  s.applyEvent({type:'release',participantId:'alice',poolSlotId:'0',generation:1});
  assert.equal(s.snapshot().stage.id,1);
});
test('reset affects only its author',()=>{
  const s=new GalaxyState();s.applyEvent(acquire('1','alice'));s.applyEvent(acquire('1','bob'));
  s.applyEvent({type:'reset',participantId:'alice'});assert.equal(s.activeCount,1);
  assert.equal(s.snapshot().stars[0].participantId,'bob');
});
test('acquire requires a slot identifier',()=>{
  const evt=acquire('1');delete evt.poolSlotId;
  assert.match(validateEvent(evt),/poolSlotId/);
});
