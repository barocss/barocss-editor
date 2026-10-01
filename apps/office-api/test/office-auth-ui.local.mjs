import { execFileSync, fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, constants, fstatSync, lstatSync, openSync,
  readFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
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
// Opt-in controls never use the product HTTP API or the shared PostgreSQL server.
const controlFile = process.env.OFFICE_AUTH_CONTROL_FILE;
let controlFd;
if (controlFile) {
  const parent = lstatSync(dirname(controlFile));
  const repository = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
  const location = relative(repository, realpathSync(controlFile));
  if (!isAbsolute(controlFile) || !parent.isDirectory() || parent.isSymbolicLink() ||
    parent.uid !== process.getuid() || (parent.mode & 0o777) !== 0o700 ||
    (!location.startsWith('..' + '/') && location !== '..' && !isAbsolute(location))) {
    throw new Error('unsafe_local_control_file');
  }
  controlFd = openSync(controlFile, constants.O_RDWR | constants.O_NOFOLLOW);
  const held = fstatSync(controlFd);
  if (!held.isFile() || held.uid !== process.getuid() || (held.mode & 0o777) !== 0o600 || held.size !== 0) {
    closeSync(controlFd);
    throw new Error('unsafe_local_control_file');
  }
}
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
let apiChild;
let controlServer;
const controlConnections = new Set();
let commandQueue = Promise.resolve();
const databaseGeneration = randomUUID();
let alpha, beta, alphaWorkspace, betaWorkspace, alice, bob;
async function startApi() {
  if (!controlFile) {
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
    return;
  }
  if (apiChild && apiChild.exitCode === null && apiChild.signalCode === null) return;
  const child = fork(fileURLToPath(new URL('./office-auth-ui.api-child.mjs', import.meta.url)), [],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  apiChild = child;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('local_api_start_timeout')); }, 15000);
    const fail = () => { clearTimeout(timeout); reject(new Error('local_api_start_failed')); };
    child.once('error', fail);
    child.once('exit', fail);
    child.once('message', message => {
      clearTimeout(timeout);
      child.removeListener('exit', fail);
      if (message.ready) resolve();
      else reject(new Error('local_api_start_failed'));
    });
    child.send({ database: config('wonffice_app'), issuer: fixture.issuer, audience: fixture.audience, port });
  });
}
async function stopApi() {
  const child = apiChild;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); }, 5000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
  });
}
async function ownerQuery(sql, values = []) {
  if (!started) throw new Error('local_database_stopped');
  const connection = new pg.Client({ ...config('wonffice_owner'), connectionTimeoutMillis: 2000, query_timeout: 4000 });
  await connection.connect();
  try { return await connection.query(sql, values); }
  finally { await connection.end(); }
}
const status = () => ({ databaseGeneration, databaseRunning: started,
  postgresPid: started ? Number(readFileSync(join(data, 'postmaster.pid'), 'utf8').split('\n')[0]) : null,
  databaseIdentity: databaseIdentity(),
  supervisorPid: process.pid, apiPid: apiChild?.pid ?? null,
  apiRunning: !!apiChild && apiChild.exitCode === null && apiChild.signalCode === null,
  tenantId: alpha, workspaceId: alphaWorkspace, betaTenantId: beta, betaWorkspaceId: betaWorkspace });
