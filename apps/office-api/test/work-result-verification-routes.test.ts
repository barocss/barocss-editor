import { Pool } from 'pg';
import Fastify from 'fastify';
import { expect,it,vi } from 'vitest';
import { CriterionVerificationStore,type CriterionRunReceipt } from '@barocss/office-service/criterion-verification-store';
import { DocumentError } from '@barocss/office-service/document-store';
import { NATIVE_PRESERVATION_EVALUATOR } from '../../office-service/src/native-preservation-evaluator.js';
import { registerCriterionVerificationRoutes } from '../src/criterion-verification-routes.js';

const tenantId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',documentId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal={issuer:'https://fictional.invalid',subject:'writer'};
const url=`/v1/tenants/${tenantId}/documents/${documentId}/criterion-verifications/work-results`;
const request={schemaVersion:1,projectId:'cccccccc-cccc-cccc-cccc-cccccccccccc',workId:'dddddddd-dddd-dddd-dddd-dddddddddddd',
  attemptId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',resultId:'11111111-1111-4111-8111-111111111111',
  confirmationId:'22222222-2222-4222-8222-222222222222',expectedOutputRevision:3,expectedOutputHash:'a'.repeat(64),
  authorityEpoch:'editor:1:44',idempotencyKey:'native-work-route-1',evaluator:NATIVE_PRESERVATION_EVALUATOR};
const receipt:CriterionRunReceipt={schemaVersion:1,runId:'33333333-3333-4333-8333-333333333333',tenantId,documentId,
  requesterIdentityId:'44444444-4444-4444-8444-444444444444',confirmationId:request.confirmationId,documentRevision:3,
  snapshotHash:request.expectedOutputHash,context:{schemaVersion:1,requirement:{itemId:'r',version:1,locator:{kind:'point-bookmark',bookmarkId:'r'},snapshotText:'pin'},
    decision:{itemId:'d',version:1,currentVersion:1,locator:{kind:'point-bookmark',bookmarkId:'d'},snapshotText:'pin',currentSnapshotText:'pin'},
    relation:{kind:'supported_by',source:{itemId:'r',version:1},target:{itemId:'d',version:1}}},
  authorityEpoch:request.authorityEpoch,idempotencyKey:request.idempotencyKey,requestHash:'b'.repeat(64),
  specimen:{kind:'native-word-work-result',projectId:request.projectId,workId:request.workId,attemptId:request.attemptId,
    resultId:request.resultId,inputRevision:2,inputHash:'c'.repeat(64),outputRevision:3,outputHash:request.expectedOutputHash},
  evaluator:NATIVE_PRESERVATION_EVALUATOR,outcome:'failed',startedAt:'2026-10-08T00:00:00.000Z',endedAt:'2026-10-08T00:00:00.001Z',
  outputText:'{"outcome":"failed"}',outputHash:'d'.repeat(64)};

it('accepts only an authenticated deliberate work-result request and passes selectors to the trusted store',async()=>{
  const app=Fastify(),store=new CriterionVerificationStore(new Pool());
  const run=vi.spyOn(store,'runWork').mockResolvedValue(receipt);
  let permitted=false;
  registerCriterionVerificationRoutes(app,{authenticate:async(_request,reply)=>permitted?principal:
    (reply.code(401).send({status:'unauthorized'}),null),verifications:store});
  try{
    expect((await app.inject({method:'POST',url,payload:request})).statusCode).toBe(401);
    expect(run).not.toHaveBeenCalled();
    permitted=true;
    const response=await app.inject({method:'POST',url,payload:request});
    expect(response.statusCode).toBe(200);expect(response.json()).toStrictEqual(receipt);
    expect(run).toHaveBeenCalledExactlyOnceWith(principal,tenantId,documentId,request);
  }finally{await app.close();}
});
it('rejects injected outcome, output, actor and malformed selectors before store work',async()=>{
  const app=Fastify(),store=new CriterionVerificationStore(new Pool()),run=vi.spyOn(store,'runWork').mockResolvedValue(receipt);
  registerCriterionVerificationRoutes(app,{authenticate:async()=>principal,verifications:store});
  try{
    for(const key of ['outcome','outputText','requesterIdentityId','startedAt','executor'])
      expect((await app.inject({method:'POST',url,payload:{...request,[key]:'forged'}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:url+'?source=forged',payload:request})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:url.replace(documentId,'bad'),payload:request})).statusCode).toBe(400);
    expect(run).not.toHaveBeenCalled();
  }finally{await app.close();}
});
it('keeps a verification refusal explicit and does not expose unexpected errors',async()=>{
  const app=Fastify(),store=new CriterionVerificationStore(new Pool()),run=vi.spyOn(store,'runWork');
  registerCriterionVerificationRoutes(app,{authenticate:async()=>principal,verifications:store});
  try{
    run.mockRejectedValueOnce(new DocumentError(409,'work_not_applied'));
    expect((await app.inject({method:'POST',url,payload:request})).json()).toStrictEqual({status:'work_not_applied'});
    run.mockRejectedValueOnce(Error('private implementation detail'));
    const response=await app.inject({method:'POST',url,payload:request});
    expect(response.statusCode).toBe(503);expect(response.json()).toStrictEqual({status:'service_unavailable'});
  }finally{await app.close();}
});
