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
import { withTenant } from '../dist/tenant-store.js';

// The sole runtime owner executes this script serially. Never accept DATABASE_URL.
const bin=process.env.PG_BIN??execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const directory=mkdtempSync('/tmp/wonffice-criterion-pg-'),data=join(directory,'data'),socket=join(directory,'socket');
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
 await migrate(owner,migrations.filter(m=>m.id<'0013'));
 const historical=(await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
 await check('new confirmation migration preserves complete older checksums and is idempotent',async()=>{
  assert.deepEqual(await migrate(owner),['0013_criterion_confirmations', '0014_criterion_verifications']);
  assert.deepEqual((await owner.query("SELECT id,checksum FROM wonffice_meta.migrations WHERE id<'0013' ORDER BY id")).rows,historical);
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
 const native=readFileSync(new URL('./fixtures/criterion-confirmation-word.json',import.meta.url),'utf8');
 const created=await documents.create(principal,tenantId,{workspaceId,product:'word',title:'Fictional criterion',fileFormat:'barocss-word',fileVersion:1,snapshotText:native,idempotencyKey:randomUUID()});
 const documentId=created.document.documentId;
 const basis=await store.getContext(principal,tenantId,documentId);
 const request={schemaVersion:1,expectedRevision:basis.documentRevision,snapshotHash:basis.snapshotHash,snapshotText:basis.snapshotText,context:basis.context,authorityEpoch:basis.authorityEpoch,idempotencyKey:randomUUID()};
 let receipt;
 await check('real concurrent duplicate requests create one immutable server-owned logical receipt without native changes',async()=>{
  assert.deepEqual(await store.list(principal,tenantId,documentId),{confirmations:[]});
  const results=await Promise.all(Array.from({length:6},()=>store.confirm(principal,tenantId,documentId,structuredClone(request))));
  receipt=results[0];for(const result of results)assert.deepEqual(result,receipt);
  assert.equal(receipt.actorIdentityId,writerId);assert.equal(receipt.verification,'not-run');assert.equal(receipt.scope,'writer-self-confirmation');
  assert.ok(Number.isFinite(Date.parse(receipt.confirmedAt)));assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice.criterion_confirmations')).rows[0].count,1);
  assert.equal((await documents.open(principal,tenantId,documentId)).snapshotText,native);
 });
 await check('app role cannot update or delete original confirmations; backup is read-only',async()=>{
  await assert.rejects(pool.query('UPDATE wonffice.criterion_confirmations SET confirmed_at=now()'),{code:'42501'});
  await assert.rejects(pool.query('DELETE FROM wonffice.criterion_confirmations'),{code:'42501'});
  const backup=await connect('wonffice_backup');const rows=(await backup.query('SELECT * FROM wonffice.criterion_confirmations WHERE tenant_id=$1 AND document_id=$2',[tenantId,documentId])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].id,receipt.confirmationId);assert.equal(rows[0].snapshot_text,native);assert.deepEqual(rows[0].context,basis.context);
  await assert.rejects(backup.query('UPDATE wonffice.criterion_confirmations SET confirmed_at=now()'),{code:'42501'});
  await assert.rejects(backup.query('DELETE FROM wonffice.criterion_confirmations'),{code:'42501'});
 });
 const rawViewer=action=>withTenant(pool,tenantId,async client=>{
  await client.query("SELECT set_config('wonffice.oidc_issuer',$1,true)",[viewer.issuer]);
  await client.query("SELECT set_config('wonffice.oidc_subject',$1,true)",[viewer.subject]);return action(client);
 });
 await check('raw viewer RLS returns no private rows and rejects insert; cross-tenant context cannot read originals',async()=>{
  assert.equal((await rawViewer(client=>client.query('SELECT * FROM wonffice.criterion_confirmations'))).rowCount,0);
  await assert.rejects(rawViewer(client=>client.query(`INSERT INTO wonffice.criterion_confirmations
   (tenant_id,document_id,id,identity_id,idempotency_key,request_hash,document_revision,snapshot_hash,snapshot_text,context,authority_epoch)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[tenantId,documentId,randomUUID(),viewerId,randomUUID(),receipt.requestHash,1,basis.snapshotHash,native,JSON.stringify(basis.context),'viewer:0'])),{code:'42501'});
  assert.equal((await withTenant(pool,beta,client=>client.query('SELECT * FROM wonffice.criterion_confirmations'))).rowCount,0);
 });
 const waitForLock=async()=>{
  const limit=Date.now()+4000;
  while(Date.now()<limit){const rows=await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname='office_test' AND usename='wonffice_app' AND wait_event_type='Lock'");if(rows.rowCount)return;await new Promise(resolve=>setTimeout(resolve,10));}
  throw new Error('app operation did not reach the expected real PostgreSQL lock');
 };
 await check('canonical source changed while confirmation waits for document lock refuses without adding records',async()=>{
  await owner.query('BEGIN');await owner.query('SELECT 1 FROM wonffice.documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,documentId]);
  const pending=store.confirm(principal,tenantId,documentId,{...request,idempotencyKey:randomUUID()});
  const refusal=assert.rejects(pending,error=>error.reason==='criterion_conflict');
  await waitForLock();const newer=native+' ';
  await owner.query('UPDATE wonffice.document_snapshots SET revision=revision+1,snapshot_text=$3,snapshot_hash=$4 WHERE tenant_id=$1 AND document_id=$2',[tenantId,documentId,newer,hash(newer)]);
  await owner.query('COMMIT');await refusal;
  assert.equal((await documents.open(principal,tenantId,documentId)).snapshotText,newer);
  assert.deepEqual((await store.list(principal,tenantId,documentId)).confirmations,[receipt]);
  assert.deepEqual(await store.confirm(principal,tenantId,documentId,request),receipt);
 });
 await check('committed role ABA without membership events changes MVCC epoch and refuses the frozen writer request',async()=>{
  const eventsBefore=(await owner.query('SELECT count(*)::int AS count FROM wonffice.membership_events WHERE tenant_id=$1 AND identity_id=$2',[tenantId,writerId])).rows[0].count;
  await owner.query("UPDATE wonffice.tenant_memberships SET role='viewer' WHERE tenant_id=$1 AND identity_id=$2",[tenantId,writerId]);
  await owner.query("UPDATE wonffice.tenant_memberships SET role='editor' WHERE tenant_id=$1 AND identity_id=$2",[tenantId,writerId]);
  assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice.membership_events WHERE tenant_id=$1 AND identity_id=$2',[tenantId,writerId])).rows[0].count,eventsBefore);
  const restored=await store.getContext(principal,tenantId,documentId);assert.notEqual(restored.authorityEpoch,basis.authorityEpoch);
  await assert.rejects(store.confirm(principal,tenantId,documentId,request),error=>error.reason==='authority_conflict');
  assert.deepEqual((await store.list(principal,tenantId,documentId)).confirmations,[receipt]);
 });
 await check('revocation committed while actor lock waits denies private confirmation and retains old receipt',async()=>{
  const now=await store.getContext(principal,tenantId,documentId);
  await owner.query('BEGIN');await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',[tenantId,writerId]);
  const pending=store.confirm(principal,tenantId,documentId,{...request,expectedRevision:now.documentRevision,snapshotHash:now.snapshotHash,snapshotText:now.snapshotText,context:now.context,authorityEpoch:now.authorityEpoch,idempotencyKey:randomUUID()});
  const refusal=assert.rejects(pending,error=>error.message==='tenant_access_denied');
  await waitForLock();await owner.query('COMMIT');await refusal;
  assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice.criterion_confirmations')).rows[0].count,1);
  await assert.rejects(store.list(principal,tenantId,documentId),error=>error.message==='tenant_access_denied');
  const row=(await owner.query('SELECT * FROM wonffice.criterion_confirmations')).rows[0];assert.equal(row.id,receipt.confirmationId);assert.equal(row.snapshot_text,native);
 });
 console.log(JSON.stringify({result:'passed',transport:'private-unix-socket',checks:7}));
}finally{
 for(const pool of pools)await pool.end().catch(()=>{});
 for(const client of clients)await client.end().catch(()=>{});
 if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 rmSync(directory,{recursive:true,force:true});
}
