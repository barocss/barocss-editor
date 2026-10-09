import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, constants, lstatSync, openSync, readFileSync, realpathSync, statSync,
  writeFileSync, writeSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parseRegistryDefinition, validateRegistryBundle } from '@barocss/schema/registry-contract';

const probeVersion = 'wonffice.mcp-adopt.current-backend.v1';
const probeTools = ['get_schema_bundle', 'register_schema', 'validate_document', 'validate_candidate', 'adopt_schema'];
const probeHash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function check(condition, message) { if (!condition) throw new Error(message); }
function same(actual, expected, message) { check(isDeepStrictEqual(actual, expected), message); }
function selected(snapshotText, schemaId, tenantId, workspaceId, version) {
  let file;
  try { file = JSON.parse(snapshotText); }
  catch { throw new Error('Invalid declared native2 JSON'); }
  check(file?.format === 'barocss-note' && file.version === 2 && object(file.document),
    'Declared Note native2 file required');
  const { bundle, selectedDefinitions } = validateRegistryBundle(file.schemaBundle);
  const index = bundle.selected.findIndex(ref => ref.schemaId === schemaId);
  check(index >= 0 && bundle.selected[index].version === version,
    'Declared selected pin version mismatch');
  check(selectedDefinitions[index].scope.tenantId === tenantId &&
    selectedDefinitions[index].scope.workspaceId === workspaceId,
  'Declared selected scope mismatch');
  return { file, bundle };
}
function expectedPinned(entry) {
  return { status: 'pinned', document: entry.document, snapshotText: entry.snapshotText,
    documentRevision: entry.document.revision, snapshotHash: entry.document.snapshotHash,
    nativeFormat: { format: 'barocss-note', version: 2 },
    bundle: JSON.parse(entry.snapshotText).schemaBundle };
}
function privateResultPath(path) {
  check(typeof path === 'string' && isAbsolute(path), 'Absolute private result path required');
  const parent = lstatSync(dirname(path));
  check(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0 &&
    (typeof process.getuid !== 'function' || parent.uid === process.getuid()),
  'Owned mode 0700 result parent required');
  return path;
}
function absent(path) {
  try { lstatSync(path); throw new Error('Private result path already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function verifyCurrentFixture(entryPath, baseUrl, fixture, tokens, hooks, resultPath) {
  check(typeof entryPath === 'string' && isAbsolute(entryPath) && entryPath.endsWith('/dist/mcp-main.js') &&
    realpathSync(entryPath) === entryPath && statSync(entryPath).isFile(), 'Compiled MCP entry required');
  const url = new URL(baseUrl);
  check(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port &&
    url.href === url.origin + '/', 'Exact loopback HTTP origin required');
  privateResultPath(resultPath);
  privateResultPath(resultPath + '.events');
  absent(resultPath); absent(resultPath + '.events');
  check(object(fixture) && fixture.version === probeVersion && object(fixture.A) &&
    object(fixture.B) && object(fixture.A.before) && object(fixture.A.expectedAfter) &&
    object(fixture.B.before) && typeof fixture.tenantId === 'string' &&
    typeof fixture.workspaceId === 'string' && typeof fixture.selectedSchemaId === 'string' &&
    typeof fixture.A.candidateSnapshotText === 'string' &&
    typeof fixture.A.changedCandidateSnapshotText === 'string' &&
    Array.isArray(fixture.keys) && fixture.keys.length === 3 &&
    fixture.keys.every(key => typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(key)) &&
    new Set(fixture.keys).size === 3 && Array.isArray(fixture.expectedReceipts) &&
    fixture.expectedReceipts.length === 2 && typeof fixture.lostAckError === 'string' &&
    Array.isArray(fixture.negativeCases), 'Complete declared A/B fixture required');
  same(Object.keys(fixture).sort(), ['A', 'B', 'expectedReceipts', 'keys', 'lostAckError',
    'negativeCases', 'selectedSchemaId', 'tenantId', 'version', 'workspaceId'].sort(),
  'Unexpected fixture field');
  same(Object.keys(fixture.A).sort(), ['before', 'candidateSnapshotText',
    'changedCandidateSnapshotText', 'expectedAfter', 'priorPinDigest'].sort(),
  'Unexpected A fixture field');
  same(Object.keys(fixture.B), ['before'], 'Unexpected B fixture field');
  for (const account of ['writer', 'viewer', 'foreign', 'revocable']) {
    check(typeof tokens?.[account] === 'string' && tokens[account].trim(),
      'Four current in-memory bearer tokens required');
  }
  for (const name of ['audit', 'armConcurrentLostAck', 'releaseConcurrentAfterBothEntered',
    'confirmCommitted', 'revokeActor']) check(typeof hooks?.[name] === 'function', 'Root audit/barrier hooks required');
  const { A, B, tenantId, workspaceId, selectedSchemaId } = fixture;
  const before = A.before.document, after = A.expectedAfter.document, bHead = B.before.document;
  check(object(before) && object(after) && object(bHead) &&
    typeof A.before.snapshotText === 'string' &&
    typeof B.before.snapshotText === 'string' &&
    typeof A.expectedAfter.snapshotText === 'string' &&
    before.tenantId === tenantId && after.tenantId === tenantId && bHead.tenantId === tenantId &&
    before.workspaceId === workspaceId && after.workspaceId === workspaceId &&
    bHead.workspaceId === workspaceId && before.documentId === after.documentId &&
    before.documentId !== bHead.documentId && before.revision >= 1 &&
    after.revision === before.revision + 1 &&
    before.snapshotHash === probeHash(A.before.snapshotText) &&
    after.snapshotHash === probeHash(A.candidateSnapshotText) &&
    bHead.snapshotHash === probeHash(B.before.snapshotText) &&
    A.expectedAfter.snapshotText === A.candidateSnapshotText,
  'Declared exact document heads and raw bytes required');
  same(after, { ...before, revision: before.revision + 1,
    snapshotHash: probeHash(A.candidateSnapshotText) }, 'Declared A head changed beyond snapshot');
  const a1 = selected(A.before.snapshotText, selectedSchemaId, tenantId, workspaceId, 1);
  const a2 = selected(A.candidateSnapshotText, selectedSchemaId, tenantId, workspaceId, 2);
  selected(B.before.snapshotText, selectedSchemaId, tenantId, workspaceId, 1);
  same(a2.file.document, a1.file.document, 'Adoption changed native document content');
  same(a2.bundle.selected.map(ref => ref.schemaId), a1.bundle.selected.map(ref => ref.schemaId),
    'Adoption changed selected schema order');
  for (let i = 0; i < a1.bundle.selected.length; i++) {
    if (a1.bundle.selected[i].schemaId !== selectedSchemaId) {
      same(a2.bundle.selected[i], a1.bundle.selected[i], 'Adoption changed unrelated selected pin');
    }
  }
  for (const oldDefinition of a1.bundle.definitions) {
    const retained = a2.bundle.definitions.find(item =>
      item.reference.schemaId === oldDefinition.reference.schemaId &&
      item.reference.version === oldDefinition.reference.version);
    same(retained, oldDefinition, 'Adoption replaced an existing definition');
  }
  check(A.changedCandidateSnapshotText !== A.candidateSnapshotText &&
    typeof A.priorPinDigest === 'string' && /^[0-9a-f]{64}$/.test(A.priorPinDigest),
  'Changed-key candidate and prior pin digest required');
  same(A.priorPinDigest, probeHash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1',
    tenantId, workspaceId, before.documentId, 'pinned', a1.bundle.selected.map(ref =>
      [ref.schemaId, ref.version, ref.digest])])), 'Declared prior pin digest mismatch');
  for (let i = 0; i < 2; i++) {
    const receipt = fixture.expectedReceipts[i];
    same(receipt, { operation: 'update', idempotencyKey: fixture.keys[i],
      requestHash: probeHash(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId,
        before.documentId, 'adopt', before.revision, before.snapshotHash, A.priorPinDigest,
        A.candidateSnapshotText])), document: after, snapshotText: A.candidateSnapshotText },
    'Declared complete receipt mismatch');
  }
  check(['schema_service_unavailable', 'schema_service_timeout'].includes(fixture.lostAckError) &&
    fixture.negativeCases.length >= 5 && fixture.negativeCases.length <= 32,
  'Named loss/refusal expectations required');
  const labels = new Set();
  for (const item of fixture.negativeCases) {
    check(object(item) && typeof item.id === 'string' &&
      isDeepStrictEqual(Object.keys(item).sort(),
        ['id', 'account', 'arguments', 'expectedError'].sort()) &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(item.id) && !labels.has(item.id) &&
      ['writer', 'viewer', 'foreign'].includes(item.account) && object(item.arguments) &&
      !['token', 'bearerToken', 'authorization', 'baseUrl'].some(key =>
        Object.hasOwn(item.arguments, key)) &&
      typeof item.expectedError === 'string' && /^[a-z][a-z0-9_]*$/.test(item.expectedError),
    'Declared refusal case invalid');
    labels.add(item.id);
  }
  for (const [label, account] of [['viewer', 'viewer'], ['foreign', 'foreign'],
    ['malformed', 'writer'], ['unsupported', 'writer'], ['executable', 'writer']]) {
    check(fixture.negativeCases.some(item => item.id === label && item.account === account),
      'Required refusal actor/case missing');
  }
}