async function control(command) {
  if (closing || !command || typeof command !== 'object' || Array.isArray(command)) throw new Error('invalid_local_command');
  const allowed = command.action === 'inspect' ? ['action', 'documentId', 'operation', 'idempotencyKey', 'actor', 'tenant']
    : command.action === 'beta-role' ? ['action', 'role'] : command.action === 'beta-active' ? ['action', 'active'] : ['action'];
  if (Object.keys(command).some(key => !allowed.includes(key))) throw new Error('invalid_local_command');
  switch (command.action) {
    case 'status': return status();
    case 'api-stop': await stopApi(); return status();
    case 'api-start': await startApi(); return status();
    case 'db-stop':
      if (owner) { await owner.end(); owner = undefined; }
      if (admin) { await admin.end(); admin = undefined; }
      if (started) { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false; }
      return status();
    case 'db-start':
      if (!started) { run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true; }
      return status();
    case 'beta-role': {
      if (!['editor', 'viewer'].includes(command.role)) throw new Error('invalid_local_role');
      const changed = await ownerQuery('UPDATE wonffice.tenant_memberships SET role=$3 WHERE tenant_id=$1 AND identity_id=$2 RETURNING role',
        [alpha, bob, command.role]);
      if (changed.rowCount !== 1) throw new Error('local_membership_missing');
      return { ...status(), actor: 'beta-viewer', role: changed.rows[0].role };
    }
    case 'beta-active': {
      if (typeof command.active !== 'boolean') throw new Error('invalid_local_membership');
      const changed = await ownerQuery('UPDATE wonffice.tenant_memberships SET revoked_at=CASE WHEN $3 THEN NULL ELSE now() END WHERE tenant_id=$1 AND identity_id=$2 RETURNING revoked_at',
        [alpha, bob, command.active]);
      if (changed.rowCount !== 1) throw new Error('local_membership_missing');
      return { ...status(), actor: 'beta-viewer', active: changed.rows[0].revoked_at === null };
    }
    case 'inspect': {
      if (command.tenant !== undefined && !['alpha', 'beta'].includes(command.tenant)) throw new Error('invalid_local_tenant');
      const inspectedTenant = command.tenant === 'beta' ? beta : alpha;
      const inspectedWorkspace = command.tenant === 'beta' ? betaWorkspace : alphaWorkspace;
      if (command.documentId !== undefined && (typeof command.documentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.documentId))) throw new Error('invalid_local_document');
      if (command.actor !== undefined && !['alpha-editor', 'beta-viewer'].includes(command.actor)) throw new Error('invalid_local_actor');
      if (command.idempotencyKey !== undefined && (!['create', 'update'].includes(command.operation) ||
        typeof command.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(command.idempotencyKey))) throw new Error('invalid_local_receipt');
      const counts = await ownerQuery(`SELECT
        (SELECT count(*)::integer FROM wonffice.documents WHERE tenant_id=$1 AND product='note') AS "documentCount",
        (SELECT count(*)::integer FROM wonffice.document_receipts WHERE tenant_id=$1) AS "receiptCount"`, [inspectedTenant]);
      const documents = command.documentId ? await ownerQuery(`SELECT d.id AS "documentId", d.page_id AS "pageId", d.title, d.product, d.tenant_id AS "tenantId", d.workspace_id AS "workspaceId", d.metadata_revision AS "metadataRevision", d.mode,
        s.revision, s.snapshot_hash AS "snapshotHash", s.snapshot_text AS "snapshotText"
        FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id
        WHERE d.tenant_id=$1 AND d.workspace_id=$2 AND d.product='note' AND d.id=$3`, [inspectedTenant, inspectedWorkspace, command.documentId]) : null;
      const receipts = command.idempotencyKey ? await ownerQuery(`SELECT operation, idempotency_key AS "idempotencyKey",
        request_hash AS "requestHash", document_id AS "documentId", result_head AS "document", result_snapshot_text AS "snapshotText"
        FROM wonffice.document_receipts WHERE tenant_id=$1 AND identity_id=$2 AND operation=$3 AND idempotency_key=$4`,
      [inspectedTenant, command.actor === 'beta-viewer' ? bob : alice, command.operation, command.idempotencyKey]) : null;
      const document = documents?.rows[0] ?? null;
      if (document) {
        document.canonicalTree = JSON.parse(document.snapshotText).document;
        document.canonicalTreeHash = createHash('sha256').update(JSON.stringify(document.canonicalTree)).digest('hex');
      }
      return { ...status(), ...counts.rows[0], document, receipt: receipts?.rows[0] ?? null };
    }
    default: throw new Error('invalid_local_command');
  }
}
async function startControl() {
  const socketPath = join(directory, 'control.sock');
  controlServer = createServer(connection => {
    controlConnections.add(connection);
    connection.once('close', () => controlConnections.delete(connection));
    connection.setTimeout(15000, () => connection.destroy());
    let input = '';
    connection.on('error', () => {});
    connection.on('data', chunk => {
      input += chunk.toString('utf8');
      if (input.length > 8192) { connection.destroy(); return; }
      if (!input.includes('\n')) return;
      connection.removeAllListeners('data');
      commandQueue = commandQueue.then(async () => {
        try { connection.end(JSON.stringify({ ok: true, result: await control(JSON.parse(input)) }) + '\n'); }
        catch (error) { connection.end(JSON.stringify({ ok: false, error: error instanceof Error && error.message.startsWith('invalid_local_') ? error.message : 'local_control_failed' }) + '\n'); }
      });
    });
  });
  await new Promise((resolve, reject) => {
    controlServer.once('error', reject);
    controlServer.listen(socketPath, resolve);
  });
  chmodSync(socketPath, 0o600);
  writeFileSync(controlFd, JSON.stringify({ socketPath, supervisorPid: process.pid, databaseGeneration }) + '\n');
}
async function close() {
  if (closing) return;
  closing = true;
  try {
    for (const connection of controlConnections) connection.destroy();
    if (controlServer) await new Promise(resolve => controlServer.close(resolve));
    await commandQueue;
    await stopApi();
    if (app) await app.close();
  } finally {
    if (pool) await pool.end();
    if (owner) await owner.end();
    if (admin) await admin.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
    if (controlFd !== undefined) closeSync(controlFd);
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
  alpha = randomUUID(); beta = randomUUID();
  alphaWorkspace = randomUUID(); betaWorkspace = randomUUID();
  alice = randomUUID(); bob = randomUUID();
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
  await startApi();
  if (controlFile) await startControl();
  console.log(JSON.stringify({ event: 'office_auth_ui_local_api_ready', port }));
} catch (error) {
  await close();
  throw error;
}

function databaseIdentity() {
  const identifier = run('pg_controldata', ['-D', data]).match(/Database system identifier:\s*(\d+)/)?.[1];
  if (!identifier) throw new Error('private_database_identity_unconfirmed');
  return createHash('sha256').update(identifier).digest('hex');
}
