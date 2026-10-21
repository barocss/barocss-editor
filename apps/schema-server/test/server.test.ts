import { tmpdir } from 'node:os';
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
import { DocumentError, type DocumentHead, type DocumentReceipt } from '@barocss/office-service/document-store';
import type { Native2Documents } from '../src/native2-routes.js';
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

function controlledNative2() {
  const f = controlled(), text = JSON.stringify(definition()), parsed = parseRegistryDefinition(text);
  const ref = { schemaId, version: 1, digest: hash(parsed.canonicalText) };
  const bundle = { bundleVersion: 1, digestAlgorithm: 'wonffice.canonical-json.sha256.v1', selected: [ref], definitions: [{ reference: ref, definitionText: text }] };
  const raw = JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: bundle,
    document: { stype: 'note', attributes: { title: 'Controlled native2', pageId: documentId }, content: [] } });
  const head: DocumentHead = { documentId, tenantId, workspaceId, product: 'note', title: 'Controlled native2', creatorUserId: identity,
    metadataRevision: 1, mode: 'snapshot', pageId: documentId, documentKey: 'controlled-key', fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: hash(raw) };
  const calls: Array<{ operation: string; input: unknown; principal: unknown }> = [];
  const state = { deny: false };
  const check = (op: string, p: unknown, input: unknown) => {
    if (state.deny) throw new DocumentError(403, 'scope_forbidden');
    calls.push({ operation: op, input, principal: p });
  };
  const receipt = (operation: 'create' | 'update', idempotencyKey: string): DocumentReceipt =>
    ({ operation, idempotencyKey, requestHash: hash('controlled fixture receipt, not actual PG'), document: head, snapshotText: raw });
  const documents: Native2Documents = {
    create: async (p, _t, input) => { check('create', p, input); return receipt('create', input.idempotencyKey); },
    open: async (p, _t, id) => { check('open', p, id); return { document: head, snapshotText: raw }; },
    updateSnapshot: async (p, _t, _id, input) => { check('update', p, input); return receipt('update', input.idempotencyKey); },
    getReceipt: async (p, _t, operation, idempotencyKey) => {
      check('receipt', p, idempotencyKey);
      if (operation !== 'create' && operation !== 'update') throw new DocumentError(400, 'invalid_operation');
      return receipt(operation, idempotencyKey);
    }
  };
  f.deps.documents = documents;
  const input = { schemaAction: 'preserve', expectedRevision: 1, expectedSnapshotHash: hash(raw), expectedPriorPinDigest: hash('controlled priorpins'), snapshotText: raw, idempotencyKey: 'fixed-native2' };
  return { f, head, bundle, raw, calls, state, input };
}

