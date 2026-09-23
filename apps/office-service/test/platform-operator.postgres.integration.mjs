import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { PlatformOperatorStore, PlatformOperatorAccessDeniedError } from '../dist/platform-operator-store.js';
import { applyPlatformOperatorChange } from '../dist/platform-operator-admin.js';
import { MembershipStore, TenantAccessDeniedError } from '../dist/membership-store.js';

// Isolated synthetic cluster. No existing database URL or customer data is used.
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-operator-pg-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [];
const pools = [];
let started = false;
const check = async (name, work) => {
  await work();
  console.log(JSON.stringify({ result: 'passed', check: name }));
};
const connect = async (user, database) => {
  const client = new pg.Client(config(user, database));
  await client.connect();
  clients.push(client);
  return client;
};

try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust',
    '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']);
  started = true;
  const admin = new pg.Client({ host: socket, port: 5432, user: 'wonffice_test_admin', database: 'postgres' });
  await admin.connect(); clients.push(admin);
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  await admin.query('CREATE DATABASE office_restored OWNER wonffice_owner');
  const owner = await connect('wonffice_owner');
  await check('migration adds only platform tables and keeps earlier history', async () => {
    assert.deepEqual(await migrate(owner), [
      '0001_tenant_workspaces', '0002_oidc_memberships', '0003_member_tenant_names',
      '0004_document_snapshots', '0005_platform_operators',
    ]);
    assert.deepEqual(await migrate(owner), []);
  });
  const issuer = 'http://127.0.0.1:18180/realms/wonffice';
  const operator = { issuer, subject: 'operator' };
  const companyOwner = { issuer, subject: 'company-owner' };
  const nonoperator = { issuer, subject: 'nonoperator' };
  const alpha = randomUUID(), beta = randomUUID();
  const ownerId = randomUUID();
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)',
    [alpha, 'Alpha', beta, 'Beta']);
  await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3)',
    [ownerId, issuer, companyOwner.subject]);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'owner')`, [alpha, ownerId]);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 1 }); pools.push(pool);
  const service = new PlatformOperatorStore(pool);
  const memberships = new MembershipStore(pool);
  const grant = { action: 'grant', ...operator, actorRef: 'LOCAL-OPERATOR', approvalRef: 'LOCAL-376-GRANT' };
  await check('owner-only approved grant and atomic audit are replay safe', async () => {
    assert.deepEqual(await applyPlatformOperatorChange(owner, grant), { applied: true });
    assert.deepEqual(await applyPlatformOperatorChange(owner, grant), { applied: false });
    await assert.rejects(applyPlatformOperatorChange(owner, { ...grant, subject: 'wrong' }),
      /platform_operator_approval_conflict/);
    await assert.rejects(applyPlatformOperatorChange(owner, { ...grant, approvalRef: 'LOCAL-376-DUP' }),
      /platform_operator_grant_conflict/);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice.platform_operator_events')).rows[0].count, 1);
    const app = await connect('wonffice_app');
    await assert.rejects(applyPlatformOperatorChange(app, { ...grant, approvalRef: 'LOCAL-376-UNSAFE' }),
      /invalid_platform_operator_admin_role/);
  });
  await check('operator-only access and minimal tenant state are separate from company membership', async () => {
    assert.deepEqual(await service.getAccess(operator), { operator: true });
    assert.deepEqual(await service.listTenantProvisioning(operator), { tenants: [
      { tenantId: alpha, name: 'Alpha', provisioningStatus: 'owner_provisioned' },
      { tenantId: beta, name: 'Beta', provisioningStatus: 'owner_missing' },
    ].sort((a, b) => a.tenantId.localeCompare(b.tenantId)), nextCursor: null });
    await assert.rejects(service.getAccess(companyOwner), PlatformOperatorAccessDeniedError);
    await assert.rejects(service.getAccess(nonoperator), PlatformOperatorAccessDeniedError);
    await assert.rejects(memberships.getTenantAccess(operator, alpha), TenantAccessDeniedError);
    assert.equal((await pool.query('SELECT id FROM wonffice.tenants')).rowCount, 0);
    assert.equal((await pool.query('SELECT identity_id FROM wonffice.platform_operator_grants')).rowCount, 0);
    assert.equal((await pool.query('SELECT * FROM wonffice.operator_tenant_overview(NULL::uuid)')).rowCount, 0);
    assert.equal((await pool.query('SELECT id FROM wonffice.documents')).rowCount, 0);
    await assert.rejects(pool.query('UPDATE wonffice.platform_operator_grants SET revoked_at = NULL'), { code: '42501' });
    await assert.rejects(pool.query(`INSERT INTO wonffice.platform_operator_events
      (id, identity_id, actor_ref, approval_ref, action) VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2, $3)`,
      ['unsafe', 'unsafe', 'grant']), { code: '42501' });
    const reads = await owner.query('SELECT operation, outcome FROM wonffice.platform_operator_reads ORDER BY created_at, id');
    assert.equal(reads.rows.filter(row => row.outcome === 'allowed').length, 2);
    assert.equal(reads.rows.filter(row => row.outcome === 'forbidden').length, 1);
  });
  await check('audit write failure prevents an operator read from succeeding', async () => {
    await owner.query('REVOKE INSERT ON wonffice.platform_operator_reads FROM wonffice_app');
    try {
      await assert.rejects(service.getAccess(operator), { code: '42501' });
    } finally {
      await owner.query('GRANT INSERT ON wonffice.platform_operator_reads TO wonffice_app');
    }
    assert.deepEqual(await service.getAccess(operator), { operator: true });
  });
  await check('revoke denies the same principal on its next request and persists', async () => {
    const revoke = { ...grant, action: 'revoke', approvalRef: 'LOCAL-376-REVOKE' };
    assert.deepEqual(await applyPlatformOperatorChange(owner, revoke), { applied: true });
    await assert.rejects(service.getAccess(operator), PlatformOperatorAccessDeniedError);
    await assert.rejects(service.listTenantProvisioning(operator), PlatformOperatorAccessDeniedError);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice.platform_operator_events')).rows[0].count, 2);
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.platform_operator_reads
      WHERE outcome = 'forbidden'`)).rows[0].count, 3);
  });
  await check('backup restores revoked grant and both audit tables without reviving access', async () => {
    const snapshot = async client => {
      const rows = {};
      for (const table of ['platform_operator_grants', 'platform_operator_events', 'platform_operator_reads']) {
        rows[table] = (await client.query(`SELECT * FROM wonffice.${table} ORDER BY 1`)).rows;
      }
      return rows;
    };
    const before = await snapshot(owner);
    const archive = join(directory, 'operator.dump');
    run('pg_dump', ['-h', socket, '-U', 'wonffice_backup', '-d', 'office_test', '-Fc', '-f', archive]);
    run('pg_restore', ['-h', socket, '-U', 'wonffice_owner', '-d', 'office_restored', '--no-owner',
      '--exit-on-error', '--single-transaction', archive]);
    const restored = await connect('wonffice_owner', 'office_restored');
    assert.deepEqual(await snapshot(restored), before);
    assert.deepEqual(await migrate(restored), []);
    const restoredPool = new pg.Pool({ ...config('wonffice_app', 'office_restored'), max: 1 });
    pools.push(restoredPool);
    const restoredService = new PlatformOperatorStore(restoredPool);
    await assert.rejects(restoredService.getAccess(operator), PlatformOperatorAccessDeniedError);
    assert.equal((await restoredPool.query('SELECT identity_id FROM wonffice.platform_operator_grants')).rowCount, 0);
  });
  await check('database outage never becomes an allowed cached grant', async () => {
    await pool.end(); pools.splice(pools.indexOf(pool), 1);
    await assert.rejects(service.getAccess(operator));
  });
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
