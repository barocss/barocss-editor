import type { FastifyInstance,FastifyRequest,FastifyReply } from 'fastify';
import type { CriterionVerificationStore,RunRequest } from '@barocss/office-service/criterion-verification-store';
import { DocumentError } from '@barocss/office-service/document-store';
import { TenantAccessDeniedError,type VerifiedPrincipal } from '@barocss/office-service/membership-store';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fields=['schemaVersion','expectedRevision','snapshotHash','snapshotText','context','authorityEpoch','idempotencyKey','confirmationId','specimen','evaluator'];
export function registerCriterionVerificationRoutes(app:FastifyInstance,deps:{
 authenticate(request:FastifyRequest,reply:FastifyReply):Promise<VerifiedPrincipal|null>;
 verifications:Pick<CriterionVerificationStore,'getContext'|'run'|'list'|'get'>;
}){
 const route=async(request:FastifyRequest,reply:FastifyReply,operation:(principal:VerifiedPrincipal,tenantId:string,documentId:string)=>Promise<unknown>)=>{
  const principal=await deps.authenticate(request,reply);if(!principal)return;
  const {tenantId,documentId}=request.params as {tenantId:string;documentId:string};
  if(!uuid.test(tenantId)||!uuid.test(documentId)||Object.keys(request.query as object).length)return reply.code(400).send({status:'invalid_request'});
  try{return await operation(principal,tenantId,documentId);}catch(error){
   if(error instanceof TenantAccessDeniedError)return reply.code(403).send({status:'forbidden'});
   if(error instanceof DocumentError)return reply.code(error.status).send({status:error.reason});
   return reply.code(503).send({status:'service_unavailable'});
  }
 };
 const path='/v1/tenants/:tenantId/documents/:documentId/criterion-verifications';
 app.get(`${path}/context`,(request,reply)=>route(request,reply,(principal,tenantId,documentId)=>deps.verifications.getContext(principal,tenantId,documentId)));
 app.get(path,(request,reply)=>route(request,reply,(principal,tenantId,documentId)=>deps.verifications.list(principal,tenantId,documentId)));
 app.get(`${path}/:runId`,(request,reply)=>route(request,reply,(principal,tenantId,documentId)=>{
  const {runId}=request.params as {runId:string};if(!uuid.test(runId))throw new DocumentError(400,'invalid_request');return deps.verifications.get(principal,tenantId,documentId,runId);
 }));
 app.post(path,(request,reply)=>route(request,reply,(principal,tenantId,documentId)=>{
  const body=request.body;if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==fields.length||fields.some(k=>!Object.hasOwn(body,k)))throw new DocumentError(400,'invalid_request');
  return deps.verifications.run(principal,tenantId,documentId,body as RunRequest);
 }));
}
