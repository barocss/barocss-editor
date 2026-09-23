import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.env.WONFFICE_LOCAL_KEYCLOAK_ORIGIN ?? 'http://127.0.0.1:18180';
const adminFile = process.env.WONFFICE_LOCAL_KEYCLOAK_ADMIN_ENV_FILE;
const officePort = process.env.WONFFICE_LOCAL_OFFICE_PORT ?? '5186';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || !adminFile || !['5186', '5191'].includes(officePort)) {
  throw new Error('Local Keycloak origin, admin file, and Office port 5186 or 5191 are required');
}
if (resolve(adminFile).startsWith(root) || statSync(adminFile).mode & 0o077) {
  throw new Error('Local Keycloak admin file must be protected outside the repository');
}

const settings = Object.fromEntries(readFileSync(adminFile, 'utf8').trim().split('\n')
  .map(line => line.split(/=(.*)/s).slice(0, 2)));
const username = settings.KC_BOOTSTRAP_ADMIN_USERNAME;
const password = settings.KC_BOOTSTRAP_ADMIN_PASSWORD;
if (!username || !password) throw new Error('Local Keycloak admin settings are incomplete');

async function request(path, init) {
  const result = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error(`Local Keycloak request failed (${result.status})`);
  return result;
}
const form = new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username, password });
const token = await (await request('/realms/master/protocol/openid-connect/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
})).json();
if (typeof token.access_token !== 'string') throw new Error('Local Keycloak admin token missing');
const headers = { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' };

const clients = await (await request('/admin/realms/wonffice-local/clients?clientId=wonffice-browser', { headers })).json();
const client = Array.isArray(clients) && clients.find(value => value.clientId === 'wonffice-browser');
if (!client?.id || !Array.isArray(client.redirectUris) || !Array.isArray(client.webOrigins)) {
  throw new Error('Local wonffice-browser client is missing or malformed');
}
const webOrigin = `http://127.0.0.1:${officePort}`;
const redirect = `${webOrigin}/auth/callback`;
const logoutRedirect = `${webOrigin}/`;
const redirectUris = [...new Set([...client.redirectUris, redirect])];
const webOrigins = [...new Set([...client.webOrigins, webOrigin])];
const existingLogoutRedirects = client.attributes?.['post.logout.redirect.uris']?.split('##') ?? [];
if (existingLogoutRedirects.some(value => value === '+' || value.includes('*'))) {
  throw new Error('Wildcard post-logout redirects are not allowed for the local Office client');
}
const logoutRedirects = [...new Set([...existingLogoutRedirects, logoutRedirect])].join('##');
await request(`/admin/realms/wonffice-local/clients/${client.id}`, {
  method: 'PUT', headers, body: JSON.stringify({
    ...client, redirectUris, webOrigins,
    attributes: { ...client.attributes, 'post.logout.redirect.uris': logoutRedirects },
  }),
});
console.log(JSON.stringify({ event: 'local_office_oidc_origin_allowed', redirect, webOrigin, logoutRedirect }));
