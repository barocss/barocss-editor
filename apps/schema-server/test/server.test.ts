import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { createSchemaServer, type SchemaServerDependencies } from '../src/server.js';
import { readSchemaServerConfig, type SchemaScopePolicy } from '../src/config.js';
import { SchemaRegistryStore } from '@barocss/office-service/schema-registry-store';
import { AuthProviderUnavailableError } from '@barocss/office-api/oidc';
import { parseRegistryDefinition } from '@barocss/schema/registry-contract';
import type { TenantRole } from '@barocss/office-service/membership-store';
const tenantId='11111111-1111-4111-8111-111111111111', workspaceId='22222222-2222-4222-8222-222222222222';
const schemaId='33333333-3333-4333-8333-333333333333', identity='44444444-4444-4444-8444-444444444444';
const documentId='55555555-5555-4555-8555-555555555555';
const principal={issuer:'http://127.0.0.1:18595/realm',subject:'controlled-writer'};
const definition=()=>({dialect:'wonffice.note-fields.v1',scope:{tenantId,workspaceId},schemaId,version:1,parent:null,dependencies:[],requiredCapabilities:['note.field.text.v1'],dataset:{name:'Tasks',fields:[{name:'Title',kind:'text'}]}});
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const base=`/v1/tenants/${tenantId}/workspaces/${workspaceId}`;
const headers={authorization:'Bearer controlled.token.value'};
const policies=():SchemaScopePolicy[]=>[{tenantId,workspaceId,readRoles:['editor'],registerRoles:['editor'],capabilities:['note.field.text.v1']}];
function controlled() {
  const text=JSON.stringify(definition()),parsed=parseRegistryDefinition(text);
  const snapshotText=JSON.stringify({format:'barocss-note',version:1,document:{stype:'note',attributes:{title:'Original',pageId:documentId},content:[]}});
  const state={role:'editor' as TenantRole,effects:0};
  const row={schema_id:schemaId,version:1,digest:hash(parsed.canonicalText),definition_text:text,canonical_text:parsed.canonicalText,actor_identity_id:identity,created_at:new Date('2026-10-01T00:00:00Z')};
  const record={schemaId,version:1,digest:row.digest,digestAlgorithm:'wonffice.canonical-json.sha256.v1' as const,definitionText:text,canonicalText:parsed.canonicalText,definition:parsed.definition,actorIdentityId:identity,createdAt:row.created_at.toISOString()};
  const receipt={operation:'register' as const,idempotencyKey:'old-operation',requestHash:hash('controlled historical request'),requesterIdentityId:identity,authorityEpoch:'editor:0',record,dependencies:[]};
  const client={release(){},async query(sql:string) {
    let rows:unknown[]=[];
    if(sql.includes('current_user'))rows=[{safe:true,context_empty:true}];
    else if(sql.includes('project_current_actor'))rows=[{id:identity,role:state.role}];
    else if(sql.includes('project_execution_actor_epoch'))rows=[{epoch:`${state.role}:1`}];
    else if(sql.includes('FROM wonffice.tenant_memberships'))rows=[{role:state.role}];
    else if(sql.includes('FROM wonffice.workspaces'))rows=[{exists:1}];
    else if(sql.includes('INSERT INTO wonffice.schema_versions')){state.effects++;rows=[row];}
    else if(sql.includes('SELECT * FROM wonffice.schema_versions'))rows=[row];
    else if(sql.includes('FROM wonffice.schema_registry_receipts')&&sql.includes('request_hash'))rows=[];
    else if(sql.includes('FROM wonffice.schema_registry_receipts'))rows=[{result:receipt}];
    else if(sql.includes('FROM wonffice.documents'))rows=[{documentId,tenantId,workspaceId,product:'note',title:'Original',creatorUserId:identity,metadataRevision:1,mode:'snapshot',pageId:documentId,documentKey:`wonffice-${tenantId}-${documentId}`,fileFormat:'barocss-note',fileVersion:1,revision:1,snapshotHash:hash(snapshotText),snapshotText}];
    return {rows,rowCount:rows.length};
  }};
  const pool={connect:async()=>client} as unknown as Pool;
  const policy=policies();
  // The second argument is the adopted current-policy boundary. Before its repair
  // the actual existing JS constructor ignores it, exposing the controlled gap.
  const registry=new SchemaRegistryStore(pool,policy);
  const deps:SchemaServerDependencies={registry,policy,verifier:{verify:async()=>principal},
    memberships:{getTenantAccess:async()=>({tenantId,role:'editor'})}};
  return {deps,state,policy,text,registry,pool};
}
async function heldAdmission(action:'register'|'get'|'document',next:TenantRole) {
  const f=controlled();let entered!:()=>void,release!:()=>void;
  const admitted=new Promise<void>(resolve=>{entered=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
  if(action==='register')f.deps.registry={...f.registry,ready:()=>f.registry.ready(),legacyDocument:(...a)=>f.registry.legacyDocument(...a),get:(...args)=>f.registry.get(...args),receipt:(...args)=>f.registry.receipt(...args),register:async(...args)=>{entered();await hold;return f.registry.register(...args);}};
  else if(action==='get')f.deps.registry={...f.registry,ready:()=>f.registry.ready(),legacyDocument:(...a)=>f.registry.legacyDocument(...a),register:(...args)=>f.registry.register(...args),receipt:(...args)=>f.registry.receipt(...args),get:async(...args)=>{entered();await hold;return f.registry.get(...args);}};
  else f.deps.registry={ready:()=>f.registry.ready(),register:(...a)=>f.registry.register(...a),get:(...a)=>f.registry.get(...a),receipt:(...a)=>f.registry.receipt(...a),legacyDocument:async(...a)=>{entered();await hold;return f.registry.legacyDocument(...a);}};
  const app=createSchemaServer(f.deps);
  try {
    const request=app.inject({method:action==='register'?'PUT':'GET',url:action==='document'?base+`/documents/${documentId}/schema-bundle`:base+`/schemas/${schemaId}/versions/1`,headers,
      ...(action==='register'?{payload:{definitionText:f.text,idempotencyKey:'held-operation'}}:{})});
    await admitted;f.state.role=next;release();const response=await request;
    expect(response.statusCode).toBe(403);expect(f.state.effects).toBe(0);
  } finally {release();await app.close();}
}
describe('controlled current-policy admission with the actual store and held transport',()=>{
  it('refuses editor→admin after policy precheck but before locked registration admission',async()=>heldAdmission('register','admin'));
  it('refuses editor→viewer after policy precheck but before locked exact-version read',async()=>heldAdmission('get','viewer'));
  it('refuses editor→viewer before authoritative legacy-document lookup',async()=>heldAdmission('document','viewer'));
  it('refuses an actor receipt after trusted operator policy removes its required capability',async()=>{
    const f=controlled();f.policy[0].capabilities=[];const app=createSchemaServer(f.deps);
    try{const response=await app.inject({method:'GET',url:base+'/schema-receipts/old-operation',headers});expect(response.statusCode).toBe(403);expect(f.state.effects).toBe(0);}finally{await app.close();}
  });
});
describe('diagnostic module identity (not PostgreSQL evidence)',()=>{
  it('causally reproduces the retained source-versus-compiled error mapping and uses compiled identity for the normal cases',async()=>{
    const source=await import('../../office-service/src/schema-registry-store.js');
    const compiled=await import('@barocss/office-service/schema-registry-store');
    expect(source.SchemaRegistryError).not.toBe(compiled.SchemaRegistryError);
    const f=controlled();f.state.role='viewer';
    const direct=new source.SchemaRegistryStore(f.pool,f.policy);
    const caught=await direct.get(principal,tenantId,workspaceId,schemaId,1).then(()=>{throw new Error('Expected refusal');},error=>error);
    expect(caught).toBeInstanceOf(source.SchemaRegistryError);expect(caught).not.toBeInstanceOf(compiled.SchemaRegistryError);
    f.deps.registry=direct;const app=createSchemaServer(f.deps);
    try{const response=await app.inject({url:base+`/schemas/${schemaId}/versions/1`,headers});expect(response.statusCode).toBe(503);expect(f.state.effects).toBe(0);}finally{await app.close();}
    expect(f.registry).toBeInstanceOf(compiled.SchemaRegistryStore);
  });
});
describe('controlled schema HTTP and config boundaries',()=>{
  it('keeps liveness separate from database readiness and redacts dependency errors',async()=>{
    const f=controlled();f.deps.registry={legacyDocument:(...a)=>f.registry.legacyDocument(...a),register:(...a)=>f.registry.register(...a),get:(...a)=>f.registry.get(...a),receipt:(...a)=>f.registry.receipt(...a),ready:async()=>{throw new Error('private database secret');}};
    const app=createSchemaServer(f.deps);try{expect((await app.inject('/health/live')).statusCode).toBe(200);const r=await app.inject('/health/ready');expect(r.statusCode).toBe(503);expect(r.json()).toEqual({status:'schema_store_unavailable'});expect(r.body).not.toContain('secret');}finally{await app.close();}
  });
  it('requires a verified access token and distinguishes provider failure without exposing claims',async()=>{
    const f=controlled();let provider=false;f.deps.verifier={verify:async()=>{if(provider)throw new AuthProviderUnavailableError();throw new Error('private token claims');}};
    const app=createSchemaServer(f.deps);try{expect((await app.inject(base+`/schemas/${schemaId}/versions/1`)).statusCode).toBe(401);expect((await app.inject({url:base+`/schemas/${schemaId}/versions/1`,headers})).statusCode).toBe(401);provider=true;const r=await app.inject({url:base+`/schemas/${schemaId}/versions/1`,headers});expect(r.statusCode).toBe(503);expect(r.json()).toEqual({status:'auth_unavailable'});}finally{await app.close();}
  });
  it('rejects body approvals/executable declarations and scope mismatch without a registry effect',async()=>{
    const f=controlled(),app=createSchemaServer(f.deps);try{
      const url=base+`/schemas/${schemaId}/versions/1`;
      expect((await app.inject({method:'PUT',url,headers,payload:{definitionText:f.text,idempotencyKey:'x',approved:true}})).statusCode).toBe(400);
      expect((await app.inject({method:'PUT',url,headers,payload:{definitionText:JSON.stringify({...definition(),validator:'run()'}),idempotencyKey:'x'}})).statusCode).toBe(422);
      expect((await app.inject({method:'GET',url:base.replace(workspaceId,'66666666-6666-4666-8666-666666666666')+`/schemas/${schemaId}/versions/1`,headers})).statusCode).toBe(403);
      const duplicate = `{"definitionText":${JSON.stringify(f.text)},"definitionText":${JSON.stringify(f.text)},"idempotencyKey":"duplicate"}`;
      expect((await app.inject({method:'PUT',url,headers:{...headers,'content-type':'application/json'},payload:duplicate})).statusCode).toBe(400);
      expect(f.state.effects).toBe(0);
    }finally{await app.close();}
  });
  it('requires complete mandatory auth and a protected operator policy; never echoes values',()=>{
    expect(()=>readSchemaServerConfig({})).toThrow('SCHEMA_SERVER_AUTH');
    const dir=mkdtempSync('/private/tmp/schema-config-'),file=join(dir,'policy.json');writeFileSync(file,JSON.stringify(policies()),{mode:0o600});
    const env={SCHEMA_SERVER_POLICY_FILE:file,SCHEMA_SERVER_OIDC_ISSUER:principal.issuer,SCHEMA_SERVER_OIDC_JWKS_URL:'http://127.0.0.1:18595/keys',SCHEMA_SERVER_OIDC_AUDIENCE:'schema-test',SCHEMA_SERVER_DATABASE_URL:'postgresql://wonffice_app@localhost/private'};
    try{expect(readSchemaServerConfig(env).port).toBe(4101);chmodSync(file,0o644);expect(()=>readSchemaServerConfig(env)).toThrow('SCHEMA_SERVER_POLICY_FILE');}finally{rmSync(dir,{recursive:true});}
  });
});
