import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { migrations } from '../dist/migrations.js';
import { DocumentStore } from '../dist/document-store.js';
import { ProjectStore, ProjectError } from '../dist/project-store.js';
import { ProjectExecutionStore } from '../dist/project-execution.js';
import { TenantAccessDeniedError } from '../dist/membership-store.js';

// Private synthetic database only. This test never performs model inference.
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-execution-pg-'), data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [], pools = []; let started = false;
const connect = async (user, database) => { const c = new pg.Client(config(user, database)); await c.connect(); clients.push(c); return c; };
const check = async (name, action) => { await action(); console.log(JSON.stringify({ result: 'passed', check: name })); };
const digest = text => createHash('sha256').update(text).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const proposal = { replacement: 'Use the new local workflow.', reason: 'Synthetic test proposal', assumptions: [] };
const response = input => ({ proposal, provenance: { kind: 'live-local-model', adapterVersion: 'synthetic-test-only',
  contextTokens:32768,outputTokenLimit:4096,promptBytes:3000,promptEvalCount:1500,evalCount:100,model: 'synthetic', modelDigest: 'a'.repeat(64), runtimeVersion: 'test', inputHash: digest(JSON.stringify(input)),
  responseHash: 'b'.repeat(64), proposalHash: digest(JSON.stringify(proposal)), startedAt: '2026-10-03T00:00:00Z', completedAt: '2026-10-03T00:00:01Z' } });
