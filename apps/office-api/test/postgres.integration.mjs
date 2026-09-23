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
  const token = (subject, expiry = Math.floor(Date.now() / 1000) + 300) =>
    new SignJWT({ typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: 'synthetic' })
      .setIssuer(issuer).setAudience('wonffice-api').setSubject(subject)
      .setIssuedAt().setExpirationTime(expiry).sign(keys.privateKey);
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)',
    [alpha, 'Alpha', beta, 'Beta']);
  await owner.query(`INSERT INTO wonffice.workspaces (tenant_id, id, name)
    VALUES ($1, $2, 'Alpha workspace'), ($3, $4, 'Beta workspace')`,
  [alpha, workspaceA, beta, workspaceB]);
  await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3), ($4, $2, $5)',
    [aliceId, issuer, 'alice', bobId, 'bob']);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'editor'), ($1, $3, 'editor'), ($4, $3, 'viewer')`,
  [alpha, aliceId, bobId, beta]);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 3 }); pools.push(pool);
  const dependencies = () => ({ verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool), documents: new DocumentStore(pool) });
  app = createApiServer(dependencies());
  const alice = { authorization: `Bearer ${await token('alice')}` };
  const bob = { authorization: `Bearer ${await token('bob')}` };
  const docUrl = `/v1/tenants/${alpha}/documents`;
  const file = text => JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', attributes: { title: 'Plan', pageId: 'source-page' },
      content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text }] }] } });
  const create = { workspaceId: workspaceA, product: 'note', title: 'Plan',
    fileFormat: 'barocss-note', fileVersion: 1, importMode: 'new-page-copy',
    snapshotText: file('first'), idempotencyKey: 'create-http-one' };
  const post = (url, headers, payload) => app.inject({ method: 'POST', url, headers, payload });
  let documentId, documentKey;
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
} finally {
  if (app) await app.close();
  if (jwks) await new Promise(resolve => jwks.close(resolve));
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
