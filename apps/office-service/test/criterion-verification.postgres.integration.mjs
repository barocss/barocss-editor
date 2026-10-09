import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash,randomUUID } from 'node:crypto';
import { mkdtempSync,mkdirSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { migrations } from '../dist/migrations.js';
import { DocumentStore } from '../dist/document-store.js';
import { CriterionConfirmationStore } from '../dist/criterion-confirmation-store.js';
import { CriterionVerificationStore } from '../dist/criterion-verification-store.js';
import { createCriterionBrowserExecutor } from '../dist/criterion-browser-executor.js';
import { withTenant } from '../dist/tenant-store.js';

// The sole runtime owner executes this script serially. Never accept DATABASE_URL.
const bin=process.env.PG_BIN??execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const directory=mkdtempSync('/tmp/wonffice-verification-pg-'),data=join(directory,'data'),socket=join(directory,'socket');
mkdirSync(socket,{mode:0o700});
const run=(name,args)=>execFileSync(join(bin,name),args,{encoding:'utf8',stdio:'pipe'});
const config=user=>({host:socket,port:5432,user,database:'office_test'});
const clients=[],pools=[];let started=false;
const connect=async(user,database='office_test')=>{const client=new pg.Client({...config(user),database});await client.connect();clients.push(client);return client;};
const check=async(name,action)=>{await action();console.log(JSON.stringify({result:'passed',check:name}));};
const hash=text=>createHash('sha256').update(text).digest('hex');
try{
 run('initdb',['-D',data,'-U','wonffice_test_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${socket} -h ''`,'-w','start']);started=true;
 const admin=await connect('wonffice_test_admin','postgres');
 await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
 await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
 const owner=await connect('wonffice_owner');
 await migrate(owner,migrations.filter(m=>m.id<'0014'));
 const historical=(await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
 await check('new verification migration preserves complete older checksums and is idempotent',async()=>{
  assert.deepEqual(await migrate(owner),['0014_criterion_verifications','0015_document_creator_attribution','0016_schema_registry']);
  assert.deepEqual((await owner.query("SELECT id,checksum FROM wonffice_meta.migrations WHERE id<'0014' ORDER BY id")).rows,historical);
  assert.deepEqual(await migrate(owner),[]);
 });
 const tenantId=randomUUID(),workspaceId=randomUUID(),writerId=randomUUID(),viewerId=randomUUID(),beta=randomUUID();
 const principal={issuer:'https://fictional-criterion.invalid',subject:'writer'},viewer={...principal,subject:'viewer'};
 await owner.query("INSERT INTO wonffice.tenants(id,name) VALUES($1,'Fictional'),($2,'Foreign')",[tenantId,beta]);
 await owner.query("INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,'Synthetic')",[tenantId,workspaceId]);
 for(const[id,subject,role]of[[writerId,'writer','editor'],[viewerId,'viewer','viewer']]){
  await owner.query('INSERT INTO wonffice.identities(id,issuer,subject) VALUES($1,$2,$3)',[id,principal.issuer,subject]);
  await owner.query('INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role) VALUES($1,$2,$3)',[tenantId,id,role]);
 }
 const pool=new pg.Pool({...config('wonffice_app'),max:8});pools.push(pool);
 const documents=new DocumentStore(pool),store=new CriterionConfirmationStore(pool);
 const native=readFileSync(new URL('./fixtures/criterion-verification-word.json',import.meta.url),'utf8');
 const created=await documents.create(principal,tenantId,{workspaceId,product:'word',title:'Fictional contrast',fileFormat:'barocss-word',fileVersion:1,snapshotText:native,idempotencyKey:randomUUID()});
 const documentId=created.document.documentId;
 const originalBasis=await store.getContext(principal,tenantId,documentId);
 const confirmation=await store.confirm(principal,tenantId,documentId,{schemaVersion:1,expectedRevision:originalBasis.documentRevision,snapshotHash:originalBasis.snapshotHash,snapshotText:originalBasis.snapshotText,context:originalBasis.context,authorityEpoch:originalBasis.authorityEpoch,idempotencyKey:randomUUID()});
 let calls=0;const live=createCriterionBrowserExecutor();
 const verification=new CriterionVerificationStore(pool,{execute:async(...args)=>{calls++;return live.execute(...args);}});
 const basis=await verification.getContext(principal,tenantId,documentId);
 const request={schemaVersion:1,expectedRevision:basis.documentRevision,snapshotHash:basis.snapshotHash,snapshotText:basis.snapshotText,context:basis.context,authorityEpoch:basis.authorityEpoch,idempotencyKey:randomUUID(),confirmationId:basis.confirmationId,specimen:basis.specimens.find(item=>item.id==='dark'),evaluator:basis.evaluator};
 let receipt;
 await check('six real concurrent requests execute one registered browser specimen and preserve native confirmation',async()=>{
  assert.equal(basis.confirmationId,confirmation.confirmationId);assert.equal(basis.executable.status,'executable');
  assert.deepEqual(await verification.list(principal,tenantId,documentId),{runs:[]});
  const results=await Promise.all(Array.from({length:6},()=>verification.run(principal,tenantId,documentId,structuredClone(request))));
  receipt=results[0];for(const result of results)assert.deepEqual(result,receipt);
  assert.equal(calls,1);assert.equal(receipt.outcome,'passed');assert.equal(receipt.requesterIdentityId,writerId);
  const output=JSON.parse(receipt.outputText);assert.equal(hash(receipt.outputText),receipt.outputHash);
  assert.deepEqual(output.request,request);assert.deepEqual(output.context,basis.context);assert.equal(output.executor.id,'local-playwright-chromium');assert.ok(output.executor.browserVersion);
  assert.equal(output.specimen.sourceHash,hash(request.specimen.sourceText));assert.ok(output.evaluation.ratio>=4.5);
  assert.equal((await documents.open(principal,tenantId,documentId)).snapshotText,native);
  assert.deepEqual(await store.list(principal,tenantId,documentId),{confirmations:[confirmation]});
 });
 await check('actual registered low and transparent specimens preserve failed and unsupported measurements',async()=>{
  for(const [id,outcome]of[['low','failed'],['transparent','unsupported']]){
   const result=await verification.run(principal,tenantId,documentId,{...request,idempotencyKey:randomUUID(),specimen:basis.specimens.find(item=>item.id===id)});
   assert.equal(result.outcome,outcome);const output=JSON.parse(result.outputText);assert.equal(output.evaluation.status,outcome);assert.ok(output.rendered);assert.equal(hash(result.outputText),result.outputHash);
  }
  assert.equal(calls,3);
 });
 await check('unavailable executor creates a durable error without executing a browser',async()=>{
  const unavailable=new CriterionVerificationStore(pool);
  const result=await unavailable.run(principal,tenantId,documentId,{...request,idempotencyKey:randomUUID()});
  assert.equal(result.outcome,'error');const output=JSON.parse(result.outputText);assert.equal(output.error,'executor_unavailable');assert.equal(output.executor,null);assert.equal(output.rendered,null);assert.equal(calls,3);
  assert.deepEqual(await unavailable.get(principal,tenantId,documentId,result.runId),result);
 });
 await check('app and backup cannot update or delete immutable output; viewer RLS cannot read or insert',async()=>{
  for(const sql of['UPDATE wonffice.criterion_verifications SET outcome=\'passed\'','DELETE FROM wonffice.criterion_verifications'])await assert.rejects(pool.query(sql),{code:'42501'});
  const backup=await connect('wonffice_backup');assert.equal((await backup.query('SELECT * FROM wonffice.criterion_verifications')).rowCount,4);
  await assert.rejects(backup.query('DELETE FROM wonffice.criterion_verifications'),{code:'42501'});
  const rawViewer=action=>withTenant(pool,tenantId,async client=>{
   await client.query("SELECT set_config('wonffice.oidc_issuer',$1,true)",[viewer.issuer]);await client.query("SELECT set_config('wonffice.oidc_subject',$1,true)",[viewer.subject]);return action(client);
  });
  assert.equal((await rawViewer(client=>client.query('SELECT * FROM wonffice.criterion_verifications'))).rowCount,0);
  await assert.rejects(rawViewer(client=>client.query(`INSERT INTO wonffice.criterion_verifications
   (tenant_id,document_id,id,identity_id,confirmation_id,idempotency_key,request_hash,document_revision,snapshot_hash,snapshot_text,context,authority_epoch,specimen,evaluator,outcome,started_at,ended_at,output_text,output_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
   [tenantId,documentId,randomUUID(),viewerId,confirmation.confirmationId,randomUUID(),receipt.requestHash,1,basis.snapshotHash,native,JSON.stringify(basis.context),basis.authorityEpoch,JSON.stringify(request.specimen),JSON.stringify(request.evaluator),'passed',receipt.startedAt,receipt.endedAt,receipt.outputText,receipt.outputHash])),{code:'42501'});
  await assert.rejects(verification.get(viewer,tenantId,documentId,receipt.runId),error=>error.status===403);
  assert.equal((await withTenant(pool,beta,client=>client.query('SELECT * FROM wonffice.criterion_verifications'))).rowCount,0);
 });
 await check('changed source refuses fresh execution but lost acknowledgement returns the exact prior output',async()=>{
  await owner.query('BEGIN');await owner.query('SELECT 1 FROM wonffice.documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,documentId]);
  const pending=verification.run(principal,tenantId,documentId,{...request,idempotencyKey:randomUUID()});
  const refusal=assert.rejects(pending,error=>error.reason==='criterion_conflict');
  const limit=Date.now()+4000;let locked=false;
  while(Date.now()<limit){if((await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname='office_test' AND usename='wonffice_app' AND wait_event_type='Lock'")).rowCount){locked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(locked,true,'verification must wait for the actual PostgreSQL document lock');
  const newer=native+' ';await owner.query('UPDATE wonffice.document_snapshots SET revision=revision+1,snapshot_text=$3,snapshot_hash=$4 WHERE tenant_id=$1 AND document_id=$2',[tenantId,documentId,newer,hash(newer)]);await owner.query('COMMIT');await refusal;
  await assert.rejects(verification.run(principal,tenantId,documentId,{...request,idempotencyKey:randomUUID()}),error=>error.reason==='criterion_conflict');
  assert.deepEqual(await verification.run(principal,tenantId,documentId,request),receipt);assert.equal(calls,3);
  await assert.rejects(verification.run(principal,tenantId,documentId,{...request,specimen:basis.specimens.find(item=>item.id==='low')}),error=>error.reason==='key_reuse');
 });
 await check('role ABA invalidates frozen intent and service restart preserves exact output bytes',async()=>{
  await owner.query("UPDATE wonffice.tenant_memberships SET role='viewer' WHERE tenant_id=$1 AND identity_id=$2",[tenantId,writerId]);
  await owner.query("UPDATE wonffice.tenant_memberships SET role='editor' WHERE tenant_id=$1 AND identity_id=$2",[tenantId,writerId]);
  await assert.rejects(verification.run(principal,tenantId,documentId,request),error=>error.reason==='authority_conflict');
  const reopened=new CriterionVerificationStore(pool,live);assert.deepEqual(await reopened.get(principal,tenantId,documentId,receipt.runId),receipt);
  await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',[tenantId,writerId]);
  await assert.rejects(reopened.get(principal,tenantId,documentId,receipt.runId),error=>error.message==='tenant_access_denied');
  assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice.criterion_verifications')).rows[0].count,4);
 });
 console.log(JSON.stringify({result:'passed',transport:'private-unix-socket',checks:7,actualBrowserInvocations:calls}));
}finally{
 for(const pool of pools)await pool.end().catch(()=>{});
 for(const client of clients)await client.end().catch(()=>{});
 if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 rmSync(directory,{recursive:true,force:true});
}