/** Root owns the signed-JWT HTTP/PG runtime, SQL audit and reached-barrier hooks. */
export async function runCurrentBackendProbe({ entryPath, baseUrl, fixture, tokens, hooks, resultPath }) {
  verifyCurrentFixture(entryPath, baseUrl, fixture, tokens, hooks, resultPath);
  const startedAt = new Date().toISOString();
  const entrySha256 = probeHash(readFileSync(entryPath));
  const fixtureSha256 = probeHash(JSON.stringify(fixture));
  const eventsPath = privateResultPath(resultPath + '.events');
  const eventsFd = openSync(eventsPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
    constants.O_NOFOLLOW, 0o600);
  const event = (kind, fields = {}) => writeSync(eventsFd,
    JSON.stringify({ at: new Date().toISOString(), kind, ...fields }) + '\n');
  const sessions = new Map(), observations = [];
  let failure, lastLabel = 'startup';
  const call = async (account, tool, arguments_, label) => {
    lastLabel = label;
    const requestText = JSON.stringify({ name: tool, arguments: arguments_ });
    const requestSha256 = probeHash(requestText);
    event('call-entered', { label, account, tool, requestSha256,
      requestBytes: Buffer.byteLength(requestText) });
    const result = await sessions.get(account).client.callTool({ name: tool, arguments: arguments_ });
    check(Array.isArray(result.content) && result.content.length === 1 &&
      result.content[0].type === 'text' && typeof result.content[0].text === 'string',
    'Unexpected MCP content shape');
    const responseText = result.content[0].text;
    let body;
    try { body = JSON.parse(responseText); }
    catch { body = undefined; }
    const observation = { label, account, tool, requestSha256,
      responseSha256: probeHash(responseText), responseBytes: Buffer.byteLength(responseText),
      isError: result.isError === true,
      ...(object(body) && typeof body.status === 'string' && result.isError ? { status: body.status } : {}) };
    observations.push(observation); event('call-returned', observation);
    return { ...observation, body, responseText };
  };
  const read = async (account, entry, label) => {
    const result = await call(account, 'get_schema_bundle',
      { tenantId: fixture.tenantId, documentId: entry.document.documentId }, label);
    check(!result.isError, 'Authorized MCP read refused');
    same(result.body, expectedPinned(entry), 'Exact MCP document/bundle read mismatch');
  };
  const denied = async (account, args, expectedError, label) => {
    const before = await hooks.audit(label + '-before');
    check(object(before) && Object.keys(before).length > 0, 'Root SQL audit required');
    const result = await call(account, 'adopt_schema', args, label);
    check(result.isError, 'Denied operation returned success');
    if (expectedError === 'invalid_arguments') {
      check(result.responseText.startsWith('Input validation error:'),
        'SDK input validation refusal mismatch');
    } else same(result.body, { status: expectedError }, 'Named MCP refusal mismatch');
    same(await hooks.audit(label + '-after'), before, 'Denied operation changed SQL state');
  };
  try {
    for (const account of ['writer', 'viewer', 'foreign', 'revocable']) {
      const transport = new StdioClientTransport({ command: process.execPath, args: [entryPath],
        env: { SCHEMA_SERVER_MCP_BASE_URL: baseUrl,
          SCHEMA_SERVER_MCP_BEARER_TOKEN: tokens[account] }, stderr: 'pipe' });
      const client = new Client({ name: 'wonffice-current-backend-probe', version: '1.0.0' });
      sessions.set(account, { client, transport });
      await client.connect(transport); transport.stderr?.resume();
      check(Number.isInteger(transport.pid) && transport.pid > 0, 'Owned MCP child PID missing');
      sessions.get(account).pid = transport.pid;
      same((await client.listTools()).tools.map(item => item.name), probeTools,
        'Compiled MCP tool discovery mismatch');
      event('child-connected', { account, pid: transport.pid,
        protocolVersion: client.getNegotiatedProtocolVersion(), toolCount: probeTools.length });
    }
    await read('writer', fixture.A.before, 'A1-before');
    await read('writer', fixture.B.before, 'B1-before');
    const argsFor = key => ({ tenantId: fixture.tenantId,
      documentId: fixture.A.before.document.documentId,
      expectedRevision: fixture.A.before.document.revision,
      expectedSnapshotHash: fixture.A.before.document.snapshotHash,
      expectedPriorPinDigest: fixture.A.priorPinDigest,
      snapshotText: fixture.A.candidateSnapshotText, idempotencyKey: key });
    await hooks.armConcurrentLostAck();
    const concurrent = fixture.keys.slice(0, 2).map((key, index) =>
      call('writer', 'adopt_schema', argsFor(key), 'concurrent-' + index));
    const settled = Promise.all(concurrent);
    await hooks.releaseConcurrentAfterBothEntered();
    const outcomes = await settled;
    const proof = await hooks.confirmCommitted();
    check(object(proof) && [0, 1].includes(proof.winnerIndex) &&
      proof.bothEntered === true && proof.committedAfterLostAck === true &&
      proof.bWholeUnchanged === true,
      'Root committed-winner audit required');
    event('root-audit-confirmed', { winnerIndex: proof.winnerIndex,
      bothEntered: true, committedAfterLostAck: true, bWholeUnchanged: true });
    const winner = proof.winnerIndex, loser = 1 - winner;
    check(outcomes[winner].isError &&
      isDeepStrictEqual(outcomes[winner].body, { status: fixture.lostAckError }),
    'Committed winner must have actual lost-ACK response');
    check(outcomes[loser].isError &&
      isDeepStrictEqual(outcomes[loser].body, { status: 'revision_conflict' }),
    'Concurrent loser must be stale');
    const retry = await call('writer', 'adopt_schema', argsFor(fixture.keys[winner]), 'fixed-key-retry');
    check(!retry.isError, 'Durable fixed-key retry refused');
    same(retry.body, fixture.expectedReceipts[winner], 'Durable exact receipt mismatch');
    const retryAgain = await call('writer', 'adopt_schema', argsFor(fixture.keys[winner]),
      'fixed-key-retry-again');
    check(!retryAgain.isError, 'Second fixed-key retry refused');
    same(retryAgain.body, retry.body, 'Fixed-key bytes changed');
    await read('writer', fixture.A.expectedAfter, 'A2-after');
    await read('writer', fixture.B.before, 'B1-unchanged-after');
    await denied('writer', { ...argsFor(fixture.keys[winner]),
      snapshotText: fixture.A.changedCandidateSnapshotText }, 'key_reuse', 'same-key-changed-bytes');
    await denied('writer', argsFor(fixture.keys[2]), 'revision_conflict', 'stale-new-key');
    for (const item of fixture.negativeCases) {
      await denied(item.account, item.arguments, item.expectedError, item.id);
    }
    await read('revocable', fixture.A.expectedAfter, 'revocable-before');
    await hooks.revokeActor();
    await denied('revocable', argsFor(fixture.keys[2]), 'scope_forbidden', 'same-child-revoked');
    await read('writer', fixture.A.expectedAfter, 'A2-final');
    await read('writer', fixture.B.before, 'B1-final');
  } catch { failure = 'probe_check_failed'; }
  finally {
    for (const [account, { client, pid }] of sessions) {
      try {
        let closeTimer;
        try {
          await Promise.race([client.close(), new Promise((_, reject) => {
            closeTimer = setTimeout(() => reject(new Error('Owned MCP close timed out')), 5000);
          })]);
        } finally { clearTimeout(closeTimer); }
        if (pid) {
          let exited = false;
          for (let i = 0; i < 40 && !exited; i++) {
            try { process.kill(pid, 0); await new Promise(done => setTimeout(done, 50)); }
            catch (error) { if (error?.code === 'ESRCH') exited = true; else break; }
          }
          check(exited, 'Owned MCP child remained running');
        }
        event('child-closed', { account, pid, exited: true });
      } catch { failure = 'owned_child_cleanup_failed'; }
    }
    closeSync(eventsFd);
  }
  if (entrySha256 !== probeHash(readFileSync(entryPath)) ||
    fixtureSha256 !== probeHash(JSON.stringify(fixture))) failure = 'source_or_fixture_changed';
  const summary = { status: failure ? 'failed' : 'declared_sdk_cases_passed',
    ...(failure ? { error: failure, failedAt: lastLabel } : {}), version: probeVersion, startedAt,
    finishedAt: new Date().toISOString(), entrySha256,
    fixtureSha256, baseOrigin: baseUrl,
    observations, childPids: [...sessions].map(([account, session]) =>
      ({ account, pid: session.pid })), eventsPath,
    qualification: 'SDK cases against operator-configured HTTP backend; Root separately proves signed-JWT/private PostgreSQL authority and whole #502 acceptance' };
  const resultFd = openSync(resultPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
    constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(resultFd, JSON.stringify(summary, null, 2) + '\n'); }
  finally { closeSync(resultFd); }
  if (failure) throw new Error('Current backend MCP probe failed; inspect private result/events');
  return summary;
}

