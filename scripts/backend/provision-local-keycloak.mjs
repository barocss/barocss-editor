import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.env.WONFFICE_LOCAL_KEYCLOAK_ORIGIN ?? 'http://127.0.0.1:18180';
const adminFile = process.env.WONFFICE_LOCAL_KEYCLOAK_ADMIN_ENV_FILE;
const output = process.env.WONFFICE_LOCAL_KEYCLOAK_OUTPUT;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || !adminFile || !output) {
  throw new Error('Local Keycloak origin, admin file, and output path are required');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
if (resolve(output).startsWith(root) || existsSync(output)) {
  throw new Error('Local Keycloak output must be a new file outside the repository');
}
if (resolve(adminFile).startsWith(root) || statSync(adminFile).mode & 0o077) {
  throw new Error('Local Keycloak admin file must be protected outside the repository');
}
const adminSettings = Object.fromEntries(readFileSync(adminFile, 'utf8').trim().split('\n')
  .map(line => line.split(/=(.*)/s).slice(0, 2)));
const username = adminSettings.KC_BOOTSTRAP_ADMIN_USERNAME;
const password = adminSettings.KC_BOOTSTRAP_ADMIN_PASSWORD;
if (!username || !password) throw new Error('Local Keycloak admin settings are incomplete');

async function response(path, init) {
  const result = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error(`Local Keycloak request failed (${result.status})`);
  return result;
}
const form = new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username, password });
const token = await (await response('/realms/master/protocol/openid-connect/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
})).json();
if (typeof token.access_token !== 'string') throw new Error('Local Keycloak admin token missing');
const headers = { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' };
const post = (path, body) => response(path, { method: 'POST', headers, body: JSON.stringify(body) });

const realm = 'wonffice-local';
await post('/admin/realms', { realm, enabled: true });
await post(`/admin/realms/${realm}/clients`, {
  clientId: 'wonffice-browser', protocol: 'openid-connect', enabled: true,
  publicClient: true, standardFlowEnabled: true, implicitFlowEnabled: false,
  directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
  redirectUris: ['http://127.0.0.1:18200/*'],
  webOrigins: ['http://127.0.0.1:18200'],
  attributes: { 'pkce.code.challenge.method': 'S256' },
  protocolMappers: [{
    name: 'wonffice-api-audience', protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-mapper', consentRequired: false,
    config: {
      'included.client.audience': 'wonffice-api',
      'id.token.claim': 'false', 'access.token.claim': 'true',
    },
  }],
});

const users = {};
for (const name of ['alpha-editor', 'beta-viewer']) {
  const userPassword = randomBytes(32).toString('base64url');
  const created = await post(`/admin/realms/${realm}/users`, {
    username: name, enabled: true, requiredActions: [],
    email: `${name}@wonffice.invalid`, emailVerified: true,
    firstName: name.split('-')[0], lastName: 'Synthetic',
    credentials: [{ type: 'password', value: userPassword, temporary: false }],
  });
  const id = created.headers.get('location')?.split('/').pop();
  if (!id) throw new Error('Local Keycloak user ID missing');
  users[name] = { id, password: userPassword };
}
const details = {
  issuer: `${origin}/realms/${realm}`, clientId: 'wonffice-browser', audience: 'wonffice-api', users,
};
writeFileSync(output, JSON.stringify(details, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ event: 'local_keycloak_ready', realm, users: Object.keys(users) }));