try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
  const admin = await connect('wonffice_test_admin', 'postgres');
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  const owner = await connect('wonffice_owner');
  await migrate(owner, migrations.filter(m => m.id < '0012'));
  const history = (await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
  await check('execution migration preserves every existing migration and is idempotent', async () => {
    assert.deepEqual(await migrate(owner), ['0012_project_execution_attempts']);
    assert.deepEqual((await owner.query("SELECT id,checksum FROM wonffice_meta.migrations WHERE id<'0012' ORDER BY id")).rows, history);
    assert.deepEqual(await migrate(owner), []);
  });
  const tenantId = randomUUID(), beta = randomUUID(), workspaceId = randomUUID();
  const actorId = randomUUID(), viewerId = randomUUID(), outsiderId = randomUUID();
  const issuer = 'https://synthetic-execution.example.test';
  const actor = { issuer, subject: 'editor' }, viewer = { issuer, subject: 'viewer' }, outsider = { issuer, subject: 'outsider' };
  await owner.query('INSERT INTO wonffice.tenants(id,name) VALUES($1,\'Execution\'),($2,\'Foreign\')', [tenantId,beta]);
  await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,\'Synthetic\')', [tenantId,workspaceId]);
  for (const [id, subject, tenant, role] of [[actorId,'editor',tenantId,'editor'],[viewerId,'viewer',tenantId,'viewer'],[outsiderId,'outsider',beta,'editor']]) {
    await owner.query('INSERT INTO wonffice.identities(id,issuer,subject) VALUES($1,$2,$3)', [id,issuer,subject]);
    await owner.query('INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role) VALUES($1,$2,$3)', [tenant,id,role]);
  }
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 5 }); pools.push(pool);
  const documents = new DocumentStore(pool), projects = new ProjectStore(pool);
  const seed = async (unsupported = false) => {
    const thread = randomUUID(), text = 'Keep the running app open.';
    const document = { stype:'document', metadata:{ source:'원본 보존' }, content:[
      { stype:'section', attributes:{ pageWidth:11906 }, content:[
        { stype:'paragraph', attributes:{ styleId:'body' }, content:[{stype:'inline-text',attributes:{},text,
          marks:[{stype:'commentRef',attrs:{id:thread},range:[0,unsupported ? 4 : text.length]}]}] },
        { stype:'paragraph',attributes:{},content:[{stype:'inline-text',text:'Untouched sibling'}] } ] },
      { stype:'resources',attributes:{},content:[{stype:'commentThread',attributes:{id:thread,resolved:false},content:[
        {stype:'paragraph',attributes:{author:'Synthetic original'},content:[{stype:'inline-text',text:'Please improve this'}]}]}] } ] };
    const snapshotText = `${JSON.stringify({format:'barocss-word',version:1,document},null,2)}\n`;
    const doc = await documents.create(actor,tenantId,{workspaceId,product:'word',title:'Guide',fileFormat:'barocss-word',fileVersion:1,snapshotText,idempotencyKey:randomUUID()});
    const documentId = doc.document.documentId;
    let current = await projects.create(actor,tenantId,{workspaceId,title:'Project',goal:'Guide request',idempotencyKey:randomUUID()});
    const update = async action => { current=await projects.update(actor,tenantId,current.project.record.id,{expectedRevision:current.project.revision,idempotencyKey:randomUUID(),action});return current; };
    await update({type:'link-result',name:'Guide',document:{product:'word',id:documentId}});
    const resultId=current.project.record.results[0].id;
    await update({type:'comment',resultId,target:{kind:'word-comment',id:thread,quote:unsupported ? text.slice(0,4) : text},body:'Improve guide',source:{documentId,revision:1,snapshotHash:digest(snapshotText)}});
    const beforeRequest = structuredClone(current);
    await update({type:'request',commentId:current.project.record.comments[0].id,request:'Update this guide clearly.'});
    return { projectId:current.project.record.id,workId:current.project.record.works[0].id,resultId,documentId,document,snapshotText,thread,
      update, current:()=>current, beforeRequest, args:()=>[actor,tenantId,current.project.record.id,current.project.record.works[0].id] };
  };
  let calls=0;
  const adapter={generate:async input=>{calls++;return response(input);}};
  const execution=new ProjectExecutionStore(pool,adapter);
  await check('read-only inspection and unconnected adapter do not dispatch or write native bytes', async () => {
    const s=await seed();
    assert.deepEqual(await execution.get(...s.args()),{execution:null});
    await assert.rejects(new ProjectExecutionStore(pool).execute(...s.args(),{expectedRevision:s.current().project.revision}),e=>e.reason==='execution_unconnected');
    assert.equal(calls,0);assert.deepEqual(await execution.get(...s.args()),{execution:null});
    assert.equal((await documents.open(actor,tenantId,s.documentId)).snapshotText,s.snapshotText);
  });
  const first=await seed(); let firstView;
  await check('reserve dispatch, repeat, accept replay and acknowledgement use one immutable attempt and exact expected bytes', async () => {
    const before=await projects.get(...first.args().slice(0,3));
    const result=await execution.execute(...first.args(),{expectedRevision:first.current().project.revision}); firstView=result.execution;
    assert.equal(firstView.phase,'proposal');assert.equal(firstView.actorId,actorId);assert.equal(firstView.input.target.nodeId,first.thread);
    assert.deepEqual(await execution.execute(...first.args(),{expectedRevision:1}),result);assert.equal(calls,1);
    assert.deepEqual(await projects.get(...first.args().slice(0,3)),before);
    assert.equal((await documents.open(actor,tenantId,first.documentId)).snapshotText,first.snapshotText);
    const expected=structuredClone(first.document);const leaf=expected.content[0].content[0].content[0];leaf.text=proposal.replacement;leaf.marks[0].range[1]=leaf.text.length;
    const bytes=`${JSON.stringify({format:'barocss-word',version:1,document:expected},null,2)}\n`;
    assert.equal(firstView.expectedSnapshotText,bytes);assert.equal(firstView.expectedSnapshotHash,digest(bytes));
    const accepted=await execution.authorizeAcceptance(...first.args(),firstView.id,{});
    assert.equal(accepted.execution.phase,'accepted');
    await assert.rejects(execution.reject(...first.args(),firstView.id,{}),e=>e.reason==='execution_not_rejectable');
    assert.deepEqual(await execution.authorizeAcceptance(...first.args(),firstView.id,{}),accepted);
    await assert.rejects(execution.acknowledge(...first.args(),firstView.id,{revision:2,snapshotHash:digest(bytes)}),e=>e.reason==='output_conflict');
    await documents.updateSnapshot(actor,tenantId,first.documentId,{expectedRevision:1,snapshotText:bytes,idempotencyKey:randomUUID()});
    const applied=await execution.acknowledge(...first.args(),firstView.id,{revision:2,snapshotHash:digest(bytes)});
    assert.equal(applied.execution.phase,'applied');assert.equal(applied.execution.appliedRevision,2);
    assert.deepEqual(await execution.acknowledge(...first.args(),firstView.id,{revision:2,snapshotHash:digest(bytes)}),applied);
    assert.deepEqual(await projects.get(...first.args().slice(0,3)),before);
  });
  let retainedStarted;
  await check('concurrent duplicate and process restart observe unknown and never reinvoke dispatched provider', async () => {
    const s=await seed(),entered=deferred(),hold=deferred();let dispatches=0;
    const pendingStore=new ProjectExecutionStore(pool,{generate:async input=>{dispatches++;entered.resolve();await hold.promise;return response(input);}});
    const pending=pendingStore.execute(...s.args(),{expectedRevision:s.current().project.revision});await entered.promise;
    const repeated=await pendingStore.execute(...s.args(),{expectedRevision:s.current().project.revision});assert.equal(repeated.execution.phase,'unknown');
    const restarted=new ProjectExecutionStore(pool,{generate:async()=>{throw new Error('must not redispatch');}});
    assert.deepEqual(await restarted.get(...s.args()),repeated);assert.deepEqual(await restarted.execute(...s.args(),{expectedRevision:1}),repeated);assert.equal(dispatches,1);
    hold.resolve();assert.equal((await pending).execution.phase,'proposal');
    // Simulate process death after committed reservation; database restart below must retain it.
    await owner.query("UPDATE wonffice.project_executions SET data=jsonb_set(data,'{phase}','\"started\"') WHERE id=$1",[repeated.execution.id]);
    retainedStarted={s,id:repeated.execution.id};
  });
  await check('pause, changed source and membership ABA preserve proposals as blocked without native writes', async () => {
    for(const change of ['pause','source','authority']){
      const s=await seed(),entered=deferred(),hold=deferred();
      const store=new ProjectExecutionStore(pool,{generate:async input=>{entered.resolve();await hold.promise;return response(input);}});
      const pending=store.execute(...s.args(),{expectedRevision:s.current().project.revision});await entered.promise;
      if(change==='pause') await s.update({type:'pause',workId:s.workId,paused:true});
      if(change==='source')await documents.updateSnapshot(actor,tenantId,s.documentId,{expectedRevision:1,snapshotText:s.snapshotText.replace('Untouched sibling','Human changed sibling'),idempotencyKey:randomUUID()});
      if(change==='authority')await owner.query(`INSERT INTO wonffice.membership_events(id,tenant_id,identity_id,approval_ref,action,role)
        VALUES($1,$2,$3,$4,'revoke','editor'),($5,$2,$3,$6,'grant','editor')`,[randomUUID(),tenantId,actorId,randomUUID(),randomUUID(),randomUUID()]);
      hold.resolve();const result=(await pending).execution;assert.equal(result.phase,'blocked');assert.deepEqual(result.proposal,proposal);
      await assert.rejects(store.authorizeAcceptance(...s.args(),result.id,{}),e=>e.reason==='execution_not_applicable');
      const expected=change==='source'?s.snapshotText.replace('Untouched sibling','Human changed sibling'):s.snapshotText;
      assert.equal((await documents.open(actor,tenantId,s.documentId)).snapshotText,expected);
    }
  });
  await check('revocation while provider is pending retains bounded outcome but denies the revoked caller', async () => {
    const s=await seed(),entered=deferred(),hold=deferred();
    const store=new ProjectExecutionStore(pool,{generate:async input=>{entered.resolve();await hold.promise;return response(input);}});
    const pending=store.execute(...s.args(),{expectedRevision:s.current().project.revision});await entered.promise;
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',[tenantId,actorId]);
    const rejection=assert.rejects(pending,TenantAccessDeniedError);hold.resolve();await rejection;
    const retained=(await owner.query('SELECT data FROM wonffice.project_executions WHERE project_id=$1',[s.projectId])).rows[0].data;
    assert.equal(retained.phase,'blocked');assert.deepEqual(retained.proposal,proposal);
    await assert.rejects(store.get(...s.args()),TenantAccessDeniedError);
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=NULL WHERE tenant_id=$1 AND identity_id=$2',[tenantId,actorId]);
    assert.equal((await documents.open(actor,tenantId,s.documentId)).snapshotText,s.snapshotText);
  });
  await check('unknown and invalid provider outcomes are durable and never automatically retried', async () => {
    for(const mode of ['unknown','invalid']){
      const s=await seed();let dispatches=0;
      const store=new ProjectExecutionStore(pool,{generate:async input=>{dispatches++;if(mode==='unknown')throw new Error('unacknowledged dispatch');return {...response(input),proposal:{replacement:'',reason:'invalid',assumptions:[]}};}});
      const result=await store.execute(...s.args(),{expectedRevision:s.current().project.revision});assert.equal(result.execution.phase,mode==='unknown'?'unknown':'failed');
      assert.deepEqual(await store.execute(...s.args(),{expectedRevision:1}),result);assert.equal(dispatches,1);
      assert.equal((await documents.open(actor,tenantId,s.documentId)).snapshotText,s.snapshotText);
    }
  });
  await check('unknown provider outcome stays unknown across pause and current authority denial', async()=>{
    for(const change of ['pause','revoke']){
      const s=await seed(),entered=deferred(),hold=deferred();
      const store=new ProjectExecutionStore(pool,{generate:async()=>{entered.resolve();await hold.promise;throw new Error('lost provider response');}});
      const pending=store.execute(...s.args(),{expectedRevision:s.current().project.revision});await entered.promise;
      if(change==='pause')await s.update({type:'pause',workId:s.workId,paused:true});
      else await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',[tenantId,actorId]);
      const denied=change==='revoke'?assert.rejects(pending,TenantAccessDeniedError):null;
      hold.resolve();if(denied)await denied;else assert.equal((await pending).execution.phase,'unknown');
      const row=(await owner.query('SELECT data FROM wonffice.project_executions WHERE project_id=$1',[s.projectId])).rows[0].data;
      assert.equal(row.phase,'unknown');assert.equal(row.reason,'execution_outcome_unknown');assert.equal(row.proposal,undefined);
      if(change==='revoke')await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=NULL WHERE tenant_id=$1 AND identity_id=$2',[tenantId,actorId]);
      assert.equal((await documents.open(actor,tenantId,s.documentId)).snapshotText,s.snapshotText);
    }
  });
  await check('explicit rejection preserves native bytes and refuses captured authority ABA', async()=>{
    const s=await seed();const result=(await execution.execute(...s.args(),{expectedRevision:s.current().project.revision})).execution;
    const rejected=await execution.reject(...s.args(),result.id,{});assert.equal(rejected.execution.phase,'rejected');
    assert.equal((await documents.open(actor,tenantId,s.documentId)).snapshotText,s.snapshotText);
    const other=await seed();const pending=(await execution.execute(...other.args(),{expectedRevision:other.current().project.revision})).execution;
    await owner.query(`INSERT INTO wonffice.membership_events(id,tenant_id,identity_id,approval_ref,action,role)
      VALUES($1,$2,$3,$4,'revoke','editor'),($5,$2,$3,$6,'grant','editor')`,[randomUUID(),tenantId,actorId,randomUUID(),randomUUID(),randomUUID()]);
    await assert.rejects(execution.reject(...other.args(),pending.id,{}),e=>e.reason==='authority_changed');
    assert.equal((await execution.get(...other.args())).execution.phase,'proposal');
  });
  await check('unsupported partial target is durable and does not invoke the provider', async()=>{
    const s=await seed(true),before=calls;
    const result=await execution.execute(...s.args(),{expectedRevision:s.current().project.revision});assert.equal(result.execution.phase,'unsupported');assert.equal(calls,before);
    assert.deepEqual(await execution.execute(...s.args(),{expectedRevision:1}),result);
  });
  await check('viewer, foreign tenant, forged actor and stale source cannot reserve execution', async()=>{
    const s=await seed(),body={expectedRevision:s.current().project.revision};
    await assert.rejects(execution.execute(viewer,tenantId,s.projectId,s.workId,body),e=>e.status===403);
    await assert.rejects(execution.execute(outsider,tenantId,s.projectId,s.workId,body),TenantAccessDeniedError);
    await assert.rejects(execution.execute(...s.args(),{...body,actorId}),e=>e.reason==='invalid_request');
    await documents.updateSnapshot(actor,tenantId,s.documentId,{expectedRevision:1,snapshotText:s.snapshotText.replace('Untouched sibling','Different'),idempotencyKey:randomUUID()});
    await assert.rejects(execution.execute(...s.args(),body),e=>e.reason==='source_conflict');
    assert.deepEqual(await execution.get(...s.args()),{execution:null});
  });
  await check('claim, RLS, deletion and completion-field grants remain bounded', async()=>{
    const security=(await owner.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='wonffice.project_executions'::regclass")).rows[0];
    assert.deepEqual(security,{relrowsecurity:true,relforcerowsecurity:true});
    assert.equal((await pool.query('SELECT data FROM wonffice.project_executions')).rowCount,0);
    await assert.rejects(pool.query('SELECT claim_hash FROM wonffice.project_executions'),{code:'42501'});
    await assert.rejects(pool.query('DELETE FROM wonffice.project_executions'),{code:'42501'});
    const client=await connect('wonffice_app');await client.query('BEGIN');await client.query("SELECT set_config('wonffice.tenant_id',$1,true)",[tenantId]);
    await assert.rejects(client.query('SELECT wonffice.complete_project_execution($1,$2,$3,$4,$5)',[tenantId,first.projectId,firstView.id,'x'.repeat(64),JSON.stringify({phase:'proposal',input:{forged:true}})]),/invalid_execution_completion/);
    await client.query('ROLLBACK');
  });
  await check('private database restart retains applied and dispatched-unknown attempts without invocation', async()=>{
    const before=await execution.get(...first.args());
    await Promise.all(pools.map(p=>p.end()));pools.length=0;await Promise.all(clients.map(c=>c.end()));clients.length=0;
    run('pg_ctl',['-D',data,'-m','fast','-w','stop']);started=false;
    run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${socket} -h ''`,'-w','start']);started=true;
    const restartedPool=new pg.Pool({...config('wonffice_app'),max:2});pools.push(restartedPool);
    const store=new ProjectExecutionStore(restartedPool,{generate:async()=>{throw new Error('must never redispatch');}});
    assert.deepEqual(await store.get(...first.args()),before);
    const unknown=await store.execute(...retainedStarted.s.args(),{expectedRevision:1});assert.equal(unknown.execution.id,retainedStarted.id);assert.equal(unknown.execution.phase,'unknown');
  });
} finally {
  await Promise.allSettled(pools.map(pool=>pool.end()));await Promise.allSettled(clients.map(client=>client.end()));
  if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);rmSync(directory,{recursive:true,force:true});
  console.log(JSON.stringify({cleanup:true,transport:'private-unix-socket',sharedServicesTouched:false,inference:false}));
}
