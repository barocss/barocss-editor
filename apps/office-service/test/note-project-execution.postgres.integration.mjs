import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { serializeNoteFile } from '@barocss/office-note-file';
import { DocumentStore } from '../dist/document-store.js';
import { CompanyMemberStore } from '../dist/company-member-store.js';
import { ProjectStore } from '../dist/project-store.js';
import { ProjectExecutionStore } from '../dist/project-execution.js';

// Private synthetic database only. This test never performs model inference.
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-note-execution-pg-'), data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [], pools = []; let started = false;
const connect = async (user, database) => { const c = new pg.Client(config(user, database)); await c.connect(); clients.push(c); return c; };
const check = async (name, action) => { await action(); console.log(JSON.stringify({ result: 'passed', check: name })); };
const digest = text => createHash('sha256').update(text).digest('hex');
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
  await migrate(owner);
  const tenantId = randomUUID(), beta = randomUUID(), workspaceId = randomUUID();
  const actorId = randomUUID(), viewerId = randomUUID(), outsiderId = randomUUID(), companyAdminId = randomUUID();
  const issuer = 'https://synthetic-execution.example.test';
  const companyAdmin = { issuer, subject: 'company-admin' };
  const actor = { issuer, subject: 'editor' }, viewer = { issuer, subject: 'viewer' }, outsider = { issuer, subject: 'outsider' };
  await owner.query('INSERT INTO wonffice.tenants(id,name) VALUES($1,\'Execution\'),($2,\'Foreign\')', [tenantId,beta]);
  await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,\'Synthetic\')', [tenantId,workspaceId]);
  for (const [id, subject, tenant, role] of [[actorId,'editor',tenantId,'editor'],[viewerId,'viewer',tenantId,'viewer'],[outsiderId,'outsider',beta,'editor'],[companyAdminId,'company-admin',tenantId,'admin']]) {
    await owner.query('INSERT INTO wonffice.identities(id,issuer,subject) VALUES($1,$2,$3)', [id,issuer,subject]);
    await owner.query('INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role) VALUES($1,$2,$3)', [tenant,id,role]);
  }
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 5 }); pools.push(pool);
  const documents = new DocumentStore(pool), projects = new ProjectStore(pool);

  let calls = 0;
  const adapter = { generate: async input => { calls++; return response(input); } };
  const execution = new ProjectExecutionStore(pool, adapter);
  const seed = async (explicitMarks = false) => {
    const quote = 'Keep the original paragraph clear.';
    const original = { stype: 'note', attributes: { title: 'Fictional Note task', pageId: randomUUID() }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: quote }] },
      { stype: 'paragraph', attributes: { custom: 'preserved' }, metadata: { loadedAt: 'authored-paragraph', unknown: { keep: true } }, content: [
        { stype: 'inline-text', text: quote, ...(explicitMarks ? { marks: [] } : {}), metadata: { loadedAt: 'authored-run', unknown: ['keep'] } }
      ] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated rich sibling', marks: [{ stype: 'bold', range: [0, 9] }] }] },
      { stype: 'resources', content: [{ stype: 'richText', attributes: { id: 'resource-original' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original resource' }] }] }] }
    ] };
    const created = await documents.create(actor, tenantId, { workspaceId, product: 'note', title: 'Note task', importMode: 'new-page-copy', fileFormat: 'barocss-note', fileVersion: 1,
      snapshotText: serializeNoteFile(original), idempotencyKey: randomUUID() });
    const documentId = created.document.documentId, snapshotText = created.snapshotText;
    const native = JSON.parse(snapshotText).document;
    const target = { kind: 'note-paragraph', id: randomUUID(), quote, selector: { version: 1, pageId: created.document.pageId, paragraphIndex: 1 } };
    let current = await projects.create(actor, tenantId, { workspaceId, title: 'Note task project', goal: 'One clear paragraph', idempotencyKey: randomUUID() });
    const update = async action => { current = await projects.update(actor, tenantId, current.project.record.id,
      { expectedRevision: current.project.revision, idempotencyKey: randomUUID(), action }); return current; };
    await update({ type: 'link-result', name: 'Original Note', document: { product: 'note', id: documentId } });
    await update({ type: 'comment', resultId: current.project.record.results[0].id, target, body: 'Please clarify this paragraph',
      source: { documentId, revision: 1, snapshotHash: digest(snapshotText) } });
    await update({ type: 'request', commentId: current.project.record.comments[0].id, request: 'Revise only the selected paragraph clearly.' });
    return { documentId, snapshotText, native, target, projectId: current.project.record.id,
      workId: current.project.record.works[0].id, current: () => current, update,
      args: () => [actor, tenantId, current.project.record.id, current.project.record.works[0].id] };
  };
  const frozen = async s => ({
    source: (await owner.query('SELECT revision,snapshot_text,snapshot_hash FROM wonffice.document_snapshots WHERE tenant_id=$1 AND document_id=$2', [tenantId, s.documentId])).rows,
    receipts: (await owner.query('SELECT count(*)::int AS n FROM wonffice.document_receipts WHERE tenant_id=$1', [tenantId])).rows,
    execution: (await owner.query('SELECT data FROM wonffice.project_executions WHERE tenant_id=$1 AND project_id=$2', [tenantId, s.projectId])).rows
  });
  const produce = async s => (await execution.execute(...s.args(), { expectedRevision: s.current().project.revision })).execution;
  let persisted, persistedView;
  for (const explicitMarks of [false, true]) await check('Note exact full native proposal/accept/explicit Save/receipt/ACK/reopen marks=' + explicitMarks, async () => {
    const s = await seed(explicitMarks), before = structuredClone(s.native), startCalls = calls;
    const view = await produce(s);
    assert.equal(view.phase, 'proposal'); assert.equal(calls, startCalls + 1);
    assert.deepEqual(view.binding, { product: 'note', operation: 'note.paragraph.replace/v1', schema: 'barocss-note@1', target: s.target });
    assert.deepEqual((await new ProjectExecutionStore(pool).get(...s.args())).execution, view);
    assert.equal((await documents.open(actor, tenantId, s.documentId)).snapshotText, s.snapshotText);
    const expected = structuredClone(before); expected.content[1].content[0].text = proposal.replacement;
    assert.deepEqual(JSON.parse(view.expectedSnapshotText).document, expected);
    assert.equal(view.expectedSnapshotText, serializeNoteFile(expected));
    assert.equal(Object.hasOwn(expected.content[1].content[0], 'marks'), explicitMarks);
    assert.equal(view.expectedSnapshotHash, digest(view.expectedSnapshotText));
    const accepted = (await execution.authorizeAcceptance(...s.args(), view.id, {})).execution;
    assert.equal(accepted.phase, 'accepted');
    assert.equal((await documents.open(actor, tenantId, s.documentId)).snapshotText, s.snapshotText);
    const beforeAck = await frozen(s);
    await assert.rejects(execution.acknowledge(...s.args(), view.id, { revision: 2, snapshotHash: view.expectedSnapshotHash }), e => e.reason === 'output_conflict');
    assert.deepEqual(await frozen(s), beforeAck);
    // Explicit immutable save, receipt replay and actual same-source reopen.
    const attempt = { expectedRevision: 1, snapshotText: view.expectedSnapshotText, idempotencyKey: randomUUID() };
    const saved = await documents.updateSnapshot(actor, tenantId, s.documentId, attempt);
    assert.deepEqual(await documents.updateSnapshot(actor, tenantId, s.documentId, attempt), saved);
    const reopened = await documents.open(actor, tenantId, s.documentId);
    assert.equal(reopened.document.revision, 2); assert.equal(reopened.document.pageId, s.target.selector.pageId);
    assert.equal(reopened.snapshotText, view.expectedSnapshotText); assert.deepEqual(JSON.parse(reopened.snapshotText).document, expected);
    const applied = (await execution.acknowledge(...s.args(), view.id, { revision: 2, snapshotHash: view.expectedSnapshotHash })).execution;
    assert.equal(applied.phase, 'applied'); assert.equal(applied.appliedRevision, 2);
    assert.deepEqual((await execution.acknowledge(...s.args(), view.id, { revision: 2, snapshotHash: view.expectedSnapshotHash })).execution, applied);
    assert.deepEqual(s.native, before);
    persisted = s; persistedView = applied;
  });
  await check('Note decline writes no native source or receipt and cannot later accept', async () => {
    const s = await seed(), view = await produce(s), before = await frozen(s);
    const rejected = (await execution.reject(...s.args(), view.id, {})).execution;
    assert.equal(rejected.phase, 'rejected');
    const after = await frozen(s); assert.deepEqual(after.source, before.source); assert.deepEqual(after.receipts, before.receipts);
    await assert.rejects(execution.authorizeAcceptance(...s.args(), view.id, {}), e => e.reason === 'execution_not_applicable');
  });
  await check('Note same-text model output is failed before acceptance and never forces a Save revision', async () => {
    const s = await seed(), before = await frozen(s);
    const noOp = new ProjectExecutionStore(pool, { generate: async input => {
      const answer = response(input); answer.proposal = { ...proposal, replacement: input.target.text };
      answer.provenance.proposalHash = digest(JSON.stringify(answer.proposal)); return answer;
    } });
    const view = (await noOp.execute(...s.args(), { expectedRevision: s.current().project.revision })).execution;
    assert.equal(view.phase, 'failed'); assert.equal(view.reason, 'invalid_proposal');
    await assert.rejects(noOp.authorizeAcceptance(...s.args(), view.id, {}), e => e.reason === 'execution_not_applicable');
    const after = await frozen(s); assert.deepEqual(after.source, before.source); assert.deepEqual(after.receipts, before.receipts);
  });
  for (const mode of ['selector', 'source', 'role-ABA', 'revoked', 'viewer', 'foreign']) await check('Note ' + mode + ' refuses current acceptance without native or receipt effects', async () => {
    const s = await seed(), view = await produce(s);
    let args = s.args();
    if (mode === 'selector') {
      // Test-owner corruption control. Equal quote at index0 must never renew the captured coordinate.
      const record = structuredClone(s.current().project.record); record.comments[0].target.selector.paragraphIndex = 0;
      await owner.query('UPDATE wonffice.projects SET data=$3 WHERE tenant_id=$1 AND id=$2', [tenantId, s.projectId, JSON.stringify(record)]);
    }
    if (mode === 'source') await documents.updateSnapshot(actor, tenantId, s.documentId, { expectedRevision: 1,
      snapshotText: s.snapshotText.replace('Unrelated rich sibling', 'Human later sibling'), idempotencyKey: randomUUID() });
    if (mode === 'role-ABA') {
      const members = new CompanyMemberStore(pool);
      await members.setRole(companyAdmin, tenantId, actorId, 'viewer'); await members.setRole(companyAdmin, tenantId, actorId, 'editor');
    }
    if (mode === 'revoked') await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2', [tenantId, actorId]);
    if (mode === 'viewer') args = [viewer, ...args.slice(1)];
    if (mode === 'foreign') args = [outsider, ...args.slice(1)];
    const before = await frozen(s);
    await assert.rejects(execution.authorizeAcceptance(...args, view.id, {}));
    assert.deepEqual(await frozen(s), before);
    if (mode === 'revoked') await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=NULL WHERE tenant_id=$1 AND identity_id=$2', [tenantId, actorId]);
  });
  await check('private PostgreSQL restart preserves exact applied Note attempt and original without inference', async () => {
    await Promise.all(pools.map(p => p.end())); pools.length = 0; await Promise.all(clients.map(c => c.end())); clients.length = 0;
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
    const restarted = new pg.Pool({ ...config('wonffice_app'), max: 2 }); pools.push(restarted);
    const store = new ProjectExecutionStore(restarted, { generate: async () => { throw new Error('must never infer on reopen'); } });
    assert.deepEqual((await store.get(...persisted.args())).execution, persistedView);
    assert.equal((await new DocumentStore(restarted).open(actor, tenantId, persisted.documentId)).snapshotText, persistedView.expectedSnapshotText);
  });
} finally {
  await Promise.allSettled(pools.map(pool => pool.end())); await Promise.allSettled(clients.map(client => client.end()));
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  if (process.env.NOTE_NATIVE_EVIDENCE) {
    const { copyFileSync } = await import('node:fs'); copyFileSync(join(directory, 'postgres.log'), join(process.env.NOTE_NATIVE_EVIDENCE, 'postgres.log'));
  }
  rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ cleanup: true, transport: 'private-unix-socket', sharedServicesTouched: false, inference: false }));
}