async function runControlledHttpProtocol() {

// This is a real MCP client and compiled process over a controlled HTTP service.
// It does not claim a current OIDC account or PostgreSQL authority test.
const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = '55555555-5555-4555-8555-555555555555';
const schemaId = '33333333-3333-4333-8333-333333333333';
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const definitionText = JSON.stringify({ dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId },
  schemaId, version: 1, parent: null, dependencies: [], requiredCapabilities: ['note.field.text.v1'],
  dataset: { name: 'Tasks', fields: [{ name: 'Title', kind: 'text' }] } }, null, 2);
const ref = { schemaId, version: 1, digest: sha(parseRegistryDefinition(definitionText).canonicalText) };
const bundle = { bundleVersion: 1, digestAlgorithm: 'wonffice.canonical-json.sha256.v1', selected: [ref],
  definitions: [{ reference: ref, definitionText }] };
const snapshotText = JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: bundle,
  document: { stype: 'note', attributes: { title: 'Exact', pageId: documentId }, content: [] } });
const document = { documentId, tenantId, workspaceId, product: 'note', title: 'Exact', creatorUserId: null,
  metadataRevision: 1, mode: 'snapshot', pageId: documentId,
  documentKey: `wonffice-${tenantId}-${documentId}`,
  fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: sha(snapshotText) };
