import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { chromium } from 'playwright';
import pg from 'pg';
import { migrate } from '../../office-service/dist/migrate.js';
import { MembershipStore } from '../../office-service/dist/membership-store.js';
import { DocumentStore } from '../../office-service/dist/document-store.js';
import { PlatformOperatorStore } from '../../office-service/dist/platform-operator-store.js';
import { applyPlatformOperatorChange } from '../../office-service/dist/platform-operator-admin.js';
import { createApiServer } from '../dist/server.js';
import { readAuthConfig } from '../dist/auth-config.js';
import { createOidcVerifier } from '../dist/oidc.js';

const fixturePath = process.env.WONFFICE_LOCAL_KEYCLOAK_USERS_FILE;
if (!fixturePath || statSync(fixturePath).mode & 0o077) {
  throw new Error('missing_or_unsafe_synthetic_oidc_fixture');
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+\/realms\/wonffice-local$/.test(fixture.issuer) ||
  fixture.clientId !== 'wonffice-browser' || fixture.audience !== 'wonffice-api' ||
  !fixture.users['alpha-editor']?.id || !fixture.users['beta-viewer']?.id) {
  throw new Error('unexpected_synthetic_oidc_fixture');
}
const redirectUri = 'http://127.0.0.1:18200/callback';
const callbacks = new Map();
const callbackServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', redirectUri);
  const pending = callbacks.get(url.searchParams.get('state'));
  if (url.pathname !== '/callback' || !pending) return response.writeHead(400).end();
  callbacks.delete(url.searchParams.get('state'));
  response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('Complete');
  pending(url.searchParams.get('code'));
});

const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-operator-oidc-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = user => ({ host: socket, port: 5432, user, database: 'office_test' });
let started = false;
let callbackStarted = false;
let browser;
let app;
let pool;
let owner;
let admin;
const contexts = [];

