import { expect,it } from 'vitest';
import { DocumentError } from '@barocss/office-service/document-store';
import { TenantAccessDeniedError } from '@barocss/office-service/membership-store';
import { createApiServer } from '../src/server.js';
const tenantId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',documentId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const principal={issuer:'https://fictional.invalid',subject:'verified-writer'};
const url=`/v1/tenants/${tenantId}/documents/${documentId}/criterion-confirmations`;
const headers={authorization:'Bearer valid'};
const input={schemaVersion:1,expectedRevision:2,snapshotHash:'a'.repeat(64),snapshotText:'fictional exact file',context:{fictional:'domain validates separately'},authorityEpoch:'editor:2',idempotencyKey:'confirm-1'};
it('requires verified authentication and sends exact context to separate confirmation service',async()=>{
  const calls:unknown[][]=[];
  const app=createApiServer({verifier:{verify:async token=>{if(token!=='valid')throw Error('bad');return principal;}},memberships:{getTenantAccess:async()=>({tenantId,role:'editor'}),listTenantAccess:async()=>({tenants:[],nextCursor:null})},
    criterionConfirmations:{confirm:async(...args)=>{calls.push(args);return {fictionalReceipt:true} as never;},getContext:async(...args)=>{calls.push(args);return {fictionalContext:true} as never;},list:async(...args)=>{calls.push(args);return {confirmations:[]};}}});
  try{
    expect((await app.inject({method:'POST',url,payload:input})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url,headers:{authorization:'Bearer bad'},payload:input})).statusCode).toBe(401);
    expect(calls).toEqual([]);
    const result=await app.inject({method:'POST',url,headers,payload:input});expect(result.statusCode).toBe(200);expect(result.json()).toStrictEqual({fictionalReceipt:true});expect(result.headers['cache-control']).toBe('no-store');
    expect(calls[0]).toStrictEqual([principal,tenantId,documentId,input]);
    expect((await app.inject({url:url+'/context',headers})).json()).toStrictEqual({fictionalContext:true});
    expect((await app.inject({url,headers})).json()).toStrictEqual({confirmations:[]});
  }finally{await app.close();}
});
it('rejects forged server fields and query injection before domain execution',async()=>{
  let calls=0;const app=createApiServer({verifier:{verify:async()=>principal},memberships:{getTenantAccess:async()=>({tenantId,role:'editor'}),listTenantAccess:async()=>({tenants:[],nextCursor:null})},
    criterionConfirmations:{confirm:async()=>{calls++;return {} as never;},list:async()=>{calls++;return {confirmations:[]};},getContext:async()=>{calls++;return {} as never;}}});
  try{
    for(const field of ['actorIdentityId','confirmedAt','status'])expect((await app.inject({method:'POST',url,headers,payload:{...input,[field]:'forged'}})).statusCode).toBe(400);
    for(const invalid of [url+'?actor=someone',url+'/context?revision=1',url.replace(documentId,'invalid')])expect((await app.inject({url:invalid,headers})).statusCode).toBe(400);
    expect(calls).toBe(0);
  }finally{await app.close();}
});
it('keeps current authority denial, conflict and outage distinct without leaking private context',async()=>{
  let error:Error=new TenantAccessDeniedError();const fail=async()=>{throw error;};
  const app=createApiServer({verifier:{verify:async()=>principal},memberships:{getTenantAccess:async()=>({tenantId,role:'editor'}),listTenantAccess:async()=>({tenants:[],nextCursor:null})},criterionConfirmations:{confirm:fail,getContext:fail,list:fail}});
  try{
    for(const [expected,value]of [[403,new TenantAccessDeniedError()],[409,new DocumentError(409,'authority_conflict')],[503,Error('private actor/context')]] as const){error=value;for(const suffix of ['', '/context']){const response=await app.inject({url:url+suffix,headers});expect(response.statusCode).toBe(expected);expect(response.body).not.toContain('private actor/context');}}
  }finally{await app.close();}
});
