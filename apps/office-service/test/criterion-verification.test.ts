import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Pool,PoolClient} from 'pg';
import {afterEach,expect,it,vi} from 'vitest';
import {captureCriterionContext,captureExecutableCriterion,getCriterionSpecimen,CRITERION_EVALUATOR,evaluateRenderedCriterion,type RenderedCriterionInput} from '@barocss/office-word/criterion-confirmation';
import {CriterionVerificationStore,type RunRequest,type CriterionVerificationExecutor} from '../src/criterion-verification-store.js';
import {MembershipStore} from '../src/membership-store.js';
const tenantId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',documentId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',actorId='cccccccc-cccc-cccc-cccc-cccccccccccc',confirmationId='dddddddd-dddd-dddd-dddd-dddddddddddd';
const principal={issuer:'https://fictional.invalid',subject:'writer'},hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const measured:RenderedCriterionInput={color:'rgb(255, 255, 255)',backgroundColor:'rgb(0, 0, 0)',opacity:'1',backgroundImage:'none',ancestorOpacities:['1','1'],tagName:'BUTTON',disabled:false,visibility:'visible',display:'inline-block'};
function setup(qualitative=false){
 const snapshotText=readFileSync(new URL(`./fixtures/${qualitative?'criterion-confirmation':'criterion-verification'}-word.json`,import.meta.url),'utf8');
 const context=captureCriterionContext(snapshotText),source={product:'word',mode:'snapshot',revision:2,snapshot_hash:hash(snapshotText),snapshot_text:snapshotText};
 const confirmation={id:confirmationId,identity_id:actorId,document_revision:2,snapshot_hash:source.snapshot_hash,context,authority_epoch:'editor:1:44'};
 const state={role:'editor',membershipVersion:'44',source,confirmations:[confirmation],records:[] as Array<Record<string,unknown>>,sql:[] as string[],rendered:structuredClone(measured)};
 const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
  state.sql.push(sql);if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('project_current_actor'))return {rows:[{id:actorId,role:state.role}]};
  if(sql.includes('project_execution_actor_epoch'))return {rows:[{epoch:'editor:1'}]};
  if(sql.includes('FROM wonffice.tenant_memberships'))return {rows:[{version:state.membershipVersion}]};
  if(sql.includes('FROM wonffice.documents'))return {rows:[structuredClone(state.source)]};
  if(sql.includes('FROM wonffice.criterion_confirmations'))return {rows:structuredClone(state.confirmations)};
  if(sql.includes('INSERT INTO wonffice.criterion_verifications')){
   const row={tenant_id:args[0],document_id:args[1],id:args[2],identity_id:args[3],confirmation_id:args[4],idempotency_key:args[5],request_hash:args[6],document_revision:args[7],snapshot_hash:args[8],snapshot_text:args[9],context:JSON.parse(String(args[10])),authority_epoch:args[11],specimen:JSON.parse(String(args[12])),evaluator:JSON.parse(String(args[13])),outcome:args[14],started_at:new Date(String(args[15])),ended_at:new Date(String(args[16])),output_text:args[17],output_hash:args[18]};state.records.push(row);return {rows:[row]};
  }
  if(sql.includes('FROM wonffice.criterion_verifications'))return {rows:state.records.filter(row=>sql.includes('idempotency_key')?row.idempotency_key===args[2]:sql.includes('id=$3')?row.id===args[2]:row.document_id===args[1])};
  throw Error('unexpectedSQL '+sql);
 });
 vi.spyOn(MembershipStore.prototype,'withAuthorizedTenant').mockImplementation(async(_principal,_tenant,operation)=>operation({query}as unknown as PoolClient,'editor'));
 const execute=vi.fn<CriterionVerificationExecutor['execute']>(async(_specimen,criterion)=>({executor:{id:'local-playwright-chromium',version:1,browserVersion:'controlled-unit-adapter'},rendered:structuredClone(state.rendered),evaluation:evaluateRenderedCriterion(criterion,state.rendered)}));
 const request:RunRequest={schemaVersion:1,expectedRevision:2,snapshotHash:source.snapshot_hash,snapshotText,context,authorityEpoch:'editor:1:44',idempotencyKey:'run-exact-1',confirmationId,specimen:getCriterionSpecimen('dark')!,evaluator:structuredClone(CRITERION_EVALUATOR)};
 return {state,execute,request,store:new CriterionVerificationStore({}as Pool,{execute})};
}
afterEach(()=>vi.restoreAllMocks());
it('requires explicit execution and preserves complete immutable input/output independently from confirmation and source',async()=>{
 const {state,execute,request,store}=setup();const before=structuredClone({source:state.source,confirmations:state.confirmations});
 const basis=await store.getContext(principal,tenantId,documentId);expect(basis.confirmationId).toBe(confirmationId);expect(basis.executable.status).toBe('executable');expect((await store.list(principal,tenantId,documentId)).runs).toEqual([]);expect(execute).not.toHaveBeenCalled();
 const run=await store.run(principal,tenantId,documentId,request),output=JSON.parse(run.outputText);
 expect(run.outcome).toBe('passed');expect(run.requesterIdentityId).toBe(actorId);expect(run.outputHash).toBe(hash(run.outputText));expect(output.request).toStrictEqual(request);
 expect(output).toMatchObject({tenantId,documentId,executionId:run.runId,requestHash:run.requestHash,confirmationId,context:request.context,documentRevision:2,authorityEpoch:request.authorityEpoch,requesterIdentityId:actorId,rendered:measured});
 expect(output.executor.id).toBe('local-playwright-chromium');expect(output.executor.id).not.toBe(actorId);expect(output.evaluation.ratio).toBe(21);
 expect({source:state.source,confirmations:state.confirmations}).toStrictEqual(before);expect(execute).toHaveBeenCalledTimes(1);expect(await store.get(principal,tenantId,documentId,run.runId)).toStrictEqual(run);
});
it.each(['failed','unsupported'])('retains actual terminal %s without inventing success',async outcome=>{
 const {state,request,store}=setup();if(outcome==='failed')state.rendered.color='rgb(150, 150, 150)';if(outcome==='failed')state.rendered.backgroundColor='rgb(160, 160, 160)';else state.rendered.opacity='0.5';
 const run=await store.run(principal,tenantId,documentId,request);expect(run.outcome).toBe(outcome);expect(JSON.parse(run.outputText).evaluation.status).toBe(outcome);expect(run.outputHash).toBe(hash(run.outputText));
});
it('retains immutable unavailable/error output but never trusts an inconsistent adapter passed flag',async()=>{
 const {state,request,execute,store}=setup();state.rendered.opacity='0.5';execute.mockImplementation(async()=>({executor:{id:'local-playwright-chromium',version:1,browserVersion:'unit'},rendered:state.rendered,evaluation:{status:'passed'}as never}));
 const run=await store.run(principal,tenantId,documentId,request);expect(run.outcome).toBe('error');expect(JSON.parse(run.outputText)).toMatchObject({error:'executor_failed',executor:null,rendered:null,evaluation:null});
 const unavailable=await new CriterionVerificationStore({}as Pool).run(principal,tenantId,documentId,{...request,idempotencyKey:'unavailable-2'});expect(unavailable.outcome).toBe('error');expect(JSON.parse(unavailable.outputText).error).toBe('executor_unavailable');
});
it('exact lost acknowledgment retry returns one old immutable result without rerun; key reuse and authority ABA refuse',async()=>{
 const {state,execute,request,store}=setup();const first=await store.run(principal,tenantId,documentId,request);state.source.revision++;state.source.snapshot_text+=' ';state.source.snapshot_hash=hash(state.source.snapshot_text);
 expect(await store.run(principal,tenantId,documentId,request)).toStrictEqual(first);expect(execute).toHaveBeenCalledTimes(1);expect(state.records).toHaveLength(1);
 await expect(store.run(principal,tenantId,documentId,{...request,specimen:getCriterionSpecimen('low')!})).rejects.toThrow('key_reuse');state.membershipVersion='46';await expect(store.run(principal,tenantId,documentId,request)).rejects.toThrow('authority_conflict');expect(execute).toHaveBeenCalledTimes(1);
});
it('qualitative criteria and missing/foreign/currently mismatched confirmation cannot run',async()=>{
 const {state,request,execute,store}=setup(true);expect((await store.getContext(principal,tenantId,documentId)).executable.status).toBe('unsupported');await expect(store.run(principal,tenantId,documentId,request)).rejects.toThrow('criterion_not_executable');state.confirmations[0].identity_id='other';await expect(store.run(principal,tenantId,documentId,request)).rejects.toThrow('confirmation_conflict');expect(execute).not.toHaveBeenCalled();expect(state.records).toEqual([]);
});
it('viewer cannot request or read private outputs and client flags/source/evaluator forgeries refuse before execution',async()=>{
 const {state,request,execute,store}=setup();state.role='viewer';for(const operation of [()=>store.run(principal,tenantId,documentId,request),()=>store.getContext(principal,tenantId,documentId),()=>store.list(principal,tenantId,documentId),()=>store.get(principal,tenantId,documentId,confirmationId)])await expect(operation()).rejects.toThrow('forbidden');
 state.role='editor';for(const value of [{...request,passed:true},{...request,executor:'forged'},{...request,specimen:{...request.specimen,sourceText:'<script>arbitrary code</script>'}},{...request,evaluator:{...request.evaluator,definition:'always passed'}}])await expect(store.run(principal,tenantId,documentId,value as unknown as RunRequest)).rejects.toThrow();expect(execute).not.toHaveBeenCalled();expect(state.records).toEqual([]);
});
it('freezes caller input before async execution and refuses changed locked source after deferred completion',async()=>{
 const {state,request,execute,store}=setup();let resume:()=>void=()=>{};const gate=new Promise<void>(resolve=>resume=resolve),criterion=captureExecutableCriterion(request.context);if(criterion.status!=='executable')throw Error('fixture');
 execute.mockImplementation(async()=>{await gate;return {executor:{id:'local-playwright-chromium',version:1,browserVersion:'unit'},rendered:measured,evaluation:evaluateRenderedCriterion(criterion.criterion,measured)};});
 const pending=store.run(principal,tenantId,documentId,request);while(!execute.mock.calls.length)await Promise.resolve();request.context.requirement.locator.bookmarkId='changed';state.source.revision++;resume();await expect(pending).rejects.toThrow('verification_context_changed');expect(state.records).toEqual([]);
});
