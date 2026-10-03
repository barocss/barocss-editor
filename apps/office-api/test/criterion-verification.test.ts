import {expect,it} from 'vitest';
import {DocumentError} from '@barocss/office-service/document-store';
import {TenantAccessDeniedError} from '@barocss/office-service/membership-store';
import {createApiServer} from '../src/server.js';
const tenantId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',documentId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',runId='cccccccc-cccc-cccc-cccc-cccccccccccc';
const principal={issuer:'https://fictional.invalid',subject:'verified-writer'},headers={authorization:'Bearer valid'};
const url=`/v1/tenants/${tenantId}/documents/${documentId}/criterion-verifications`;
const request={schemaVersion:1,expectedRevision:1,snapshotHash:'a'.repeat(64),snapshotText:'exactdomainvalidatednative',context:{domain:'validated'},authorityEpoch:'editor:0:55',idempotencyKey:'verification-1',confirmationId:runId,specimen:{id:'dark',version:1,sourceText:'registered HTML'},evaluator:{id:'opaque-solid-contrast',version:1,definition:'registered definition'}};
it('uses verified principal and independent private verification endpoints only',async()=>{
 const calls:unknown[][]=[];const app=createApiServer({verifier:{verify:async token=>{if(token!=='valid')throw Error('bad');return principal;}},memberships:{getTenantAccess:async()=>({tenantId,role:'editor'}),listTenantAccess:async()=>({tenants:[],nextCursor:null})},criterionVerifications:{
  getContext:async(...args)=>{calls.push(args);return {schemaVersion:1} as never;},run:async(...args)=>{calls.push(args);return {runId} as never;},list:async()=>({runs:[]}),get:async(...args)=>{calls.push(args);return {runId} as never;}}});
 try{
  expect((await app.inject({method:'POST',url,payload:request})).statusCode).toBe(401);expect(calls).toEqual([]);
  const response=await app.inject({method:'POST',url,headers,payload:request});expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toBe('no-store');expect(calls[0]).toStrictEqual([principal,tenantId,documentId,request]);
  expect((await app.inject({url:url+'/context',headers})).json()).toStrictEqual({schemaVersion:1});expect((await app.inject({url,headers})).json()).toStrictEqual({runs:[]});
  expect((await app.inject({url:url+'/'+runId,headers})).json()).toStrictEqual({runId});expect(calls[2]).toStrictEqual([principal,tenantId,documentId,runId]);
 }finally{await app.close();}
});
it('rejects supplied result/actor/output/time and arbitrary query target before invoking executor service',async()=>{
 let called=0;const fail=async()=>{called++;return {} as never;};const app=createApiServer({verifier:{verify:async()=>principal},memberships:{getTenantAccess:async()=>({tenantId,role:'editor'}),listTenantAccess:async()=>({tenants:[],nextCursor:null})},criterionVerifications:{getContext:fail,run:fail,list:fail,get:fail}});
 try{
  for(const key of ['outcome','passed','requesterIdentityId','outputText','executor','startedAt'])expect((await app.inject({method:'POST',url,headers,payload:{...request,[key]:'forged'}})).statusCode).toBe(400);
  for(const path of [url+'?url=http://remote',url+'/context?code=anything',url+'/bad',url.replace(documentId,'bad')])expect((await app.inject({url:path,headers})).statusCode).toBe(400);expect(called).toBe(0);
 }finally{await app.close();}
});
it('denies private records under current authority and distinguishes stale and outage responses',async()=>{
 let problem:Error=new TenantAccessDeniedError();const fail=async()=>{throw problem;};const app=createApiServer({verifier:{verify:async()=>principal},memberships:{getTenantAccess:async()=>({tenantId,role:'editor'}),listTenantAccess:async()=>({tenants:[],nextCursor:null})},criterionVerifications:{getContext:fail,run:fail,list:fail,get:fail}});
 try{for(const[status,error]of[[403,new TenantAccessDeniedError()],[409,new DocumentError(409,'confirmation_conflict')],[503,Error('private secret')]]as const){problem=error;for(const suffix of ['', '/context','/'+runId]){const response=await app.inject({url:url+suffix,headers});expect(response.statusCode).toBe(status);expect(response.body).not.toContain('private secret');}}}finally{await app.close();}
});