async function login(username) {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  const authorization = new URL(`${fixture.issuer}/protocol/openid-connect/auth`);
  authorization.search = new URLSearchParams({ client_id: fixture.clientId, response_type: 'code',
    scope: 'openid', redirect_uri: redirectUri, code_challenge_method: 'S256',
    code_challenge: challenge, state }).toString();
  const callback = new Promise(resolve => { callbacks.set(state, resolve); });
  await page.goto(authorization.href);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(fixture.users[username].password);
  await page.locator('#kc-login').click();
  if (new URL(page.url()).pathname.endsWith('/login-actions/required-action')) {
    await page.locator('input[name="email"]').fill(`${username}@wonffice.invalid`);
    await page.locator('input[name="firstName"]').fill(username.split('-')[0]);
    await page.locator('input[name="lastName"]').fill('Synthetic');
    await page.locator('input[type="submit"]').click();
  }
  const code = await Promise.race([callback, page.waitForTimeout(10000).then(() => null)]);
  if (!code) throw new Error('synthetic_oidc_authorization_failed');
  const tokenResponse = await fetch(`${fixture.issuer}/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: fixture.clientId,
      redirect_uri: redirectUri, code, code_verifier: verifier }),
  });
  if (!tokenResponse.ok) throw new Error('synthetic_oidc_token_exchange_failed');
  const token = (await tokenResponse.json()).access_token;
  if (typeof token !== 'string') throw new Error('synthetic_oidc_token_missing');
  return token;
}

try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust',
    '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']);
  started = true;
  admin = new pg.Client({ host: socket, port: 5432, user: 'wonffice_test_admin', database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  owner = new pg.Client(config('wonffice_owner'));
  await owner.connect();
  await migrate(owner);
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2)', [tenantId, 'Synthetic Alpha']);
  await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3)',
    [ownerId, fixture.issuer, fixture.users['beta-viewer'].id]);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'owner')`, [tenantId, ownerId]);
  const grant = { action: 'grant', issuer: fixture.issuer, subject: fixture.users['alpha-editor'].id,
    actorRef: 'LOCAL-376-TEST', approvalRef: 'LOCAL-376-TEST-GRANT' };
  await applyPlatformOperatorChange(owner, grant);

  await new Promise((resolve, reject) => {
    callbackServer.once('error', reject);
    callbackServer.listen(18200, '127.0.0.1', resolve);
  });
  callbackStarted = true;
  browser = await chromium.launch({ headless: true });
  pool = new pg.Pool({ ...config('wonffice_app'), max: 3 });
  const authConfig = readAuthConfig({ OFFICE_OIDC_ISSUER: fixture.issuer,
    OFFICE_OIDC_JWKS_URL: `${fixture.issuer}/protocol/openid-connect/certs`,
    OFFICE_OIDC_AUDIENCE: fixture.audience, OFFICE_API_DATABASE_URL: 'postgresql://synthetic/app' });
  assert.ok(authConfig);
  app = createApiServer({ verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool), operators: new PlatformOperatorStore(pool),
    documents: new DocumentStore(pool) });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const apiAddress = new URL(app.server.address() ? `http://127.0.0.1:${app.server.address().port}` : '');

  const operatorToken = await login('alpha-editor');
  const ownerToken = await login('beta-viewer');
  const get = async (token, path, status) => {
    const response = await fetch(new URL(path, apiAddress), {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, status, path);
    return response.json();
  };
  assert.deepEqual((await get(operatorToken, '/v1/me', 200)).tenants, []);
  assert.deepEqual(await get(operatorToken, '/v1/operator/access', 200), { operator: true });
  assert.deepEqual((await get(operatorToken, '/v1/operator/tenants', 200)).tenants,
    [{ tenantId, name: 'Synthetic Alpha', provisioningStatus: 'owner_provisioned' }]);
  assert.deepEqual((await get(operatorToken, '/v1/operator/status', 200)).ready,
    { httpStatus: 503, status: 'service_not_configured' });
  assert.deepEqual(await get(operatorToken, `/v1/tenants/${tenantId}/access`, 403), { status: 'forbidden' });
  assert.deepEqual(await get(operatorToken, `/v1/tenants/${tenantId}/documents`, 403), { status: 'forbidden' });
  assert.deepEqual(await get(ownerToken, '/v1/operator/access', 403), { status: 'forbidden' });
  assert.deepEqual(await get(ownerToken, `/v1/tenants/${tenantId}/access`, 200), { tenantId, role: 'owner' });
  assert.deepEqual(await get('invalid', '/v1/operator/access', 401), { status: 'unauthorized' });

  await applyPlatformOperatorChange(owner, { ...grant, action: 'revoke', approvalRef: 'LOCAL-376-TEST-REVOKE' });
  assert.deepEqual(await get(operatorToken, '/v1/operator/access', 403), { status: 'forbidden' });
  assert.deepEqual(await get(operatorToken, '/v1/operator/tenants', 403), { status: 'forbidden' });
  assert.deepEqual(await get(ownerToken, `/v1/tenants/${tenantId}/access`, 200), { tenantId, role: 'owner' });
  await app.close(); app = null;
  await pool.end(); pool = null;
  await owner.end(); owner = null;
  await admin.end(); admin = null;
  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres-restart.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
  owner = new pg.Client(config('wonffice_owner')); await owner.connect();
  pool = new pg.Pool({ ...config('wonffice_app'), max: 3 });
  app = createApiServer({ verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool), operators: new PlatformOperatorStore(pool),
    documents: new DocumentStore(pool) });
  await app.listen({ host: '127.0.0.1', port: 0 });
  apiAddress.port = String(app.server.address().port);
  assert.deepEqual(await get(operatorToken, '/v1/operator/status', 403), { status: 'forbidden' });
  assert.deepEqual(await get(ownerToken, `/v1/tenants/${tenantId}/access`, 200), { tenantId, role: 'owner' });
  console.log(JSON.stringify({ event: 'platform_operator_oidc_verified', accounts: 2,
    independentContexts: 2, grantRevokedWithSameToken: true, postgresRestarted: true }));
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser?.close();
  await app?.close();
  await pool?.end();
  await owner?.end();
  await admin?.end();
  if (callbackStarted) await new Promise(resolve => callbackServer.close(resolve));
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
