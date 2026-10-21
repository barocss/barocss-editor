import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { readNoteV1SnapshotFile } from '../../../packages/office-note-file/dist/index.js';
import { native2Corpus, native2OriginalSource } from './native2-auth-ui-corpus.mjs';

// Setup/process proof only. This probe does not log in, call a model or accept the product UI.
const source = readNoteV1SnapshotFile(JSON.stringify(native2OriginalSource, null, 2) + '\n');
assert.ok(!('error' in source), 'Declared complete original source must be admitted by the actual codec');
assert.deepEqual(source.document, native2OriginalSource.document, 'The codec must retain every declared original native field and resource');
const root = process.env.NATIVE2_FIXTURE_PROBE_ROOT;
assert.ok(root?.startsWith('/Users/user/.codex/visualizations/'), 'Private probe output must be outside Git');
const privateRoot = mkdtempSync(join(root, 'private-'));
chmodSync(privateRoot, 0o700);
const controlFile = join(privateRoot, 'control.json');
writeFileSync(controlFile, '', { mode: 0o600 });
const child = fork(new URL('./office-auth-ui.local.mjs', import.meta.url), [], {
  env: { ...process.env, OFFICE_AUTH_CONTROL_FILE: controlFile, OFFICE_AUTH_NATIVE2_READ_FIXTURE: 'true', OFFICE_AUTH_NATIVE2_MUTATION_FIXTURE: 'true',
    OFFICE_LOCAL_AGENT_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
const exited = once(child, 'exit');
let stderr = '';
child.stderr.on('data', data => { stderr += String(data); });
const hash = value => createHash('sha256').update(value).digest('hex');
async function command(request) {
  const descriptor = JSON.parse(readFileSync(controlFile, 'utf8'));
  return new Promise((resolve, reject) => {
    const socket = createConnection(descriptor.socketPath);
    let text = '';
    socket.setTimeout(10000, () => socket.destroy(new Error('fixture_control_timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', data => { text += data.toString(); });
    socket.on('end', () => { try {
      const response = JSON.parse(text); assert.equal(response.ok, true); resolve(response.result);
    } catch (error) { reject(error); } });
  });
}
let result;
try {
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('fixture_start_timeout')), 45000);
    child.stdout.on('data', data => {
      output += String(data);
      if (output.includes('office_auth_ui_local_api_ready')) { clearTimeout(timer); resolve(); }
    });
    exited.then(() => { clearTimeout(timer); reject(new Error('fixture_exited_before_ready')); });
  });
  const before = await command({ action: 'native2-state' });
  const byId = new Map(before.heads.map(h => [h.documentId, h]));
  const a = byId.get(before.native2.targetA), b = byId.get(before.native2.targetB), s = byId.get(before.native2.sourceS);
  assert.equal(a.snapshotText, JSON.stringify(native2Corpus.A1, null, 2) + '\n');
  assert.equal(a.snapshotHash, hash(a.snapshotText)); assert.equal(a.revision, 1);
  assert.equal(b.snapshotText, JSON.stringify(native2Corpus.B, null, 2) + '\n');
  assert.equal(s.snapshotText, JSON.stringify(native2OriginalSource, null, 2) + '\n');
  assert.equal(before.fixtureMode, 'mutation');
  assert.deepEqual(before.schemaPolicy.preserveRoles, ['owner', 'editor']);
  assert.deepEqual(before.schemaPolicy.adoptRoles, ['owner', 'editor']);
  assert.deepEqual(before.schemaPolicy.registerRoles, []);
  assert.equal(hash(a.snapshotText), '50ff9dc77c5fbbeaafeaad597e6ca1622e2f31177bfb71305580eb8a38e9a7f3');
  assert.equal(hash(b.snapshotText), '6253f30d80007a297910a88a8377d04388a14f007dffc5dea02ec3cf33b31f90');
  assert.equal(hash(JSON.stringify(native2Corpus.A2, null, 2) + '\n'), '3b5aa2461855d017458c4345d98e03c3a66ef69782b1d70ccabf557ef1870300');
  assert.deepEqual(Object.keys(before.ledger).sort(), Object.keys(before.audit).sort());
  for (const [table, ledger] of Object.entries(before.ledger)) {
    assert.ok(Array.isArray(ledger));
    assert.equal(ledger.length, before.audit[table].rows);
    assert.equal(hash(JSON.stringify(ledger)), before.audit[table].hash);
  }
  assert.equal(before.audit.schema_versions.rows, 4);
  assert.equal(before.audit.schema_registry_receipts.rows, 4);
  assert.equal(before.audit.document_receipts.rows, 0);
  const schemaReady = await fetch(`http://127.0.0.1:${before.schemaPort}/health/ready`, { signal: AbortSignal.timeout(5000) });
  assert.equal(schemaReady.status, 200); assert.deepEqual(await schemaReady.json(), { status: 'ready' });
  for (const part of ['validation', 'update']) {
    const armed = await command({ action: 'native2-hold', documentId: before.native2.targetA, part });
    assert.equal(armed.armed, true); assert.equal(armed.held, null);
    const released = await command({ action: 'native2-release' });
    assert.equal(released.armed, false); assert.equal(released.held, null);
  }
  const next = await command({ action: 'native2-advance-a2' });
  assert.equal(next.revision, 2);
  const after = await command({ action: 'native2-state' });
  const a2 = after.heads.find(h => h.documentId === before.native2.targetA);
  assert.equal(a2.snapshotText, JSON.stringify(native2Corpus.A2, null, 2) + '\n');
  assert.equal(a2.snapshotHash, hash(a2.snapshotText));
  assert.deepEqual(after.heads.find(h => h.documentId === b.documentId), b);
  assert.deepEqual(after.heads.find(h => h.documentId === s.documentId), s);
  for (const [table, audit] of Object.entries(before.audit)) {
    if (table !== 'document_snapshots') assert.deepEqual(after.audit[table], audit, table);
  }
  await command({ action: 'schema-stop' });
  const schemaRestarted = await command({ action: 'schema-start' });
  assert.notEqual(schemaRestarted.schemaPid, before.schemaPid);
  assert.equal(schemaRestarted.databaseGeneration, before.databaseGeneration);
  await command({ action: 'api-stop' });
  const restarted = await command({ action: 'api-start' });
  assert.notEqual(restarted.apiPid, before.apiPid);
  assert.equal(restarted.databaseGeneration, before.databaseGeneration);
  const current = await command({ action: 'native2-state' });
  assert.deepEqual(current.heads, after.heads);
  assert.deepEqual(current.audit, after.audit);
  result = { qualification: 'Actual private PG registration/exact fixture rows/SchemaServer readiness/setup advance only; no authenticated read, model or browser acceptance',
    scope: { tenantId: before.tenantId, workspaceId: before.workspaceId }, schemaPid: current.schemaPid,
    sourceS: s.documentId, targetA: a.documentId, targetB: b.documentId,
    rawHashes: { A1: a.snapshotHash, A2: a2.snapshotHash, B: b.snapshotHash, S: s.snapshotHash },
    beforeAudit: before.audit, afterAudit: after.audit, beforeLedger: before.ledger, afterLedger: after.ledger,
    actualHeads: { before: before.heads, after: after.heads }, schemaPolicy: before.schemaPolicy,
    responseHoldQualification: 'Real process IPC arm/release only; no authenticated response was held by this setup probe',
    currentOwnedPids: { api: current.apiPid, schema: current.schemaPid } };
} catch (error) {
  writeFileSync(join(privateRoot, 'failure.log'), stderr + '\n' + String(error), { mode: 0o600 });
  throw error;
} finally {
  const deadline = setTimeout(() => child.kill('SIGKILL'), 10000);
  child.kill('SIGTERM');
  const end = await exited;
  clearTimeout(deadline);
  assert.deepEqual(end, [0, null], 'Owned supervisor must cleanly close both children and its private cluster');
  const cleanup = JSON.parse(readFileSync(controlFile, 'utf8'));
  assert.equal(cleanup.databaseStopped, true);
  for (const name of ['api', 'schema']) {
    if (result) assert.equal(cleanup.cleanup[name].pid, result.currentOwnedPids[name]);
    assert.deepEqual({ code: cleanup.cleanup[name].code, signal: cleanup.cleanup[name].signal,
      forced: cleanup.cleanup[name].forced }, { code: 0, signal: null, forced: false });
    assert.throws(() => process.kill(cleanup.cleanup[name].pid, 0), { code: 'ESRCH' });
  }
  if (result) result.cleanup = cleanup;
}
writeFileSync(join(privateRoot, 'result.json'), JSON.stringify({ ...result, supervisorClosed: true }, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ result: 'passed', checks: 'private fixture exact rows and owned cleanup', evidence: privateRoot,
  qualification: 'No authenticated product read/model/GUI acceptance' }));
