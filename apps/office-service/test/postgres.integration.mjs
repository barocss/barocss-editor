import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { copyNoteSnapshotFile, readNoteSnapshotFile } from '@barocss/office-note-file';
import { migrate } from '../dist/migrate.js';
import { migrations } from '../dist/migrations.js';
import { TenantStore, withTenant } from '../dist/tenant-store.js';
import { MembershipStore, TenantAccessDeniedError } from '../dist/membership-store.js';
import { applyMembershipChange } from '../dist/membership-admin.js';
import { DocumentStore, DocumentError } from '../dist/document-store.js';
import { CollaborationStore } from '../dist/collaboration-store.js';
import { CapabilityStore, CapabilityError } from '../dist/capability-store.js';

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
    assert.deepEqual(result.flat().sort(), ['0001_tenant_workspaces', '0002_oidc_memberships',
      '0003_member_tenant_names', '0004_document_snapshots', '0005_platform_operators',
      '0006_company_member_admin', '0007_document_collaboration_seed',
      '0008_document_capabilities', '0009_full_note_collaboration_seed']);
    assert.deepEqual(await migrate(owner), []);
  });
  await check('upgrade quarantines legacy confirmed raw roots without changing snapshot bytes', async () => {
    await admin.query('CREATE DATABASE office_upgrade OWNER wonffice_owner');
    const upgrade = await connect('wonffice_owner', 'office_upgrade'); clients.push(upgrade);
    await migrate(upgrade, migrations.slice(0, -1));
    const tenantId = randomUUID(), workspaceId = randomUUID(), documentId = randomUUID();
    const seedId = randomUUID(), original = '{"legacy":"raw snapshot"}';
    const digest = createHash('sha256').update(original).digest('hex');
    await upgrade.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2)', [tenantId, 'Upgrade']);
    await upgrade.query(`INSERT INTO wonffice.workspaces (tenant_id, id, name)
      VALUES ($1, $2, $3)`, [tenantId, workspaceId, 'Legacy']);
    await upgrade.query(`INSERT INTO wonffice.documents
      (tenant_id, id, workspace_id, product, page_id, document_key, mode)
      VALUES ($1, $2, $3, 'note', $4, $5, 'collaborative')`,
    [tenantId, documentId, workspaceId, documentId, `wonffice-${tenantId}-${documentId}`]);
    await upgrade.query(`INSERT INTO wonffice.document_snapshots
      (tenant_id, document_id, file_format, file_version, snapshot_text, snapshot_hash, revision)
      VALUES ($1, $2, 'barocss-note', 1, $3, $4, 1)`,
    [tenantId, documentId, original, digest]);
    await upgrade.query(`INSERT INTO wonffice.document_collaboration_seeds
      (tenant_id, document_id, provider, provider_project, provider_build, seed_id,
        request_key, snapshot_revision, snapshot_hash, status, confirmed_at,
        confirmed_provider_checkpoint, confirmed_provider_snapshot_hash)
      VALUES ($1, $2, 'yorkie', 'old-project', 'old-build', $3,
        'old-attempt', 1, $4, 'confirmed', now(), 'old-checkpoint', $4)`,
    [tenantId, documentId, seedId, digest]);
    assert.deepEqual(await migrate(upgrade), ['0009_full_note_collaboration_seed']);
    const result = (await upgrade.query(`SELECT d.mode, s.snapshot_text, c.status,
      c.confirmed_provider_checkpoint, c.confirmed_provider_snapshot_hash
      FROM wonffice.documents d JOIN wonffice.document_snapshots s
        ON s.tenant_id = d.tenant_id AND s.document_id = d.id
      JOIN wonffice.document_collaboration_seeds c
        ON c.tenant_id = d.tenant_id AND c.document_id = d.id
      WHERE d.tenant_id = $1 AND d.id = $2`, [tenantId, documentId])).rows[0];
    assert.deepEqual(result, { mode: 'initializing', snapshot_text: original, status: 'uncertain',
      confirmed_provider_checkpoint: null, confirmed_provider_snapshot_hash: null });
  });
  await check('failed DDL and migration history roll back together', async () => {
    await assert.rejects(migrate(owner, [...migrations, {
      id: '9999_failure', sql: 'CREATE TABLE wonffice.must_rollback (id integer); SELECT 1 / 0;',
    }]));
    assert.equal((await owner.query("SELECT to_regclass('wonffice.must_rollback') AS name")).rows[0].name, null);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM wonffice_meta.migrations')).rows[0].count,
      migrations.length);
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
  const alice = randomUUID(), bob = randomUUID();
  const issuer = 'http://127.0.0.1:18180/realms/wonffice';
  await owner.query(`INSERT INTO wonffice.identities (id, issuer, subject)
    VALUES ($1, $2, 'alice'), ($3, $2, 'bob')`, [alice, issuer, bob]);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'editor'), ($3, $4, 'viewer')`, [alpha, alice, beta, bob]);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 1 }); pools.push(pool);
  const store = new TenantStore(pool);
  const memberships = new MembershipStore(pool);
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
    assert.equal((await pool.query('SELECT id FROM wonffice.identities')).rowCount, 0);
    assert.equal((await pool.query('SELECT tenant_id FROM wonffice.tenant_memberships')).rowCount, 0);
    assert.equal((await pool.query('SELECT id FROM wonffice.tenants')).rowCount, 0);
    await assert.rejects(pool.query('INSERT INTO wonffice.workspaces (tenant_id, id, name) VALUES ($1, $2, $3)',
      [alpha, randomUUID(), 'rejected']), { code: '42501' });
    await assert.rejects(pool.query(`UPDATE wonffice.tenant_memberships SET role = 'owner'`), { code: '42501' });
  });
  await check('identity and current membership authorize only their tenant', async () => {
    assert.deepEqual(await memberships.getTenantAccess({ issuer, subject: 'alice' }, alpha),
      { tenantId: alpha, role: 'editor' });
    assert.deepEqual(await memberships.getTenantAccess({ issuer, subject: 'bob' }, beta),
      { tenantId: beta, role: 'viewer' });
    for (const principal of [
      { issuer, subject: 'alice' },
      { issuer: 'https://wrong.example', subject: 'bob' },
      { issuer, subject: 'unknown' },
    ]) {
      await assert.rejects(memberships.getTenantAccess(principal, beta), TenantAccessDeniedError);
    }
    assert.equal((await pool.query('SELECT id FROM wonffice.identities')).rowCount, 0);
  });
  await check('principal list contains only active tenant names and roles', async () => {
    assert.deepEqual(await memberships.listTenantAccess({ issuer, subject: 'alice' }), {
      tenants: [{ tenantId: alpha, name: 'Alpha', role: 'editor' }], nextCursor: null,
    });
    assert.deepEqual(await memberships.listTenantAccess({ issuer, subject: 'bob' }), {
      tenants: [{ tenantId: beta, name: 'Beta', role: 'viewer' }], nextCursor: null,
    });
    assert.deepEqual(await memberships.listTenantAccess({ issuer, subject: 'unknown' }), {
      tenants: [], nextCursor: null,
    });
    assert.deepEqual(await memberships.listTenantAccess({ issuer, subject: 'alice' }, alpha), {
      tenants: [], nextCursor: null,
    });
    assert.equal((await pool.query('SELECT id FROM wonffice.tenants')).rowCount, 0);
  });
  await check('membership revocation denies the next operation and does not run its callback', async () => {
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at = now() WHERE tenant_id = $1', [alpha]);
    let called = false;
    await assert.rejects(memberships.withAuthorizedTenant({ issuer, subject: 'alice' }, alpha,
      async () => { called = true; }), TenantAccessDeniedError);
    assert.equal(called, false);
    assert.equal(pool.totalCount, 0);
    assert.deepEqual(await memberships.listTenantAccess({ issuer, subject: 'alice' }), {
      tenants: [], nextCursor: null,
    });
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at = NULL WHERE tenant_id = $1', [alpha]);
  });
  await check('approved first owner and admin changes are audited, idempotent and revocable', async () => {
    const gamma = randomUUID();
    const bootstrap = { action: 'bootstrap_owner', tenantId: gamma, tenantName: 'Gamma',
      issuer, subject: 'alice', approvalRef: 'LOCAL-355-OWNER' };
    assert.deepEqual(await applyMembershipChange(owner, bootstrap), { applied: true });
    assert.deepEqual(await applyMembershipChange(owner, bootstrap), { applied: false });
    await assert.rejects(applyMembershipChange(owner,
      { ...bootstrap, tenantName: 'Another tenant name' }), /membership_approval_conflict/);
    assert.deepEqual(await memberships.getTenantAccess({ issuer, subject: 'alice' }, gamma),
      { tenantId: gamma, role: 'owner' });
    await assert.rejects(applyMembershipChange(owner, {
      action: 'grant', tenantId: gamma, issuer, subject: 'alice',
      role: 'admin', approvalRef: 'LOCAL-355-OWNER-DOWNGRADE',
    }), /owner_role_immutable/);
    assert.deepEqual(await memberships.getTenantAccess({ issuer, subject: 'alice' }, gamma),
      { tenantId: gamma, role: 'owner' });
    await assert.rejects(applyMembershipChange(owner,
      { ...bootstrap, approvalRef: 'LOCAL-355-OTHER', subject: 'bob' }), /membership_bootstrap_conflict/);
    const grant = { action: 'grant', tenantId: gamma, issuer, subject: 'bob',
      role: 'admin', approvalRef: 'LOCAL-355-ADMIN' };
    assert.deepEqual(await applyMembershipChange(owner, grant), { applied: true });
    assert.deepEqual(await applyMembershipChange(owner, grant), { applied: false });
    assert.deepEqual(await memberships.getTenantAccess({ issuer, subject: 'bob' }, gamma),
      { tenantId: gamma, role: 'admin' });
    await assert.rejects(applyMembershipChange(owner,
      { ...grant, action: 'revoke' }), /membership_approval_conflict/);
    assert.deepEqual(await applyMembershipChange(owner,
      { ...grant, action: 'revoke', approvalRef: 'LOCAL-355-REVOKE' }), { applied: true });
    await assert.rejects(memberships.getTenantAccess({ issuer, subject: 'bob' }, gamma), TenantAccessDeniedError);
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.membership_events
      WHERE tenant_id = $1`, [gamma])).rows[0].count, 3);
    await assert.rejects(applyMembershipChange(await connectAndTrack('wonffice_app'), bootstrap),
      /invalid_membership_admin_role/);
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
    const invalidId = randomUUID();
    await assert.rejects(withTenant(pool, alpha, client => client.query(`INSERT INTO wonffice.documents
      (tenant_id, id, workspace_id, product, document_key, page_id)
      VALUES ($1, $2, $3, 'note', $4, $2::uuid::text)`,
    [alpha, invalidId, b.id, `wonffice-${alpha}-${invalidId}`])), { code: '23503' });
    for (const [tenant, workspace] of [[alpha, a.id], [beta, b.id]]) {
      const documentId = randomUUID();
      await withTenant(pool, tenant, client => client.query(`INSERT INTO wonffice.documents
        (tenant_id, id, workspace_id, product, document_key, page_id)
        VALUES ($1, $2, $3, 'note', $4, $2::uuid::text)`,
      [tenant, documentId, workspace, `wonffice-${tenant}-${documentId}`]));
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
  await check('configured identity defaults are rejected before the callback', async () => {
    for (const key of ['wonffice.oidc_issuer', 'wonffice.oidc_subject']) {
      const configuredPool = new pg.Pool({ ...config('wonffice_app'), max: 1,
        options: `-c ${key}=untrusted` });
      pools.push(configuredPool);
      let called = false;
      await assert.rejects(new MembershipStore(configuredPool).withAuthorizedTenant(
        { issuer, subject: 'alice' }, alpha, async () => { called = true; }),
      /invalid_tenant_context/);
      assert.equal(called, false);
      assert.equal(configuredPool.totalCount, 0);
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
  await check('tenant list cursor covers more than 50 memberships without duplicates', async () => {
    const extra = (await owner.query(`INSERT INTO wonffice.tenants (id, name)
      SELECT gen_random_uuid(), 'List ' || n FROM generate_series(1, 51) AS n RETURNING id`)).rows.map(row => row.id);
    await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
      SELECT ids.id, $2, 'viewer' FROM unnest($1::uuid[]) AS ids(id)`, [extra, alice]);
    const first = await memberships.listTenantAccess({ issuer, subject: 'alice' });
    assert.equal(first.tenants.length, 50);
    assert.ok(first.nextCursor);
    const second = await memberships.listTenantAccess({ issuer, subject: 'alice' }, first.nextCursor);
    assert.equal(second.tenants.length, 3);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.tenants, ...second.tenants].map(row => row.tenantId)).size, 53);
    assert.ok(first.tenants.every(row => row.name && row.role));
    assert.deepEqual(await memberships.listTenantAccess({ issuer, subject: 'bob' }), {
      tenants: [{ tenantId: beta, name: 'Beta', role: 'viewer' }], nextCursor: null,
    });
  });
  const documents = new DocumentStore(pool);
  const alicePrincipal = { issuer, subject: 'alice' };
  const bobPrincipal = { issuer, subject: 'bob' };
  const originalPage = 'old-page';
  const noteFile = (body, pageId = originalPage) => JSON.stringify({
    format: 'barocss-note', version: 1,
    document: { stype: 'note', attributes: { title: 'Plan', pageId }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: body }] },
      { stype: 'paragraph', content: [{ stype: 'pageReference', attributes: { pageId } },
        { stype: 'pageReference', attributes: { pageId: 'other-page' } }] },
    ] },
  });
  const noteInput = { workspaceId: a.id, product: 'note', title: 'Plan',
    fileFormat: 'barocss-note', fileVersion: 1, snapshotText: noteFile('first'),
    idempotencyKey: 'create-one', importMode: 'new-page-copy' };
  let created;
  await check('document create, exact retry and receipt are atomic; Note gets a new page identity', async () => {
    created = await documents.create(alicePrincipal, alpha, noteInput);
    assert.equal(created.document.revision, 1);
    assert.notEqual(created.document.pageId, originalPage);
    assert.equal(created.document.documentKey,
      `wonffice-${alpha}-${created.document.documentId}`);
    assert.deepEqual(await documents.create(alicePrincipal, alpha, noteInput), created);
    assert.deepEqual(await documents.getReceipt(alicePrincipal, alpha, 'create', 'create-one'), created);
    const opened = await documents.open(alicePrincipal, alpha, created.document.documentId);
    assert.equal(created.snapshotText, opened.snapshotText);
    assert.equal(created.snapshotText,
      copyNoteSnapshotFile(noteInput.snapshotText, created.document.pageId).snapshotText);
    const stored = JSON.parse(opened.snapshotText);
    assert.equal(Object.hasOwn(stored, 'savedAt'), false);
    assert.equal(stored.document.attributes.pageId, created.document.pageId);
    assert.equal(stored.document.content[1].content[0].attributes.pageId, created.document.pageId);
    assert.equal(stored.document.content[1].content[1].attributes.pageId, 'other-page');
    assert.equal(opened.document.snapshotHash,
      createHash('sha256').update(opened.snapshotText).digest('hex'));
    assert.equal((await documents.list(alicePrincipal, alpha, { workspaceId: a.id })).documents
      .filter(row => row.documentId === created.document.documentId).length, 1);
    await assert.rejects(documents.create(alicePrincipal, alpha,
      { ...noteInput, snapshotText: noteFile('changed') }),
    error => error instanceof DocumentError && error.reason === 'key_reuse');
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.documents
      WHERE tenant_id = $1 AND workspace_id = $2 AND title = 'Plan'`, [alpha, a.id])).rows[0].count, 1);
  });
  await check('Note codec preserves savedAt and rejects invalid migration files', async () => {
    const source = JSON.stringify({ ...JSON.parse(noteFile('timestamped')),
      savedAt: '2026-09-23T01:00:00Z' });
    const input = { ...noteInput, snapshotText: source, idempotencyKey: 'saved-at-copy' };
    const receipt = await documents.create(alicePrincipal, alpha, input);
    assert.deepEqual(await documents.create(alicePrincipal, alpha, input), receipt);
    assert.equal(receipt.snapshotText,
      copyNoteSnapshotFile(source, receipt.document.pageId).snapshotText);
    assert.equal(readNoteSnapshotFile(receipt.snapshotText).savedAt, '2026-09-23T01:00:00Z');
    assert.equal((await documents.open(alicePrincipal, alpha, receipt.document.documentId)).snapshotText,
      receipt.snapshotText);
    const invalid = JSON.stringify({ ...JSON.parse(source), savedAt: '' });
    await assert.rejects(documents.create(alicePrincipal, alpha,
      { ...input, snapshotText: invalid, idempotencyKey: 'invalid-saved-at' }),
    error => error instanceof DocumentError && error.status === 422);
    await assert.rejects(documents.updateSnapshot(alicePrincipal, alpha, receipt.document.documentId,
      { expectedRevision: 1, snapshotText: invalid, idempotencyKey: 'invalid-update-saved-at' }),
    error => error instanceof DocumentError && error.status === 422);
  });
  await check('two database connections with the same create key commit one document', async () => {
    const concurrentPool = new pg.Pool({ ...config('wonffice_app'), max: 3 }); pools.push(concurrentPool);
    const concurrent = new DocumentStore(concurrentPool);
    const input = { ...noteInput, title: 'Concurrent', idempotencyKey: 'concurrent-create' };
    const results = await Promise.all([
      concurrent.create(alicePrincipal, alpha, input), concurrent.create(alicePrincipal, alpha, input),
    ]);
    assert.equal(results[0].document.documentId, results[1].document.documentId);
    assert.equal(results[0].snapshotText, results[1].snapshotText);
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.documents
      WHERE tenant_id = $1 AND title = 'Concurrent'`, [alpha])).rows[0].count, 1);
    const different = await Promise.allSettled([
      concurrent.create(alicePrincipal, alpha, { ...input, idempotencyKey: 'concurrent-different',
        snapshotText: noteFile('A') }),
      concurrent.create(alicePrincipal, alpha, { ...input, idempotencyKey: 'concurrent-different',
        snapshotText: noteFile('B') }),
    ]);
    assert.equal(different.filter(one => one.status === 'fulfilled').length, 1);
    assert.equal(different.filter(one => one.status === 'rejected' &&
      one.reason instanceof DocumentError && one.reason.reason === 'key_reuse').length, 1);
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.documents
      WHERE tenant_id = $1 AND title = 'Concurrent'`, [alpha])).rows[0].count, 2);
  });
  await check('two active members share a document, other tenant and viewer writes stay denied', async () => {
    await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
      VALUES ($1, $2, 'editor')`, [alpha, bob]);
    const same = await documents.open(bobPrincipal, alpha, created.document.documentId);
    assert.equal(same.document.documentKey, created.document.documentKey);
    await assert.rejects(documents.open(bobPrincipal, beta, created.document.documentId),
      error => error instanceof DocumentError && error.status === 404);
    await assert.rejects(documents.open(alicePrincipal, beta, created.document.documentId),
      TenantAccessDeniedError);
    await assert.rejects(documents.create(bobPrincipal, beta,
      { ...noteInput, workspaceId: b.id, idempotencyKey: 'viewer-create' }),
    error => error instanceof DocumentError && error.status === 403);
    await assert.rejects(documents.open(alicePrincipal, alpha, randomUUID()),
      error => error instanceof DocumentError && error.status === 404);
  });
  await check('Word, Slides and Site retain their distinct v1 envelopes and product-filtered list', async () => {
    for (const [product, fileFormat] of [
      ['word', 'barocss-word'], ['slides', 'barocss-slides'], ['site', 'barocss-site'],
    ]) {
      const snapshotText = JSON.stringify({ format: fileFormat, version: 1,
        document: { stype: 'document', content: [] } });
      const receipt = await documents.create(alicePrincipal, alpha, { workspaceId: a.id, product,
        title: product, fileFormat, fileVersion: 1, snapshotText, idempotencyKey: `create-${product}` });
      assert.equal((await documents.open(bobPrincipal, alpha, receipt.document.documentId)).snapshotText,
        snapshotText);
      assert.equal((await documents.list(bobPrincipal, alpha, { product })).documents
        .some(row => row.documentId === receipt.document.documentId), true);
      await assert.rejects(documents.create(alicePrincipal, alpha, { workspaceId: a.id, product,
        title: product, fileFormat: 'barocss-note', fileVersion: 1, snapshotText,
        idempotencyKey: `bad-${product}` }),
      error => error instanceof DocumentError && error.status === 422);
    }
    await assert.rejects(documents.create(alicePrincipal, alpha,
      { ...noteInput, idempotencyKey: 'note-without-copy', importMode: undefined }),
    error => error instanceof DocumentError && error.status === 422);
  });
  await check('Note copy growth beyond the confirmed body limit returns 413 without a document or receipt', async () => {
    const filler = 'x'.repeat(524288 - Buffer.byteLength(noteFile('')) - 10);
    const source = noteFile(filler);
    assert.equal(Buffer.byteLength(source), 524278);
    await assert.rejects(documents.create(alicePrincipal, alpha,
      { ...noteInput, snapshotText: source, idempotencyKey: 'oversize-transformed' }),
    error => error instanceof DocumentError && error.status === 413);
    await assert.rejects(documents.getReceipt(alicePrincipal, alpha, 'create', 'oversize-transformed'),
      error => error instanceof DocumentError && error.status === 404);
  });
  await check('snapshot and metadata compare-and-swap reject lost updates and keep receipts', async () => {
    const id = created.document.documentId;
    const savedText = noteFile('second', created.document.pageId);
    const update = { expectedRevision: 1, snapshotText: savedText, idempotencyKey: 'update-one' };
    const [first, second] = await Promise.allSettled([
      documents.updateSnapshot(alicePrincipal, alpha, id, update),
      documents.updateSnapshot(bobPrincipal, alpha, id,
        { expectedRevision: 1, snapshotText: noteFile('racing', created.document.pageId), idempotencyKey: 'race' }),
    ]);
    assert.equal([first, second].filter(one => one.status === 'fulfilled').length, 1);
    assert.equal([first, second].filter(one => one.status === 'rejected' &&
      one.reason instanceof DocumentError && one.reason.reason === 'revision_conflict').length, 1);
    const opened = await documents.open(alicePrincipal, alpha, id);
    assert.equal(opened.document.revision, 2);
    const winner = first.status === 'fulfilled' ? first.value : second.value;
    assert.equal(winner.snapshotText, opened.snapshotText);
    assert.deepEqual(await documents.getReceipt(first.status === 'fulfilled' ? alicePrincipal : bobPrincipal,
      alpha, 'update', winner.idempotencyKey), winner);
    const metadata = await documents.updateMetadata(alicePrincipal, alpha, id,
      { expectedMetadataRevision: 1, title: 'Revised', idempotencyKey: 'metadata-one' });
    assert.equal(metadata.document.metadataRevision, 2);
    assert.equal(metadata.document.revision, 2);
    assert.deepEqual(await documents.updateMetadata(alicePrincipal, alpha, id,
      { expectedMetadataRevision: 1, title: 'Revised', idempotencyKey: 'metadata-one' }), metadata);
    await assert.rejects(documents.updateMetadata(bobPrincipal, alpha, id,
      { expectedMetadataRevision: 1, title: 'Late', idempotencyKey: 'metadata-late' }),
    error => error instanceof DocumentError && error.reason === 'revision_conflict');
  });
  await check('document key reuse and cross-tenant remapping are rejected at the database', async () => {
    const id = created.document.documentId;
    await assert.rejects(withTenant(pool, alpha, client => client.query(`UPDATE wonffice.documents
      SET document_key = $3 WHERE tenant_id = $1 AND id = $2`,
    [alpha, id, `wonffice-${beta}-${id}`])), { code: '23514' });
    assert.equal((await withTenant(pool, beta, client => client.query(`UPDATE wonffice.documents
      SET document_key = $3 WHERE tenant_id = $1 AND id = $2`,
    [alpha, id, 'reused']))).rowCount, 0);
    const forgedId = randomUUID();
    await assert.rejects(withTenant(pool, beta, client => client.query(`INSERT INTO wonffice.documents
      (tenant_id, id, workspace_id, product, document_key, page_id)
      VALUES ($1, $2, $3, 'note', $4, $2::uuid::text)`,
    [beta, forgedId, b.id, created.document.documentKey])), { code: '23514' });
    const fresh = new DocumentStore(pool);
    assert.equal((await fresh.open(bobPrincipal, alpha, id)).document.documentKey,
      created.document.documentKey);
  });
  await check('revocation applies before receipt, list and body read', async () => {
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at = now() WHERE tenant_id = $1 AND identity_id = $2',
      [alpha, bob]);
    for (const operation of [
      documents.open(bobPrincipal, alpha, created.document.documentId),
      documents.list(bobPrincipal, alpha),
      documents.getReceipt(bobPrincipal, alpha, 'create', 'create-one'),
    ]) await assert.rejects(operation, TenantAccessDeniedError);
    await owner.query('UPDATE wonffice.tenant_memberships SET revoked_at = NULL WHERE tenant_id = $1 AND identity_id = $2',
      [alpha, bob]);
  });
  let seededKey;
  await check('unsupported Note source is rejected before a durable attempt or provider write', async () => {
    const unsupported = JSON.parse(noteFile('keep me'));
    unsupported.document.content[0].content[0].unknown = 'must not be dropped';
    const receipt = await documents.create(alicePrincipal, alpha, {
      ...noteInput, snapshotText: JSON.stringify(unsupported),
      idempotencyKey: 'unsupported-collaboration-source',
    });
    let writes = 0;
    const collab = new CollaborationStore(pool, 'synthetic-project', 'synthetic-build', {
      async seed() { writes++; }, async inspect() { return null; },
    });
    await assert.rejects(collab.requestTransition(alicePrincipal, alpha,
      receipt.document.documentId, { expectedRevision: 1, idempotencyKey: 'reject-unsupported' }),
    error => error instanceof DocumentError && error.status === 422);
    assert.equal(writes, 0);
    assert.equal((await documents.open(alicePrincipal, alpha, receipt.document.documentId)).document.mode,
      'snapshot');
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM wonffice.document_collaboration_seeds
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, receipt.document.documentId])).rows[0].count, 0);
  });
  await check('collaboration seed freezes snapshots and resolves only confirmed current members', async () => {
    const receipt = await documents.create(alicePrincipal, alpha,
      { ...noteInput, idempotencyKey: 'collaboration-document' });
    const id = receipt.document.documentId;
    seededKey = receipt.document.documentKey;
    const seen = new Map();
    const seeder = {
      async seed(task) { seen.set(task.seedId, { documentKey: task.documentKey,
        providerProject: task.providerProject, providerBuild: task.providerBuild,
        seedId: task.seedId, snapshotRevision: task.snapshotRevision,
        snapshotHash: task.snapshotHash, providerCheckpoint: 'synthetic-checkpoint-1',
        providerSnapshotHash: task.canonicalSeed.canonicalTreeHash }); },
      async inspect(task) { return seen.get(task.seedId) ?? null; },
    };
    const collab = new CollaborationStore(pool, 'synthetic-project', 'synthetic-build', seeder);
    const before = await documents.open(alicePrincipal, alpha, id);
    await assert.rejects(collab.resolve(alicePrincipal, receipt.document.documentKey, 'write'),
      error => error instanceof DocumentError && error.status === 404);
    await assert.rejects(collab.requestTransition(bobPrincipal, beta, id,
      { expectedRevision: 1, idempotencyKey: 'foreign-seed' }),
    error => error instanceof DocumentError && error.status === 403);
    await assert.rejects(collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 2, idempotencyKey: 'stale-seed' }),
    error => error instanceof DocumentError && error.reason === 'revision_conflict');
    assert.equal((await documents.open(alicePrincipal, alpha, id)).document.mode, 'snapshot');
    const promoted = await collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'seed-once' });
    assert.equal(promoted.mode, 'collaborative');
    assert.equal(promoted.documentKey, receipt.document.documentKey);
    assert.equal(seen.size, 1);
    const frozen = (await owner.query(`SELECT snapshot_revision, snapshot_hash, source_snapshot_text,
      codec_version, canonical_seed, canonical_seed_hash
      FROM wonffice.document_collaboration_seeds WHERE tenant_id = $1 AND document_id = $2`,
    [alpha, id])).rows[0];
    assert.equal(frozen.snapshot_revision, 1);
    assert.equal(frozen.snapshot_hash, receipt.document.snapshotHash);
    assert.equal(frozen.source_snapshot_text, before.snapshotText);
    assert.equal(frozen.codec_version, 'note-full-seed-v2');
    assert.equal(frozen.canonical_seed.canonicalTreeHash, frozen.canonical_seed_hash);
    const ids = [frozen.canonical_seed.tree.id,
      ...frozen.canonical_seed.tree.content.flatMap(block => [block.id,
        ...block.content.map(child => child.id)])];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(value => value.startsWith('node:')));
    assert.equal((await collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'seed-once' })).mode, 'collaborative');
    assert.equal((await owner.query(`SELECT canonical_seed FROM wonffice.document_collaboration_seeds
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, id])).rows[0].canonical_seed.tree.id,
    frozen.canonical_seed.tree.id);
    assert.equal((await documents.open(alicePrincipal, alpha, id)).snapshotText, undefined);
    const seed = (await owner.query(`SELECT status, confirmed_provider_checkpoint,
      confirmed_provider_snapshot_hash FROM wonffice.document_collaboration_seeds
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, id])).rows[0];
    assert.equal(seed.status, 'confirmed');
    assert.equal(seed.confirmed_provider_checkpoint, 'synthetic-checkpoint-1');
    assert.equal(seed.confirmed_provider_snapshot_hash, (await owner.query(`SELECT canonical_seed_hash FROM wonffice.document_collaboration_seeds WHERE tenant_id = $1 AND document_id = $2`, [alpha, id])).rows[0].canonical_seed_hash);
    await assert.rejects(documents.updateSnapshot(alicePrincipal, alpha, id,
      { expectedRevision: 1, snapshotText: before.snapshotText, idempotencyKey: 'stale-after-seed' }),
    error => error instanceof DocumentError && error.reason === 'mode_conflict');
    assert.equal((await collab.resolve(alicePrincipal, receipt.document.documentKey, 'write')).documentId, id);
    await owner.query(`UPDATE wonffice.document_collaboration_seeds
      SET confirmed_provider_snapshot_hash = snapshot_hash WHERE tenant_id = $1 AND document_id = $2`,
    [alpha, id]);
    await assert.rejects(collab.resolve(alicePrincipal, receipt.document.documentKey, 'read'),
      error => error instanceof DocumentError && error.status === 404);
    await assert.rejects(collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'seed-once' }),
    error => error instanceof DocumentError && error.reason === 'seed_uncertain');
    await owner.query(`UPDATE wonffice.document_collaboration_seeds
      SET confirmed_provider_snapshot_hash = canonical_seed_hash WHERE tenant_id = $1 AND document_id = $2`,
    [alpha, id]);
    const other = await documents.create(alicePrincipal, alpha,
      { ...noteInput, idempotencyKey: 'other-collaboration-document' });
    assert.equal((await collab.requestTransition(alicePrincipal, alpha, other.document.documentId,
      { expectedRevision: 1, idempotencyKey: 'seed-once' })).mode, 'collaborative');
    assert.equal((await collab.resolve(bobPrincipal, receipt.document.documentKey, 'read')).documentId, id);
    await owner.query(`UPDATE wonffice.tenant_memberships SET role = 'viewer'
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, bob]);
    await assert.rejects(collab.resolve(bobPrincipal, receipt.document.documentKey, 'write'),
      error => error instanceof DocumentError && error.status === 403);
    await owner.query(`UPDATE wonffice.tenant_memberships SET revoked_at = now()
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, bob]);
    await assert.rejects(collab.resolve(bobPrincipal, receipt.document.documentKey, 'read'),
      TenantAccessDeniedError);
    await owner.query(`UPDATE wonffice.tenant_memberships SET role = 'editor', revoked_at = NULL
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, bob]);
    await assert.rejects(collab.resolve(alicePrincipal, `wonffice-${alpha}-${randomUUID()}`, 'write'),
      error => error instanceof DocumentError && error.status === 404);
  });
  await check('capability checks current session, document, role and exact Yorkie attributes', async () => {
    const documentId = (await owner.query('SELECT id FROM wonffice.documents WHERE document_key = $1',
      [seededKey])).rows[0].id;
    let currentSession = true;
    let gateCalls = 0;
    const capability = new CapabilityStore(pool, 'synthetic-project', 'synthetic-build',
      async session => { gateCalls++; return currentSession && session.issuer === issuer &&
        session.subject === 'alice' && session.sessionId === 'session-one'; });
    const input = { principal: alicePrincipal, sessionId: 'session-one',
      oidcExpiresAt: Math.floor(Date.now() / 1000) + 90, tenantId: alpha, documentId, access: 'rw' };
    const issued = await capability.issue(input);
    assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(issued.documentKey, seededKey);
    assert.ok(issued.expiresAt <= Date.now() / 1000 + 60);
    const stored = (await owner.query(`SELECT token_hash, issuer, subject, session_id,
      provider_project, provider_build, access
      FROM wonffice.document_capabilities WHERE document_id = $1`, [documentId])).rows[0];
    assert.equal(stored.token_hash, createHash('sha256').update(issued.token).digest('hex'));
    assert.equal(stored.provider_project, 'synthetic-project');
    assert.equal(stored.provider_build, 'synthetic-build');
    assert.ok(!JSON.stringify(stored).includes(issued.token));
    await assert.rejects(pool.query('SELECT * FROM wonffice.document_capabilities'), { code: '42501' });
    const authorize = (method, attributes, token = issued.token) =>
      capability.authorize({ token, method, attributes });
    const read = [{ key: seededKey, verb: 'r' }];
    const write = [{ key: seededKey, verb: 'rw' }];
    for (const method of ['AttachDocument', 'DetachDocument', 'PushPull', 'Watch', 'WatchDocument']) {
      assert.equal((await authorize(method, read)).status, 200);
      assert.equal((await authorize(method, write)).status, 200);
    }
    for (const method of ['ActivateClient', 'DeactivateClient']) {
      assert.equal((await authorize(method, [])).status, 200);
      assert.equal((await authorize(method, read)).status, 403);
    }
    for (const [method, attrs] of [
      ['RemoveDocument', write], ['WatchChannel', read], ['CreateRevision', read],
      ['Broadcast', []], ['unknown', []], ['PushPull', []],
      ['PushPull', [{ key: seededKey, verb: 'invalid' }]],
      ['PushPull', [{ key: seededKey, verb: 'r', extra: true }]],
      ['PushPull', [{ key: 'foreign-key', verb: 'r' }]],
      ['PushPull', [read[0], read[0]]],
    ]) assert.equal((await authorize(method, attrs)).status, 403);
    assert.equal((await authorize('PushPull', read, 'wrong-token')).status, 401);
    assert.ok(gateCalls > 1);
    const readOnly = await capability.issue({ ...input, access: 'r' });
    assert.equal((await authorize('PushPull', read, readOnly.token)).status, 200);
    assert.equal((await authorize('PushPull', write, readOnly.token)).status, 403);
    currentSession = false;
    assert.equal((await authorize('ActivateClient', [])).status, 403);
    await assert.rejects(capability.issue(input), error => error instanceof CapabilityError && error.status === 403);
    const gateOutage = new CapabilityStore(pool, 'synthetic-project', 'synthetic-build',
      async () => { throw new Error('synthetic_session_outage'); });
    assert.equal((await gateOutage.authorize({ token: issued.token,
      method: 'ActivateClient', attributes: [] })).status, 503);
    await assert.rejects(gateOutage.issue(input),
      error => error instanceof CapabilityError && error.status === 503);
    const databaseOutage = new CapabilityStore({ query: async () => {
      throw new Error('synthetic_database_outage');
    } }, 'synthetic-project', 'synthetic-build', async () => true);
    assert.deepEqual(await databaseOutage.authorize({ token: issued.token,
      method: 'ActivateClient', attributes: [] }),
    { allowed: false, status: 503, reason: 'unavailable' });
    currentSession = true;
    await owner.query(`UPDATE wonffice.tenant_memberships SET role = 'viewer'
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, alice]);
    assert.equal((await authorize('PushPull', write)).status, 403);
    assert.equal((await authorize('PushPull', read, readOnly.token)).status, 200);
    await owner.query(`UPDATE wonffice.tenant_memberships SET revoked_at = now()
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, alice]);
    assert.equal((await authorize('ActivateClient', [])).status, 403);
    await owner.query(`UPDATE wonffice.tenant_memberships SET role = 'editor', revoked_at = NULL
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, alice]);
    await owner.query(`UPDATE wonffice.document_collaboration_seeds SET provider_build = 'other-build'
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, documentId]);
    assert.equal((await authorize('PushPull', read)).status, 403);
    const changedProvider = new CapabilityStore(pool, 'synthetic-project', 'other-build',
      async session => session.sessionId === 'session-one');
    assert.equal((await changedProvider.authorize({ token: issued.token,
      method: 'PushPull', attributes: read })).status, 403);
    const replacementToken = await changedProvider.issue(input);
    assert.equal((await changedProvider.authorize({ token: replacementToken.token,
      method: 'PushPull', attributes: read })).status, 200);
    await assert.rejects(capability.issue(input),
      error => error instanceof CapabilityError && error.status === 403);
    await owner.query(`UPDATE wonffice.document_collaboration_seeds SET provider_build = 'synthetic-build'
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, documentId]);
    await owner.query(`UPDATE wonffice.document_collaboration_seeds SET status = 'uncertain',
      confirmed_at = NULL, confirmed_provider_checkpoint = NULL,
      confirmed_provider_snapshot_hash = NULL WHERE tenant_id = $1 AND document_id = $2`,
    [alpha, documentId]);
    assert.equal((await authorize('PushPull', read)).status, 403);
    await assert.rejects(capability.issue(input),
      error => error instanceof CapabilityError && error.status === 403);
    await owner.query(`UPDATE wonffice.document_collaboration_seeds SET status = 'confirmed',
      confirmed_at = now(), confirmed_provider_checkpoint = 'synthetic-checkpoint-1',
      confirmed_provider_snapshot_hash = canonical_seed_hash
      WHERE tenant_id = $1 AND document_id = $2`, [alpha, documentId]);
    await owner.query(`UPDATE wonffice.documents SET mode = 'snapshot'
      WHERE tenant_id = $1 AND id = $2`, [alpha, documentId]);
    assert.equal((await authorize('PushPull', read)).status, 403);
    await owner.query(`UPDATE wonffice.documents SET mode = 'collaborative'
      WHERE tenant_id = $1 AND id = $2`, [alpha, documentId]);
    await owner.query(`UPDATE wonffice.document_capabilities SET expires_at = now() - interval '1 second'
      WHERE token_hash = $1`, [stored.token_hash]);
    assert.equal((await authorize('ActivateClient', [])).status, 401);
    await assert.rejects(capability.issue({ ...input, oidcExpiresAt: Math.floor(Date.now() / 1000) - 1 }),
      error => error instanceof CapabilityError && error.status === 401);
  });
  await check('ambiguous seed stays closed until read-only reconciliation', async () => {
    const receipt = await documents.create(alicePrincipal, alpha,
      { ...noteInput, idempotencyKey: 'uncertain-document' });
    const id = receipt.document.documentId;
    let task;
    const seeder = { async seed(value) { task = value; throw new Error('lost_ack'); },
      async inspect() { return null; } };
    const collab = new CollaborationStore(pool, 'synthetic-project', 'synthetic-build', seeder);
    await assert.rejects(collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'uncertain-seed' }), /provider_seed_uncertain/);
    const opened = await documents.open(alicePrincipal, alpha, id);
    assert.equal(opened.document.mode, 'initializing');
    assert.equal(opened.transitionStatus, 'uncertain');
    assert.equal(opened.snapshotText, undefined);
    await assert.rejects(documents.updateSnapshot(alicePrincipal, alpha, id,
      { expectedRevision: 1, snapshotText: receipt.snapshotText, idempotencyKey: 'blocked-seed' }),
    error => error instanceof DocumentError && error.reason === 'mode_conflict');
    assert.equal((await collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'uncertain-seed' })).transitionStatus, 'uncertain');
    await assert.rejects(collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'different-seed' }),
    error => error instanceof DocumentError && error.reason === 'initialization_in_progress');
    assert.equal(task.documentKey, receipt.document.documentKey);
    await assert.rejects(collab.reconcile(alicePrincipal, alpha, id),
      error => error instanceof DocumentError && error.reason === 'seed_uncertain');
    seeder.inspect = async () => ({ documentKey: task.documentKey, providerProject: task.providerProject,
      providerBuild: task.providerBuild, seedId: task.seedId,
      snapshotRevision: task.snapshotRevision, snapshotHash: task.snapshotHash });
    const restarted = new CollaborationStore(pool, 'synthetic-project', 'synthetic-build', seeder);
    await assert.rejects(restarted.reconcile(alicePrincipal, alpha, id),
      error => error instanceof DocumentError && error.reason === 'seed_uncertain');
    seeder.inspect = async () => ({ documentKey: task.documentKey, providerProject: task.providerProject,
      providerBuild: task.providerBuild, seedId: task.seedId,
      snapshotRevision: task.snapshotRevision, snapshotHash: task.snapshotHash,
      providerCheckpoint: 'synthetic-checkpoint-2', providerSnapshotHash: task.canonicalSeed.canonicalTreeHash });
    assert.equal((await restarted.reconcile(alicePrincipal, alpha, id)).mode, 'collaborative');
    assert.equal((await restarted.resolve(alicePrincipal, receipt.document.documentKey, 'read')).documentId, id);
  });
  await check('concurrent transition requests write one seed and revocation blocks promotion', async () => {
    const receipt = await documents.create(alicePrincipal, alpha,
      { ...noteInput, idempotencyKey: 'concurrent-seed-document' });
    const id = receipt.document.documentId;
    let writes = 0;
    let unblock;
    const waitForProvider = new Promise(resolve => { unblock = resolve; });
    let observed;
    const seeder = {
      async seed(task) { writes++; observed = task; await waitForProvider; },
      async inspect(task) { return { documentKey: task.documentKey,
        providerProject: task.providerProject, providerBuild: task.providerBuild,
        seedId: task.seedId, snapshotRevision: task.snapshotRevision,
        snapshotHash: task.snapshotHash, providerCheckpoint: 'synthetic-checkpoint-3',
        providerSnapshotHash: task.canonicalSeed.canonicalTreeHash }; },
    };
    const collab = new CollaborationStore(pool, 'synthetic-project', 'synthetic-build', seeder);
    const first = collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'concurrent-seed' });
    while (!observed) await new Promise(resolve => setTimeout(resolve, 5));
    const second = await collab.requestTransition(alicePrincipal, alpha, id,
      { expectedRevision: 1, idempotencyKey: 'concurrent-seed' });
    assert.equal(second.mode, 'initializing');
    assert.equal(writes, 1);
    assert.equal((await withTenant(pool, beta, client => client.query(`SELECT *
      FROM wonffice.document_collaboration_seeds WHERE document_id = $1`, [id]))).rowCount, 0);
    await owner.query(`UPDATE wonffice.tenant_memberships SET revoked_at = now()
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, alice]);
    unblock();
    await assert.rejects(first, TenantAccessDeniedError);
    assert.equal((await owner.query(`SELECT d.mode, cs.status FROM wonffice.documents d
      JOIN wonffice.document_collaboration_seeds cs ON cs.tenant_id = d.tenant_id AND cs.document_id = d.id
      WHERE d.tenant_id = $1 AND d.id = $2`, [alpha, id])).rows[0].status, 'uncertain');
    await owner.query(`UPDATE wonffice.tenant_memberships SET revoked_at = NULL
      WHERE tenant_id = $1 AND identity_id = $2`, [alpha, alice]);
    assert.equal((await collab.reconcile(alicePrincipal, alpha, id)).mode, 'collaborative');
    assert.equal(writes, 1);
  });
  await check('collaborative mode never exposes or overwrites an old PostgreSQL snapshot', async () => {
    const id = created.document.documentId;
    const beforeCollab = { expectedRevision: 2, snapshotText: noteFile('before collaboration',
      created.document.pageId), idempotencyKey: 'before-collab' };
    const confirmed = await documents.updateSnapshot(alicePrincipal, alpha, id, beforeCollab);
    assert.equal(confirmed.document.revision, 3);
    await owner.query(`UPDATE wonffice.documents SET mode = 'collaborative'
      WHERE tenant_id = $1 AND id = $2`, [alpha, id]);
    const opened = await documents.open(alicePrincipal, alpha, id);
    assert.equal(opened.document.mode, 'collaborative');
    assert.equal(Object.hasOwn(opened, 'snapshotText'), false);
    await assert.rejects(documents.getReceipt(alicePrincipal, alpha, 'create', 'create-one'),
      error => error instanceof DocumentError && error.reason === 'mode_conflict');
    await assert.rejects(documents.create(alicePrincipal, alpha, noteInput),
      error => error instanceof DocumentError && error.reason === 'mode_conflict');
    await assert.rejects(documents.getReceipt(alicePrincipal, alpha, 'update', 'before-collab'),
      error => error instanceof DocumentError && error.reason === 'mode_conflict');
    await assert.rejects(documents.updateSnapshot(alicePrincipal, alpha, id, beforeCollab),
      error => error instanceof DocumentError && error.reason === 'mode_conflict');
    await assert.rejects(documents.updateSnapshot(alicePrincipal, alpha, id,
      { expectedRevision: opened.document.revision, snapshotText: noteFile('stale', created.document.pageId),
        idempotencyKey: 'stale-update' }),
    error => error instanceof DocumentError && error.reason === 'mode_conflict');
  });
  const snapshot = async client => {
    const content = {};
    for (const table of ['tenants', 'workspaces', 'documents', 'identities', 'membership_events']) {
      // Fixed internal table names; no external identifier is interpolated.
      content[table] = (await client.query(`SELECT * FROM wonffice.${table} ORDER BY id`)).rows;
    }
    content.tenant_memberships = (await client.query(`SELECT * FROM wonffice.tenant_memberships
      ORDER BY tenant_id, identity_id`)).rows;
    content.document_snapshots = (await client.query(`SELECT * FROM wonffice.document_snapshots
      ORDER BY tenant_id, document_id`)).rows;
    content.document_receipts = (await client.query(`SELECT * FROM wonffice.document_receipts
      ORDER BY tenant_id, identity_id, operation, idempotency_key`)).rows;
    content.document_collaboration_seeds = (await client.query(`SELECT * FROM wonffice.document_collaboration_seeds
      ORDER BY tenant_id, document_id`)).rows;
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
    const restoredMemberships = new MembershipStore(restoredPool);
    assert.deepEqual(await restoredMemberships.getTenantAccess({ issuer, subject: 'alice' }, alpha),
      { tenantId: alpha, role: 'editor' });
    const restoredDocuments = new DocumentStore(restoredPool);
    assert.equal((await restoredDocuments.open(alicePrincipal, alpha, created.document.documentId))
      .document.documentKey, created.document.documentKey);
    const restoredCollaboration = new CollaborationStore(restoredPool, 'synthetic-project', 'synthetic-build');
    const confirmed = await restoredCollaboration.resolve(alicePrincipal, seededKey, 'read');
    assert.equal(confirmed.providerProject, 'synthetic-project');
    assert.equal(confirmed.providerBuild, 'synthetic-build');
    assert.equal(confirmed.providerCheckpoint, 'synthetic-checkpoint-1');
    assert.equal(confirmed.providerSnapshotHash,
      (await withTenant(restoredPool, alpha, client => client.query(`SELECT canonical_seed_hash FROM wonffice.document_collaboration_seeds WHERE tenant_id = $1 AND document_id = $2`, [alpha, confirmed.documentId]))).rows[0].canonical_seed_hash);
    assert.equal((await restoredPool.query('SELECT id FROM wonffice.workspaces')).rowCount, 0);
    const invalidId = randomUUID();
    await assert.rejects(withTenant(restoredPool, alpha, client => client.query(`INSERT INTO wonffice.documents
      (tenant_id, id, workspace_id, product, document_key, page_id)
      VALUES ($1, $2, $3, 'note', $4, $2::uuid::text)`,
    [alpha, invalidId, b.id, `wonffice-${alpha}-${invalidId}`])), { code: '23503' });
    await assert.rejects(restoredPool.query('TRUNCATE wonffice.workspaces'), { code: '42501' });
  });
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  // Only remove this run's own cluster, after PostgreSQL has stopped successfully.
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
