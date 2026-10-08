import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createNative2TargetStorage, createNative2TargetPreserve } from './experimental-native2-target-preserve';
const scope = { issuer:'controlled-issuer',subject:'controlled-writer',tenantId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',workspaceId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const documentId='33333333-3333-4333-8333-333333333333',hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const target=JSON.stringify({format:'barocss-note',version:2,schemaBundle:NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle,document:NATIVE_NOTE_FIXTURES.TARGET_A2.document,savedAt:NATIVE_NOTE_FIXTURES.TARGET_A2.savedAt},null,2)+'\n';
const base={snapshotText:target,document:{documentId,tenantId:scope.tenantId,workspaceId:scope.workspaceId,product:'note' as const,title:'SOURCE_A',creatorUserId:null,metadataRevision:1,mode:'snapshot' as const,pageId:'native2-note-A',documentKey:`wonffice-${scope.tenantId}-${documentId}`,fileFormat:'barocss-note' as const,fileVersion:2 as const,revision:2,snapshotHash:hash(target)}};
class MemoryStorage implements Storage { data=new Map<string,string>();fail=false;get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){if(this.fail)throw new Error('controlled quota');this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}clear(){this.data.clear();} }
function setup(){let current=true;const storage=new MemoryStorage(),calls:Array<{method:string;body:BodyInit|null|undefined}>=[];
const receipt={operation:'update',idempotencyKey:'native2-target-preserve-test-1',requestHash:'d'.repeat(64),document:{...base.document,revision:3},snapshotText:target};
const service=createNative2TargetPreserve({scope,documentId,adoptionKey:'native2-adopt-test-1',targetSeedHash:hash(target),storage,apiBase:'/controlled-native2',isCurrent:()=>current,authorizedFetch:async(url,init)=>{calls.push({method:init?.method??'GET',body:init?.body});return Response.json(init?.method==='PUT'||String(url).includes('/receipts/')?receipt:String(url).endsWith('/schema-bundle')?{status:'pinned',documentId,documentRevision:3,snapshotHash:hash(target),nativeFormat:{format:'barocss-note',version:2},bundle:NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle}:{document:receipt.document,snapshotText:target});}});
return {storage,service,calls,retire:()=>{current=false;}};}
describe('target preserve separate namespace and fixed current-target operation',()=>{
 it('maps only its one exact virtual key, retains ALL oldphysical bytes, cannot remove/clear or expose oldrecords',()=>{
  const h=setup();h.storage.setItem('old-v1','old unsent input');h.storage.setItem('old-adopt','oldfixedsixbody');h.storage.setItem('old-preserve','oldsourcebody');
  expect(h.service.storage.length).toBe(0);expect(h.service.storage.getItem('old-adopt')).toBeNull();expect(h.service.storage.key(0)).toBeNull();
  h.service.storage.setItem(h.service.virtualKey,'new recovery bytes');expect(h.storage.getItem(h.service.physicalKey)).toBe('new recovery bytes');expect(h.service.storage.key(0)).toBe(h.service.virtualKey);
  expect(()=>h.service.storage.setItem('old-adopt','replace')).toThrow('native2_target_virtual_key_conflict');expect(()=>h.service.storage.removeItem(h.service.virtualKey)).toThrow('removal_refused');expect(()=>h.service.storage.clear()).toThrow('removal_refused');
  expect([...h.storage.data.entries()].filter(([k])=>k.startsWith('old-'))).toEqual([['old-v1','old unsent input'],['old-adopt','oldfixedsixbody'],['old-preserve','oldsourcebody']]);
 });
 it('explicit newtarget preserve6body uses verifiedtargetbase/newkey, beforePUT journalreadback and fulltarget confirmation, never oldadopt request',async()=>{
  const h=setup();h.storage.setItem('old-adopt','exact original fixed bytes');const attempt=await h.service.freeze(base,target,1,'native2-target-preserve-test-1');
  const expected={schemaAction:'preserve',expectedRevision:2,expectedSnapshotHash:hash(target),expectedPriorPinDigest:hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1',scope.tenantId,scope.workspaceId,documentId,'pinned',NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.selected.map(r=>[r.schemaId,r.version,r.digest])])),snapshotText:target,idempotencyKey:'native2-target-preserve-test-1'};
  expect(attempt.bodyText).toBe(JSON.stringify(expected));expect((await h.service.journal.read())?.fixed).toEqual(attempt);expect(h.calls).toHaveLength(0);
  const receipt=await h.service.writer.send(attempt);await h.service.journal.observeDirect(attempt,receipt);const proof=await h.service.writer.confirm(attempt,receipt);
  if(proof.status!=='fixed-confirmed')throw new Error('Wholecurrenttarget required');await h.service.journal.confirmFixed(proof);expect((await h.service.journal.read())?.phase).toBe('fixed-confirmed');
  expect(h.calls.filter(c=>c.method==='PUT').map(c=>c.body)).toEqual([JSON.stringify(expected)]);expect(h.storage.getItem('old-adopt')).toBe('exact original fixed bytes');expect(proof.read.snapshotText).toBe(target);
 });
 it('oldkey/wrongseed cannot protect/freeze; corrupt targetraw and quota are retained, functional foreignseed scope cannot discover',async()=>{
  const h=setup();await expect(h.service.freeze(base,target,1,'native2-adopt-test-1')).rejects.toThrow('identity_conflict');await expect(h.service.protect({...base,document:{...base.document,snapshotHash:'0'.repeat(64)}},target,1)).rejects.toThrow('seed_conflict');expect(h.storage.length).toBe(0);expect(h.calls).toHaveLength(0);
  await h.service.protect(base,target,1);const before=h.storage.getItem(h.service.physicalKey);h.storage.fail=true;await expect(h.service.protect(base,target,2)).rejects.toThrow('controlled quota');expect(h.storage.getItem(h.service.physicalKey)).toBe(before);h.storage.fail=false;
  const foreign=createNative2TargetStorage({scope:{...scope,subject:'other-user'},documentId,adoptionKey:'native2-adopt-test-1',targetSeedHash:hash(target),storage:h.storage,isCurrent:()=>true});expect(foreign.storage.getItem(foreign.virtualKey)).toBeNull();
  h.storage.setItem(h.service.physicalKey,'{corrupt');await expect(h.service.journal.read()).rejects.toThrow('corrupt_native2_pending_record');expect(h.storage.getItem(h.service.physicalKey)).toBe('{corrupt');
 });
 it('retired fresh target owner cannot use storage or send a previously protected fixed request',async()=>{
  const h=setup(),fixed=await h.service.freeze(base,target,1,'native2-target-preserve-test-1'),before=h.storage.getItem(h.service.physicalKey);h.retire();
  await expect(h.service.writer.send(fixed)).rejects.toMatchObject({code:'stale_native2_writable_context'});expect(()=>h.service.storage.setItem(h.service.virtualKey,'replace')).toThrow('stale_native2_writable_context');expect(h.storage.getItem(h.service.physicalKey)).toBe(before);expect(h.calls).toHaveLength(0);
 });
 it('lost direct ACK remains GET-only unconfirmed; explicit same-body retry preserves later target draft through same namespace reopen and own-confirmed nextFixed',async()=>{
  const h=setup();const fixed=await h.service.freeze(base,target,1,'native2-target-preserve-test-1');
  const nextFile=structuredClone(NATIVE_NOTE_FIXTURES.TARGET_A2);nextFile.document.attributes.title='Independent later target draft';
  const late=JSON.stringify({format:'barocss-note',version:2,schemaBundle:nextFile.schemaBundle,document:nextFile.document,savedAt:nextFile.savedAt},null,2)+'\n';
  await h.service.protect(base,late,2);await h.service.journal.markUnknown(fixed);const before=h.storage.getItem(h.service.physicalKey);
  const lookup=await h.service.writer.checkReceipt(fixed);expect(await h.service.writer.confirm(fixed,lookup)).toEqual({status:'unconfirmed',reason:'receipt_not_correlated'});expect(h.calls.filter(c=>c.method==='PUT')).toHaveLength(0);expect(h.storage.getItem(h.service.physicalKey)).toBe(before);
  const direct=await h.service.writer.send(fixed);await h.service.journal.observeDirect(fixed,direct);const proof=await h.service.writer.confirm(fixed,direct);if(proof.status!=='fixed-confirmed')throw new Error('Whole target current proof required');await h.service.journal.confirmFixed(proof);
  const recovered=await h.service.journal.read();expect(recovered?.latestDraft).toEqual({generation:2,snapshotText:late});expect(recovered?.fixed).toEqual(fixed);
  const reopened=createNative2TargetPreserve({scope,documentId,adoptionKey:'native2-adopt-test-1',targetSeedHash:hash(target),storage:h.storage,apiBase:'/controlled-native2',authorizedFetch:async()=>{throw new Error('Reopen must not send');},isCurrent:()=>true});
  expect(await reopened.journal.read()).toEqual(recovered);expect(reopened.physicalKey).toBe(h.service.physicalKey);
  const currentBase={document:proof.read.document,snapshotText:proof.read.snapshotText};const next=await h.service.writer.freeze(currentBase,late,'native2-target-preserve-test-2',2);
  await h.service.nextFixed(proof,next);expect((await h.service.journal.read())?.base).toEqual(currentBase);expect((await h.service.journal.read())?.lineage).toEqual([{fixed,requestHash:'d'.repeat(64)}]);expect(h.calls.filter(c=>c.method==='PUT').map(c=>c.body)).toEqual([fixed.bodyText]);
 });
 it('retirement inside a supplied Storage read refuses before writes; another fresh namespace owner cannot use a retired proof',async()=>{
  const h=setup(),fixed=await h.service.freeze(base,target,1,'native2-target-preserve-test-1');
  const direct=await h.service.writer.send(fixed);await h.service.journal.observeDirect(fixed,direct);const proof=await h.service.writer.confirm(fixed,direct);if(proof.status!=='fixed-confirmed')throw new Error('Current target proof required');
  const before=h.storage.getItem(h.service.physicalKey);h.retire();
  const fresh=createNative2TargetPreserve({scope,documentId,adoptionKey:'native2-adopt-test-1',targetSeedHash:hash(target),storage:h.storage,apiBase:'/controlled-native2',authorizedFetch:async()=>{throw new Error('No extra HTTP');},isCurrent:()=>true});
  await expect(async()=>fresh.journal.confirmFixed(proof)).rejects.toThrow('native2_confirmation_not_verified');expect(h.storage.getItem(h.service.physicalKey)).toBe(before);
  let current=true;const mapped=createNative2TargetStorage({scope,documentId,adoptionKey:'native2-adopt-test-1',targetSeedHash:hash(target),storage:{length:1,key:()=>h.service.virtualKey,clear:()=>{throw new Error('No removal');},removeItem:()=>{throw new Error('No removal');},setItem:()=>{throw new Error('No write');},getItem:()=>{current=false;return before;}},isCurrent:()=>current});
  expect(()=>mapped.storage.getItem(mapped.virtualKey)).toThrow('stale_native2_writable_context');expect(h.storage.getItem(h.service.physicalKey)).toBe(before);
 });

 it('retired old proof is rechecked after awaited namespace decode even when the new current journal owner remains writable',async()=>{
  const h=setup(),fixed=await h.service.freeze(base,target,1,'native2-target-preserve-test-1');const direct=await h.service.writer.send(fixed);await h.service.journal.observeDirect(fixed,direct);const proof=await h.service.writer.confirm(fixed,direct);if(proof.status!=='fixed-confirmed')throw new Error('Current old proof required');
  const before=h.storage.getItem(h.service.physicalKey);let scheduled=false,writes=0;
  const storage:Storage={length:h.storage.length,key:i=>h.storage.key(i),removeItem:()=>{throw new Error('No removal');},clear:()=>{throw new Error('No removal');},setItem:(k,v)=>{writes++;h.storage.setItem(k,v);},getItem:k=>{const value=h.storage.getItem(k);if(!scheduled){scheduled=true;queueMicrotask(h.retire);}return value;}};
  const fresh=createNative2TargetPreserve({scope,documentId,adoptionKey:'native2-adopt-test-1',targetSeedHash:hash(target),storage,apiBase:'/controlled-native2',authorizedFetch:async()=>{throw new Error('No extra HTTP');},isCurrent:()=>true});
  await expect(fresh.journal.confirmFixed(proof)).rejects.toThrow('native2_origin_proof_retired');expect(scheduled).toBe(true);expect(writes).toBe(0);expect(h.storage.getItem(h.service.physicalKey)).toBe(before);expect(h.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
 });

});
