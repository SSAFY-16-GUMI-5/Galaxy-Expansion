/** Deterministic, language-independent Galaxy Expansion event/state contract. */
export const STAGES = Object.freeze([
  { id: 1, name: 'COSMIC SEED', title: 'Cosmic Seed', min: 0, max: 9 },
  { id: 2, name: 'STAR CLUSTER', title: 'Star Cluster', min: 10, max: 29 },
  { id: 3, name: 'PROTO GALAXY', title: 'Proto Galaxy', min: 30, max: 99 },
  { id: 4, name: 'GALAXY', title: 'Galaxy', min: 100, max: Number.MAX_SAFE_INTEGER }
]);
export const stageForCount = (n) => STAGES.findLast(s => n >= s.min) ?? STAGES[0];
export const MAX_ACTIVE = 1200;
export const MAX_NAME = 40;
export const MAX_SLOTS_PER_PARTICIPANT = 500;
const PARTICIPANT = /^[a-zA-Z0-9_-]{1,32}$/;
const SLOT = /^[a-zA-Z0-9_-]{1,48}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const TYPE = new Set(['seed','star','planet']);
export function validateEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'Message must be an object';
  if (!PARTICIPANT.test(e.participantId ?? '')) return 'Invalid participantId';
  if (e.type === 'reset') return null;
  if (e.type !== 'acquire' && e.type !== 'release') return 'Unknown event type';
  if ((typeof e.poolSlotId !== 'string' && !Number.isSafeInteger(e.poolSlotId)) || !SLOT.test(String(e.poolSlotId))) return 'Invalid poolSlotId';
  if (!Number.isSafeInteger(e.generation) || e.generation < 1) return 'Invalid generation';
  if (e.type === 'acquire') {
    if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) return 'Missing star data';
    const { name, color, size, type } = e.data;
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > MAX_NAME) return 'Invalid name';
    if (typeof color !== 'string' || !HEX.test(color)) return 'Invalid color';
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0.3 || size > 3.5) return 'Size must be between 0.3 and 3.5';
    if (!TYPE.has(type)) return 'Invalid cosmic type';
  }
  return null;
}
export class GalaxyState {
  constructor() { this.slots = new Map(); this.sequence = 0; this.totalAcquired = 0; this.reuseCount = 0; }
  get activeCount() { return [...this.slots.values()].filter(x => x.active).length; }
  get availableCount() { return this.slots.size - this.activeCount; }
  get participants() { return new Set([...this.slots.values()].map(x => x.participantId)).size; }
  snapshot() {
    return { type:'snapshot', revision:this.sequence, stage:stageForCount(this.activeCount), activeCount:this.activeCount,
      pooledCount:this.slots.size, availableCount:this.availableCount, totalAcquired:this.totalAcquired,
      reuseCount:this.reuseCount, participants:this.participants,
      stars:[...this.slots.values()].filter(s=>s.active).map(s=>({...s})) };
  }
  applyEvent(e) {
    const error=validateEvent(e);
    if (error) return { ok:false, error };
    const stageBefore=stageForCount(this.activeCount).id;
    if(e.type==='reset') {
      for(const [key,slot] of this.slots) if(slot.participantId===e.participantId) this.slots.delete(key);
      this.sequence++;
      return {ok:true, event:{type:'reset',participantId:e.participantId,revision:this.sequence},stageChanged:stageBefore!==stageForCount(this.activeCount).id};
    }
    const key=`${e.participantId}:${e.poolSlotId}`;
    const old=this.slots.get(key);
    if(e.type==='release') {
      if(!old || !old.active) return {ok:false,error:'Slot is not active'};
      if(old.generation!==e.generation) return {ok:false,error:'Stale release generation'};
      this.slots.set(key,{...old,active:false});
      this.sequence++;
      return {ok:true,event:{type:'release',participantId:e.participantId,poolSlotId:String(e.poolSlotId),generation:e.generation,revision:this.sequence},stageChanged:stageBefore!==stageForCount(this.activeCount).id};
    }
    if(old?.active) return {ok:false,error:'Slot is already active'};
    if(old && e.generation!==old.generation+1) return {ok:false,error:'Reused slot must increment generation by one'};
    if(!old && e.generation!==1) return {ok:false,error:'New slot must begin at generation 1'};
    if(!old && [...this.slots.values()].filter(s=>s.participantId===e.participantId).length>=MAX_SLOTS_PER_PARTICIPANT)
      return {ok:false,error:'Participant slot limit reached'};
    if(this.activeCount>=MAX_ACTIVE) return {ok:false,error:'Active star limit reached'};
    const reused=Boolean(old);
    const slot={key,participantId:e.participantId,poolSlotId:String(e.poolSlotId),generation:e.generation,
      name:e.data.name.trim(),type:e.data.type,color:e.data.color,size:e.data.size,active:true,reused};
    this.slots.set(key,slot);this.sequence++;this.totalAcquired++;if(reused)this.reuseCount++;
    return {ok:true,event:{type:'acquire',star:{...slot},revision:this.sequence},stageChanged:stageBefore!==stageForCount(this.activeCount).id};
  }
}
