import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import pg from 'pg';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { migrate } from '../../office-service/dist/migrate.js';
import { MembershipStore } from '@barocss/office-service/membership-store';
import { DocumentStore } from '@barocss/office-service/document-store';
import { CollaborationStore } from '@barocss/office-service/collaboration-store';
import { CapabilityStore } from '@barocss/office-service/capability-store';
import { PlatformOperatorStore } from '@barocss/office-service/platform-operator-store';
import { CompanyMemberStore } from '@barocss/office-service/company-member-store';
import { applyPlatformOperatorChange } from '../../office-service/dist/platform-operator-admin.js';
import { readAuthConfig } from '../dist/auth-config.js';
import { createOidcVerifier } from '../dist/oidc.js';
import { createApiServer } from '../dist/server.js';

// This is a private, synthetic PostgreSQL/JWKS integration run. It never touches
// the operator's local database, Keycloak realm, or customer documents.
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-api-pg-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_api_test') => ({ host: socket, port: 5432, user, database });
const clients = [];
const pools = [];
let started = false;
let jwks;
let app;
async function connect(user, database) {
  const client = new pg.Client(config(user, database));
  clients.push(client);
  await client.connect();
  return client;
}
async function check(name, work) {
  await work();
  console.log(JSON.stringify({ result: 'passed', check: name }));
}

