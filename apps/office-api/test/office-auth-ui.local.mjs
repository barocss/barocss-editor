import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../../office-service/dist/migrate.js';
import { MembershipStore } from '../../office-service/dist/membership-store.js';
import { DocumentStore } from '../../office-service/dist/document-store.js';
import { PlatformOperatorStore } from '../../office-service/dist/platform-operator-store.js';
import { CompanyMemberStore } from '../../office-service/dist/company-member-store.js';
import { applyPlatformOperatorChange } from '../../office-service/dist/platform-operator-admin.js';
import { createApiServer } from '../dist/server.js';
import { createOidcVerifier } from '../dist/oidc.js';
import { readAuthConfig } from '../dist/auth-config.js';

// Playwright starts this server only for the local real-IdP Office check.
// Keycloak accounts are read-only; all grants and tenant data live in a new
// private PostgreSQL cluster that is removed when the test ends.
const fixturePath = process.env.OFFICE_AUTH_REAL_FILE;
if (!fixturePath || statSync(fixturePath).mode & 0o077) throw new Error('unsafe_synthetic_oidc_fixture');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+\/realms\/wonffice-local$/.test(fixture.issuer) ||
  fixture.clientId !== 'wonffice-browser' || fixture.audience !== 'wonffice-api' ||
  !fixture.users['alpha-editor']?.id || !fixture.users['beta-viewer']?.id) {
  throw new Error('unexpected_synthetic_oidc_fixture');
}
const port = Number(process.env.OFFICE_AUTH_API_PORT ?? '14101');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_local_api_port');
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-office-auth-ui-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = user => ({ host: socket, port: 5432, user, database: 'office_test' });
let started = false;
let app;
let pool;
let owner;
let admin;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { if (app) await app.close(); } finally {
    if (pool) await pool.end();
    if (owner) await owner.end();
    if (admin) await admin.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
}
process.on('SIGTERM', () => { void close().then(() => process.exit(0)); });
process.on('SIGINT', () => { void close().then(() => process.exit(0)); });

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
  const alpha = randomUUID(), beta = randomUUID();
  const alphaWorkspace = randomUUID(), betaWorkspace = randomUUID();
  const alice = randomUUID(), bob = randomUUID();
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)',
    [alpha, 'Synthetic Alpha', beta, 'Synthetic Beta']);
  await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3), ($4, $2, $5)',
    [alice, fixture.issuer, fixture.users['alpha-editor'].id, bob, fixture.users['beta-viewer'].id]);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'owner'), ($1, $3, 'viewer'), ($4, $3, 'owner')`,
  [alpha, alice, bob, beta]);
  await owner.query(`INSERT INTO wonffice.workspaces (tenant_id, id, name)
    VALUES ($1, $2, 'Alpha workspace'), ($3, $4, 'Beta workspace')`,
  [alpha, alphaWorkspace, beta, betaWorkspace]);
  await applyPlatformOperatorChange(owner, { action: 'grant', issuer: fixture.issuer,
    subject: fixture.users['alpha-editor'].id, actorRef: 'synthetic-test',
    approvalRef: 'synthetic-office-auth-ui-369' });
  pool = new pg.Pool({ ...config('wonffice_app'), max: 3 });
  const auth = readAuthConfig({ OFFICE_OIDC_ISSUER: fixture.issuer,
    OFFICE_OIDC_JWKS_URL: `${fixture.issuer}/protocol/openid-connect/certs`,
    OFFICE_OIDC_AUDIENCE: fixture.audience, OFFICE_API_DATABASE_URL: 'postgresql://synthetic/unused' });
  if (!auth) throw new Error('synthetic_auth_config_missing');
  app = createApiServer({ verifier: createOidcVerifier(auth),
    memberships: new MembershipStore(pool), workspaces: new MembershipStore(pool),
    documents: new DocumentStore(pool),
    operators: new PlatformOperatorStore(pool), companyMembers: new CompanyMemberStore(pool) });
  await app.listen({ host: '127.0.0.1', port });
  console.log(JSON.stringify({ event: 'office_auth_ui_local_api_ready', port }));
} catch (error) {
  await close();
  throw error;
}
