import { createHash,randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { captureCriterionContext,compareCriterionContext,captureExecutableCriterion,getCriterionSpecimen,listCriterionSpecimens,
 CRITERION_EVALUATOR,evaluateRenderedCriterion,type CriterionContext,type CriterionSpecimen,type ExecutableCriterion,type RenderedCriterionInput,type RenderedCriterionEvaluation } from '@barocss/office-word/criterion-confirmation';
import { DocumentError } from './document-store.js';
import { MembershipStore,TenantAccessDeniedError,type VerifiedPrincipal } from './membership-store.js';
import { assertUuid } from './tenant-store.js';
export interface RunRequest {
 schemaVersion:1;expectedRevision:number;snapshotHash:string;snapshotText:string;context:CriterionContext;
 authorityEpoch:string;idempotencyKey:string;confirmationId:string;specimen:CriterionSpecimen;evaluator:typeof CRITERION_EVALUATOR;
}
export interface CriterionRunReceipt {
 schemaVersion:1;runId:string;tenantId:string;documentId:string;requesterIdentityId:string;confirmationId:string;
 documentRevision:number;snapshotHash:string;context:CriterionContext;authorityEpoch:string;idempotencyKey:string;requestHash:string;
 specimen:CriterionSpecimen;evaluator:typeof CRITERION_EVALUATOR;outcome:'passed'|'failed'|'unsupported'|'error';
 startedAt:string;endedAt:string;outputText:string;outputHash:string;
}
export interface CriterionVerificationContext {
 schemaVersion:1;documentRevision:number;snapshotHash:string;snapshotText:string;context:CriterionContext;authorityEpoch:string;actorIdentityId:string;
 confirmationId:string|null;executable:ReturnType<typeof captureExecutableCriterion>;specimens:readonly CriterionSpecimen[];evaluator:typeof CRITERION_EVALUATOR;
}
export interface CriterionVerificationExecutor {
 execute(specimen:CriterionSpecimen,criterion:ExecutableCriterion):Promise<{
  executor:{id:'local-playwright-chromium';version:1;browserVersion:string};rendered:RenderedCriterionInput;evaluation:RenderedCriterionEvaluation;
 }>;
}
interface Source {product:string;mode:string;revision:number;snapshot_hash:string;snapshot_text:string}
interface Row {
 id:string;tenant_id:string;document_id:string;identity_id:string;confirmation_id:string;document_revision:number;snapshot_hash:string;
 context:CriterionContext;authority_epoch:string;idempotency_key:string;request_hash:string;specimen:CriterionSpecimen;evaluator:typeof CRITERION_EVALUATOR;
 outcome:CriterionRunReceipt['outcome'];started_at:Date;ended_at:Date;output_text:string;output_hash:string;
}
interface Confirmation {id:string;identity_id:string;document_revision:number;snapshot_hash:string;context:CriterionContext;authority_epoch:string}
const hash=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const same=(left:unknown,right:unknown):boolean=>{
 if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>same(v,right[i]));
 if(object(left)||object(right))return object(left)&&object(right)&&Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(k=>Object.hasOwn(right,k)&&same(left[k],right[k]));
 return left===right;
};
const fields=['schemaVersion','expectedRevision','snapshotHash','snapshotText','context','authorityEpoch','idempotencyKey','confirmationId','specimen','evaluator'];
function frozenRequest(input:RunRequest):RunRequest{
 if(!object(input)||Object.keys(input).length!==fields.length||fields.some(k=>!Object.hasOwn(input,k))||input.schemaVersion!==1||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.snapshotText!=='string'||typeof input.snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(input.snapshotHash)||
  typeof input.authorityEpoch!=='string'||!input.authorityEpoch||input.authorityEpoch.length>255||typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.idempotencyKey)||
  typeof input.confirmationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.confirmationId))throw new DocumentError(400,'invalid_request');
 if(Buffer.byteLength(input.snapshotText,'utf8')>524288)throw new DocumentError(413,'snapshot_too_large');
 if(hash(input.snapshotText)!==input.snapshotHash||!compareCriterionContext(input.snapshotText,input.context))throw new DocumentError(422,'invalid_criterion_context');
 const specimen=object(input.specimen)&&typeof input.specimen.id==='string'?getCriterionSpecimen(input.specimen.id):undefined;
 if(!specimen||!same(specimen,input.specimen)||!same(CRITERION_EVALUATOR,input.evaluator))throw new DocumentError(422,'unregistered_verification');
 return {schemaVersion:1,expectedRevision:input.expectedRevision,snapshotHash:input.snapshotHash,snapshotText:input.snapshotText,
  context:captureCriterionContext(input.snapshotText),authorityEpoch:input.authorityEpoch,idempotencyKey:input.idempotencyKey,confirmationId:input.confirmationId,
  specimen:structuredClone(specimen),evaluator:structuredClone(CRITERION_EVALUATOR)};
}
function receipt(row:Row):CriterionRunReceipt{return {schemaVersion:1,runId:row.id,tenantId:row.tenant_id,documentId:row.document_id,requesterIdentityId:row.identity_id,
 confirmationId:row.confirmation_id,documentRevision:row.document_revision,snapshotHash:row.snapshot_hash,context:row.context,authorityEpoch:row.authority_epoch,
 idempotencyKey:row.idempotency_key,requestHash:row.request_hash,specimen:row.specimen,evaluator:row.evaluator,outcome:row.outcome,
 startedAt:row.started_at.toISOString(),endedAt:row.ended_at.toISOString(),outputText:row.output_text,outputHash:row.output_hash};}