try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust', '--auth-host=reject',
    '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']);
  started = true;
  const admin = await connect('wonffice_test_admin', 'postgres');
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_api_test OWNER wonffice_owner');
  const owner = await connect('wonffice_owner');
  await migrate(owner);
  const alpha = randomUUID(), beta = randomUUID(), workspaceA = randomUUID(), workspaceB = randomUUID();
  const aliceId = randomUUID(), bobId = randomUUID();
  const keys = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(keys.publicKey);
  jwks = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: 'synthetic', alg: 'RS256', use: 'sig' }] }));
  });
  await new Promise(resolve => jwks.listen(0, '127.0.0.1', resolve));
  const address = jwks.address();
  const issuer = `http://127.0.0.1:${address.port}/realms/synthetic`;
  const authConfig = readAuthConfig({ OFFICE_OIDC_ISSUER: issuer,
    OFFICE_OIDC_JWKS_URL: `${issuer}/certs`, OFFICE_OIDC_AUDIENCE: 'wonffice-api',
    OFFICE_API_DATABASE_URL: 'postgresql://synthetic/unused' });
  assert.ok(authConfig);
  const token = (subject, expiry = Math.floor(Date.now() / 1000) + 300, sessionId) =>
    new SignJWT({ typ: 'Bearer', ...(sessionId ? { sid: sessionId } : {}) })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic' })
      .setIssuer(issuer).setAudience('wonffice-api').setSubject(subject)
      .setIssuedAt().setExpirationTime(expiry).sign(keys.privateKey);
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)',
    [alpha, 'Alpha', beta, 'Beta']);
  await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3), ($4, $2, $5)',
    [aliceId, issuer, 'alice', bobId, 'bob']);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'editor'), ($1, $3, 'editor'), ($4, $3, 'viewer')`,
  [alpha, aliceId, bobId, beta]);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 3 }); pools.push(pool);
  const providerSeeds = new Map();
  let failNextSeed = false;
  let allowInspection = true;
  const provider = {
    async seed(task) { providerSeeds.set(task.seedId, {
      documentKey: task.documentKey, providerProject: task.providerProject,
      providerBuild: task.providerBuild, seedId: task.seedId,
      snapshotRevision: task.snapshotRevision, snapshotHash: task.snapshotHash,
      providerCheckpoint: 'synthetic-checkpoint-1', providerSnapshotHash: task.canonicalSeed.canonicalTreeHash,
    }); if (failNextSeed) { failNextSeed = false; throw new Error('lost_provider_ack'); } },
    async inspect(task) { return allowInspection ? providerSeeds.get(task.seedId) ?? null : null; },
  };
  const currentSessions = new Set(['alice-session', 'bob-session']);
  const dependencies = () => ({ verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool), workspaces: new MembershipStore(pool),
    documents: new DocumentStore(pool),
    collaboration: new CollaborationStore(pool, 'synthetic-project', 'synthetic-build', provider,
      async session => currentSessions.has(session.sessionId)),
    capabilities: new CapabilityStore(pool, 'synthetic-project', 'synthetic-build',
      async session => currentSessions.has(session.sessionId)),
    verifyYorkieCaller: async request => request.headers['x-synthetic-caller'] === 'local-only',
    operators: new PlatformOperatorStore(pool), companyMembers: new CompanyMemberStore(pool) });
  app = createApiServer(dependencies());
  const alice = { authorization: `Bearer ${await token('alice', Math.floor(Date.now() / 1000) + 300, 'alice-session')}` };
  const bob = { authorization: `Bearer ${await token('bob', Math.floor(Date.now() / 1000) + 300, 'bob-session')}` };
  const docUrl = `/v1/tenants/${alpha}/documents`;
  const workspaceUrl = `/v1/tenants/${alpha}/workspaces`;
  await check('workspace discovery distinguishes no workspaces from authentication and tenant denial', async () => {
    assert.equal((await app.inject(workspaceUrl)).statusCode, 401);
    assert.equal((await app.inject({ url: workspaceUrl,
      headers: { authorization: `Bearer ${await token('alice', Math.floor(Date.now() / 1000) - 30)}` } })).statusCode, 401);
    const empty = await app.inject({ url: workspaceUrl, headers: alice });
    assert.equal(empty.statusCode, 200, empty.body);
    assert.deepEqual(empty.json(), { workspaces: [], nextCursor: null });
    assert.equal((await app.inject({ url: `/v1/tenants/${beta}/workspaces`, headers: alice })).statusCode, 403);
    assert.equal((await app.inject({ url: '/v1/tenants/not-uuid/workspaces', headers: alice })).statusCode, 400);
    assert.equal((await app.inject({ url: `${workspaceUrl}?after=not-uuid`, headers: alice })).statusCode, 400);
  });
  await owner.query(`INSERT INTO wonffice.workspaces (tenant_id, id, name)
    VALUES ($1, $2, 'Alpha workspace'), ($3, $4, 'Beta workspace')`,
  [alpha, workspaceA, beta, workspaceB]);
  await check('workspace pages contain only authorized tenant IDs and reject foreign cursors', async () => {
    const extra = Array.from({ length: 51 }, (_, index) => ({ id: randomUUID(), name: `Alpha ${index}` }));
    for (const row of extra) await owner.query('INSERT INTO wonffice.workspaces (tenant_id, id, name) VALUES ($1, $2, $3)',
      [alpha, row.id, row.name]);
    const first = await app.inject({ url: workspaceUrl, headers: alice });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().workspaces.length, 50);
    assert.ok(first.json().nextCursor);
    const second = await app.inject({ url: `${workspaceUrl}?after=${first.json().nextCursor}`, headers: alice });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().workspaces.length, 2);
    assert.equal(second.json().nextCursor, null);
    const all = [...first.json().workspaces, ...second.json().workspaces];
    assert.deepEqual(all.map(row => row.id), [workspaceA, ...extra.map(row => row.id)].sort());
    assert.deepEqual(all.map(row => Object.keys(row).sort()), Array(52).fill(['id', 'name']));
    const betaPage = await app.inject({ url: `/v1/tenants/${beta}/workspaces`, headers: bob });
    assert.deepEqual(betaPage.json(), { workspaces: [{ id: workspaceB, name: 'Beta workspace' }], nextCursor: null });
    for (const after of [workspaceB, randomUUID()]) {
      const invalid = await app.inject({ url: `${workspaceUrl}?after=${after}`, headers: alice });
      assert.equal(invalid.statusCode, 400, invalid.body);
      assert.deepEqual(invalid.json(), { status: 'invalid_cursor' });
    }
  });
  await check('workspace database outage is 503, not an empty list', async () => {
    const unavailablePool = new pg.Pool({ ...config('wonffice_app', 'missing_database'), connectionTimeoutMillis: 500 });
    const unavailableMemberships = new MembershipStore(unavailablePool);
    const unavailable = createApiServer({ verifier: createOidcVerifier(authConfig),
      memberships: unavailableMemberships, workspaces: unavailableMemberships });
    try {
      const response = await unavailable.inject({ url: workspaceUrl, headers: alice });
      assert.equal(response.statusCode, 503, response.body);
      assert.deepEqual(response.json(), { status: 'service_unavailable' });
    } finally { await unavailable.close(); await unavailablePool.end(); }
  });
  const file = text => JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', attributes: { title: 'Plan', pageId: 'source-page' },
      content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text }] }] } });
  const create = { workspaceId: workspaceA, product: 'note', title: 'Plan',
    fileFormat: 'barocss-note', fileVersion: 1, importMode: 'new-page-copy',
    snapshotText: file('first'), idempotencyKey: 'create-http-one' };
  const post = (url, headers, payload) => app.inject({ method: 'POST', url, headers, payload });
  let documentId, documentKey, collaborativeId, collaborativeKey;
  await check('signed OIDC token and active membership gate every document route', async () => {
    assert.equal((await app.inject(docUrl)).statusCode, 401);
    assert.equal((await app.inject({ url: docUrl,
      headers: { authorization: `Bearer ${await token('alice', Math.floor(Date.now() / 1000) - 30)}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: `/v1/tenants/${beta}/documents`, headers: alice })).statusCode, 403);
    assert.equal((await post(`/v1/tenants/${beta}/documents`, bob,
      { ...create, workspaceId: workspaceB, idempotencyKey: 'viewer-attempt' })).statusCode, 403);
  });
  await check('create/retry/receipt/list/open are coherent across two authenticated users', async () => {
    const first = await post(docUrl, alice, create);
    assert.equal(first.statusCode, 201, first.body);
    documentId = first.json().document.documentId;
    documentKey = first.json().document.documentKey;
    assert.equal((await post(docUrl, alice, create)).json().document.documentId, documentId);
    assert.equal((await app.inject({ url: `/v1/tenants/${alpha}/receipts/create/create-http-one`,
      headers: alice })).json().document.documentId, documentId);
    assert.equal((await app.inject({ url: docUrl, headers: bob })).json().documents
      .some(row => row.documentId === documentId), true);
    const open = await app.inject({ url: `${docUrl}/${documentId}`, headers: bob });
    assert.equal(open.statusCode, 200, open.body);
    assert.equal(open.json().document.documentKey, documentKey);
    assert.equal(first.json().snapshotText, open.json().snapshotText);
    assert.notEqual(JSON.parse(open.json().snapshotText).document.attributes.pageId, 'source-page');
    assert.equal((await app.inject({ url: `/v1/tenants/${beta}/documents/${documentId}`,
      headers: bob })).statusCode, 404);
    assert.equal((await app.inject({ url: `${docUrl}/${randomUUID()}`, headers: alice })).statusCode, 404);
    const different = await post(docUrl, alice, { ...create, snapshotText: file('changed') });
    assert.equal(different.statusCode, 409);
    assert.deepEqual(different.json(), { status: 'key_reuse' });
  });
  await check('signature-valid tokens without a current session cannot dispatch collaboration or reconciliation', async () => {
    const initial = await post(docUrl, alice, { ...create, idempotencyKey: 'session-denied-http-document' });
    const id = initial.json().document.documentId;
    const path = `${docUrl}/${id}/collaboration`;
    const verifier = createOidcVerifier(authConfig);
    const noSession = await token('alice');
    const revoked = await token('alice', Math.floor(Date.now() / 1000) + 300, 'revoked-session');
    for (const value of [noSession, revoked]) {
      assert.deepEqual(await verifier.verify(value), { issuer, subject: 'alice' });
    }
    const before = providerSeeds.size;
    for (const [suffix, payload] of [['', { expectedRevision: 1, idempotencyKey: 'denied-session-seed' }],
      ['/reconcile', {}]]) for (const [value, status] of [[noSession, 401], [revoked, 403],
      [await token('alice', Math.floor(Date.now() / 1000) - 30, 'alice-session'), 401]]) {
      const response = await post(path + suffix, { authorization: `Bearer ${value}` }, payload);
      assert.equal(response.statusCode, status, response.body);
    }
    assert.equal(providerSeeds.size, before);
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.document_collaboration_seeds
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, id])).rows[0].count, 0);
  });
  await check('protected collaboration request freezes the snapshot and preserves key across API restart', async () => {
    const initial = await post(docUrl, alice, { ...create, idempotencyKey: 'seed-http-document' });
    assert.equal(initial.statusCode, 201, initial.body);
    const id = initial.json().document.documentId;
    collaborativeId = id;
    const path = `${docUrl}/${id}/collaboration`;
    const payload = { expectedRevision: 1, idempotencyKey: 'seed-http-one' };
    assert.equal((await post(path, {}, payload)).statusCode, 401);
    assert.equal((await post(`/v1/tenants/${beta}/documents/${id}/collaboration`, bob,
      payload)).statusCode, 403);
    const seeded = await post(path, alice, payload);
    assert.equal(seeded.statusCode, 200, seeded.body);
    assert.equal(seeded.json().documentKey, initial.json().document.documentKey);
    collaborativeKey = seeded.json().documentKey;
    assert.equal((await app.inject({ url: `${docUrl}/${id}`, headers: bob })).json().snapshotText, undefined);
    assert.equal((await app.inject({ method: 'PUT', url: `${docUrl}/${id}/snapshot`, headers: alice,
      payload: { expectedRevision: 1, idempotencyKey: 'old-http-snapshot',
        snapshotText: initial.json().snapshotText } })).statusCode, 409);
    await app.close();
    app = createApiServer(dependencies());
    const reopened = await app.inject({ url: `${docUrl}/${id}`, headers: alice });
    assert.equal(reopened.statusCode, 200, reopened.body);
    assert.equal(reopened.json().document.documentKey, seeded.json().documentKey);
    assert.equal(reopened.json().document.mode, 'collaborative');
    const confirmation = await new CollaborationStore(pool, 'synthetic-project', 'synthetic-build')
      .resolve({ issuer, subject: 'alice' }, seeded.json().documentKey, 'read');
    assert.equal(confirmation.providerCheckpoint, 'synthetic-checkpoint-1');
    assert.match(confirmation.providerSnapshotHash, /^[0-9a-f]{64}$/);
    assert.notEqual(confirmation.providerSnapshotHash, initial.json().document.snapshotHash);
  });
  await check('real loopback API issues a session-bound capability and local Yorkie callback rechecks it', async () => {
    const sessionHeader = { authorization: `Bearer ${await token('alice',
      Math.floor(Date.now() / 1000) + 300, 'alice-session')}` };
    let httpApp = createApiServer(dependencies());
    try {
      await httpApp.listen({ host: '127.0.0.1', port: 0 });
      let port = httpApp.server.address().port;
      const issue = () => fetch(`http://127.0.0.1:${port}/v1/tenants/${alpha}/documents/${collaborativeId}/capabilities`, {
        method: 'POST', headers: { ...sessionHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ access: 'rw' }),
      });
      const issuedResponse = await issue();
      assert.equal(issuedResponse.status, 201);
      const issued = await issuedResponse.json();
      assert.equal(issued.documentKey, collaborativeKey);
      assert.equal(issued.access, 'rw');
      assert.equal(typeof issued.token, 'string');
      const callback = (body, caller = 'local-only') => fetch(`http://127.0.0.1:${port}/internal/yorkie/auth`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-synthetic-caller': caller },
        body: JSON.stringify(body),
      });
      const watch = { token: issued.token, method: 'Watch',
        attributes: [{ key: collaborativeKey, verb: 'r' }] };
      assert.equal((await callback(watch)).status, 200);
      assert.equal((await callback(watch, 'untrusted')).status, 401);
      assert.equal((await callback({ ...watch, token: 'forged' })).status, 401);
      assert.equal((await callback({ ...watch, attributes: [{ key: documentKey, verb: 'r' }] })).status, 403);
      await httpApp.close();
      httpApp = createApiServer(dependencies());
      await httpApp.listen({ host: '127.0.0.1', port: 0 });
      port = httpApp.server.address().port;
      assert.equal((await callback(watch)).status, 200);
      currentSessions.delete('alice-session');
      assert.equal((await callback(watch)).status, 403);
      assert.equal((await issue()).status, 403);
    } finally {
      currentSessions.add('alice-session');
      await httpApp.close();
    }
  });
  await check('signed writer reconciles an uncertain seed without a second provider write', async () => {
    const initial = await post(docUrl, alice, { ...create, idempotencyKey: 'uncertain-http-document' });
    assert.equal(initial.statusCode, 201, initial.body);
    const id = initial.json().document.documentId;
    const path = `${docUrl}/${id}/collaboration`;
    failNextSeed = true;
    allowInspection = false;
    const payload = { expectedRevision: 1, idempotencyKey: 'uncertain-http-seed' };
    assert.equal((await post(path, alice, payload)).statusCode, 503);
    const pending = await app.inject({ url: `${docUrl}/${id}`, headers: alice });
    assert.equal(pending.json().document.mode, 'initializing');
    assert.equal(pending.json().transitionStatus, 'uncertain');
    assert.equal(pending.json().snapshotText, undefined);
    const retry = await post(path, alice, payload);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().transitionStatus, 'uncertain');
    assert.equal((await post(`${path}/reconcile`, {}, {})).statusCode, 401);
    assert.equal((await post(`/v1/tenants/${beta}/documents/${id}/collaboration/reconcile`, bob, {})).statusCode, 403);
    assert.equal((await post(`${path}/reconcile`, alice, {})).statusCode, 409);
    allowInspection = true;
    await app.close();
    app = createApiServer(dependencies());
    currentSessions.delete('alice-session');
    assert.equal((await post(`${path}/reconcile`, alice, {})).statusCode, 403);
    const recovered = await post(`${path}/reconcile`, bob, {});
    currentSessions.add('alice-session');
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.equal(recovered.json().mode, 'collaborative');
    assert.equal(providerSeeds.size, 2);
  });
  await check('signed operator grant never opens tenant documents and every denied probe is audited', async () => {
    const operator = { authorization: `Bearer ${await token('operator')}` };
    const unknown = { authorization: `Bearer ${await token('unknown-operator')}` };
    const forbidden = async (url, headers) => {
      const response = await app.inject({ url, headers });
      assert.equal(response.statusCode, 403, response.body);
      assert.deepEqual(response.json(), { status: 'forbidden' });
    };
    await forbidden('/v1/operator/access', unknown);
    await forbidden('/v1/operator/tenants', unknown);
    await forbidden('/v1/operator/status', unknown);
    await forbidden('/v1/operator/access', alice);
    const grant = { action: 'grant', issuer, subject: 'operator',
      actorRef: 'LOCAL-API-TEST', approvalRef: 'LOCAL-API-OPERATOR-GRANT' };
    assert.deepEqual(await applyPlatformOperatorChange(owner, grant), { applied: true });
    const access = await app.inject({ url: '/v1/operator/access', headers: operator });
    assert.equal(access.statusCode, 200);
    assert.deepEqual(access.json(), { operator: true });
    const tenants = await app.inject({ url: '/v1/operator/tenants', headers: operator });
    assert.equal(tenants.statusCode, 200);
    assert.deepEqual(tenants.json().tenants.map(row => row.tenantId).sort(), [alpha, beta].sort());
    assert.equal(tenants.body.includes(documentId), false);
    assert.equal(tenants.body.includes(documentKey), false);
    const status = await app.inject({ url: '/v1/operator/status', headers: operator });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.json().ready, { httpStatus: 503, status: 'service_not_configured' });
    await forbidden(`${docUrl}/${documentId}`, operator);
    await forbidden(docUrl, operator);
    const open = (await app.inject({ url: `${docUrl}/${documentId}`, headers: alice })).json();
    const write = await app.inject({ method: 'PUT', url: `${docUrl}/${documentId}/snapshot`,
      headers: operator, payload: { expectedRevision: 1,
        snapshotText: file('operator-write').replace('source-page', open.document.pageId),
        idempotencyKey: 'operator-write' } });
    assert.equal(write.statusCode, 403, write.body);
    assert.deepEqual(write.json(), { status: 'forbidden' });
    const createAsOperator = await post(docUrl, operator,
      { ...create, idempotencyKey: 'operator-create' });
    assert.equal(createAsOperator.statusCode, 403, createAsOperator.body);
    assert.deepEqual(createAsOperator.json(), { status: 'forbidden' });
    const reads = await owner.query(`SELECT identity_id, subject, operation, outcome
      FROM wonffice.platform_operator_reads WHERE subject = 'unknown-operator' ORDER BY operation`);
    assert.deepEqual(reads.rows, ['access', 'status', 'tenants'].map(operation => ({
      identity_id: null, subject: 'unknown-operator', operation, outcome: 'forbidden',
    })));
    assert.deepEqual(await applyPlatformOperatorChange(owner,
      { ...grant, action: 'revoke', approvalRef: 'LOCAL-API-OPERATOR-REVOKE' }), { applied: true });
    await forbidden('/v1/operator/access', operator);
    await forbidden('/v1/operator/tenants', operator);
  });
  await check('snapshot revision, metadata revision and revoked membership reject writes', async () => {
    const initial = (await app.inject({ url: `${docUrl}/${documentId}`, headers: alice })).json();
    const update = await app.inject({ method: 'PUT', url: `${docUrl}/${documentId}/snapshot`, headers: alice,
      payload: { expectedRevision: 1, snapshotText: file('changed').replace('source-page',
        initial.document.pageId), idempotencyKey: 'update-http-one' } });
    assert.equal(update.statusCode, 200, update.body);
    assert.equal(update.json().document.revision, 2);
    const conflict = await app.inject({ method: 'PUT', url: `${docUrl}/${documentId}/snapshot`, headers: bob,
      payload: { expectedRevision: 1, snapshotText: file('late').replace('source-page',
        initial.document.pageId), idempotencyKey: 'update-http-late' } });
    assert.equal(conflict.statusCode, 409);
    const rename = await app.inject({ method: 'PATCH', url: `${docUrl}/${documentId}/metadata`, headers: alice,
      payload: { expectedMetadataRevision: 1, title: 'Revised', idempotencyKey: 'rename-http-one' } });
    assert.equal(rename.statusCode, 200, rename.body);
    assert.equal(rename.json().document.metadataRevision, 2);
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at = now() WHERE tenant_id = $1 AND identity_id = $2',
      [alpha, bobId]);
    assert.equal((await app.inject({ url: `${docUrl}/${documentId}`, headers: bob })).statusCode, 403);
    assert.equal((await app.inject({ url: workspaceUrl, headers: bob })).statusCode, 403);
    assert.equal((await app.inject({ url: `${docUrl}/${documentId}`, headers: alice })).statusCode, 200);
  });
  await check('new API process objects reopen the same PostgreSQL document/key', async () => {
    await app.close();
    app = createApiServer(dependencies());
    const result = await app.inject({ url: `${docUrl}/${documentId}`, headers: alice });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().document.documentKey, documentKey);
    assert.equal(result.json().document.title, 'Revised');
    assert.equal(result.json().document.revision, 2);
  });
  await check('current company roles gate member changes and survive API restart', async () => {
    const alphaOwnerId = randomUUID(), alphaAdminId = randomUUID(), betaOwnerId = randomUUID();
    await owner.query(`INSERT INTO wonffice.identities (id, issuer, subject)
      VALUES ($1, $2, 'alpha-owner'), ($3, $2, 'alpha-admin'), ($4, $2, 'beta-owner')`,
    [alphaOwnerId, issuer, alphaAdminId, betaOwnerId]);
    await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
      VALUES ($1, $2, 'owner'), ($1, $3, 'admin'), ($4, $5, 'owner')`,
    [alpha, alphaOwnerId, alphaAdminId, beta, betaOwnerId]);
    const alphaOwner = { authorization: `Bearer ${await token('alpha-owner')}` };
    const alphaAdmin = { authorization: `Bearer ${await token('alpha-admin')}` };
    const betaOwner = { authorization: `Bearer ${await token('beta-owner')}` };
    const unknown = { authorization: `Bearer ${await token('unknown-member')}` };
    const membersUrl = `/v1/tenants/${alpha}/members`;
    const get = (url, headers) => app.inject({ url, headers });
    const patch = (memberId, headers, role) => app.inject({ method: 'PATCH',
      url: `${membersUrl}/${memberId}`, headers, payload: { role } });
    assert.equal((await app.inject(membersUrl)).statusCode, 401);
    assert.equal((await get(membersUrl, alice)).statusCode, 403);
    assert.equal((await get(membersUrl, bob)).statusCode, 403);
    assert.equal((await get(membersUrl, unknown)).statusCode, 403);
    assert.equal((await get(`/v1/tenants/${beta}/members`, alphaOwner)).statusCode, 403);
    assert.equal((await get(`/v1/tenants/${beta}/members`, betaOwner)).statusCode, 200);
    const list = await get(membersUrl, alphaOwner);
    assert.equal(list.statusCode, 200, list.body);
    assert.equal(list.json().members.some(row => row.memberId === aliceId && row.role === 'editor'), true);
    assert.equal(list.body.includes('alpha-owner'), false);
    assert.equal(list.body.includes(issuer), false);
    assert.equal((await get(membersUrl, alphaAdmin)).statusCode, 200);
    assert.equal((await patch(aliceId, alphaOwner, 'viewer')).statusCode, 200);
    assert.deepEqual((await get(`/v1/tenants/${alpha}/access`, alice)).json(),
      { tenantId: alpha, role: 'viewer' });
    assert.equal((await patch(aliceId, alphaAdmin, 'editor')).statusCode, 200);
    assert.equal((await patch(alphaOwnerId, alphaAdmin, 'viewer')).statusCode, 403);
    assert.equal((await patch(alphaAdminId, alphaOwner, 'viewer')).statusCode, 403);
    assert.equal((await patch(aliceId, alphaOwner, 'owner')).statusCode, 400);
    assert.equal((await patch(aliceId, unknown, 'viewer')).statusCode, 403);
    const revoke = await app.inject({ method: 'DELETE', url: `${membersUrl}/${aliceId}`,
      headers: alphaOwner });
    assert.equal(revoke.statusCode, 200, revoke.body);
    assert.equal((await get(`/v1/tenants/${alpha}/access`, alice)).statusCode, 403);
    assert.equal((await get(workspaceUrl, alice)).statusCode, 403);
    assert.equal((await get(`${docUrl}/${documentId}`, alice)).statusCode, 403);
    await app.close();
    app = createApiServer(dependencies());
    assert.equal((await get(membersUrl, alphaAdmin)).statusCode, 200);
    assert.equal((await get(`/v1/tenants/${alpha}/access`, alice)).statusCode, 403);
    const audit = await owner.query(`SELECT action, outcome FROM wonffice.company_member_admin_events
      WHERE tenant_id = $1`, [alpha]);
    assert.ok(audit.rows.some(row => row.action === 'revoke' && row.outcome === 'applied'));
  });
} finally {
  if (app) await app.close();
  if (jwks) await new Promise(resolve => jwks.close(resolve));
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
