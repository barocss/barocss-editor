import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../../office-service/dist/migrate.js';
import { migrations } from '../../office-service/dist/migrations.js';
import { DocumentStore } from '../../office-service/dist/document-store.js';
import { ProjectStore, ProjectError } from '../../office-service/dist/project-store.js';
import { MembershipStore, TenantAccessDeniedError } from '../../office-service/dist/membership-store.js';
import { createApiServer } from '../dist/server.js';

// A private Unix-socket cluster. Never connect to DATABASE_URL or shared PostgreSQL.
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-project-pg-'), data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [], pools = []; let started = false, api;
const connect = async (user, database) => { const c = new pg.Client(config(user, database)); await c.connect(); clients.push(c); return c; };
const check = async (name, action) => { await action(); console.log(JSON.stringify({ result: 'passed', check: name })); };
const digest = text => createHash('sha256').update(text).digest('hex');
try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
  const admin = await connect('wonffice_test_admin', 'postgres');
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  const owner = await connect('wonffice_owner');
  await migrate(owner, migrations.filter(m => m.id < '0011'));
  const history = (await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
  await check('immutable upgrade adds only project catalog tables', async () => {
    assert.deepEqual(await migrate(owner), ['0011_connected_projects']);
    assert.deepEqual((await owner.query("SELECT id,checksum FROM wonffice_meta.migrations WHERE id<'0011' ORDER BY id")).rows, history);
    assert.deepEqual(await migrate(owner), []);
  });
  const tenantId = randomUUID(), beta = randomUUID(), workspaceId = randomUUID(), foreignWorkspace = randomUUID();
  const editorId = randomUUID(), viewerId = randomUUID(), outsiderId = randomUUID();
  const issuer = 'https://synthetic-idp.example.test';
  const editor = { issuer, subject: 'editor' }, viewer = { issuer, subject: 'viewer' }, outsider = { issuer, subject: 'outsider' };
  await owner.query('INSERT INTO wonffice.tenants(id,name) VALUES($1,$2),($3,$4)', [tenantId,'Synthetic Windows beta',beta,'Foreign']);
  await owner.query(`INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,'Project docs'),($3,$4,'Foreign docs')`,
    [tenantId,workspaceId,beta,foreignWorkspace]);
  for (const [id, subject, tenant, role] of [[editorId,'editor',tenantId,'editor'],[viewerId,'viewer',tenantId,'viewer'],[outsiderId,'outsider',beta,'editor']]) {
    await owner.query('INSERT INTO wonffice.identities(id,issuer,subject) VALUES($1,$2,$3)', [id,issuer,subject]);
    await owner.query('INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role) VALUES($1,$2,$3)', [tenant,id,role]);
  }
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 3 }); pools.push(pool);
  const store = new ProjectStore(pool), documents = new DocumentStore(pool), memberships = new MembershipStore(pool);
  const guideText = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Keep the running app open.', marks: [
      { stype: 'commentRef', attrs: { id: 'comment-1' }, range: [9,20] }] }] },
    { stype: 'resources', content: [{ stype: 'commentThread', attributes: { id: 'comment-1', resolved: false }, content: [
      { stype: 'paragraph', attributes: { author: 'Synthetic human', date: new Date().toISOString() }, content: [{ stype: 'inline-text', text: 'Also update training.' }] }] }] }
  ] } });
  const guide = await documents.create(editor, tenantId, { workspaceId,product:'word',title:'Customer guide',fileFormat:'barocss-word',fileVersion:1,
    snapshotText:guideText,idempotencyKey:'guide' });
  const training = await documents.create(editor, tenantId, { workspaceId,product:'slides',title:'Team training',fileFormat:'barocss-slides',fileVersion:1,
    snapshotText:JSON.stringify({format:'barocss-slides',version:1,document:{stype:'document',content:[]}}),idempotencyKey:'training' });
  const foreign = await documents.create(outsider, beta, { workspaceId:foreignWorkspace,product:'word',title:'Foreign',fileFormat:'barocss-word',fileVersion:1,
    snapshotText:guideText,idempotencyKey:'foreign' });
  const source = { documentId:guide.document.documentId,revision:1,snapshotHash:digest(guideText) };
  let current, guideResult, trainingResult, opinion, work, pin;
  const create = {workspaceId,title:'Windows beta release',goal:'Customer guide and team training',idempotencyKey:'project-create'};
  const change = async (action, idempotencyKey) => { current = await store.update(editor,tenantId,current.project.record.id,
    {expectedRevision:current.project.revision,idempotencyKey,action}); return current; };
  await check('create replay/CAS and four existing representation links do not copy native documents', async () => {
    const before = (await owner.query('SELECT count(*)::int AS n FROM wonffice.documents')).rows[0].n;
    current = await store.create(editor,tenantId,create);
    assert.equal(current.actor.id,editorId); assert.equal(current.actor.kind,'human'); assert.equal(current.project.revision,1);
    assert.deepEqual(await store.create(editor,tenantId,create),current);
    await assert.rejects(store.create(editor,tenantId,{...create,title:'Key reuse'}),e=>e instanceof ProjectError && e.reason==='key_reuse');
    for (const document of [guide.document,training.document]) await change({type:'link-result',name:document.title,document:{product:document.product,id:document.documentId}},`link-${document.product}`);
    for (const product of ['note','site']) {
      const doc = await documents.create(editor,tenantId,{workspaceId,product,title:product,fileFormat:`barocss-${product}`,fileVersion:1,
        ...(product==='note'?{importMode:'new-page-copy'}:{}),snapshotText:JSON.stringify({format:`barocss-${product}`,version:1,document:{stype:product==='note'?'note':'document',
          ...(product==='note'?{attributes:{pageId:randomUUID(),title:'Note'},content:[{stype:'paragraph',content:[{stype:'inline-text',text:'Internal'}]}]}:{content:[]})}}),idempotencyKey:`make-${product}`});
      await change({type:'link-result',name:product,document:{product,id:doc.document.documentId}},`link-${product}`);
    }
    assert.equal(current.project.record.results.length,4);
    guideResult=current.project.record.results.find(r=>r.document.id===guide.document.documentId);
    trainingResult=current.project.record.results.find(r=>r.document.id===training.document.documentId);
    await change({type:'link-result',name:'Duplicate',document:guideResult.document},'duplicate-link');
    assert.equal(current.project.record.results.length,4);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.documents')).rows[0].n,before+2);
    await assert.rejects(store.update(editor,tenantId,current.project.record.id,{expectedRevision:1,idempotencyKey:'stale-project',action:{type:'metadata',goal:'bad'}}),
      e=>e instanceof ProjectError && e.reason==='revision_conflict');
    await assert.rejects(change({type:'link-result',name:'Foreign',document:{product:'word',id:foreign.document.documentId}},'foreign-link'),
      e=>e instanceof ProjectError && e.reason==='source_not_found');
  });
  await check('opinion-only pins canonical bytes without changing source or starting work', async () => {
    const before = await documents.open(editor,tenantId,guide.document.documentId);
    const commentInput={expectedRevision:current.project.revision,idempotencyKey:'opinion',action:{type:'comment',resultId:guideResult.id,target:{kind:'word-comment',id:'comment-1',quote:'running app'},body:'Also update training.',source}};
    current=await store.update(editor,tenantId,current.project.record.id,commentInput);
    assert.deepEqual(await new ProjectStore(pool).update(editor,tenantId,current.project.record.id,commentInput),current);
    assert.equal((await store.get(editor,tenantId,current.project.record.id)).project.record.comments.length,1);
    opinion=current.project.record.comments[0]; pin=opinion.pin;
    assert.equal(opinion.actor.id,editorId); assert.equal(opinion.actor.kind,'human'); assert.equal(pin.text,guideText); assert.equal(pin.revision,1);
    assert.equal(current.project.record.works.length,0);
    assert.deepEqual(await documents.open(editor,tenantId,guide.document.documentId),before);
    assert.deepEqual((await store.getPin(viewer,tenantId,current.project.record.id,pin.id)).pin,pin);
  });
  await check('request replay, paused restart and resume retain one unconnected work', async () => {
    const input={expectedRevision:current.project.revision,idempotencyKey:'request',action:{type:'request',commentId:opinion.id,request:'Update the guide and training.'}};
    current=await store.update(editor,tenantId,current.project.record.id,input); const first=structuredClone(current);
    assert.deepEqual(await store.update(editor,tenantId,current.project.record.id,input),first);
    work=current.project.record.works[0]; assert.equal(work.state,'unconnected'); assert.deepEqual(work.inputs,[pin]);
    await change({type:'request',commentId:opinion.id,request:'Update the guide and training.'},'request-again');
    assert.equal(current.project.record.works.length,1); assert.equal(current.project.record.works[0].id,work.id);
    await change({type:'pin-input',resultId:trainingResult.id,source,requestId:work.id},'training-input');
    assert.deepEqual(current.project.record.works[0].outputs,[guideResult.id,trainingResult.id]); assert.equal(current.project.record.results.find(r=>r.id===trainingResult.id).request,work.id);
    await change({type:'pause',workId:work.id,paused:true},'pause');
    const reopened=await new ProjectStore(pool).get(editor,tenantId,current.project.record.id);
    assert.equal(reopened.project.record.works[0].id,work.id); assert.equal(reopened.project.record.works[0].state,'paused');
    await change({type:'pause',workId:work.id,paused:false},'resume'); assert.equal(current.project.record.works[0].state,'unconnected');
  });
  await check('human source changes keep historical evidence and reject stale request/pin without writes', async () => {
    const next=guideText.replace('Keep the running app open.','Keep the running app open. Human edit.');
    await documents.updateSnapshot(editor,tenantId,guide.document.documentId,{expectedRevision:1,snapshotText:next,idempotencyKey:'human-edit'});
    const inspected=await store.getPin(editor,tenantId,current.project.record.id,pin.id); assert.equal(inspected.sourceState,'changed'); assert.equal(inspected.pin.text,guideText);
    const before=await store.get(editor,tenantId,current.project.record.id);
    await assert.rejects(change({type:'pin-input',resultId:trainingResult.id,source},'stale-pin'),e=>e instanceof ProjectError && e.reason==='source_conflict');
    await assert.rejects(change({type:'request',commentId:opinion.id,request:'Stale update'},'stale-request'),e=>e instanceof ProjectError && e.reason==='source_conflict');
    assert.deepEqual(await store.get(editor,tenantId,current.project.record.id),before);
    assert.equal((await documents.open(editor,tenantId,guide.document.documentId)).snapshotText,next);
  });
  await check('viewer, revoked and cross-tenant roles cannot mutate or retrieve private pins', async () => {
    const projectId=current.project.record.id;
    await assert.rejects(store.create(viewer,tenantId,{...create,idempotencyKey:'viewer'}),e=>e instanceof ProjectError && e.status===403);
    await assert.rejects(store.update(viewer,tenantId,projectId,{expectedRevision:current.project.revision,idempotencyKey:'viewer-change',action:{type:'metadata',title:'Denied'}}),e=>e instanceof ProjectError && e.status===403);
    await assert.rejects(store.get(outsider,tenantId,projectId),TenantAccessDeniedError);
    await assert.rejects(store.getPin(outsider,tenantId,projectId,pin.id),TenantAccessDeniedError);
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',[tenantId,viewerId]);
    await assert.rejects(store.getPin(viewer,tenantId,projectId,pin.id),TenantAccessDeniedError);
    await owner.query('UPDATE wonffice.tenant_memberships SET role=\'viewer\' WHERE tenant_id=$1 AND identity_id=$2',[tenantId,editorId]);
    await assert.rejects(store.create(editor,tenantId,create),e=>e instanceof ProjectError && e.status===403);
    await owner.query('UPDATE wonffice.tenant_memberships SET role=\'editor\' WHERE tenant_id=$1 AND identity_id=$2',[tenantId,editorId]);
  });
  await check('RLS current membership and least privileges protect table reads/writes, receipts and immutable pins', async () => {
    for (const table of ['projects','project_pins','project_receipts']) {
      assert.deepEqual((await owner.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[`wonffice.${table}`])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
      assert.equal((await pool.query(`SELECT * FROM wonffice.${table}`)).rowCount,0);
      await assert.rejects(pool.query(`DELETE FROM wonffice.${table}`),{code:'42501'});
    }
    await assert.rejects(pool.query('UPDATE wonffice.project_pins SET snapshot_text=\'forged\''),{code:'42501'});
    const c=await connect('wonffice_app'); await c.query('BEGIN');
    await c.query("SELECT set_config('wonffice.tenant_id',$1,true),set_config('wonffice.oidc_issuer',$2,true),set_config('wonffice.oidc_subject',$3,true)",[tenantId,issuer,'viewer']);
    assert.equal((await c.query('SELECT * FROM wonffice.projects')).rowCount,0); // Revoked viewer.
    await c.query('ROLLBACK');
  });
  await check('real project routes reject forged actors, snapshot bytes, completion and save outage without side effects', async () => {
    api=createApiServer({verifier:{verify:async token=>{if(token!=='editor')throw new Error('invalid');return editor;}},memberships,projects:store});
    const path=`/v1/tenants/${tenantId}/projects/${current.project.record.id}`,headers={authorization:'Bearer editor'};
    const before=await store.get(editor,tenantId,current.project.record.id);
    for(const action of [{type:'metadata',title:'Good',actor:{id:'forged'}},{type:'applied',state:'completed'},
      {type:'pin-input',resultId:trainingResult.id,source:{...source,text:'forged'}}]) {
      const response=await api.inject({method:'PATCH',url:path,headers,payload:{expectedRevision:current.project.revision,idempotencyKey:randomUUID(),action}});
      assert.equal(response.statusCode,400);
    }
    assert.equal((await api.inject(path)).statusCode,401); assert.deepEqual(await store.get(editor,tenantId,current.project.record.id),before);
    const list=await api.inject({url:`/v1/tenants/${tenantId}/projects?workspaceId=${workspaceId}`,headers}); assert.equal(list.statusCode,200);
    assert.equal(list.json().projects[0].project.record.id,current.project.record.id); assert.equal(list.headers['cache-control'],'no-store');
    await api.close(); api=null;
    const failedPool={connect:async()=>{throw new Error('private outage');}};
    api=createApiServer({verifier:{verify:async()=>editor},memberships,projects:new ProjectStore(failedPool)});
    const unavailable=await api.inject({url:path,headers}); assert.equal(unavailable.statusCode,503); assert.deepEqual(unavailable.json(),{status:'service_unavailable'});
  });
  await check('parallel CAS writes have one winner and failed mutation receipts roll back', async () => {
    const inputs=['first','second'].map(name=>({expectedRevision:current.project.revision,idempotencyKey:`parallel-${name}`,action:{type:'metadata',title:`Concurrent ${name}`}}));
    const settled=await Promise.allSettled(inputs.map(input=>store.update(editor,tenantId,current.project.record.id,input)));
    assert.equal(settled.filter(one=>one.status==='fulfilled').length,1);
    const rejected=settled.find(one=>one.status==='rejected');assert.equal(rejected.reason.reason,'revision_conflict');
    current=await store.get(editor,tenantId,current.project.record.id);
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM wonffice.project_receipts WHERE idempotency_key LIKE 'parallel-%'")).rows[0].n,1);
  });
  await check('archive, restore and unlink retain native originals and historical comment/work provenance', async () => {
    const original=await documents.open(editor,tenantId,guide.document.documentId);
    await change({type:'metadata',archived:true},'archive');
    await assert.rejects(change({type:'pause',workId:work.id,paused:true},'archived-pause'),e=>e instanceof ProjectError && e.reason==='project_archived');
    await change({type:'metadata',archived:false},'restore');
    await change({type:'unlink-result',resultId:guideResult.id},'unlink-guide');
    assert.equal(current.project.record.results.some(r=>r.id===guideResult.id),false);
    assert.equal(current.project.record.comments[0].resultId,guideResult.id);
    assert.equal(current.project.record.works[0].id,work.id);
    assert.equal((await store.getPin(editor,tenantId,current.project.record.id,pin.id)).pin.text,guideText);
    await assert.rejects(change({type:'request',commentId:opinion.id,request:'Cannot guess a new result'},'unlinked-request'),e=>e instanceof ProjectError && e.reason==='result_not_found');
    await change({type:'pause',workId:work.id,paused:true},'unlinked-pause');
    await change({type:'pause',workId:work.id,paused:false},'unlinked-resume');
    assert.deepEqual(await documents.open(editor,tenantId,guide.document.documentId),original);
  });
  await check('private draft keys survive reopen and do not expose another member draft', async () => {
    await change({type:'draft',key:'opinion',text:'Draft preserved through dismissal'},'private-draft');
    assert.equal(current.project.record.drafts[`${editorId}:opinion`],'Draft preserved through dismissal');
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=NULL WHERE tenant_id=$1 AND identity_id=$2',[tenantId,viewerId]);
    assert.deepEqual((await store.get(viewer,tenantId,current.project.record.id)).project.record.drafts,{});
    assert.equal((await store.get(editor,tenantId,current.project.record.id)).project.record.drafts[`${editorId}:opinion`],'Draft preserved through dismissal');
    const reader=await connect('wonffice_app'); await reader.query('BEGIN');
    await reader.query("SELECT set_config('wonffice.tenant_id',$1,true),set_config('wonffice.oidc_issuer',$2,true),set_config('wonffice.oidc_subject',$3,true)",[tenantId,issuer,'viewer']);
    assert.deepEqual((await reader.query('SELECT * FROM wonffice.project_current_actor($1)',[tenantId])).rows,[{id:viewerId,role:'viewer'}]);
    assert.equal((await reader.query('SELECT * FROM wonffice.project_current_actor($1)',[beta])).rowCount,0);
    assert.equal((await reader.query('UPDATE wonffice.projects SET revision=revision+1')).rowCount,0);
    assert.equal((await reader.query('SELECT revision FROM wonffice.projects WHERE id=$1',[current.project.record.id])).rows[0].revision,current.project.revision);
    await reader.query('ROLLBACK');
    await assert.rejects(pool.query('UPDATE wonffice.tenant_memberships SET role=\'editor\''),{code:'42501'});
  });
  await check('disconnected client retry applies one mutation and rollback leaves no false receipts', async () => {
    const input={expectedRevision:current.project.revision,idempotencyKey:'retry-after-ack-loss',action:{type:'metadata',goal:'Final checked goal'}};
    const first=await store.update(editor,tenantId,current.project.record.id,input);
    const replay=await new ProjectStore(pool).update(editor,tenantId,current.project.record.id,input); assert.deepEqual(replay,first);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.project_receipts WHERE idempotency_key=$1',['retry-after-ack-loss'])).rows[0].n,1);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.project_receipts WHERE idempotency_key IN (\'stale-pin\',\'stale-request\',\'stale-project\')')).rows[0].n,0);
  });
  await check('service and private PostgreSQL restart retain project, work identity and exact pin bytes', async () => {
    const before=await store.get(editor,tenantId,current.project.record.id);
    if(api){await api.close();api=null;}
    await Promise.all(pools.map(p=>p.end()));pools.length=0;
    await Promise.all(clients.map(c=>c.end()));clients.length=0;
    run('pg_ctl',['-D',data,'-m','fast','-w','stop']);started=false;
    run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${socket} -h ''`,'-w','start']);started=true;
    const restartedPool=new pg.Pool({...config('wonffice_app'),max:1});pools.push(restartedPool);
    const restarted=new ProjectStore(restartedPool);
    assert.deepEqual(await restarted.get(editor,tenantId,before.project.record.id),before);
    assert.equal((await restarted.getPin(editor,tenantId,before.project.record.id,pin.id)).pin.text,guideText);
    assert.equal(before.project.record.works[0].id,work.id);
  });

} finally {
  if(api) await api.close();
  await Promise.allSettled(pools.map(pool=>pool.end())); await Promise.allSettled(clients.map(client=>client.end()));
  if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']); rmSync(directory,{recursive:true,force:true});
  console.log(JSON.stringify({cleanup:true,transport:'private-unix-socket',sharedServicesTouched:false}));
}