const expected = { status: 'pinned', document, snapshotText, documentRevision: 1,
  snapshotHash: document.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle };
const path = `/v1/tenants/${tenantId}/note-native2/documents/${documentId}`;
const validationPath = path + '/validation';
const priorPinDigest = sha(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId,
  documentId, 'pinned', bundle.selected.map(item => [item.schemaId, item.version, item.digest])]));
const validationInput = { tenantId, documentId, expectedRevision: 1,
  expectedSnapshotHash: document.snapshotHash, expectedPriorPinDigest: priorPinDigest };
const validationChecks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle',
  'source_preconditions'];
const candidateChecks = [...validationChecks, 'candidate_file', 'candidate_registered_bundle',
  'candidate_action_policy', 'pin_transition'];
const registerPath = `/v1/tenants/${tenantId}/workspaces/${workspaceId}/schemas/${schemaId}/versions/1`;
const registration = { tenantId, workspaceId, schemaId, version: 1, definitionText, idempotencyKey: 'mcp-fixed-1' };
const parsed = parseRegistryDefinition(definitionText);
const registerReceipt = { operation: 'register', idempotencyKey: registration.idempotencyKey,
  requestHash: sha(JSON.stringify(['schema-register-v1', tenantId, workspaceId, schemaId, 1, definitionText])),
  requesterIdentityId: '44444444-4444-4444-8444-444444444444', authorityEpoch: 'controlled-epoch',
  record: { schemaId, version: 1, digest: ref.digest, digestAlgorithm: 'wonffice.canonical-json.sha256.v1',
    definitionText, canonicalText: parsed.canonicalText, definition: parsed.definition,
    actorIdentityId: '44444444-4444-4444-8444-444444444444', createdAt: '2026-10-08T00:00:00.000Z' },
  dependencies: [] };
