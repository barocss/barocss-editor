import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { captureCriterionContext } from '@barocss/office-word/criterion-confirmation';
import { CriterionVerificationStore } from '../src/criterion-verification-store.js';
import { MembershipStore } from '../src/membership-store.js';
import { NATIVE_PRESERVATION_EVALUATOR,NATIVE_PRESERVATION_SENTENCE } from '../src/native-preservation-evaluator.js';

const ids = {
  tenant:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', document:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', actor:'cccccccc-cccc-cccc-cccc-cccccccccccc',
  performer:'77777777-7777-4777-8777-777777777777',
  confirmation:'dddddddd-dddd-dddd-dddd-dddddddddddd', project:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', work:'11111111-1111-4111-8111-111111111111',
  attempt:'22222222-2222-4222-8222-222222222222', result:'33333333-3333-4333-8333-333333333333', pin:'44444444-4444-4444-8444-444444444444',
  workspace:'55555555-5555-4555-8555-555555555555'
};
const principal={issuer:'https://fictional.invalid',subject:'writer'};
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const original=readFileSync(new URL('./fixtures/criterion-confirmation-word.json',import.meta.url),'utf8')
  .replaceAll('Keep original fictional content.',NATIVE_PRESERVATION_SENTENCE);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function output(changedProtected:boolean):string{
  const parsed:unknown=JSON.parse(original);
  if(!object(parsed)||!object(parsed.document)||!Array.isArray(parsed.document.content))throw Error('fixture');
  const document=parsed.document,content=JSON.stringify(document.content);
  document.content=changedProtected?JSON.parse(content.replace('Store exact rich reference.','Changed protected content.')):JSON.parse(content);
  if(!changedProtected&&Array.isArray(document.content))document.content.push({stype:'surface',content:[{stype:'paragraph',content:[{stype:'inline-text',text:'Applied elsewhere.'}]}]});
  return JSON.stringify(parsed);
}
function fixture(changedProtected=false,performerId=ids.actor){
  const resultText=output(changedProtected),context=captureCriterionContext(original);
  const source={product:'word',mode:'snapshot',revision:3,snapshot_hash:sha(resultText),snapshot_text:resultText};
  const confirmation={id:ids.confirmation,identity_id:ids.actor,document_revision:2,snapshot_hash:sha(original),snapshot_text:original,
    context,authority_epoch:'editor:1:44'};
  const pin={document_id:ids.document,snapshot_revision:2,snapshot_hash:sha(original),snapshot_text:original};
  const target={kind:'word-comment',id:'word-anchor',quote:'Selected work'};
  const project={workspace_id:ids.workspace,data:{archived:false,
    results:[{id:ids.result,request:ids.work,document:{product:'word',id:ids.document}}],
    works:[{id:ids.work,commentId:'66666666-6666-4666-8666-666666666666',outputs:[ids.result],state:'unconnected'}],
    comments:[{id:'66666666-6666-4666-8666-666666666666',workId:ids.work,resultId:ids.result,target,
      pin:{id:ids.pin,document:{product:'word',id:ids.document}}}]}};
  const attemptData={id:ids.attempt,tenantId:ids.tenant,workspaceId:ids.workspace,projectId:ids.project,workId:ids.work,
    resultId:ids.result,documentId:ids.document,actorId:performerId,phase:'applied',target:structuredClone(target),
    provenance:{kind:'live-local-model'},input:{revision:2,snapshotHash:sha(original),snapshotText:original,
      inputs:[{id:ids.pin,documentId:ids.document,revision:2,snapshotHash:sha(original),snapshotText:original}]},
    expectedSnapshotText:resultText,expectedSnapshotHash:sha(resultText),appliedRevision:3};
  const attempt={id:ids.attempt,work_id:ids.work,result_id:ids.result,document_id:ids.document,actor_id:performerId,phase:'applied',data:attemptData};
  const records:Array<Record<string,unknown>>=[],sqlLog:string[]=[];
  const state={role:'editor',epoch:'editor:1',membershipVersion:'44',project,source,confirmation,pin,attempt,
    records,sql:sqlLog};
  const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
    state.sql.push(sql);
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql.includes('project_current_actor'))return {rows:[{id:ids.actor,role:state.role}]};
    if(sql.includes('project_execution_actor_epoch'))return {rows:[{epoch:state.epoch}]};
    if(sql.includes('FROM wonffice.tenant_memberships'))return {rows:[{version:state.membershipVersion}]};
    if(sql.includes('FROM wonffice.projects'))return {rows:[structuredClone(state.project)]};
    if(sql.includes('FROM wonffice.documents'))return {rows:[structuredClone(state.source)]};
    if(sql.includes('FROM wonffice.project_executions'))return {rows:sql.includes('FOR SHARE')&&state.attempt.actor_id!==ids.actor?[]:[structuredClone(state.attempt)]};
    if(sql.includes('FROM wonffice.project_pins'))return {rows:[structuredClone(state.pin)]};
    if(sql.includes('FROM wonffice.criterion_confirmations'))return {rows:[structuredClone(state.confirmation)]};
    if(sql.includes('INSERT INTO wonffice.criterion_verifications')){
      const row={tenant_id:args[0],document_id:args[1],id:args[2],identity_id:args[3],confirmation_id:args[4],idempotency_key:args[5],
        request_hash:args[6],document_revision:args[7],snapshot_hash:args[8],snapshot_text:args[9],context:JSON.parse(String(args[10])),
        authority_epoch:args[11],specimen:JSON.parse(String(args[12])),evaluator:JSON.parse(String(args[13])),outcome:args[14],
        started_at:new Date(String(args[15])),ended_at:new Date(String(args[16])),output_text:args[17],output_hash:args[18]};
      state.records.push(row);return {rows:[row]};
    }
    if(sql.includes('FROM wonffice.criterion_verifications'))return {rows:state.records.filter(row=>row.idempotency_key===args[2])};
    throw Error(`unexpected SQL: ${sql}`);
  });
  vi.spyOn(MembershipStore.prototype,'withAuthorizedTenant').mockImplementation(async(_principal,_tenant,operation)=>
    Reflect.apply(operation,undefined,[{query},'editor']));
  const request={schemaVersion:1,projectId:ids.project,workId:ids.work,attemptId:ids.attempt,resultId:ids.result,
    confirmationId:ids.confirmation,expectedOutputRevision:3,expectedOutputHash:sha(resultText),authorityEpoch:'editor:1:44',
    idempotencyKey:'native-work-1',evaluator:structuredClone(NATIVE_PRESERVATION_EVALUATOR)};
  return {state,request,store:new CriterionVerificationStore(new Pool()),query};
}
afterEach(()=>vi.restoreAllMocks());
it.each([false,true])('binds a synthetic applied Word attempt and stores a true %s comparison',async changed=>{
  const {state,request,store}=fixture(changed),before=structuredClone({project:state.project,source:state.source,attempt:state.attempt,confirmation:state.confirmation});
  const run=await store.runWork(principal,ids.tenant,ids.document,request);
  expect(run.outcome).toBe(changed?'failed':'passed');expect(run.outputHash).toBe(sha(run.outputText));
  expect(run.specimen).toMatchObject({kind:'native-word-work-result',projectId:ids.project,workId:ids.work,attemptId:ids.attempt,
    resultId:ids.result,inputHash:sha(original),outputHash:request.expectedOutputHash});
  expect(JSON.parse(run.outputText)).toMatchObject({request,requesterIdentityId:ids.actor,executor:{id:'registered-local-native-evaluator'},
    outcome:changed?'failed':'passed'});
  expect({project:state.project,source:state.source,attempt:state.attempt,confirmation:state.confirmation}).toStrictEqual(before);
  expect(state.records).toHaveLength(1);
  expect(await store.runWork(principal,ids.tenant,ids.document,request)).toStrictEqual(run);
  expect(state.records).toHaveLength(1);
});
it('lets the current requester verify a different member’s applied attempt without changing it',async()=>{
  const {state,request,store}=fixture(false,ids.performer),before=structuredClone(state.attempt);
  const run=await store.runWork(principal,ids.tenant,ids.document,request);
  expect(run.outcome).toBe('passed');
  expect(JSON.parse(run.outputText)).toMatchObject({requesterIdentityId:ids.actor,confirmationId:ids.confirmation});
  expect(state.attempt).toStrictEqual(before);
  expect(state.records).toHaveLength(1);
  expect(state.records[0].identity_id).toBe(ids.actor);
});
it('rejects fabricated outcome, output, actor and evaluator before SQL execution',async()=>{
  const {request,store,query}=fixture();
  for(const extra of [{outcome:'passed'},{outputText:'forged'},{requesterIdentityId:ids.actor},{startedAt:'forged'}])
    await expect(store.runWork(principal,ids.tenant,ids.document,{...request,...extra})).rejects.toThrow('invalid_request');
  await expect(store.runWork(principal,ids.tenant,ids.document,{...request,evaluator:{id:'always-pass',version:1}})).rejects.toThrow('unregistered_verification');
  expect(query).not.toHaveBeenCalled();
});
it('rejects unsupported or unrelated attempts and mismatched stored input/output/confirmation',async()=>{
  const {state,request,store}=fixture();
  state.attempt.phase='unsupported';state.attempt.data.phase='unsupported';
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('work_not_applied');
  state.attempt.phase='applied';state.attempt.data.phase='applied';state.attempt.data.target.kind='note-paragraph';
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('output_conflict');
  state.attempt.data.target.kind='word-comment';state.attempt.data.expectedSnapshotHash='0'.repeat(64);
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('output_conflict');
  state.attempt.data.expectedSnapshotHash=request.expectedOutputHash;state.pin.snapshot_text='forged';
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('input_conflict');
  state.pin.snapshot_text=original;state.confirmation.identity_id='different';
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('confirmation_conflict');
  expect(state.records).toEqual([]);
});
it('refuses stale output, role downgrade and idempotency key reuse without inventing a pass',async()=>{
  const {state,request,store}=fixture();
  state.source.revision=4;
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('output_conflict');
  state.source.revision=3;state.role='viewer';
  await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('forbidden');
  state.role='editor';const run=await store.runWork(principal,ids.tenant,ids.document,request);
  state.source.revision=4;expect(await store.runWork(principal,ids.tenant,ids.document,request)).toStrictEqual(run);
  await expect(store.runWork(principal,ids.tenant,ids.document,{...request,expectedOutputRevision:4})).rejects.toThrow('key_reuse');
  state.membershipVersion='45';await expect(store.runWork(principal,ids.tenant,ids.document,request)).rejects.toThrow('authority_conflict');
  expect(state.records).toHaveLength(1);
});
