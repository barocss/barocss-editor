import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { migrations } from '../dist/migrations.js';
import { TenantStore, withTenant } from '../dist/tenant-store.js';

// Always create our own cluster. No DATABASE_URL or existing server is accepted.
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-pg-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const connect = async (user, database) => {
  const client = new pg.Client(config(user, database));
  await client.connect();
  return client;
};
const check = async (name, work) => {
  await work();
  console.log(JSON.stringify({ result: 'passed', check: name }));
};
let started = false;
const clients = [];
const pools = [];
async function connectAndTrack(user) { const c = await connect(user); clients.push(c); return c; }
try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']);
  started = true;
  console.log(JSON.stringify({ postgres: run('postgres', ['--version']).trim(), transport: 'private-unix-socket' }));
  const admin = await connect('wonffice_test_admin', 'postgres'); clients.push(admin);
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  await admin.query('CREATE DATABASE office_restored OWNER wonffice_owner');
  const owner = await connect('wonffice_owner'); clients.push(owner);
  const secondOwner = await connect('wonffice_owner'); clients.push(secondOwner);
  await check('concurrent migration applies exactly once; re-run is empty', async () => {
    const result = await Promise.all([migrate(owner), migrate(secondOwner)]);
    assert.deepEqual(result.flat(), ['0001_tenant_workspaces']);
    assert.deepEqual(await migrate(owner), []);
  });
  await check('failed DDL and migration history roll back together', async () => {
    await assert.rejects(migrate(owner, [...migrations, {
      id: '0002_failure', sql: 'CREATE TABLE wonffice.must_rollback (id integer); SELECT 1 / 0;',
    }]));
    assert.equal((await owner.query("SELECT to_regclass('wonffice.must_rollback') AS name")).rows[0].name, null);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice_meta.migrations')).rows[0].count, 1);
    assert.deepEqual(await migrate(owner), []);
  });
  await check('changed or unknown migration history is rejected', async () => {
    await assert.rejects(migrate(owner, [{ ...migrations[0], sql: migrations[0].sql + '\n' }]), /migration_history_mismatch/);
    await assert.rejects(migrate(owner, []), /migration_history_mismatch/);
  });
  await check('migration CLI runs the same history and hides malformed connection secrets', async () => {
    const url = `postgresql:///office_test?host=${encodeURIComponent(socket)}&user=wonffice_owner`;
    const success = spawnSync(process.execPath, ['dist/migrate-cli.js'], {
      env: { ...process.env, OFFICE_MIGRATION_DATABASE_URL: url }, encoding: 'utf8',
    });
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(JSON.parse(success.stdout), { event: 'migration_complete', applied: [] });
    const failure = spawnSync(process.execPath, ['dist/migrate-cli.js'], {
      env: { ...process.env, OFFICE_MIGRATION_DATABASE_URL: 'postgres://private-value:%ZZ@invalid/' }, encoding: 'utf8',
    });
    assert.equal(failure.status, 1);
    assert.deepEqual(JSON.parse(failure.stderr), { event: 'migration_failed' });
    assert.ok(!failure.stderr.includes('private-value'));
  });
  const alpha = randomUUID(), beta = randomUUID();
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)', [alpha, 'Alpha', beta, 'Beta']);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 1 }); pools.push(pool);
  const store = new TenantStore(pool);
  const a = await store.createWorkspace(alpha, 'Alpha workspace');
  const b = await store.createWorkspace(beta, 'Beta workspace');
  await check('actual app role is not owner, superuser, or BYPASSRLS', async () => {
    const role = (await pool.query(`SELECT current_user AS name, rolsuper, rolbypassrls,
      pg_has_role(current_user, 'wonffice_owner', 'MEMBER') AS owner_member
      FROM pg_roles WHERE rolname = current_user`)).rows[0];
    assert.deepEqual(role, { name: 'wonffice_app', rolsuper: false, rolbypassrls: false, owner_member: false });
    await assert.rejects(pool.query('SELECT * FROM wonffice_meta.migrations'), { code: '42501' });
    await assert.rejects(pool.query('TRUNCATE wonffice.workspaces'), { code: '42501' });
    await assert.rejects(pool.query('SET ROLE wonffice_owner'), { code: '42501' });
    await assert.rejects(pool.query('SET ROLE wonffice_backup'), { code: '42501' });
    await assert.rejects(migrate(await connectAndTrack('wonffice_app')), /invalid_migration_role/);
  });
  await check('no context reads nothing and cannot insert', async () => {
    assert.equal((await pool.query('SELECT id FROM wonffice.workspaces')).rowCount, 0);
    await assert.rejects(pool.query('INSERT INTO wonffice.workspaces (tenant_id, id, name) VALUES ($1, $2, $3)',
      [alpha, randomUUID(), 'rejected']), { code: '42501' });
  });
  await check('RLS blocks cross-tenant reads, updates, deletes and inserts', async () => {
    await withTenant(pool, alpha, async client => {
      assert.deepEqual((await client.query('SELECT id FROM wonffice.workspaces')).rows, [{ id: a.id }]);
      assert.equal((await client.query('UPDATE wonffice.workspaces SET name = $1 WHERE id = $2', ['changed', b.id])).rowCount, 0);
      assert.equal((await client.query('DELETE FROM wonffice.workspaces WHERE id = $1', [b.id])).rowCount, 0);
    });
    await assert.rejects(withTenant(pool, alpha, client => client.query(
      'INSERT INTO wonffice.workspaces (tenant_id, id, name) VALUES ($1, $2, $3)', [beta, randomUUID(), 'rejected'])), { code: '42501' });
    await assert.rejects(withTenant(pool, alpha, client => client.query(
      'UPDATE wonffice.workspaces SET tenant_id = $1 WHERE id = $2', [beta, a.id])), { code: '42501' });
  });
  await check('composite document reference rejects another tenant workspace', async () => {
    await assert.rejects(withTenant(pool, alpha, client => client.query(`INSERT INTO wonffice.documents
      (tenant_id, id, workspace_id, product) VALUES ($1, $2, $3, 'note')`, [alpha, randomUUID(), b.id])), { code: '23503' });
    for (const [tenant, workspace] of [[alpha, a.id], [beta, b.id]]) {
      await withTenant(pool, tenant, client => client.query(`INSERT INTO wonffice.documents
        (tenant_id, id, workspace_id, product) VALUES ($1, $2, $3, 'note')`, [tenant, randomUUID(), workspace]));
    }
  });
  await check('pool re-use clears tenant context after success and failure', async () => {
    assert.deepEqual((await store.listWorkspaces(beta)).map(row => row.id), [b.id]);
    assert.deepEqual((await store.listWorkspaces(alpha)).map(row => row.id), [a.id]);
    assert.equal((await pool.query('SELECT id FROM wonffice.workspaces')).rowCount, 0);
    await assert.rejects(withTenant(pool, alpha, async client => {
      await client.query('UPDATE wonffice.workspaces SET name = $1 WHERE id = $2', ['must roll back', a.id]);
      throw new Error('injected_failure');
    }), /injected_failure/);
    assert.equal((await store.listWorkspaces(alpha))[0].name, 'Alpha workspace');
    assert.equal((await pool.query('SELECT id FROM wonffice.workspaces')).rowCount, 0);
    const ownerPool = new pg.Pool(config('wonffice_owner')); pools.push(ownerPool);
    await assert.rejects(withTenant(ownerPool, alpha, async () => 'forbidden'), /invalid_application_role/);
  });
  await check('configured tenant defaults are rejected before the callback', async () => {
    const settings = [
      { set: `ALTER ROLE wonffice_app SET wonffice.tenant_id TO '${alpha}'`,
        reset: 'ALTER ROLE wonffice_app RESET wonffice.tenant_id', options: undefined },
      { set: `ALTER DATABASE office_test SET wonffice.tenant_id TO '${alpha}'`,
        reset: 'ALTER DATABASE office_test RESET wonffice.tenant_id', options: undefined },
      { set: null, reset: null, options: `-c wonffice.tenant_id=${alpha}` },
    ];
    for (const setting of settings) {
      if (setting.set) await admin.query(setting.set);
      try {
        const configuredPool = new pg.Pool({ ...config('wonffice_app'), max: 1, options: setting.options });
        pools.push(configuredPool);
        let called = false;
        await assert.rejects(withTenant(configuredPool, beta, async () => { called = true; }), /invalid_tenant_context/);
        assert.equal(called, false);
        assert.equal(configuredPool.totalCount, 0);
      } finally {
        if (setting.reset) await admin.query(setting.reset);
      }
    }
  });
  await check('backup membership is rejected before application work', async () => {
    await admin.query('GRANT wonffice_backup TO wonffice_app');
    try {
      const unsafePool = new pg.Pool({ ...config('wonffice_app'), max: 1 }); pools.push(unsafePool);
      let called = false;
      await assert.rejects(withTenant(unsafePool, alpha, async () => { called = true; }), /invalid_application_role/);
      assert.equal(called, false);
      assert.equal(unsafePool.totalCount, 0);
    } finally {
      await admin.query('REVOKE wonffice_backup FROM wonffice_app');
    }
  });
  const snapshot = async client => {
    const content = {};
    for (const table of ['tenants', 'workspaces', 'documents']) {
      // Fixed internal table names; no external identifier is interpolated.
      content[table] = (await client.query(`SELECT * FROM wonffice.${table} ORDER BY id`)).rows;
    }
    content.migrations = (await client.query('SELECT * FROM wonffice_meta.migrations ORDER BY id')).rows;
    return createHash('sha256').update(JSON.stringify(content)).digest('hex');
  };
  await check('database backup restores matching data and migration history into a new database', async () => {
    const before = await snapshot(owner);
    const archive = join(directory, 'database.dump');
    run('pg_dump', ['-h', socket, '-U', 'wonffice_backup', '-d', 'office_test', '-Fc', '-f', archive]);
    run('pg_restore', ['-h', socket, '-U', 'wonffice_owner', '-d', 'office_restored', '--no-owner', '--exit-on-error', '--single-transaction', archive]);
    const restored = await connect('wonffice_owner', 'office_restored'); clients.push(restored);
    assert.equal(await snapshot(restored), before);
    assert.deepEqual(await migrate(restored), []);
    console.log(JSON.stringify({ restoredDataHash: before }));
  });
  await check('restored privileges and RLS still isolate both tenants', async () => {
    const restoredPool = new pg.Pool({ ...config('wonffice_app', 'office_restored'), max: 1 }); pools.push(restoredPool);
    const restoredStore = new TenantStore(restoredPool);
    assert.deepEqual((await restoredStore.listWorkspaces(alpha)).map(row => row.id), [a.id]);
    assert.deepEqual((await restoredStore.listWorkspaces(beta)).map(row => row.id), [b.id]);
    assert.equal((await restoredPool.query('SELECT id FROM wonffice.workspaces')).rowCount, 0);
    await assert.rejects(withTenant(restoredPool, alpha, client => client.query(`INSERT INTO wonffice.documents
      (tenant_id, id, workspace_id, product) VALUES ($1, $2, $3, 'note')`, [alpha, randomUUID(), b.id])), { code: '23503' });
    await assert.rejects(restoredPool.query('TRUNCATE wonffice.workspaces'), { code: '42501' });
  });
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  // Only remove this run's own cluster, after PostgreSQL has stopped successfully.
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
