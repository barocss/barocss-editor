import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { captureCriterionContext } from '@barocss/office-word/criterion-confirmation';
import { CriterionConfirmationStore, type ConfirmCriterionInput } from '../src/criterion-confirmation-store.js';
import { MembershipStore } from '../src/membership-store.js';
const tenantId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',documentId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorId='cccccccc-cccc-cccc-cccc-cccccccccccc';
const principal={issuer:'https://fictional.invalid',subject:'writer'};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function file(){return readFileSync(new URL('./fixtures/criterion-confirmation-word.json',import.meta.url),'utf8');}
function setup(){
  const snapshotText=file();const source={product:'word',mode:'snapshot',revision:3,snapshot_hash:hash(snapshotText),snapshot_text:snapshotText};
  const state={epoch:'editor:4',membershipVersion:'41',role:'editor',source,records:[] as Array<Record<string,unknown>>,sql:[] as string[]};
  const client={query:vi.fn(async(sql:string,args:unknown[]=[])=>{
    state.sql.push(sql);
    if(sql.includes('project_execution_actor_epoch'))return {rows:[{epoch:state.epoch}]};
    if(sql.includes('FROM wonffice.tenant_memberships'))return {rows:[{version:state.membershipVersion}]};
    if(sql.includes('project_current_actor'))return {rows:[{id:actorId,role:state.role}]};
    if(sql.includes('FROM wonffice.documents'))return {rows:[structuredClone(state.source)]};
    if(sql.includes('INSERT INTO wonffice.criterion_confirmations')){
      const row={tenant_id:args[0],document_id:args[1],id:args[2],identity_id:args[3],idempotency_key:args[4],request_hash:args[5],
        document_revision:args[6],snapshot_hash:args[7],snapshot_text:args[8],context:JSON.parse(String(args[9])),authority_epoch:args[10],confirmed_at:new Date('2026-10-03T02:00:00Z')};
      state.records.push(row);return {rows:[structuredClone(row)]};
    }
    if(sql.includes('FROM wonffice.criterion_confirmations'))return {rows:state.records.filter(row=>sql.includes('idempotency_key')?row.idempotency_key===args[2]:row.document_id===args[1])};
    throw new Error('unexpected SQL '+sql);
  })};
  vi.spyOn(MembershipStore.prototype,'withAuthorizedTenant').mockImplementation(async(_principal,_tenant,operation)=>operation(client as unknown as PoolClient,'editor'));
  const input:ConfirmCriterionInput={schemaVersion:1,expectedRevision:3,snapshotHash:hash(snapshotText),snapshotText,context:captureCriterionContext(snapshotText),authorityEpoch:`${state.epoch}:${state.membershipVersion}`,idempotencyKey:'explicit-criterion-1'};
  return {state,client,input,store:new CriterionConfirmationStore({} as Pool)};
}
afterEach(()=>vi.restoreAllMocks());
it('records only explicit confirmation with server actor/time, exact context, and no native writes',async()=>{
  const {state,input,store}=setup();const before=structuredClone(state.source);
  expect((await store.list(principal,tenantId,documentId)).confirmations).toEqual([]);
  const context=await store.getContext(principal,tenantId,documentId);expect(context.actorIdentityId).toBe(actorId);expect(context.documentRevision).toBe(3);
  const result=await store.confirm(principal,tenantId,documentId,input);
  expect(result).toMatchObject({actorIdentityId:actorId,confirmedAt:'2026-10-03T02:00:00.000Z',documentRevision:3,context:input.context,verification:'not-run',scope:'writer-self-confirmation'});
  expect(result.confirmationId).toMatch(/^[a-f0-9-]{36}$/);expect(state.source).toStrictEqual(before);
  expect(state.sql.some(sql=>/UPDATE|DELETE/.test(sql)&&!sql.includes('FOR UPDATE'))).toBe(false);
  expect((await store.list(principal,tenantId,documentId)).confirmations).toStrictEqual([result]);
});
it('lost acknowledgment replay retains one exact receipt even after later document revision',async()=>{
  const {state,input,store}=setup();const first=await store.confirm(principal,tenantId,documentId,input);
  state.source.revision++;state.source.snapshot_text=state.source.snapshot_text.replace('fictional','later fictional');state.source.snapshot_hash=hash(state.source.snapshot_text);
  expect(await store.confirm(principal,tenantId,documentId,input)).toStrictEqual(first);expect(state.records).toHaveLength(1);
  await expect(store.confirm(principal,tenantId,'dddddddd-dddd-dddd-dddd-dddddddddddd',input)).rejects.toThrow('key_reuse');expect(state.records).toHaveLength(1);
});
it.each(['revision','bytes','epoch','mode'])('refuses changed %s without modifying source or prior records',async mode=>{
  const {state,input,store}=setup();
  if(mode==='revision')state.source.revision++;
  if(mode==='bytes'){state.source.snapshot_text+=' ';state.source.snapshot_hash=hash(state.source.snapshot_text);}
  if(mode==='epoch')state.epoch='editor:6';
  if(mode==='mode')state.source.mode='collaborative';
  const before=structuredClone(state.source);await expect(store.confirm(principal,tenantId,documentId,input)).rejects.toThrow();expect(state.source).toStrictEqual(before);expect(state.records).toEqual([]);
});
it('current viewer authority denies every private endpoint and stale epoch denies receipt replay',async()=>{
  const {state,input,store}=setup();await store.confirm(principal,tenantId,documentId,input);const before=structuredClone(state.records);
  state.role='viewer';for(const operation of [()=>store.confirm(principal,tenantId,documentId,input),()=>store.list(principal,tenantId,documentId),()=>store.getContext(principal,tenantId,documentId)])await expect(operation()).rejects.toThrow('forbidden');
  state.role='editor';state.epoch='editor:6';await expect(store.confirm(principal,tenantId,documentId,input)).rejects.toThrow('authority_conflict');expect(state.records).toStrictEqual(before);
});
it('rejects client actor/time/status and malformed context before database work',async()=>{
  const {state,input,store}=setup();for(const extra of [{actorIdentityId:actorId},{confirmedAt:'1999-01-01'},{status:'approved'}])await expect(store.confirm(principal,tenantId,documentId,{...input,...extra})).rejects.toThrow('invalid_request');
  await expect(store.confirm(principal,tenantId,documentId,{...input,context:{...input.context,actor:'forged'} as typeof input.context})).rejects.toThrow('invalid_criterion_context');expect(state.sql).toEqual([]);
});
it('freezes caller data before the awaited current authority transaction',async()=>{
  const {state,input,store}=setup();let resume:()=>void=()=>{};const gate=new Promise<void>(resolve=>resume=resolve);
  const original=MembershipStore.prototype.withAuthorizedTenant;
  const prior=vi.mocked(original).getMockImplementation()!;
  vi.mocked(original).mockImplementation(async(...args)=>{await gate;return prior(...args);});
  const expected=structuredClone(input.context);const pending=store.confirm(principal,tenantId,documentId,input);input.context.requirement.locator.bookmarkId='other';input.expectedRevision=90;resume();
  expect((await pending).context).toStrictEqual(expected);expect(state.records).toHaveLength(1);
});

it('committed writer role ABA invalidates frozen intent even when existing membership event count is unchanged',async()=>{
 const {state,input,store}=setup();const original=await store.confirm(principal,tenantId,documentId,input);
 const oldEpoch=state.epoch;state.role='viewer';state.membershipVersion='42';state.role='editor';state.membershipVersion='43';
 expect(state.epoch).toBe(oldEpoch);await expect(store.confirm(principal,tenantId,documentId,input)).rejects.toThrow('authority_conflict');
 const basis=await store.getContext(principal,tenantId,documentId);expect(basis.authorityEpoch).toBe('editor:4:43');
 expect((await store.list(principal,tenantId,documentId)).confirmations).toStrictEqual([original]);expect(state.records).toHaveLength(1);
});
