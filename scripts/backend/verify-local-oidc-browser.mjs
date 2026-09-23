import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const userFile = process.env.WONFFICE_LOCAL_KEYCLOAK_USERS_FILE;
const tenantFile = process.env.WONFFICE_LOCAL_TENANTS_FILE;
const apiOrigin = process.env.WONFFICE_LOCAL_API_ORIGIN ?? 'http://127.0.0.1:14100';
const expectedAlphaRole = process.env.WONFFICE_EXPECT_ALPHA_ROLE ?? 'admin';
const revokeFile = process.env.WONFFICE_LOCAL_REVOKE_MANIFEST;
const ownerDatabaseUrl = process.env.OFFICE_MIGRATION_DATABASE_URL;
if (!userFile || !tenantFile || !/^http:\/\/127\.0\.0\.1:\d+$/.test(apiOrigin)) {
  throw new Error('Local verification configuration is incomplete');
}
for (const path of [userFile, tenantFile, revokeFile].filter(Boolean)) {
  if (statSync(path).mode & 0o077) throw new Error('Unsafe local verification file permissions');
}
if (revokeFile && !ownerDatabaseUrl) throw new Error('Owner database URL is required for revocation');

const users = JSON.parse(readFileSync(userFile, 'utf8'));
const tenants = JSON.parse(readFileSync(tenantFile, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+\/realms\/wonffice-local$/.test(users.issuer) ||
  users.clientId !== 'wonffice-browser' || users.audience !== 'wonffice-api') {
  throw new Error('Unexpected local OIDC fixture');
}
const redirectUri = 'http://127.0.0.1:18200/callback';
const callbacks = new Map();
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', redirectUri);
  const pending = callbacks.get(url.searchParams.get('state'));
  if (url.pathname !== '/callback' || !pending) {
    response.writeHead(400).end();
    return;
  }
  callbacks.delete(url.searchParams.get('state'));
  response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('Login complete');
  pending(url.searchParams.get('code'));
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(18200, '127.0.0.1', resolve);
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const login = async username => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(24).toString('base64url');
    const authorization = new URL(`${users.issuer}/protocol/openid-connect/auth`);
    authorization.search = new URLSearchParams({ client_id: users.clientId,
      response_type: 'code', scope: 'openid', redirect_uri: redirectUri,
      code_challenge_method: 'S256', code_challenge: challenge, state }).toString();
    const callback = new Promise(resolve => {
      callbacks.set(state, resolve);
    });
    await page.goto(authorization.href);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(users.users[username].password);
    await page.locator('#kc-login').click();
    if (new URL(page.url()).pathname.endsWith('/login-actions/required-action')) {
      await page.locator('input[name="email"]').fill(`${username}@wonffice.invalid`);
      await page.locator('input[name="firstName"]').fill(username.split('-')[0]);
      await page.locator('input[name="lastName"]').fill('Synthetic');
      await page.locator('input[type="submit"]').click();
    }
    const code = await Promise.race([callback, page.waitForTimeout(10000).then(() => null)]);
    if (!code) {
      const current = new URL(page.url());
      const feedback = await page.locator('#input-error, .kc-feedback-text, .alert-error').allTextContents();
      const fields = await page.locator('input').evaluateAll(inputs => inputs.map(input =>
        ({ name: input.getAttribute('name'), type: input.getAttribute('type') })));
      throw new Error(`OIDC authorization failed at ${current.origin}${current.pathname}: ${feedback.join(' ').trim()} fields=${JSON.stringify(fields)}`);
    }
    const tokenResponse = await fetch(`${users.issuer}/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: users.clientId,
        redirect_uri: redirectUri, code, code_verifier: verifier }),
    });
    if (!tokenResponse.ok) throw new Error(`OIDC token exchange failed (${tokenResponse.status})`);
    const token = (await tokenResponse.json()).access_token;
    if (typeof token !== 'string') throw new Error('OIDC access token missing');
    return { context, token };
  };
  const access = async (token, path, status, role) => {
    const response = await fetch(`${apiOrigin}${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (response.status !== status) throw new Error(`Unexpected API status for ${path}: ${response.status}`);
    const body = await response.json();
    if (role && body.role !== role) throw new Error(`Unexpected role for ${path}`);
    return body;
  };
  const alice = await login('alpha-editor');
  const bob = await login('beta-viewer');
  const aliceMe = await access(alice.token, '/v1/me', 200);
  const bobMe = await access(bob.token, '/v1/me', 200);
  if (aliceMe.tenants.length !== 1 || aliceMe.tenants[0].tenantId !== tenants.alpha ||
    aliceMe.tenants[0].role !== 'owner' || aliceMe.nextCursor !== null) {
    throw new Error('Alice tenant list mismatch');
  }
  const bobTenants = expectedAlphaRole === 'revoked' ? [tenants.beta] : [tenants.alpha, tenants.beta];
  if (bobMe.tenants.length !== bobTenants.length ||
    bobMe.tenants.some(({ tenantId }) => !bobTenants.includes(tenantId)) || bobMe.nextCursor !== null) {
    throw new Error('Bob tenant list mismatch');
  }
  await access(alice.token, `/v1/tenants/${tenants.alpha}/access`, 200, 'owner');
  await access(alice.token, `/v1/tenants/${tenants.beta}/access`, 403);
  await access(bob.token, `/v1/tenants/${tenants.beta}/access`, 200, 'owner');
  await access(bob.token, `/v1/tenants/${tenants.alpha}/access`,
    expectedAlphaRole === 'revoked' ? 403 : 200, expectedAlphaRole === 'revoked' ? undefined : expectedAlphaRole);
  await access('invalid', '/v1/me', 401);
  if (revokeFile) {
    const { spawnSync } = await import('node:child_process');
    const cli = fileURLToPath(new URL('../../apps/office-service/dist/membership-admin-cli.js', import.meta.url));
    const result = spawnSync(process.execPath, [cli], {
      env: { ...process.env, OFFICE_MEMBERSHIP_MANIFEST_PATH: revokeFile },
      encoding: 'utf8', timeout: 15000,
    });
    if (result.status !== 0) throw new Error('Approved membership revocation failed');
    await access(bob.token, `/v1/tenants/${tenants.alpha}/access`, 403);
    const afterRevoke = await access(bob.token, '/v1/me', 200);
    if (afterRevoke.tenants.length !== 1 || afterRevoke.tenants[0].tenantId !== tenants.beta) {
      throw new Error('Revoked membership remained in current tenant list');
    }
    await access(alice.token, `/v1/tenants/${tenants.alpha}/access`, 200, 'owner');
    await access(bob.token, `/v1/tenants/${tenants.beta}/access`, 200, 'owner');
  }
  await alice.context.close();
  await bob.context.close();
  console.log(JSON.stringify({ event: 'local_oidc_browser_verified', accounts: 2,
    independentContexts: 2, crossTenantDenied: true, roleRevocationChecked: Boolean(revokeFile) }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