function rendered(value:unknown):value is RenderedCriterionInput{
 const keys=['color','backgroundColor','opacity','backgroundImage','ancestorOpacities','tagName','disabled','visibility','display'];
 return object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k))&&typeof value.disabled==='boolean'&&
  Array.isArray(value.ancestorOpacities)&&value.ancestorOpacities.length<=100&&value.ancestorOpacities.every(v=>typeof v==='string'&&v.length<=100)&&
  keys.filter(k=>!['ancestorOpacities','disabled'].includes(k)).every(k=>typeof value[k]==='string'&&(value[k] as string).length<=2000);
}
export class CriterionVerificationStore {
 private readonly membership:MembershipStore;
 constructor(pool:Pool,private readonly executor?:CriterionVerificationExecutor){this.membership=new MembershipStore(pool);}
 private async actor(client:PoolClient,tenantId:string){
  const actor=await client.query<{id:string;role:string}>('SELECT id,role FROM wonffice.project_current_actor($1)',[tenantId]);
  if(!actor.rows[0])throw new TenantAccessDeniedError();if(actor.rows[0].role==='viewer')throw new DocumentError(403,'forbidden');
  const epoch=await client.query<{epoch:string}>('SELECT epoch FROM wonffice.project_execution_actor_epoch($1)',[tenantId]);
  const membership=await client.query<{version:string}>(`SELECT xmin::text AS version FROM wonffice.tenant_memberships WHERE tenant_id=$1 AND identity_id=$2 AND revoked_at IS NULL`,[tenantId,actor.rows[0].id]);
  if(!epoch.rows[0]||!membership.rows[0])throw new TenantAccessDeniedError();return {id:actor.rows[0].id,epoch:`${epoch.rows[0].epoch}:${membership.rows[0].version}`};
 }
 private async source(client:PoolClient,tenantId:string,documentId:string){
  const found=await client.query<Source>(`SELECT d.product,d.mode,s.revision,s.snapshot_hash,s.snapshot_text FROM wonffice.documents d
   JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id WHERE d.tenant_id=$1 AND d.id=$2 FOR UPDATE OF d,s`,[tenantId,documentId]);
  if(!found.rows[0])throw new DocumentError(404,'not_found');const source=found.rows[0];
  if(source.mode!=='snapshot')throw new DocumentError(409,'mode_conflict');if(source.product!=='word')throw new DocumentError(422,'unsupported_criterion_product');
  if(hash(source.snapshot_text)!==source.snapshot_hash)throw new DocumentError(409,'source_unavailable');return source;
 }
 private async confirmations(client:PoolClient,tenantId:string,documentId:string){return (await client.query<Confirmation>(`SELECT id,identity_id,document_revision,snapshot_hash,context,authority_epoch
  FROM wonffice.criterion_confirmations WHERE tenant_id=$1 AND document_id=$2 ORDER BY confirmed_at,id`,[tenantId,documentId])).rows;}
 async getContext(principal:VerifiedPrincipal,tenantId:string,documentId:string):Promise<CriterionVerificationContext>{
  assertUuid(tenantId);assertUuid(documentId);return this.membership.withAuthorizedTenant(principal,tenantId,async client=>{
   const actor=await this.actor(client,tenantId),source=await this.source(client,tenantId,documentId);let context:CriterionContext;
   try{context=captureCriterionContext(source.snapshot_text);}catch{throw new DocumentError(409,'criterion_unavailable');}
   const confirmation=(await this.confirmations(client,tenantId,documentId)).find(row=>row.identity_id===actor.id&&row.document_revision===source.revision&&row.snapshot_hash===source.snapshot_hash&&row.authority_epoch===actor.epoch&&compareCriterionContext(source.snapshot_text,row.context));
   return {schemaVersion:1,documentRevision:source.revision,snapshotHash:source.snapshot_hash,snapshotText:source.snapshot_text,context,authorityEpoch:actor.epoch,actorIdentityId:actor.id,
    confirmationId:confirmation?.id??null,executable:captureExecutableCriterion(context),specimens:structuredClone(listCriterionSpecimens()),evaluator:structuredClone(CRITERION_EVALUATOR)};
  });
 }
 async run(principal:VerifiedPrincipal,tenantId:string,documentId:string,input:RunRequest):Promise<CriterionRunReceipt>{
  assertUuid(tenantId);assertUuid(documentId);const request=frozenRequest(input);
  return this.membership.withAuthorizedTenant(principal,tenantId,async client=>{
   const actor=await this.actor(client,tenantId);if(actor.epoch!==request.authorityEpoch)throw new DocumentError(409,'authority_conflict');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,431))',[JSON.stringify([tenantId,actor.id,request.idempotencyKey])]);
   const source=await this.source(client,tenantId,documentId),digest=hash(JSON.stringify(['criterion-verification-v1',tenantId,documentId,actor.id,request]));
   const previous=(await client.query<Row>('SELECT * FROM wonffice.criterion_verifications WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3',[tenantId,actor.id,request.idempotencyKey])).rows[0];
   if(previous){if(previous.request_hash!==digest)throw new DocumentError(409,'key_reuse');return receipt(previous);}
   if(source.revision!==request.expectedRevision||source.snapshot_hash!==request.snapshotHash||source.snapshot_text!==request.snapshotText||!compareCriterionContext(source.snapshot_text,request.context))throw new DocumentError(409,'criterion_conflict');
   const confirmation=(await this.confirmations(client,tenantId,documentId)).find(row=>row.id===request.confirmationId&&row.identity_id===actor.id&&row.document_revision===source.revision&&row.snapshot_hash===source.snapshot_hash&&row.authority_epoch===actor.epoch&&compareCriterionContext(source.snapshot_text,row.context));
   if(!confirmation)throw new DocumentError(409,'confirmation_conflict');const executable=captureExecutableCriterion(request.context);if(executable.status!=='executable')throw new DocumentError(422,'criterion_not_executable');
   const runId=randomUUID(),startedAt=new Date().toISOString();let execution:Awaited<ReturnType<CriterionVerificationExecutor['execute']>>|null=null;
   let outcome:CriterionRunReceipt['outcome']='error',error:string|undefined;
   if(!this.executor)error='executor_unavailable';else try{
    const value=await this.executor.execute(structuredClone(request.specimen),structuredClone(executable.criterion));
    if(!object(value)||Object.keys(value).length!==3||!object(value.executor)||Object.keys(value.executor).length!==3||value.executor.id!=='local-playwright-chromium'||value.executor.version!==1||typeof value.executor.browserVersion!=='string'||!value.executor.browserVersion||!rendered(value.rendered))throw new Error('invalid_executor_response');
    const evaluation=evaluateRenderedCriterion(executable.criterion,value.rendered);if(!same(evaluation,value.evaluation))throw new Error('invalid_executor_response');
    execution={executor:structuredClone(value.executor) as typeof value.executor,rendered:structuredClone(value.rendered),evaluation};outcome=evaluation.status;
   }catch{error='executor_failed';}
   const currentActor=await this.actor(client,tenantId),currentSource=await this.source(client,tenantId,documentId);
   if(currentActor.id!==actor.id||currentActor.epoch!==actor.epoch||currentSource.revision!==source.revision||currentSource.snapshot_text!==source.snapshot_text||currentSource.snapshot_hash!==source.snapshot_hash||
    !same(getCriterionSpecimen(request.specimen.id),request.specimen)||!same(CRITERION_EVALUATOR,request.evaluator))throw new DocumentError(409,'verification_context_changed');
   const endedAt=new Date(Math.max(Date.now(),Date.parse(startedAt))).toISOString();
   const outputText=JSON.stringify({schemaVersion:1,executionId:runId,tenantId,documentId,requestHash:digest,request,confirmationId:request.confirmationId,
    documentRevision:source.revision,snapshotHash:source.snapshot_hash,context:request.context,authorityEpoch:actor.epoch,requesterIdentityId:actor.id,executor:execution?.executor??null,startedAt,endedAt,
    specimen:{...request.specimen,sourceHash:hash(request.specimen.sourceText)},evaluator:request.evaluator,criterion:executable.criterion,rendered:execution?.rendered??null,evaluation:execution?.evaluation??null,outcome,...(error?{error}: {})});
   const result=await client.query<Row>(`INSERT INTO wonffice.criterion_verifications
    (tenant_id,document_id,id,identity_id,confirmation_id,idempotency_key,request_hash,document_revision,snapshot_hash,snapshot_text,context,authority_epoch,specimen,evaluator,outcome,started_at,ended_at,output_text,output_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT DO NOTHING RETURNING *`,
   [tenantId,documentId,runId,actor.id,request.confirmationId,request.idempotencyKey,digest,source.revision,source.snapshot_hash,source.snapshot_text,JSON.stringify(request.context),actor.epoch,
    JSON.stringify(request.specimen),JSON.stringify(request.evaluator),outcome,startedAt,endedAt,outputText,hash(outputText)]);
   if(result.rows[0])return receipt(result.rows[0]);
   const concurrent=(await client.query<Row>('SELECT * FROM wonffice.criterion_verifications WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3',[tenantId,actor.id,request.idempotencyKey])).rows[0];
   if(!concurrent||concurrent.request_hash!==digest)throw new DocumentError(409,'key_reuse');return receipt(concurrent);
  });
 }
 async list(principal:VerifiedPrincipal,tenantId:string,documentId:string){
  assertUuid(tenantId);assertUuid(documentId);return this.membership.withAuthorizedTenant(principal,tenantId,async client=>{
   await this.actor(client,tenantId);await this.source(client,tenantId,documentId);
   const rows=await client.query<Row>('SELECT * FROM wonffice.criterion_verifications WHERE tenant_id=$1 AND document_id=$2 ORDER BY started_at,id',[tenantId,documentId]);return {runs:rows.rows.map(receipt)};
  });
 }
 async get(principal:VerifiedPrincipal,tenantId:string,documentId:string,runId:string){
  assertUuid(tenantId);assertUuid(documentId);assertUuid(runId);return this.membership.withAuthorizedTenant(principal,tenantId,async client=>{
   await this.actor(client,tenantId);await this.source(client,tenantId,documentId);
   const found=(await client.query<Row>('SELECT * FROM wonffice.criterion_verifications WHERE tenant_id=$1 AND document_id=$2 AND id=$3',[tenantId,documentId,runId])).rows[0];if(!found)throw new DocumentError(404,'not_found');return receipt(found);
  });
 }
}
