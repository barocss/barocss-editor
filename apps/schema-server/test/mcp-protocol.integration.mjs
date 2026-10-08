import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parseRegistryDefinition } from '@barocss/schema/registry-contract';

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
      ['get_schema_bundle', 'register_schema', 'validate_document', 'validate_candidate']);
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
    const extraValidation = await client.callTool({ name: 'validate_document',
      arguments: { ...validationInput, role: 'owner' } });
    assert.equal(extraValidation.isError, true);
    const invalidCandidate = await client.callTool({ name: 'validate_candidate',
      arguments: { ...candidateInput, intendedAction: 'execute' } });
    assert.equal(invalidCandidate.isError, true);
    assert.equal(calls.length, beforeMalformed);

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
  tools: ['get_schema_bundle', 'register_schema', 'validate_document', 'validate_candidate'],
  ownedResources: { controllerPid: process.pid, loopbackHost: '127.0.0.1', loopbackPort: address.port,
    childPids, startedAt, finishedAt: new Date().toISOString(), httpClosed: true, childrenExited: true },
  controlledHttpCalls: calls.length,
  qualification: 'real MCP client/compiled server; controlled HTTP service, not OIDC/PG/product UI' }));
