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
  metadataRevision: 1, mode: 'snapshot', pageId: documentId, documentKey: 'controlled-key',
  fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: sha(snapshotText) };
const expected = { status: 'pinned', document, snapshotText, documentRevision: 1,
  snapshotHash: document.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle };
const path = `/v1/tenants/${tenantId}/note-native2/documents/${documentId}`;
const calls = [];
const startedAt = new Date().toISOString(), childPids = [];
let held, heldResponse;
const http = createServer((request, response) => {
  calls.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
  if (held && request.url === path) {
    const current = held; held = undefined; heldResponse = response;
    response.once('close', current.closed); current.entered(); return;
  }
  response.setHeader('content-type', 'application/json');
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
    assert.deepEqual(listed.tools.map(tool => tool.name), ['get_schema_bundle']);
    assert.deepEqual(listed.tools[0].inputSchema.required, ['tenantId', 'documentId']);
    const result = await client.callTool({ name: 'get_schema_bundle', arguments: { tenantId, documentId } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), expected);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => [call.method, call.url, call.authorization]), [
      ['GET', path, 'Bearer controlled.token.value'], ['GET', path + '/schema-bundle', 'Bearer controlled.token.value']]);

    const before = calls.length;
    const extra = await client.callTool({ name: 'get_schema_bundle',
      arguments: { tenantId, documentId, role: 'owner' } });
    assert.equal(extra.isError, true);
    assert.equal(calls.length, before);
    const malformed = await client.callTool({ name: 'get_schema_bundle', arguments: { tenantId: '../x', documentId } });
    assert.equal(malformed.isError, true);
    assert.equal(calls.length, before);
    await assert.rejects(client.callTool({ name: 'register_schema', arguments: { tenantId, documentId } }));

    const foreign = await client.callTool({ name: 'get_schema_bundle',
      arguments: { tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', documentId } });
    assert.equal(foreign.isError, true);
    assert.deepEqual(JSON.parse(foreign.content[0].text), { status: 'scope_forbidden' });

    let entered, closed;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    const closedPromise = new Promise(resolve => { closed = resolve; });
    held = { entered, closed };
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
  } finally { await client.close(); }

  const anonymous = await connect(baseUrl);
  try {
    const before = calls.length;
    const denied = await anonymous.callTool({ name: 'get_schema_bundle', arguments: { tenantId, documentId } });
    assert.equal(denied.isError, true);
    assert.deepEqual(JSON.parse(denied.content[0].text), { status: 'unauthorized' });
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
  client: '@modelcontextprotocol/client', server: 'dist/mcp-main.js', tools: ['get_schema_bundle'],
  ownedResources: { controllerPid: process.pid, loopbackHost: '127.0.0.1', loopbackPort: address.port,
    childPids, startedAt, finishedAt: new Date().toISOString(), httpClosed: true, childrenExited: true },
  controlledHttpCalls: calls.length,
  qualification: 'real MCP client/compiled server; controlled HTTP service, not OIDC/PG/product UI' }));
