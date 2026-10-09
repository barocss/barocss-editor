/**
 * #449 controlled compiled HTTP/private PostgreSQL preparation.
 * Run only under Execute Integration's serial resource lease, after its exact
 * source/build receipt. EVIDENCE must name a fresh directory; PG_BIN is explicit.
 * Real JWT cryptography, current DB authority and original service methods are
 * exercised. The injected proposal adapter is SYNTHETIC, performs NO inference,
 * and does not establish genuine human OIDC, browser, local model or #449 acceptance.
 * No DATABASE_URL, external provider, browser, downloads or fabricated attempts.
 * All original native fixture fields/references are retained and independently
 * authored changes are applied to a whole expected copy, never derived from the
 * producer's expectedSnapshotText. Owned DB data and first outputs are retained.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { migrate } from '../../office-service/dist/migrate.js';
import { migrations } from '../../office-service/dist/migrations.js';
import { applyMembershipChange } from '../../office-service/dist/membership-admin.js';
import { MembershipStore } from '../../office-service/dist/membership-store.js';
import { DocumentStore } from '../../office-service/dist/document-store.js';
import { ProjectStore } from '../../office-service/dist/project-store.js';
import { ProjectExecutionStore } from '../../office-service/dist/project-execution.js';
import { CriterionConfirmationStore } from '../../office-service/dist/criterion-confirmation-store.js';
import { CriterionVerificationStore } from '../../office-service/dist/criterion-verification-store.js';
import { createApiServer } from '../dist/server.js';
import { createOidcVerifier } from '../dist/oidc.js';

const bin = process.env.PG_BIN, evidence = process.env.WORD_WORK_PG_EVIDENCE;
if (!bin || !evidence || existsSync(evidence)) throw new Error('Explicit PG_BIN and fresh WORD_WORK_PG_EVIDENCE required');
if (process.env.DATABASE_URL || process.env.OFFICE_API_DATABASE_URL) throw new Error('No shared database environment permitted');
assert.equal(process.versions.node, '22.22.0');
mkdirSync(evidence, { mode: 0o700, recursive: true });
const directory = mkdtempSync('/private/tmp/word449-'), data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const pgPort = 14650, database = 'word_work449', hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const write = (name, value) => writeFileSync(join(evidence, name), typeof value === 'string' ? value : json(value), { mode: 0o600 });
const run = (name, args) => {
  try { const output = execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' }); write(`pg-${name}-${++commandSerial}.log`, output); return output; }
  catch (error) { write(`pg-${name}-${++commandSerial}-FAIL.log`, `${error.stdout ?? ''}\n${error.stderr ?? ''}`); throw error; }
};
let commandSerial = 0, postmasterPid, dropAcknowledgement = null, started = false, app, jwks, owner, auditClient, pool, issuer, origin, keys, serial = 0, dispatches = 0;
const clients = [], pools = [], cases = [], tokens = new Map();
const fixturePath = new URL('../../office-service/test/fixtures/criterion-confirmation-word.json', import.meta.url);
const fixtureRaw = readFileSync(fixturePath, 'utf8'), fixture = JSON.parse(fixtureRaw);
const report = { kind: 'controlled compiled API/privatePG/cryptographic-JWKS', controllerPid: process.pid,
  sourceRoot: resolve(new URL('../../..', import.meta.url).pathname), node: process.version,
  beforeRun: new Date().toISOString(), data, socket, pgPort, pgBinary: join(bin, 'postgres'),
  postgresVersion: execFileSync(join(bin, 'postgres'), ['--version'], { encoding: 'utf8' }).trim(),
  postgresBinaryHash: hash(readFileSync(join(bin, 'postgres'))), fixtureHash: hash(fixtureRaw),
  resources: [], checks: cases, dispatches: 0, cleanup: false,
  notClaimed: ['genuine human login', 'browser/UI', 'live model inference', 'new model run', 'full #449 acceptance', 'alpha/release',
    'existing button browser specimen regression (separate producer)'] };
assert.match(report.postgresVersion, /PostgreSQL\) 16\./);
write('before-run.json', report); write('fixture-original.json', fixtureRaw);
const config = user => ({ host: socket, port: pgPort, user, database, max: 8 });
async function connect(user, db = database) { const client = new pg.Client({ ...config(user), database: db }); await client.connect(); clients.push(client); return client; }
async function check(name, work) { const began = new Date().toISOString(); try { await work(); cases.push({ name, result: 'PASS', began, ended: new Date().toISOString() }); }
  catch (error) { cases.push({ name, result: 'FAIL', began, ended: new Date().toISOString(), error: String(error.stack ?? error) }); throw error; }
  finally { report.dispatches = dispatches; write('report.json', report); } }
const ids = { tenant: randomUUID(), foreign: randomUUID(), workspace: randomUUID() };
const requirementSentence = 'Preserve the linked decision paragraph exactly as pinned.';
// Independently declared public evaluator contract; no imported comparator oracle.
const evaluator = { id: 'word-paragraph-preserved', version: 1,
  definition: 'Only the exact authored requirement sentence "Preserve the linked decision paragraph exactly as pinned." declares this condition. Compare the complete uniquely bookmarked native decision paragraph with its confirmed pinned Word reference. Require the same business pair and resolved native context for a pass. Missing or ambiguous coverage never passes.' };
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const paragraphText = value => JSON.stringify(stable(value));
async function audit() {
  const tables = (await auditClient.query(`SELECT schemaname,tablename FROM pg_catalog.pg_tables
    WHERE schemaname IN ('wonffice','wonffice_meta') ORDER BY schemaname,tablename`)).rows;
  const result = {};
  for (const { schemaname, tablename } of tables) {
    assert.match(schemaname, /^[a-z_]+$/); assert.match(tablename, /^[a-z_]+$/);
    result[`${schemaname}.${tablename}`] = (await auditClient.query(`SELECT to_jsonb(t)::text AS row
      FROM "${schemaname}"."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows.map(row => JSON.parse(row.row));
  }
  return result;
}
async function unchanged(name, work) {
  const before = await audit(), value = await work(), after = await audit();
  write(`audit-${++serial}-${name}.json`, { before, after }); assert.deepEqual(after, before); return value;
}
async function singleRun(name, work) {
  const before = await audit(), value = await work(), after = await audit(), table = 'wonffice.criterion_verifications';
  const old = before[table], added = after[table].filter(row => !old.some(previous => previous.id === row.id));
  assert.equal(added.length, 1); assert.equal(after[table].length, old.length + 1);
  assert.deepEqual(after[table].filter(row => row.id !== added[0].id), old);
  const fullAfter = structuredClone(after); fullAfter[table] = old; assert.deepEqual(fullAfter, before);
  write(`audit-${++serial}-${name}.json`, { before, after, soleAppend: added[0] }); return { value, row: added[0] };
}
async function observedLock(name, predicate) {
  const deadline = Date.now() + 2500, observations = [];
  while (Date.now() < deadline) {
    const rows = (await auditClient.query(`SELECT pid,query,state,wait_event_type,wait_event,
      pg_blocking_pids(pid) AS blocking FROM pg_catalog.pg_stat_activity
      WHERE datname=$1 AND application_name='word449-http-api' ORDER BY pid`, [database])).rows;
    observations.push({ at: new Date().toISOString(), rows });
    const found = rows.find(predicate);
    if (found) { write(`entered-${name}.json`, { observations, found }); return found; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  write(`entered-${name}-FAIL.json`, { observations }); throw new Error(`Actual entered DB lock not observed: ${name}`);
}
async function concurrentlyEntered(s) {
  const holder = await connect('wonffice_test_admin');
  const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let released = false, first, second;
  await holder.query('BEGIN');
  try {
    await holder.query('SELECT id FROM wonffice.documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [ids.tenant, s.documentId]);
    const prior = await audit();
    first = request('B', `${s.path}/criterion-verifications/work-results`, 'POST', s.request); void first.catch(() => {});
    const enteredFirst = await observedLock('first-document', row => row.state === 'active' && row.wait_event_type === 'Lock'
      && row.query.includes('FROM wonffice.documents') && row.blocking.includes(holderPid));
    second = request('B', `${s.path}/criterion-verifications/work-results`, 'POST', s.request); void second.catch(() => {});
    const enteredSecond = await observedLock('second-same-key', row => row.pid !== enteredFirst.pid && row.state === 'active'
      && row.wait_event_type === 'Lock' && row.query.includes('pg_advisory_xact_lock') && row.blocking.includes(enteredFirst.pid));
    // Both requests reached their actual application transactions. No delay or
    // promise construction is used as evidence of entry, and no effect occurred.
    assert.deepEqual(await audit(), prior);
    write('concurrent-entered-before-release.json', { holderPid, enteredFirst, enteredSecond, beforeRelease: prior });
    await holder.query('COMMIT'); released = true;
    const values = await Promise.all([first, second]); assert.deepEqual(values[1], values[0]); return values[0];
  } finally {
    if (!released) await holder.query('ROLLBACK');
    await Promise.allSettled([first, second].filter(Boolean));
  }
}
async function projectLockExcludesMutator(s) {
  const holder = await connect('wonffice_test_admin');
  const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let released = false, verification, mutator;
  await holder.query('BEGIN');
  try {
    await holder.query('SELECT id FROM wonffice.documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [ids.tenant, s.documentId]);
    const prior = await audit();
    verification = request('B', `${s.path}/criterion-verifications/work-results`, 'POST', s.request); void verification.catch(() => {});
    const verifierEntered = await observedLock('parent-share-verifier', row => row.state === 'active' && row.wait_event_type === 'Lock'
      && row.query.includes('FROM wonffice.documents') && row.blocking.includes(holderPid));
    // This is the actual HTTP mutator and actual ProjectExecutionStore.reject.
    // It must acquire the parent project UPDATE lock before inspecting applied.
    mutator = request('A', `${s.executionPath}/${s.applied.id}/reject`, 'POST', {}, 409); void mutator.catch(() => {});
    const mutatorEntered = await observedLock('parent-update-mutator', row => row.pid !== verifierEntered.pid && row.state === 'active'
      && row.wait_event_type === 'Lock' && row.query.includes('FROM wonffice.projects') && row.query.includes('FOR UPDATE')
      && row.blocking.includes(verifierEntered.pid));
    assert.deepEqual(await audit(), prior);
    write('parent-share-excludes-real-mutator-before-release.json', {
      qualification: 'Actual attempted normal A mutator excluded by B shared parent lock, not privileged DB writes or successful state transition',
      holderPid, verifierEntered, mutatorEntered, beforeRelease: prior });
    await holder.query('COMMIT'); released = true;
    const [receipt, refusal] = await Promise.all([verification, mutator]);
    assert.deepEqual(refusal, { status: 'execution_not_rejectable' });
    write('parent-share-real-mutator-terminal-refusal.json', { actor: 'A', method: 'reject', statusCode: 409, refusal,
      verificationRunId: receipt.runId, attemptId: s.applied.id });
    return receipt;
  } finally {
    if (!released) await holder.query('ROLLBACK');
    await Promise.allSettled([verification, mutator].filter(Boolean));
  }
}
async function request(subject, path, method = 'GET', body, status = 200) {
  const token = subject === null ? null : tokens.get(subject);
  const response = await fetch(origin + path, { method, headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(15000) });
  const value = await response.json(); assert.equal(response.status, status, JSON.stringify({ method, path, status: response.status, value }));
  assert.equal(response.headers.get('cache-control'), 'no-store'); return value;
}
const docPath = documentId => `/v1/tenants/${ids.tenant}/documents/${documentId}`;
const projectsPath = `/v1/tenants/${ids.tenant}/projects`;
async function identity(subject) { return (await auditClient.query('SELECT id FROM wonffice.identities WHERE issuer=$1 AND subject=$2', [issuer, subject])).rows[0].id; }
async function epoch(subject) {
  const id = await identity(subject), row = (await auditClient.query(`SELECT m.role,m.xmin::text AS version,
    (SELECT count(*)::text FROM wonffice.membership_events e WHERE e.tenant_id=m.tenant_id AND e.identity_id=m.identity_id) AS events
    FROM wonffice.tenant_memberships m WHERE m.tenant_id=$1 AND m.identity_id=$2 AND revoked_at IS NULL`, [ids.tenant, id])).rows[0];
  assert.ok(row); return `${row.role}:${row.events}:${row.version}`;
}
async function membership(subject, action, role = 'editor') {
  await applyMembershipChange(owner, { action, tenantId: ids.tenant, issuer, subject, role, approvalRef: `word449-${action}-${subject}-${++serial}` });
}
const adapter = { generate: async input => {
  dispatches++;
  const proposal = { replacement: 'Controlled replacement: retain every untouched native reference.', reason: 'SYNTHETIC controlled adapter; NO inference', assumptions: ['Not live model generation'] };
  const at = new Date().toISOString(), responseText = JSON.stringify(proposal);
  // This descriptor is a bounded retained fixture record, NOT a model prompt.
  // Full native input stays intact and its exact bytes are separately hashed.
  const controlledDescriptor = JSON.stringify({ qualification: 'SYNTHETIC deterministic response; NO prompt/inference', inputHash: hash(JSON.stringify(input)), proposal });
  const provenance = { kind: 'live-local-model', adapterVersion: 'controlled-no-inference-fixture/v1', model: 'SYNTHETIC-NO-INFERENCE',
    modelDigest: hash('SYNTHETIC-NO-INFERENCE'), runtimeVersion: 'controlled-fixture-no-runtime',
    contextTokens: 32768, outputTokenLimit: 4096, promptBytes: Buffer.byteLength(controlledDescriptor), promptEvalCount: 1, evalCount: 1,
    inputHash: hash(JSON.stringify(input)), responseHash: hash(responseText), proposalHash: hash(JSON.stringify(proposal)), startedAt: at, completedAt: at };
  write(`dispatch-${dispatches}.json`, { qualification: 'Synthetic controlled response, contract enum and token counts are not actual inference evidence', controlledDescriptor, input, proposal, provenance });
  return { proposal, provenance };
} };
async function startApi() {
  pool = new pg.Pool({ ...config('wonffice_app'), application_name: 'word449-http-api' }); pools.push(pool);
  app = createApiServer({ verifier: createOidcVerifier({ issuer, audience: 'word449', algorithms: ['RS256'], jwksUrl: new URL(`${issuer}/certs`) }),
    memberships: new MembershipStore(pool), workspaces: new MembershipStore(pool), documents: new DocumentStore(pool), projects: new ProjectStore(pool),
    projectExecutions: new ProjectExecutionStore(pool, adapter), criterionConfirmations: new CriterionConfirmationStore(pool),
    criterionVerifications: new CriterionVerificationStore(pool, { execute: async () => { throw new Error('Browser specimen is outside this native-only controlled producer'); } }) });
  // Test transport fault only. The actual service has already returned after
  // COMMIT; independent admin visibility proves the row exists before dropping
  // this owned HTTP socket. No evaluator, authority or source predicate changes.
  app.addHook('onSend', async (request, reply, payload) => {
    const armed = dropAcknowledgement;
    if (!armed || request.method !== 'POST' || request.url !== armed.path || request.body?.idempotencyKey !== armed.key) return payload;
    assert.equal(reply.statusCode, 200);
    const rows = (await auditClient.query(`SELECT * FROM wonffice.criterion_verifications
      WHERE tenant_id=$1 AND document_id=$2 AND identity_id=$3 AND idempotency_key=$4`,
    [ids.tenant, armed.documentId, armed.requesterId, armed.key])).rows;
    assert.equal(rows.length, 1); assert.equal(hash(rows[0].output_text), rows[0].output_hash);
    armed.committedRow = rows[0]; armed.observedAt = new Date().toISOString();
    write('lost-acknowledgement-before-socket-drop.json', { qualification: 'Owned HTTP response dropped after independently visible COMMIT',
      path: armed.path, key: armed.key, observedAt: armed.observedAt, committedRow: rows[0] });
    const socket = reply.raw.socket; assert.ok(socket); socket.destroy(); armed.socketDestroyed = socket.destroyed;
    return payload;
  });
  await app.listen({ port: 0, host: '127.0.0.1' }); origin = `http://127.0.0.1:${app.server.address().port}`;
  report.resources.push({ kind: 'actual compiled API', pid: process.pid, origin, start: new Date().toISOString(), closed: false }); write('report.json', report);
}
function assertAbsentPid(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  try { process.kill(pid, 0); } catch (error) { assert.equal(error.code, 'ESRCH'); return; }
  throw new Error(`Owned postmaster remains alive: ${pid}`);
}
function recordPostmaster() {
  postmasterPid = Number(readFileSync(join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
  report.resources.push({ kind: 'owned private PostgreSQL', pid: postmasterPid, socket, pgPort, start: new Date().toISOString(), closed: false });
  write('report.json', report);
}
function stopPostmaster() {
  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false; assertAbsentPid(postmasterPid);
  report.resources.filter(item => item.kind === 'owned private PostgreSQL' && !item.closed).forEach(item => { item.closed = true; item.end = new Date().toISOString(); item.pidAbsent = true; });
}
async function stopApi() { if (app) { await app.close(); app = null; report.resources.filter(item => item.kind === 'actual compiled API' && !item.closed).forEach(item => { item.closed = true; item.end = new Date().toISOString(); }); } }
/** Decorate a full copy; keep all original fixture fields and full version files. */
function nativeFixture(mode = 'passed', condition = requirementSentence) {
  const value = structuredClone(fixture), thread = randomUUID(), surface = value.document.content[0];
  surface.content[0].content[1].text = condition;
  const paragraphIndex = mode === 'failed' ? 1 : 2;
  if (mode !== 'failed') surface.content.push({ stype: 'paragraph', attributes: { styleId: 'body' }, content: [{ stype: 'inline-text', text: 'Separate editable work paragraph.' }] });
  const leafIndex = mode === 'failed' ? 1 : 0, leaf = surface.content[paragraphIndex].content[leafIndex];
  leaf.marks = [{ stype: 'commentRef', attrs: { id: thread }, range: [0, leaf.text.length] }];
  value.document.content.push({ stype: 'resources', attributes: {}, content: [{ stype: 'commentThread', attributes: { id: thread, resolved: false },
    content: [{ stype: 'paragraph', attributes: { author: 'Controlled author A' }, content: [{ stype: 'inline-text', text: 'Change only the selected native work target.' }] }] }] });
  // The exact full native reference includes the same rich marks/resources.
  const pin = structuredClone(value); pin.document.metadata = {};
  const pinRaw = json(pin);
  let currentPinRaw = pinRaw;
  if (mode === 'historical') {
    value.document.content[0].content[1].content[1].text = 'A deliberately newer decision paragraph.';
    const currentPin = structuredClone(value); currentPin.document.metadata = {}; currentPinRaw = json(currentPin);
  }
  for (const item of value.document.metadata.wonfficeBusinessPair.items) item.versions[0].snapshotText = pinRaw;
  const pair = value.document.metadata.wonfficeBusinessPair;
  if (mode === 'historical') { pair.items[1].currentVersion = 2; pair.items[1].versions.push({ version: 2, snapshotText: currentPinRaw }); }
  const context = { schemaVersion: 1, requirement: { itemId: pair.items[0].id, version: 1, locator: structuredClone(pair.items[0].locator), snapshotText: pinRaw },
    decision: { itemId: pair.items[1].id, version: 1, currentVersion: mode === 'historical' ? 2 : 1, locator: structuredClone(pair.items[1].locator), snapshotText: pinRaw, currentSnapshotText: currentPinRaw }, relation: structuredClone(pair.relations[0]) };
  const expected = structuredClone(value), edited = expected.document.content[0].content[paragraphIndex].content[leafIndex];
  edited.text = 'Controlled replacement: retain every untouched native reference.'; edited.marks[0].range[1] = edited.text.length;
  return { value, raw: json(value), expected, expectedRaw: json(expected), context, thread, targetText: leaf.text, mode };
}
async function seed(mode = 'passed', condition = requirementSentence, confirmer = 'B') {
  const fixture = nativeFixture(mode, condition), document = await request('A', `/v1/tenants/${ids.tenant}/documents`, 'POST', {
    workspaceId: ids.workspace, product: 'word', title: `Controlled ${mode}`, fileFormat: 'barocss-word', fileVersion: 1, snapshotText: fixture.raw, idempotencyKey: randomUUID() }, 201);
  const documentId = document.document.documentId, path = docPath(documentId);
  let project = await request('A', projectsPath, 'POST', { workspaceId: ids.workspace, title: 'Controlled Word work', goal: 'Preserve confirmed linked paragraph', idempotencyKey: randomUUID() }, 201);
  const projectId = project.project.record.id;
  async function update(action) { project = await request('A', `${projectsPath}/${projectId}`, 'PATCH', { expectedRevision: project.project.revision, idempotencyKey: randomUUID(), action }); }
  await update({ type: 'link-result', name: 'Word result', document: { product: 'word', id: documentId } });
  const resultId = project.project.record.results[0].id;
  await update({ type: 'comment', resultId, target: { kind: 'word-comment', id: fixture.thread, quote: fixture.targetText }, body: 'Apply an explicitly accepted controlled change.',
    source: { documentId, revision: 1, snapshotHash: hash(fixture.raw) } });
  await update({ type: 'request', commentId: project.project.record.comments[0].id, request: 'Replace only the current comment-marked native target.' });
  const workId = project.project.record.works[0].id;
  // B confirms the exact current INPUT before A executes/applies. This uses the
  // independent whole authored context, not the server-returned context as oracle.
  const basis = await unchanged('confirmation-context', () => request(confirmer, `${path}/criterion-confirmations/context`));
  assert.equal(basis.snapshotText, fixture.raw); assert.equal(basis.snapshotHash, hash(fixture.raw)); assert.deepEqual(basis.context, fixture.context);
  assert.equal(basis.actorIdentityId, await identity(confirmer)); assert.equal(basis.authorityEpoch, await epoch(confirmer));
  const confirmationRequest = { schemaVersion: 1, expectedRevision: 1, snapshotHash: hash(fixture.raw), snapshotText: fixture.raw,
    context: fixture.context, authorityEpoch: await epoch(confirmer), idempotencyKey: randomUUID() };
  const confirmation = await request(confirmer, `${path}/criterion-confirmations`, 'POST', confirmationRequest);
  assert.equal(confirmation.actorIdentityId, await identity(confirmer)); assert.equal(confirmation.documentRevision, 1);
  assert.equal(confirmation.requestHash, hash(JSON.stringify(['criterion-confirmation-v1', ids.tenant, documentId, await identity(confirmer), confirmationRequest])));
  // JSONB defines the stored context's representation. Bind its independently
  // read full value for the output context hash; never substitute a client-key
  // order or derive an expected context from the verification output.
  const confirmationContext = (await auditClient.query('SELECT context FROM wonffice.criterion_confirmations WHERE tenant_id=$1 AND document_id=$2 AND id=$3', [ids.tenant, documentId, confirmation.confirmationId])).rows[0].context;
  assert.deepEqual(confirmationContext, fixture.context);
  const executionPath = `${projectsPath}/${projectId}/works/${workId}/execution`;
  const proposal = (await request('A', executionPath, 'POST', { expectedRevision: project.project.revision })).execution;
  assert.equal(proposal.phase, 'proposal'); assert.equal(proposal.actorId, await identity('A'));
  assert.equal(proposal.input.snapshotText, fixture.raw); assert.equal(proposal.input.snapshotHash, hash(fixture.raw));
  assert.equal(proposal.expectedSnapshotText, fixture.expectedRaw); assert.equal(proposal.expectedSnapshotHash, hash(fixture.expectedRaw));
  assert.deepEqual(JSON.parse(proposal.expectedSnapshotText), fixture.expected);
  assert.equal(proposal.input.inputs.length, 1);
  const pinId = project.project.record.comments[0].pin.id;
  assert.deepEqual(proposal.input.inputs, [{ id: pinId, documentId, revision: 1, snapshotHash: hash(fixture.raw), snapshotText: fixture.raw }]);
  const pin = (await auditClient.query('SELECT document_id,snapshot_revision,snapshot_hash,snapshot_text FROM wonffice.project_pins WHERE tenant_id=$1 AND project_id=$2 AND id=$3', [ids.tenant, projectId, pinId])).rows[0];
  assert.deepEqual(pin, { document_id: documentId, snapshot_revision: 1, snapshot_hash: hash(fixture.raw), snapshot_text: fixture.raw });
  const accepted = (await request('A', `${executionPath}/${proposal.id}/accept`, 'POST', {})).execution;
  assert.equal(accepted.phase, 'accepted'); assert.equal((await request('A', path)).snapshotText, fixture.raw);
  await request('A', `${path}/snapshot`, 'PUT', { expectedRevision: 1, snapshotText: fixture.expectedRaw, idempotencyKey: randomUUID() });
  const applied = (await request('A', `${executionPath}/${proposal.id}/ack`, 'POST', { revision: 2, snapshotHash: hash(fixture.expectedRaw) })).execution;
  assert.equal(applied.phase, 'applied'); assert.equal(applied.appliedRevision, 2);
  const head = await request('B', path); assert.equal(head.snapshotText, fixture.expectedRaw); assert.deepEqual(JSON.parse(head.snapshotText), fixture.expected);
  const req = { schemaVersion: 1, projectId, workId, attemptId: applied.id, resultId, confirmationId: confirmation.confirmationId,
    expectedOutputRevision: 2, expectedOutputHash: hash(fixture.expectedRaw), authorityEpoch: await epoch('B'), idempotencyKey: randomUUID(), evaluator };
  const output = { ...fixture, documentId, path, projectId, project, resultId, workId, executionPath, applied, confirmation, confirmationContext, confirmationRequest, request: req };
  write(`case-${documentId}.json`, output); return output;
}
function checkReceipt(s, value, row, expectedOutcome) {
  assert.equal(value.outcome, expectedOutcome); assert.equal(value.documentRevision, 2); assert.equal(value.snapshotHash, hash(s.expectedRaw));
  assert.equal(value.confirmationId, s.confirmation.confirmationId); assert.equal(value.authorityEpoch, s.request.authorityEpoch);
  assert.deepEqual(value.context, s.context); assert.deepEqual(value.evaluator, evaluator);
  assert.equal(value.requestHash, hash(JSON.stringify(['native-work-verification-v1', ids.tenant, s.documentId, value.requesterIdentityId, s.request])));
  assert.equal(hash(value.outputText), value.outputHash); assert.equal(row.output_text, value.outputText); assert.equal(row.output_hash, value.outputHash);
  assert.equal(row.snapshot_text, s.expectedRaw); assert.deepEqual(row.context, s.context); assert.equal(row.identity_id, value.requesterIdentityId);
  const decoded = JSON.parse(value.outputText); assert.deepEqual(decoded.request, s.request); assert.equal(decoded.outcome, expectedOutcome);
  assert.equal(decoded.requesterIdentityId, value.requesterIdentityId); assert.equal(decoded.contextHash, hash(JSON.stringify(s.confirmationContext)));
  assert.equal(decoded.confirmationSnapshotHash, hash(s.raw));
  assert.deepEqual(decoded.specimen, { kind: 'native-word-work-result', projectId: s.projectId, workId: s.workId, attemptId: s.applied.id,
    resultId: s.resultId, inputRevision: 1, inputHash: hash(s.raw), outputRevision: 2, outputHash: hash(s.expectedRaw) });
  if (expectedOutcome !== 'unsupported') {
    const referenceParagraphText = paragraphText(JSON.parse(s.context.decision.snapshotText).document.content[0].content[1]);
    const resultParagraphText = paragraphText(s.expected.document.content[0].content[1]);
    assert.deepEqual(decoded.comparison, { status: expectedOutcome, referenceParagraphText, resultParagraphText,
      referenceParagraphHash: hash(referenceParagraphText), resultParagraphHash: hash(resultParagraphText) });
  } else assert.equal(decoded.comparison.reason, 'unregistered_preservation_condition');
}
async function refuse(s, change, code, reason, subject = 'B') {
  const payload = { ...s.request, idempotencyKey: randomUUID(), ...change };
  const result = await unchanged(`refusal-${reason}`, () => request(subject, `${s.path}/criterion-verifications/work-results`, 'POST', payload, code));
  assert.equal(result.status, reason);
}
let passed, failed, unsupported, passedReceipt;
try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h '' -p ${pgPort}`, '-w', 'start']); started = true;
  recordPostmaster();
  const bootstrap = await connect('wonffice_test_admin', 'postgres');
  await bootstrap.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await bootstrap.query(`CREATE DATABASE ${database} OWNER wonffice_owner`);
  owner = await connect('wonffice_owner'); auditClient = await connect('wonffice_test_admin');
  await check('actual fresh full migrations and unchanged idempotent migration checksums', async () => {
    assert.deepEqual(await migrate(owner), migrations.map(item => item.id)); const before = await audit(); assert.deepEqual(await migrate(owner), []); assert.deepEqual(await audit(), before);
  });
  keys = await generateKeyPair('RS256'); const publicJwk = await exportJWK(keys.publicKey);
  jwks = createServer((request, response) => { if (request.url !== '/realm/certs') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: 'word449-controlled', alg: 'RS256', use: 'sig' }] })); });
  await new Promise((resolve, reject) => { jwks.once('error', reject); jwks.listen(0, '127.0.0.1', resolve); });
  issuer = `http://127.0.0.1:${jwks.address().port}/realm`;
  report.resources.push({ kind: 'owned controlled signed JWKS', pid: process.pid, issuer, closed: false }); write('report.json', report);
  await applyMembershipChange(owner, { action: 'bootstrap_owner', tenantId: ids.tenant, tenantName: 'Controlled Word449', issuer, subject: 'operator', approvalRef: 'word449-bootstrap' });
  for (const [subject, role] of [['A', 'editor'], ['B', 'editor'], ['viewer', 'viewer']]) await membership(subject, 'grant', role);
  await applyMembershipChange(owner, { action: 'bootstrap_owner', tenantId: ids.foreign, tenantName: 'Foreign Word449', issuer, subject: 'foreign', approvalRef: 'word449-foreign-bootstrap' });
  await owner.query("INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,'Controlled Word')", [ids.tenant, ids.workspace]);
  for (const subject of ['A', 'B', 'viewer', 'foreign']) tokens.set(subject, await new SignJWT({ typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: 'word449-controlled' })
    .setIssuedAt().setIssuer(issuer).setAudience('word449').setSubject(subject).setExpirationTime('30m').sign(keys.privateKey));
  await startApi();
  await check('A real accepted/applied Word target plus prior B confirmation yields passed whole native result; only evaluator row appended', async () => {
    passed = await seed('passed'); const beforeCalls = dispatches;
    const { value, row } = await singleRun('passed', () => request('B', `${passed.path}/criterion-verifications/work-results`, 'POST', passed.request));
    assert.equal(value.requesterIdentityId, await identity('B')); assert.notEqual(value.requesterIdentityId, passed.applied.actorId);
    checkReceipt(passed, value, row, 'passed'); assert.equal(dispatches, beforeCalls); passedReceipt = value;
  });
  await check('deliberate changed uniquely bookmarked rich protected paragraph yields legitimate failed, not synthetic PASS', async () => {
    failed = await seed('failed'); const { value, row } = await singleRun('failed', () => request('B', `${failed.path}/criterion-verifications/work-results`, 'POST', failed.request));
    checkReceipt(failed, value, row, 'failed'); assert.notDeepEqual(failed.expected.document.content[0].content[1], failed.value.document.content[0].content[1]);
    assert.equal((await unchanged('failed-reopen', () => request('B', `${failed.path}/criterion-verifications/${value.runId}`))).outputText, value.outputText);
  });
  await check('generic requirement never invents preservation intent and records unsupported result', async () => {
    unsupported = await seed('passed', 'Keep original fictional content.');
    const { value, row } = await singleRun('unsupported', () => request('B', `${unsupported.path}/criterion-verifications/work-results`, 'POST', unsupported.request));
    checkReceipt(unsupported, value, row, 'unsupported');
  });
  await check('historical decision reference remains version1 rather than silently substituting current version2', async () => {
    const historical = await seed('historical'); assert.equal(historical.context.decision.version, 1); assert.equal(historical.context.decision.currentVersion, 2);
    const { value, row } = await singleRun('historical-pin-failed', () => request('B', `${historical.path}/criterion-verifications/work-results`, 'POST', historical.request));
    checkReceipt(historical, value, row, 'failed');
    assert.notEqual(historical.context.decision.snapshotText, historical.context.decision.currentSnapshotText);
  });
  await check('missing/ambiguous bookmarks and unsupported business version refuse confirmation without effects', async () => {
    for (const mode of ['missing', 'ambiguous', 'version']) {
      const specimen = nativeFixture(), malformed = structuredClone(specimen.value);
      if (mode === 'missing') malformed.document.content[0].content[1].content.shift();
      if (mode === 'ambiguous') malformed.document.content[0].content.push(structuredClone(malformed.document.content[0].content[1]));
      if (mode === 'version') malformed.document.metadata.wonfficeBusinessPair.schemaVersion = 99;
      const raw = json(malformed), created = await request('A', `/v1/tenants/${ids.tenant}/documents`, 'POST', {
        workspaceId: ids.workspace, product: 'word', title: `Refused ${mode}`, fileFormat: 'barocss-word', fileVersion: 1, snapshotText: raw, idempotencyKey: randomUUID() }, 201);
      const path = docPath(created.document.documentId);
      const unavailable = await unchanged(`${mode}-context`, () => request('B', `${path}/criterion-confirmations/context`, 'GET', undefined, 409));
      assert.equal(unavailable.status, 'criterion_unavailable');
      const refused = await unchanged(`${mode}-confirm`, async () => request('B', `${path}/criterion-confirmations`, 'POST', {
        schemaVersion: 1, expectedRevision: 1, snapshotHash: hash(raw), snapshotText: raw, context: specimen.context,
        authorityEpoch: await epoch('B'), idempotencyKey: randomUUID() }, 422));
      assert.equal(refused.status, 'invalid_criterion_context');
    }
  });
  await check('same frozen request retry returns exact immutable result with no tables or model effects', async () => {
    const beforeCalls = dispatches; const retry = await unchanged('exact-retry', () => request('B', `${passed.path}/criterion-verifications/work-results`, 'POST', passed.request));
    assert.deepEqual(retry, passedReceipt); assert.equal(dispatches, beforeCalls);
    await refuse(passed, { idempotencyKey: passed.request.idempotencyKey, expectedOutputHash: 'a'.repeat(64) }, 409, 'key_reuse');
  });
  await check('two observed entered same-key HTTP requests append one exact native result without model/document effects', async () => {
    const concurrent = { ...passed, request: { ...passed.request, idempotencyKey: randomUUID() } }, beforeCalls = dispatches;
    const { value, row } = await singleRun('concurrently-entered-same-key', () => concurrentlyEntered(concurrent));
    checkReceipt(concurrent, value, row, 'passed'); assert.equal(dispatches, beforeCalls);
    await refuse(concurrent, { idempotencyKey: concurrent.request.idempotencyKey, expectedOutputHash: 'a'.repeat(64) }, 409, 'key_reuse');
    await refuse(concurrent, { expectedOutputHash: 'a'.repeat(64) }, 409, 'output_conflict');
  });
  await check('B verifier shared parent lock excludes normal A attempt mutator and preserves applied terminal state', async () => {
    const locked = { ...passed, request: { ...passed.request, idempotencyKey: randomUUID() } }, beforeCalls = dispatches;
    const { value, row } = await singleRun('parent-share-real-mutator-exclusion', () => projectLockExcludesMutator(locked));
    checkReceipt(locked, value, row, 'passed'); assert.equal(dispatches, beforeCalls);
    const attempt = await unchanged('parent-lock-applied-attempt-retained', () => request('A', locked.executionPath));
    assert.deepEqual(attempt.execution, locked.applied);
    const native = await unchanged('parent-lock-whole-native-retained', () => request('B', locked.path));
    assert.equal(native.snapshotText, locked.expectedRaw); assert.deepEqual(JSON.parse(native.snapshotText), locked.expected);
  });
  await check('observed committed verification loses actual HTTP response and exact-byte retry returns its sole stored result', async () => {
    const lost = { ...passed, request: { ...passed.request, idempotencyKey: randomUUID() } }, beforeCalls = dispatches;
    const armed = { path: `${lost.path}/criterion-verifications/work-results`, key: lost.request.idempotencyKey,
      documentId: lost.documentId, requesterId: await identity('B'), committedRow: null, socketDestroyed: false };
    const { value, row } = await singleRun('actual-lost-acknowledgement', async () => {
      dropAcknowledgement = armed;
      try {
        await assert.rejects(() => request('B', armed.path, 'POST', lost.request), error => {
          armed.clientFailure = { name: error.name, message: error.message, observedAt: new Date().toISOString() };
          return error instanceof TypeError && error.message === 'fetch failed';
        });
        assert.ok(armed.committedRow); assert.equal(armed.socketDestroyed, true); assert.ok(armed.clientFailure);
        write('lost-acknowledgement-client-refusal.json', { observedCommit: armed.observedAt, socketDestroyed: armed.socketDestroyed,
          clientFailure: armed.clientFailure, request: lost.request, requestBodyBytes: JSON.stringify(lost.request) });
      } finally { dropAcknowledgement = null; }
      return unchanged('lost-acknowledgement-exact-retry', () => request('B', armed.path, 'POST', lost.request));
    });
    checkReceipt(lost, value, row, 'passed'); assert.equal(value.runId, armed.committedRow.id);
    assert.equal(value.outputText, armed.committedRow.output_text); assert.equal(value.outputHash, armed.committedRow.output_hash);
    assert.equal(dispatches, beforeCalls);
    await refuse(lost, { idempotencyKey: lost.request.idempotencyKey, attemptId: randomUUID() }, 409, 'key_reuse');
    await refuse(lost, { expectedOutputRevision: 1 }, 409, 'output_conflict');
  });
  await check('strict selector/identity/missing/history/output/evaluator refusals have no effects', async () => {
    await refuse(passed, { actorId: await identity('A') }, 400, 'invalid_request');
    await refuse(passed, { outcome: 'passed' }, 400, 'invalid_request');
    await refuse(passed, { context: passed.context }, 400, 'invalid_request');
    await refuse(passed, { snapshotText: passed.expectedRaw }, 400, 'invalid_request');
    await refuse(passed, { projectId: randomUUID() }, 404, 'project_not_found');
    await refuse(passed, { workId: randomUUID() }, 409, 'work_conflict');
    await refuse(passed, { resultId: randomUUID() }, 409, 'work_conflict');
    await refuse(passed, { attemptId: randomUUID() }, 409, 'work_not_applied');
    await refuse(passed, { confirmationId: randomUUID() }, 409, 'confirmation_conflict');
    await refuse(passed, { authorityEpoch: await epoch('A') }, 409, 'confirmation_conflict', 'A');
    await refuse(passed, { expectedOutputRevision: 1 }, 409, 'output_conflict');
    await refuse(passed, { expectedOutputHash: 'b'.repeat(64) }, 409, 'output_conflict');
    await refuse(passed, { evaluator: { ...evaluator, version: 2 } }, 422, 'unregistered_verification');
    await refuse(passed, { evaluator: { ...evaluator, definition: 'Always pass' } }, 422, 'unregistered_verification');
    await refuse(passed, {}, 403, 'forbidden', 'viewer'); await refuse(passed, {}, 403, 'forbidden', 'foreign');
    await unchanged('unauthenticated', () => request(null, `${passed.path}/criterion-verifications/work-results`, 'POST', passed.request, 401));
  });
  await check('copied business identities and ordinary same-byte save cannot inherit the original applied result or receipt', async () => {
    const beforeCalls = dispatches;
    const copy = await request('A', `/v1/tenants/${ids.tenant}/documents`, 'POST', {
      workspaceId: ids.workspace, product: 'word', title: 'Controlled copied native identities',
      fileFormat: 'barocss-word', fileVersion: 1, snapshotText: passed.raw, idempotencyKey: randomUUID() }, 201);
    const copyPath = docPath(copy.document.documentId);
    assert.notEqual(copy.document.documentId, passed.documentId);
    await request('A', `${copyPath}/snapshot`, 'PUT', {
      expectedRevision: 1, snapshotText: passed.expectedRaw, idempotencyKey: randomUUID() });
    const copied = await unchanged('copied-exact-head', () => request('B', copyPath));
    assert.equal(copied.document.revision, passed.applied.appliedRevision);
    assert.equal(copied.document.snapshotHash, hash(passed.expectedRaw));
    assert.equal(copied.snapshotText, passed.expectedRaw);
    assert.deepEqual(JSON.parse(copied.snapshotText).document.metadata.wonfficeBusinessPair,
      passed.expected.document.metadata.wonfficeBusinessPair);
    assert.deepEqual(await unchanged('copied-empty-verification-list', () => request('B', `${copyPath}/criterion-verifications`)), { runs: [] });
    await unchanged('copied-original-receipt-not-found', () => request('B', `${copyPath}/criterion-verifications/${passedReceipt.runId}`, 'GET', undefined, 404));
    const rejection = await unchanged('copied-original-work-binding-refused', () => request('B', `${copyPath}/criterion-verifications/work-results`, 'POST',
      { ...passed.request, idempotencyKey: randomUUID() }, 409));
    assert.deepEqual(rejection, { status: 'work_conflict' });
    assert.deepEqual(await unchanged('original-receipt-after-copy', () => request('B', `${passed.path}/criterion-verifications/${passedReceipt.runId}`)), passedReceipt);
    assert.equal(dispatches, beforeCalls);
    write('copied-identities-same-bytes-no-inherited-result.json', { copied, originalDocumentId: passed.documentId,
      originalReceipt: passedReceipt, rejection, noNewInference: true });
  });
  await check('changed latest head refuses new checks while historical result remains exact and read-only', async () => {
    const newer = structuredClone(passed.expected); newer.document.content[0].content.push({ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Newer authored sibling' }] });
    await request('A', `${passed.path}/snapshot`, 'PUT', { expectedRevision: 2, snapshotText: json(newer), idempotencyKey: randomUUID() });
    await refuse(passed, {}, 409, 'output_conflict');
    assert.deepEqual(await unchanged('historical-run', () => request('B', `${passed.path}/criterion-verifications/${passedReceipt.runId}`)), passedReceipt);
    assert.deepEqual(await unchanged('historical-retry', () => request('B', `${passed.path}/criterion-verifications/work-results`, 'POST', passed.request)), passedReceipt);
  });
  await check('restoring exact old output bytes at a newer revision keeps old evidence historical without retargeting it', async () => {
    const beforeCalls = dispatches;
    await request('A', `${passed.path}/snapshot`, 'PUT', {
      expectedRevision: 3, snapshotText: passed.expectedRaw, idempotencyKey: randomUUID() });
    const restored = await unchanged('restored-head', () => request('B', passed.path));
    assert.equal(restored.document.revision, 4);
    assert.equal(restored.document.snapshotHash, passedReceipt.snapshotHash);
    assert.equal(restored.snapshotText, passed.expectedRaw);
    await refuse(passed, {}, 409, 'output_conflict');
    await refuse(passed, { expectedOutputRevision: 4 }, 409, 'output_conflict');
    const historical = await unchanged('restored-old-receipt', () => request('B', `${passed.path}/criterion-verifications/${passedReceipt.runId}`));
    assert.deepEqual(historical, passedReceipt); assert.equal(historical.documentRevision, 2);
    assert.notEqual(historical.documentRevision, restored.document.revision);
    assert.deepEqual(await unchanged('restored-old-key-exact-retry', () => request('B', `${passed.path}/criterion-verifications/work-results`, 'POST', passed.request)), passedReceipt);
    assert.equal(dispatches, beforeCalls);
    write('restored-exact-bytes-historical-only.json', { restored, historical, noRetargeting: true, noNewInference: true });
  });
  await check('membership editor-viewer-editor ABA permanently retires old B confirmation epoch with no check effects', async () => {
    const old = failed.request.authorityEpoch; await membership('B', 'grant', 'viewer');
    await refuse(failed, {}, 403, 'forbidden'); await membership('B', 'grant', 'editor'); assert.notEqual(await epoch('B'), old);
    await refuse(failed, {}, 409, 'authority_conflict');
    await refuse(failed, { authorityEpoch: await epoch('B') }, 409, 'confirmation_conflict');
  });
  await check('current revoke denies fresh and historical reads/retries without restoring old evidence', async () => {
    await membership('B', 'revoke'); await refuse(failed, {}, 403, 'forbidden');
    await unchanged('revoked-history', () => request('B', `${passed.path}/criterion-verifications/${passedReceipt.runId}`, 'GET', undefined, 403));
    await membership('B', 'grant');
  });
  await check('API and private PostgreSQL restart retain exact stored result and native input/output/confirmation records', async () => {
    const before = await audit(); await stopApi(); for (const p of pools) await p.end(); pools.length = 0;
    for (const client of clients) await client.end(); clients.length = 0;
    stopPostmaster();
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres-restart.log'), '-o', `-k ${socket} -h '' -p ${pgPort}`, '-w', 'start']); started = true; recordPostmaster();
    owner = await connect('wonffice_owner'); auditClient = await connect('wonffice_test_admin'); assert.deepEqual(await audit(), before); await startApi();
    assert.deepEqual(await unchanged('restart-read', () => request('A', `${passed.path}/criterion-verifications/${passedReceipt.runId}`)), passedReceipt);
    assert.equal((await unchanged('restart-failed-native', () => request('A', failed.path))).snapshotText, failed.expectedRaw);
    const confirmations = await unchanged('restart-confirmations', () => request('A', `${failed.path}/criterion-confirmations`));
    assert.deepEqual(confirmations.confirmations, [failed.confirmation]);
  });
} catch (error) { report.failure = String(error.stack ?? error); write('first-terminal-failure.json', report); throw error; }
finally {
  await stopApi(); if (jwks) await new Promise((resolve, reject) => jwks.close(error => error ? reject(error) : resolve()));
  for (const item of report.resources) if (item.kind === 'owned controlled signed JWKS') { item.closed = true; item.end = new Date().toISOString(); }
  for (const p of pools) await p.end(); for (const client of clients) await client.end();
  if (started) stopPostmaster();
  assert.equal(existsSync(join(data, 'postmaster.pid')), false); report.cleanup = true; report.dataRetained = true;
  report.dispatches = dispatches; report.endedAt = new Date().toISOString(); write('report.json', report);
  console.log(JSON.stringify({ checks: cases.length, cleanup: report.cleanup, dataRetained: data, evidence, qualification: report.kind }));
}