const adoptedDefinitionText = JSON.stringify({ dialect: 'wonffice.note-fields.v1',
  scope: { tenantId, workspaceId }, schemaId, version: 2, parent: ref, dependencies: [],
  requiredCapabilities: ['note.field.text.v1'], dataset: { name: 'Tasks',
    fields: [{ name: 'Title', kind: 'text' }, { name: 'Status', kind: 'text' }] } });
const adoptedRef = { schemaId, version: 2,
  digest: sha(parseRegistryDefinition(adoptedDefinitionText).canonicalText) };
const adoptedBundle = { ...bundle, selected: [adoptedRef],
  definitions: [...bundle.definitions, { reference: adoptedRef, definitionText: adoptedDefinitionText }] };
const adoptedSnapshotText = JSON.stringify({ format: 'barocss-note', version: 2,
  schemaBundle: adoptedBundle,
  document: { stype: 'note', attributes: { title: 'Exact', pageId: documentId }, content: [] } });
const adoptInput = { ...validationInput, snapshotText: adoptedSnapshotText, idempotencyKey: 'adopt-fixed-1' };
const adoptPath = path + '/snapshot';
const adoptReceipt = { operation: 'update', idempotencyKey: adoptInput.idempotencyKey,
  requestHash: sha(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId,
    'adopt', 1, document.snapshotHash, priorPinDigest, adoptedSnapshotText])),
  document: { ...document, revision: 2, snapshotHash: sha(adoptedSnapshotText) },
  snapshotText: adoptedSnapshotText };