describe('controlled optional native2 HTTP seam, separate from actual PG authority', () => {
  const path = `/v1/tenants/${tenantId}/note-native2`;
  it('has no native2 route without explicit document dependencies', async () => {
    const f = controlled(), app = createSchemaServer(f.deps);
    try { expect((await app.inject({ url: path + `/documents/${documentId}`, headers })).statusCode).toBe(404); }
    finally { await app.close(); }
  });
  it('keeps raw input/current verified principal and returns the same versioned full bundle', async () => {
    const x = controlledNative2(), app = createSchemaServer(x.f.deps);
    try {
      const saved = await app.inject({ method: 'PUT', url: path + `/documents/${documentId}/snapshot`, headers, payload: x.input });
      expect(saved.statusCode).toBe(200); expect(x.calls[0]).toEqual({ operation: 'update', input: x.input, principal });
      const opened = await app.inject({ url: path + `/documents/${documentId}/schema-bundle`, headers });
      expect(opened.json()).toEqual({ status: 'pinned', documentId, documentRevision: 1, snapshotHash: hash(x.raw),
        nativeFormat: { format: 'barocss-note', version: 2 }, bundle: x.bundle });
    } finally { await app.close(); }
  });
  it('rejects grants, missing source hash, invalid action objects, legacy payload and queries before store dispatch', async () => {
    const x = controlledNative2(), app = createSchemaServer(x.f.deps);
    try {
      const url = path + `/documents/${documentId}/snapshot`;
      for (const payload of [{ ...x.input, role: 'owner' }, { ...x.input, expectedSnapshotHash: undefined }, { ...x.input, schemaAction: {} }]) {
        expect((await app.inject({ method: 'PUT', url, headers, payload })).statusCode).toBe(400);
      }
      expect((await app.inject({ method: 'PUT', url, headers, payload: { ...x.input, snapshotText: JSON.stringify({ format: 'barocss-note', version: 1 }) } })).statusCode).toBe(422);
      expect((await app.inject({ url: path + `/documents/${documentId}?approved=true`, headers })).statusCode).toBe(400);
      expect(x.calls).toEqual([]);
    } finally { await app.close(); }
  });
  it('requires Bearer verification and maps current service denial to its named response', async () => {
    const x = controlledNative2(), app = createSchemaServer(x.f.deps);
    try {
      expect((await app.inject(path + `/documents/${documentId}`)).statusCode).toBe(401); expect(x.calls).toEqual([]);
      x.state.deny = true;
      const denied = await app.inject({ url: path + `/receipts/update/${x.input.idempotencyKey}`, headers });
      expect(denied.statusCode).toBe(403); expect(denied.json()).toEqual({ status: 'scope_forbidden' });
      expect(x.calls).toEqual([]);
    } finally { await app.close(); }
  });
  it('refuses metadata receipts and legacy native heads on the explicit route', async () => {
    const x = controlledNative2(), app = createSchemaServer(x.f.deps);
    try {
      expect((await app.inject({ url: path + '/receipts/metadata/key', headers })).statusCode).toBe(400);
      x.head.fileVersion = 1;
      expect((await app.inject({ url: path + `/documents/${documentId}`, headers })).statusCode).toBe(422);
    } finally { await app.close(); }
  });
  it('reads separate protected document permissions without inheriting registration or echoing secrets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native2-config-')), registry = join(dir, 'registry.json'), docs = join(dir, 'documents.json');
    writeFileSync(registry, JSON.stringify(policies()), { mode: 0o600 });
    const env = { SCHEMA_SERVER_POLICY_FILE: registry, SCHEMA_SERVER_OIDC_ISSUER: principal.issuer, SCHEMA_SERVER_OIDC_JWKS_URL: 'http://127.0.0.1:18595/keys',
      SCHEMA_SERVER_OIDC_AUDIENCE: 'schema-test', SCHEMA_SERVER_DATABASE_URL: 'postgresql://wonffice_app@localhost/private' };
    try {
      expect(readSchemaServerConfig(env).documentPolicy).toEqual([]);
      writeFileSync(docs, '[]', { mode: 0o600 });
      const configured = { ...env, SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE: docs };
      expect(readSchemaServerConfig(configured).documentPolicy).toEqual([]);
      const entry = { tenantId, workspaceId, readRoles: ['editor', 'viewer'], preserveRoles: ['editor'], adoptRoles: [], capabilities: ['note.field.text.v1'] };
      writeFileSync(docs, JSON.stringify([entry])); expect(readSchemaServerConfig(configured).documentPolicy).toEqual([entry]);
      writeFileSync(docs, JSON.stringify([{ ...entry, registerRoles: ['owner'] }])); expect(() => readSchemaServerConfig(configured)).toThrow('SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE');
      writeFileSync(docs, JSON.stringify([entry, entry])); expect(() => readSchemaServerConfig(configured)).toThrow('SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE');
      writeFileSync(docs, JSON.stringify([entry])); chmodSync(docs, 0o644); expect(() => readSchemaServerConfig(configured)).toThrow('SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE');
    } finally { rmSync(dir, { recursive: true }); }
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
    const dir=mkdtempSync(join(tmpdir(), 'schema-config-')),file=join(dir,'policy.json');writeFileSync(file,JSON.stringify(policies()),{mode:0o600});
    const env={SCHEMA_SERVER_POLICY_FILE:file,SCHEMA_SERVER_OIDC_ISSUER:principal.issuer,SCHEMA_SERVER_OIDC_JWKS_URL:'http://127.0.0.1:18595/keys',SCHEMA_SERVER_OIDC_AUDIENCE:'schema-test',SCHEMA_SERVER_DATABASE_URL:'postgresql://wonffice_app@localhost/private'};
    try{expect(readSchemaServerConfig(env).port).toBe(4101);chmodSync(file,0o644);expect(()=>readSchemaServerConfig(env)).toThrow('SCHEMA_SERVER_POLICY_FILE');}finally{rmSync(dir,{recursive:true});}
  });
});
