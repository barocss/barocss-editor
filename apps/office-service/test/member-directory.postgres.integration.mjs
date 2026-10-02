import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { migrations } from '../dist/migrations.js';
import { CompanyMemberStore, CompanyMemberAccessDeniedError } from '../dist/company-member-store.js';
import { provisionMemberDirectory, readMemberDirectory } from '../dist/member-directory-admin.js';

const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-directory-pg-');
const data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [], pools = [];
let started = false;
const check = async (name, work) => { await work(); console.log(JSON.stringify({ result: 'passed', check: name })); };
const connect = async (user, database) => {
  const client = new pg.Client(config(user, database)); await client.connect(); clients.push(client); return client;
};
try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust',
    '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']);
  started = true;
  const admin = await connect('wonffice_test_admin', 'postgres');
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  await admin.query('CREATE DATABASE office_restored OWNER wonffice_owner');
  const owner = await connect('wonffice_owner'), app = await connect('wonffice_app');
  await migrate(owner, migrations.filter(entry => entry.id < '0010'));
  const previousHistory = (await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
  assert.deepEqual(await migrate(owner), ['0010_member_directory', '0011_connected_projects']);
  assert.deepEqual((await owner.query("SELECT id,checksum FROM wonffice_meta.migrations WHERE id < '0010' ORDER BY id")).rows, previousHistory);
  assert.deepEqual(await migrate(owner), []);
  const alpha = randomUUID(), beta = randomUUID();
  const issuer = 'https://synthetic-idp.example.test';
  const accounts = Object.fromEntries(['owner', 'admin', 'editor', 'viewer', 'operator', 'beta-owner', 'missing']
    .map(subject => [subject, { id: randomUUID(), principal: { issuer, subject } }]));
  await owner.query('INSERT INTO wonffice.tenants (id,name) VALUES ($1,$2),($3,$4)',
    [alpha, 'Synthetic Alpha', beta, 'Synthetic Beta']);
  for (const [subject, account] of Object.entries(accounts)) await owner.query(
    'INSERT INTO wonffice.identities(id,issuer,subject) VALUES ($1,$2,$3)', [account.id, issuer, subject]);
  for (const [subject, role] of [['owner', 'owner'], ['admin', 'admin'], ['editor', 'editor'],
    ['viewer', 'viewer'], ['missing', 'viewer']]) await owner.query(
    'INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role) VALUES ($1,$2,$3)',
    [alpha, accounts[subject].id, role]);
  await owner.query(`INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role)
    VALUES ($1,$2,'owner')`, [beta, accounts['beta-owner'].id]);
  // Operator-only identity deliberately has no tenant membership.
  await owner.query(`INSERT INTO wonffice.platform_operator_grants
    (identity_id) VALUES ($1)`, [accounts.operator.id]);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 3 }); pools.push(pool);
  const members = new CompanyMemberStore(pool);
  const manifest = (memberId, approvalRef, expectedRevision = null, displayLabel = '가상 동명이인') =>
    ({ tenantId: alpha, memberId, displayLabel, sourceCategory: 'company_roster',
      sourceRef: 'roster:synthetic-v1', approvalRef, actorRef: 'operator:synthetic', expectedRevision });
  let first, renamed;
  const membershipBefore = (await owner.query('SELECT * FROM wonffice.tenant_memberships ORDER BY tenant_id,identity_id')).rows;
  const grantsBefore = (await owner.query('SELECT * FROM wonffice.platform_operator_grants')).rows;
  const identitiesBefore = (await owner.query('SELECT * FROM wonffice.identities ORDER BY id')).rows;
  await check('private owner role rejects unknown/wrong-tenant targets and malformed approvals', async () => {
    await assert.rejects(provisionMemberDirectory(app, manifest(accounts.editor.id, 'approval:first')),
      /invalid_directory_admin_role/);
    await assert.rejects(provisionMemberDirectory(admin, manifest(accounts.editor.id, 'approval:first')),
      /invalid_directory_admin_role/);
    await assert.rejects(provisionMemberDirectory(owner, manifest(randomUUID(), 'approval:unknown')),
      /unknown_directory_member/);
    await assert.rejects(provisionMemberDirectory(owner, manifest(accounts['beta-owner'].id, 'approval:foreign')),
      /unknown_directory_member/);
    await assert.rejects(provisionMemberDirectory(owner, { ...manifest(accounts.editor.id, ''), displayLabel: 'bad\nlabel' }));
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.member_directory')).rows[0].n, 0);
  });
  await check('approved Unicode duplicate labels get durable distinct server codes and immutable replay', async () => {
    first = await provisionMemberDirectory(owner, manifest(accounts.editor.id, 'approval:first'));
    assert.equal(first.applied, true); assert.equal(first.entry.revision, 1);
    const second = await provisionMemberDirectory(owner, manifest(accounts.viewer.id, 'approval:second'));
    assert.equal(first.entry.displayLabel, second.entry.displayLabel);
    assert.notEqual(first.entry.memberCode, second.entry.memberCode);
    assert.deepEqual(await provisionMemberDirectory(owner, manifest(accounts.editor.id, 'approval:first')),
      { applied: false, entry: first.entry });
    await assert.rejects(provisionMemberDirectory(owner, manifest(accounts.viewer.id, 'approval:first')),
      /directory_approval_conflict/);
    await assert.rejects(provisionMemberDirectory(owner, manifest(accounts.editor.id, 'approval:stale')),
      /directory_revision_conflict/);
    renamed = await provisionMemberDirectory(owner, manifest(accounts.editor.id, 'approval:rename', 1, '<가상 변경 이름>'));
    assert.equal(renamed.entry.memberCode, first.entry.memberCode); assert.equal(renamed.entry.revision, 2);
    assert.deepEqual(await provisionMemberDirectory(owner, manifest(accounts.editor.id, 'approval:first')),
      { applied: false, entry: first.entry });
    assert.deepEqual(await readMemberDirectory(owner, { tenantId: alpha, memberId: accounts.editor.id,
      approvalRef: 'approval:inspect' }), renamed.entry);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.member_directory_events')).rows[0].n, 3);
    const audit = (await owner.query('SELECT previous_revision,result_entry FROM wonffice.member_directory_events WHERE approval_ref=$1',
      ['approval:rename'])).rows[0];
    assert.equal(audit.previous_revision, 1); assert.deepEqual(audit.result_entry, renamed.entry);
  });
  await check('current tenant authority and identified/unidentified DTO never leak private provenance', async () => {
    for (const actor of ['owner', 'admin']) {
      const list = await members.listMembers(accounts[actor].principal, alpha);
      const identified = list.members.find(m => m.memberId === accounts.editor.id).identification;
      assert.deepEqual(identified, { state: 'identified', displayLabel: renamed.entry.displayLabel,
        memberCode: first.entry.memberCode, sourceCategory: 'company_roster', revision: 2,
        updatedAt: renamed.entry.updatedAt });
      assert.deepEqual(list.members.find(m => m.memberId === accounts.missing.id).identification,
        { state: 'unidentified', displayLabel: null, memberCode: null, sourceCategory: null, revision: null, updatedAt: null });
      const text = JSON.stringify(list);
      for (const privateValue of [issuer, 'approval:', 'roster:', 'operator:']) assert.ok(!text.includes(privateValue));
      assert.ok(list.members.every(m => m.memberId !== accounts['beta-owner'].id));
    }
    for (const actor of ['editor', 'viewer', 'operator', 'beta-owner']) await assert.rejects(
      members.listMembers(accounts[actor].principal, alpha), CompanyMemberAccessDeniedError);
    await assert.rejects(members.listMembers({ issuer, subject: 'not-registered' }, alpha), CompanyMemberAccessDeniedError);
    await assert.rejects(members.listMembers(accounts.owner.principal, beta), CompanyMemberAccessDeniedError);
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',
      [alpha, accounts.admin.id]);
    await assert.rejects(members.listMembers(accounts.admin.principal, alpha), CompanyMemberAccessDeniedError);
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at=NULL WHERE tenant_id=$1 AND identity_id=$2',
      [alpha, accounts.admin.id]);
  });
  await check('RLS/least privileges exclude application profile reads/writes and retain backup read only', async () => {
    for (const table of ['member_directory', 'member_directory_events']) {
      const rls = (await owner.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
        WHERE oid=$1::regclass`, [`wonffice.${table}`])).rows[0];
      assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
      for (const role of ['wonffice_app', 'wonffice_backup']) {
        const grants = (await owner.query(`SELECT has_table_privilege($1,$2,'SELECT') AS read,
          has_table_privilege($1,$2,'INSERT,UPDATE,DELETE') AS write`, [role, `wonffice.${table}`])).rows[0];
        assert.deepEqual(grants, { read: role === 'wonffice_backup', write: false });
      }
      await assert.rejects(app.query(`SELECT * FROM wonffice.${table}`), { code: '42501' });
      await assert.rejects(app.query(`DELETE FROM wonffice.${table}`), { code: '42501' });
    }
    assert.deepEqual((await owner.query('SELECT * FROM wonffice.tenant_memberships ORDER BY tenant_id,identity_id')).rows, membershipBefore);
    assert.deepEqual((await owner.query('SELECT * FROM wonffice.platform_operator_grants')).rows, grantsBefore);
    assert.deepEqual((await owner.query('SELECT * FROM wonffice.identities ORDER BY id')).rows, identitiesBefore);
  });
  await check('protected CLI keeps label/provenance in600 output and refuses unsafe input or output', async () => {
    const file = join(directory, 'manifest.json'), output = join(directory, 'result.json');
    writeFileSync(file, JSON.stringify({ action: 'read', tenantId: alpha, memberId: accounts.editor.id,
      approvalRef: 'approval:cli-read' }), { mode: 0o600 });
    const env = { ...process.env, OFFICE_DIRECTORY_MANIFEST_PATH: file, OFFICE_DIRECTORY_RESULT_PATH: output,
      OFFICE_MIGRATION_DATABASE_URL: `postgresql://wonffice_owner@localhost/office_test?host=${encodeURIComponent(socket)}` };
    const stdout = execFileSync(process.execPath, [resolve('dist/member-directory-admin-cli.js')], { env, encoding: 'utf8' });
    assert.ok(!stdout.includes('가상')); assert.ok(!stdout.includes('approval:'));
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), renamed.entry);
    assert.throws(() => execFileSync(process.execPath, [resolve('dist/member-directory-admin-cli.js')], { env, stdio: 'pipe' }));
    chmodSync(file, 0o644);
    assert.throws(() => execFileSync(process.execPath, [resolve('dist/member-directory-admin-cli.js')],
      { env: { ...env, OFFICE_DIRECTORY_RESULT_PATH: join(directory, 'refused.json') }, stdio: 'pipe' }));
    chmodSync(file, 0o600);
  });
  await check('simultaneous approved renames compare durable revision and audit failure rolls back', async () => {
    const otherOwner = await connect('wonffice_owner');
    const results = await Promise.allSettled([
      provisionMemberDirectory(owner, manifest(accounts.editor.id, 'approval:race-a', 2, '가상 경합 A')),
      provisionMemberDirectory(otherOwner, manifest(accounts.editor.id, 'approval:race-b', 2, '가상 경합 B')),
    ]);
    const success = results.filter(result => result.status === 'fulfilled');
    const refusal = results.filter(result => result.status === 'rejected');
    assert.equal(success.length, 1); assert.equal(refusal.length, 1);
    assert.match(refusal[0].reason.message, /directory_revision_conflict/);
    renamed = success[0].value;
    assert.equal(renamed.entry.revision, 3); assert.equal(renamed.entry.memberCode, first.entry.memberCode);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.member_directory_events')).rows[0].n, 4);
    await owner.query(`CREATE FUNCTION wonffice.test_directory_audit_failure() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$;
      CREATE TRIGGER test_directory_audit_failure BEFORE INSERT ON wonffice.member_directory_events
      FOR EACH ROW EXECUTE FUNCTION wonffice.test_directory_audit_failure()`);
    await assert.rejects(provisionMemberDirectory(owner,
      manifest(accounts.editor.id, 'approval:audit-failure', 3, '가상 미적용')), /synthetic_audit_failure/);
    assert.deepEqual(await readMemberDirectory(owner, { tenantId: alpha, memberId: accounts.editor.id,
      approvalRef: 'approval:after-refusal' }), renamed.entry);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM wonffice.member_directory_events')).rows[0].n, 4);
    await owner.query(`DROP TRIGGER test_directory_audit_failure ON wonffice.member_directory_events;
      DROP FUNCTION wonffice.test_directory_audit_failure()`);
  });
  await check('backup and same-database restart preserve directory code revision and private audit', async () => {
    const archive = join(directory, 'directory.dump');
    const auditBefore = (await owner.query('SELECT * FROM wonffice.member_directory_events ORDER BY tenant_id,approval_ref')).rows;
    run('pg_dump', ['-h', socket, '-U', 'wonffice_backup', '-d', 'office_test', '-Fc', '-f', archive]);
    run('pg_restore', ['-h', socket, '-U', 'wonffice_owner', '-d', 'office_restored', '--no-owner', '--exit-on-error', '--single-transaction', archive]);
    const restored = await connect('wonffice_owner', 'office_restored');
    assert.deepEqual((await restored.query('SELECT * FROM wonffice.member_directory_events ORDER BY tenant_id,approval_ref')).rows, auditBefore);
    assert.deepEqual(await readMemberDirectory(restored, { tenantId: alpha, memberId: accounts.editor.id,
      approvalRef: 'approval:restore' }), renamed.entry);
    await Promise.all(pools.map(p => p.end())); pools.length = 0;
    await Promise.all(clients.map(c => c.end())); clients.length = 0;
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
    run('pg_ctl', ['-D', data, '-l', join(directory, 'restart.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
    const restarted = await connect('wonffice_owner');
    assert.deepEqual(await readMemberDirectory(restarted, { tenantId: alpha, memberId: accounts.editor.id,
      approvalRef: 'approval:restart' }), renamed.entry);
    const replay = await provisionMemberDirectory(restarted, manifest(accounts.editor.id, 'approval:first'));
    assert.deepEqual(replay, { applied: false, entry: first.entry });
    assert.deepEqual(await migrate(restarted), []);
  });
} finally {
  await Promise.allSettled(pools.map(p => p.end()));
  await Promise.allSettled(clients.map(c => c.end()));
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