const calls = [];
const startedAt = new Date().toISOString(), childPids = [];
let held, heldResponse;
const http = createServer(async (request, response) => {
  calls.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
  if (held && request.url === held.url) {
    const current = held; held = undefined; heldResponse = response;
    response.once('close', current.closed); current.entered(); return;
  }
  response.setHeader('content-type', 'application/json');
  if (request.method === 'PUT' && request.url === adoptPath) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.headers.authorization !== 'Bearer controlled.token.value') {
      response.writeHead(401).end(JSON.stringify({ status: 'unauthorized' })); return;
    }
    if (body.schemaAction !== 'adopt' || body.idempotencyKey !== adoptInput.idempotencyKey ||
      body.snapshotText !== adoptedSnapshotText) {
      response.writeHead(409).end(JSON.stringify({ status: 'key_reuse' })); return;
    }
    if (body.expectedRevision !== 1 || body.expectedSnapshotHash !== document.snapshotHash ||
      body.expectedPriorPinDigest !== priorPinDigest) {
      response.writeHead(409).end(JSON.stringify({ status: 'revision_conflict' })); return;
    }
    response.writeHead(200).end(JSON.stringify(adoptReceipt)); return;
  }
  if (request.method === 'PUT' && request.url === registerPath) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.headers.authorization !== 'Bearer controlled.token.value') {
      response.writeHead(401).end(JSON.stringify({ status: 'unauthorized' })); return;
    }
    if (body.definitionText !== definitionText || body.idempotencyKey !== registration.idempotencyKey) {
      response.writeHead(409).end(JSON.stringify({ status: 'key_reuse' })); return;
    }
    response.writeHead(200).end(JSON.stringify(registerReceipt)); return;
  }
  if (request.method === 'POST' && request.url === validationPath) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.headers.authorization !== 'Bearer controlled.token.value') {
      response.writeHead(401).end(JSON.stringify({ status: 'unauthorized' })); return;
    }
    if (body.expectedRevision !== 1) {
      response.writeHead(409).end(JSON.stringify({ status: 'revision_conflict' })); return;
    }
    if (body.expectedSnapshotHash !== document.snapshotHash || body.expectedPriorPinDigest !== priorPinDigest) {
      response.writeHead(409).end(JSON.stringify({ status: 'schema_pin_conflict' })); return;
    }
    if (body.kind === 'candidate' && body.intendedAction !== 'preserve') {
      response.writeHead(403).end(JSON.stringify({ status: 'scope_forbidden' })); return;
    }
    response.writeHead(200).end(JSON.stringify({ status: 'structurally_valid', kind: body.kind,
      documentId, documentRevision: 1, snapshotHash: document.snapshotHash, priorPinDigest,
      checks: body.kind === 'candidate' ? candidateChecks : validationChecks,
      ...(body.kind === 'candidate' ? { candidateSnapshotHash: sha(body.snapshotText), action: 'preserve' } : {}) }));
    return;
  }
  if (request.method !== 'GET' || request.headers.authorization !== 'Bearer controlled.token.value') {
    response.writeHead(401).end(JSON.stringify({ status: 'unauthorized' })); return;
  }
  if (request.url !== path && request.url !== path + '/schema-bundle') {
    response.writeHead(403).end(JSON.stringify({ status: 'scope_forbidden' })); return;
  }
  response.writeHead(200).end(JSON.stringify(request.url === path
    ? { document, snapshotText }
    : { status: 'pinned', documentId, documentRevision: 1, snapshotHash: document.snapshotHash,
        nativeFormat: { format: 'barocss-note', version: 2 }, bundle }));
});

