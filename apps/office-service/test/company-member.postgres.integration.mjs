import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { CompanyMemberStore, CompanyMemberAccessDeniedError,
  CompanyMemberConflictError } from '../dist/company-member-store.js';
import { MembershipStore, TenantAccessDeniedError } from '../dist/membership-store.js';

const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-company-pg-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [], pools = [];
let started = false;
const check = async (name, work) => { await work(); console.log(JSON.stringify({ result: 'passed', check: name })); };
const connect = async (user, database) => {
  const client = new pg.Client(config(user, database));
  await client.connect(); clients.push(client);
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
  assert.deepEqual(await migrate(owner), [
    '0001_tenant_workspaces', '0002_oidc_memberships', '0003_member_tenant_names',
    '0006_company_member_admin',
  ]);
  const issuer = 'http://127.0.0.1:18180/realms/wonffice';
  const alpha = randomUUID(), beta = randomUUID();
  const accounts = Object.fromEntries(['owner', 'admin', 'editor', 'viewer', 'beta-owner'].map(subject =>
    [subject, { id: randomUUID(), principal: { issuer, subject } }]));
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)',
    [alpha, 'Alpha', beta, 'Beta']);
  for (const [subject, account] of Object.entries(accounts)) {
    await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3)',
      [account.id, issuer, subject]);
  }
  for (const [subject, role] of [['owner', 'owner'], ['admin', 'admin'],
    ['editor', 'editor'], ['viewer', 'viewer']]) {
    await owner.query('INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role) VALUES ($1, $2, $3)',
      [alpha, accounts[subject].id, role]);
  }
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'owner')`, [beta, accounts['beta-owner'].id]);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 3 }); pools.push(pool);
  const members = new CompanyMemberStore(pool);
  const access = new MembershipStore(pool);

  await check('owner and admin list only their company with internal IDs', async () => {
    for (const actor of ['owner', 'admin']) {
      const page = await members.listMembers(accounts[actor].principal, alpha);
      assert.equal(page.members.length, 4);
      assert.ok(page.members.every(member => Object.keys(member).sort().join(',') ===
        'active,isSelf,memberId,role'));
      assert.ok(page.members.find(member => member.memberId === accounts[actor].id).isSelf);
      assert.ok(!page.members.some(member => member.memberId === accounts['beta-owner'].id));
    }
    await assert.rejects(members.listMembers(accounts.owner.principal, beta),
      CompanyMemberAccessDeniedError);
    await assert.rejects(members.listMembers(accounts.editor.principal, alpha),
      CompanyMemberAccessDeniedError);
    await assert.rejects(pool.query('SELECT * FROM wonffice.company_member_admin_events'), { code: '42501' });
    assert.equal((await pool.query('SELECT * FROM wonffice.tenant_memberships')).rowCount, 0);
  });
  await check('owner and admin can change only active editor or viewer roles', async () => {
    assert.deepEqual(await members.setRole(accounts.admin.principal, alpha, accounts.viewer.id, 'editor'),
      { memberId: accounts.viewer.id, role: 'editor', active: true, changed: true });
    assert.deepEqual(await access.getTenantAccess(accounts.viewer.principal, alpha),
      { tenantId: alpha, role: 'editor' });
    assert.deepEqual(await members.setRole(accounts.owner.principal, alpha, accounts.viewer.id, 'editor'),
      { memberId: accounts.viewer.id, role: 'editor', active: true, changed: false });
    for (const target of [accounts.owner.id, accounts.admin.id, accounts['beta-owner'].id]) {
      await assert.rejects(members.setRole(accounts.owner.principal, alpha, target, 'viewer'),
        CompanyMemberAccessDeniedError);
      await assert.rejects(members.revoke(accounts.owner.principal, alpha, target),
        CompanyMemberAccessDeniedError);
    }
    await assert.rejects(members.setRole(accounts.editor.principal, alpha, accounts.viewer.id, 'viewer'),
      CompanyMemberAccessDeniedError);
  });
  await check('revocation denies the same token on the next tenant operation', async () => {
    assert.deepEqual(await members.revoke(accounts.owner.principal, alpha, accounts.editor.id),
      { memberId: accounts.editor.id, role: 'editor', active: false, changed: true });
    await assert.rejects(access.getTenantAccess(accounts.editor.principal, alpha), TenantAccessDeniedError);
    await assert.rejects(members.listMembers(accounts.editor.principal, alpha),
      CompanyMemberAccessDeniedError);
    await assert.rejects(members.revoke(accounts.owner.principal, alpha, accounts.editor.id),
      CompanyMemberConflictError);
    const page = await members.listMembers(accounts.owner.principal, alpha);
    assert.equal(page.members.find(member => member.memberId === accounts.editor.id).active, false);
  });
  await check('audits record actor, target, outcome and time without OIDC claims', async () => {
    const rows = (await owner.query(`SELECT tenant_id, actor_identity_id, target_identity_id,
      action, previous_role, requested_role, outcome, request_id, created_at
      FROM wonffice.company_member_admin_events ORDER BY created_at, id`)).rows;
    assert.ok(rows.some(row => row.action === 'set_role' && row.outcome === 'applied'));
    assert.ok(rows.some(row => row.action === 'revoke' && row.outcome === 'applied'));
    assert.ok(rows.some(row => row.outcome === 'forbidden'));
    assert.ok(rows.every(row => row.actor_identity_id && row.request_id && row.created_at));
    assert.ok(!JSON.stringify(rows).includes(issuer));
    assert.ok(!JSON.stringify(rows).includes('beta-owner'));
  });
  await check('backup restores revoked membership and admin audit without granting access', async () => {
    const archive = join(directory, 'company.dump');
    const before = (await owner.query(`SELECT * FROM wonffice.company_member_admin_events
      ORDER BY created_at, id`)).rows;
    run('pg_dump', ['-h', socket, '-U', 'wonffice_backup', '-d', 'office_test', '-Fc', '-f', archive]);
    run('pg_restore', ['-h', socket, '-U', 'wonffice_owner', '-d', 'office_restored', '--no-owner',
      '--exit-on-error', '--single-transaction', archive]);
    const restored = await connect('wonffice_owner', 'office_restored');
    assert.deepEqual((await restored.query(`SELECT * FROM wonffice.company_member_admin_events
      ORDER BY created_at, id`)).rows, before);
    assert.deepEqual(await migrate(restored), []);
    const restoredPool = new pg.Pool({ ...config('wonffice_app', 'office_restored'), max: 1 });
    pools.push(restoredPool);
    await assert.rejects(new MembershipStore(restoredPool).getTenantAccess(accounts.editor.principal, alpha),
      TenantAccessDeniedError);
    await assert.rejects(restoredPool.query('SELECT * FROM wonffice.company_member_admin_events'),
      { code: '42501' });
  });
  await check('audit failure and database outage do not authorize changes', async () => {
    await owner.query('DROP TABLE wonffice.company_member_admin_events');
    await assert.rejects(members.setRole(accounts.owner.principal, alpha, accounts.viewer.id, 'viewer'));
    assert.deepEqual(await access.getTenantAccess(accounts.viewer.principal, alpha),
      { tenantId: alpha, role: 'editor' });
    await pool.end(); pools.splice(pools.indexOf(pool), 1);
    await assert.rejects(members.listMembers(accounts.owner.principal, alpha));
  });
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