async function connect(baseUrl, bearerToken) {
  const client = new Client({ name: 'wonffice-independent-protocol-check', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../dist/mcp-main.js', import.meta.url))],
    env: { SCHEMA_SERVER_MCP_BASE_URL: baseUrl,
      ...(bearerToken ? { SCHEMA_SERVER_MCP_BEARER_TOKEN: bearerToken } : { SCHEMA_SERVER_MCP_BEARER_TOKEN: '' }) } });
  try { await client.connect(transport); }
  catch (error) { await client.close(); throw error; }
  assert.ok(transport.pid);
  childPids.push(transport.pid);
  return client;
}
async function within(promise, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

await new Promise((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); });
const address = http.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
let protocolVersion;
try {
  const client = await connect(baseUrl, 'controlled.token.value');
  try {
    protocolVersion = client.getNegotiatedProtocolVersion();
    assert.match(protocolVersion, /^20\d{2}-\d{2}-\d{2}$/);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name),
      ['get_schema_bundle', 'register_schema', 'validate_document', 'validate_candidate', 'adopt_schema']);
    assert.deepEqual(listed.tools[0].inputSchema.required, ['tenantId', 'documentId']);
    const result = await client.callTool({ name: 'get_schema_bundle', arguments: { tenantId, documentId } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), expected);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => [call.method, call.url, call.authorization]), [
      ['GET', path, 'Bearer controlled.token.value'], ['GET', path + '/schema-bundle', 'Bearer controlled.token.value']]);

    const registered = await client.callTool({ name: 'register_schema', arguments: registration });
    assert.notEqual(registered.isError, true);
    assert.deepEqual(JSON.parse(registered.content[0].text), JSON.parse(JSON.stringify(registerReceipt)));
    const retried = await client.callTool({ name: 'register_schema', arguments: registration });
    assert.deepEqual(JSON.parse(retried.content[0].text), JSON.parse(JSON.stringify(registerReceipt)));
    assert.deepEqual(calls.slice(2, 4).map(call => [call.method, call.url, call.authorization]), [
      ['PUT', registerPath, 'Bearer controlled.token.value'], ['PUT', registerPath, 'Bearer controlled.token.value']]);
    const reuse = await client.callTool({ name: 'register_schema',
      arguments: { ...registration, definitionText: definitionText + ' ' } });
    assert.equal(reuse.isError, true);
    assert.deepEqual(JSON.parse(reuse.content[0].text), { status: 'key_reuse' });
    const beforeValidation = calls.length;
    const validated = await client.callTool({ name: 'validate_document', arguments: validationInput });
    assert.notEqual(validated.isError, true);
    assert.deepEqual(JSON.parse(validated.content[0].text), { status: 'structurally_valid', kind: 'document',
      documentId, documentRevision: 1, snapshotHash: document.snapshotHash, priorPinDigest,
      checks: validationChecks });
    const candidateInput = { ...validationInput, snapshotText, intendedAction: 'preserve' };
    const candidateResult = await client.callTool({ name: 'validate_candidate', arguments: candidateInput });
    assert.notEqual(candidateResult.isError, true);
    assert.deepEqual(JSON.parse(candidateResult.content[0].text), { status: 'structurally_valid', kind: 'candidate',
      documentId, documentRevision: 1, snapshotHash: document.snapshotHash, priorPinDigest,
      checks: candidateChecks, candidateSnapshotHash: sha(snapshotText), action: 'preserve' });
    assert.deepEqual(calls.slice(beforeValidation).map(call => [call.method, call.url, call.authorization]), [
      ['POST', validationPath, 'Bearer controlled.token.value'],
      ['POST', validationPath, 'Bearer controlled.token.value']]);
    const stale = await client.callTool({ name: 'validate_document',
      arguments: { ...validationInput, expectedRevision: 2 } });
    assert.equal(stale.isError, true);
    assert.deepEqual(JSON.parse(stale.content[0].text), { status: 'revision_conflict' });
    const forbiddenAdopt = await client.callTool({ name: 'validate_candidate',
      arguments: { ...candidateInput, intendedAction: 'adopt' } });
    assert.equal(forbiddenAdopt.isError, true);
    assert.deepEqual(JSON.parse(forbiddenAdopt.content[0].text), { status: 'scope_forbidden' });
    const beforeMalformed = calls.length;
    const forbiddenArgument = await client.callTool({ name: 'register_schema',
      arguments: { ...registration, role: 'owner' } });
    assert.equal(forbiddenArgument.isError, true);
    assert.equal(calls.length, beforeMalformed);

    const beforeAdopt = calls.length;
    const adopted = await client.callTool({ name: 'adopt_schema', arguments: adoptInput });
    assert.notEqual(adopted.isError, true);
    assert.deepEqual(JSON.parse(adopted.content[0].text), adoptReceipt);
    const adoptRetry = await client.callTool({ name: 'adopt_schema', arguments: adoptInput });
    assert.notEqual(adoptRetry.isError, true);
    assert.deepEqual(JSON.parse(adoptRetry.content[0].text), adoptReceipt);
    assert.deepEqual(calls.slice(beforeAdopt).map(call => [call.method, call.url, call.authorization]), [
      ['PUT', adoptPath, 'Bearer controlled.token.value'], ['PUT', adoptPath, 'Bearer controlled.token.value']]);
    const adoptReuse = await client.callTool({ name: 'adopt_schema',
      arguments: { ...adoptInput, snapshotText: adoptedSnapshotText + ' ' } });
    assert.equal(adoptReuse.isError, true);
    assert.deepEqual(JSON.parse(adoptReuse.content[0].text), { status: 'key_reuse' });
    const adoptStale = await client.callTool({ name: 'adopt_schema',
      arguments: { ...adoptInput, expectedRevision: 2 } });
    assert.equal(adoptStale.isError, true);
    assert.deepEqual(JSON.parse(adoptStale.content[0].text), { status: 'revision_conflict' });
    const beforeBadAdopt = calls.length;
    for (const arguments_ of [{ ...adoptInput, role: 'owner' },
      { ...adoptInput, schemaAction: 'preserve' },
      { ...adoptInput, expectedRevision: Number.MAX_SAFE_INTEGER }]) {
      const refused = await client.callTool({ name: 'adopt_schema', arguments: arguments_ });
      assert.equal(refused.isError, true);
    }
    assert.equal(calls.length, beforeBadAdopt);
    const extraValidation = await client.callTool({ name: 'validate_document',
      arguments: { ...validationInput, role: 'owner' } });
    assert.equal(extraValidation.isError, true);
    const invalidCandidate = await client.callTool({ name: 'validate_candidate',
      arguments: { ...candidateInput, intendedAction: 'execute' } });
    assert.equal(invalidCandidate.isError, true);
    assert.equal(calls.length, beforeBadAdopt);

    const before = calls.length;
    const extra = await client.callTool({ name: 'get_schema_bundle',
      arguments: { tenantId, documentId, role: 'owner' } });
    assert.equal(extra.isError, true);
    assert.equal(calls.length, before);
    const malformed = await client.callTool({ name: 'get_schema_bundle', arguments: { tenantId: '../x', documentId } });
    assert.equal(malformed.isError, true);
    assert.equal(calls.length, before);
    await assert.rejects(client.callTool({ name: 'unregistered_tool', arguments: { tenantId, documentId } }));

    const foreign = await client.callTool({ name: 'get_schema_bundle',
      arguments: { tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', documentId } });
    assert.equal(foreign.isError, true);
    assert.deepEqual(JSON.parse(foreign.content[0].text), { status: 'scope_forbidden' });

    let entered, closed;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    const closedPromise = new Promise(resolve => { closed = resolve; });
    held = { entered, closed, url: path };
    const controller = new AbortController();
    const cancelled = client.callTool({ name: 'get_schema_bundle', arguments: { tenantId, documentId } },
      { signal: controller.signal });
    await within(enteredPromise, 'MCP call did not reach HTTP');
    const beforeCancel = calls.length;
    controller.abort();
    await assert.rejects(cancelled);
    await within(closedPromise, 'Cancelled HTTP connection stayed open');
    heldResponse = undefined;
    assert.equal(calls.length, beforeCancel);
    const afterCancel = await client.callTool({ name: 'get_schema_bundle', arguments: { tenantId, documentId } });
    assert.notEqual(afterCancel.isError, true);
    let validateEntered, validateClosed;
    const validateEnteredPromise = new Promise(resolve => { validateEntered = resolve; });
    const validateClosedPromise = new Promise(resolve => { validateClosed = resolve; });
    held = { entered: validateEntered, closed: validateClosed, url: validationPath };
    const validationController = new AbortController();
    const cancelledValidation = client.callTool({ name: 'validate_document', arguments: validationInput },
      { signal: validationController.signal });
    await within(validateEnteredPromise, 'Validation did not reach HTTP');
    validationController.abort();
    await assert.rejects(cancelledValidation);
    await within(validateClosedPromise, 'Cancelled validation HTTP connection stayed open');
    heldResponse = undefined;
    let adoptEntered, adoptClosed;
    const adoptEnteredPromise = new Promise(resolve => { adoptEntered = resolve; });
    const adoptClosedPromise = new Promise(resolve => { adoptClosed = resolve; });
    held = { entered: adoptEntered, closed: adoptClosed, url: adoptPath };
    const adoptController = new AbortController();
    const cancelledAdopt = client.callTool({ name: 'adopt_schema', arguments: adoptInput },
      { signal: adoptController.signal });
    await within(adoptEnteredPromise, 'Adoption did not reach HTTP');
    adoptController.abort();
    await assert.rejects(cancelledAdopt);
    await within(adoptClosedPromise, 'Cancelled adoption HTTP connection stayed open');
    heldResponse = undefined;
  } finally { await client.close(); }

  const anonymous = await connect(baseUrl);
  try {
    const before = calls.length;
    const denied = await anonymous.callTool({ name: 'get_schema_bundle', arguments: { tenantId, documentId } });
    assert.equal(denied.isError, true);
    assert.deepEqual(JSON.parse(denied.content[0].text), { status: 'unauthorized' });
    assert.equal(calls.length, before);
    const deniedRegister = await anonymous.callTool({ name: 'register_schema', arguments: registration });
    assert.equal(deniedRegister.isError, true);
    assert.deepEqual(JSON.parse(deniedRegister.content[0].text), { status: 'unauthorized' });
    const deniedValidation = await anonymous.callTool({ name: 'validate_document', arguments: validationInput });
    assert.equal(deniedValidation.isError, true);
    assert.deepEqual(JSON.parse(deniedValidation.content[0].text), { status: 'unauthorized' });
    const deniedAdopt = await anonymous.callTool({ name: 'adopt_schema', arguments: adoptInput });
    assert.equal(deniedAdopt.isError, true);
    assert.deepEqual(JSON.parse(deniedAdopt.content[0].text), { status: 'unauthorized' });
    assert.equal(calls.length, before);
  } finally { await anonymous.close(); }
} finally { heldResponse?.destroy(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
for (const pid of childPids) {
  let alive = true;
  for (let attempt = 0; attempt < 20 && alive; attempt++) {
    try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 50)); }
    catch (error) { if (error.code !== 'ESRCH') throw error; alive = false; }
  }
  assert.equal(alive, false, `Owned MCP child ${pid} remained running`);
}
console.log(JSON.stringify({ status: 'passed', transport: 'stdio', protocolVersion,
  client: '@modelcontextprotocol/client', server: 'dist/mcp-main.js',
  tools: ['get_schema_bundle', 'register_schema', 'validate_document', 'validate_candidate', 'adopt_schema'],
  ownedResources: { controllerPid: process.pid, loopbackHost: '127.0.0.1', loopbackPort: address.port,
    childPids, startedAt, finishedAt: new Date().toISOString(), httpClosed: true, childrenExited: true },
  controlledHttpCalls: calls.length,
  qualification: 'real MCP client/compiled server; controlled HTTP service, not OIDC/PG/product UI' }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Default controlled MCP protocol accepts no arguments');
  await runControlledHttpProtocol();
}
