import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { migrate } from '../dist/migrate.js';
import { CompanyMemberStore, CompanyMemberConflictError } from '../dist/company-member-store.js';
import { provisionMemberDirectory } from '../dist/member-directory-admin.js';

// Preparation driver: only Integration runs the private PostgreSQL experiment.
// A failure on the old source is an actual stale-confirmation regression, not a simulated reply.
const baseline = process.env.WONFFICE_377_BASELINE_RED === '1';
assert.ok(baseline !== (process.env.WONFFICE_377_GUARDED === '1'), 'one_explicit_execution_mode_required');
assert.ok(process.env.WONFFICE_377_EVIDENCE_DIR, 'fresh_private_evidence_directory_required');
const evidence = resolve(process.env.WONFFICE_377_EVIDENCE_DIR);
mkdirSync(evidence, { mode: 0o700 });
const save = (name, value) => writeFileSync(join(evidence, name),
  JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-377-confirmation-pg-');
const data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args,
  { encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
const config = (user, database = 'office_test') => ({ host: socket, port: 5432, user, database });
const clients = [], pools = [];
let started = false;
const connect = async (user, database) => {
  const client = new pg.Client(config(user, database));
  await client.connect(); clients.push(client); return client;
};
// Only table-row order is immaterial. Every column, duplicate and nested array stays exact.
function orderedRows(rows) {
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  };
  return rows.map(row => ({ row, key: JSON.stringify(canonical(row)) }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(entry => entry.row);
}
const ledger = async owner => {
  const tables = (await owner.query(`SELECT tablename FROM pg_tables
    WHERE schemaname='wonffice' ORDER BY tablename`)).rows;
  const entries = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z_][a-z0-9_]*$/);
    entries[tablename] = (await owner.query(`SELECT to_jsonb(t) AS row
      FROM wonffice."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.row);
  }
  return entries;
};


const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Every table is compared. Only an independently declared single audit append is allowed.
function expectAudit(before, after, expected, lower, upper, changed = {}) {
  assert.deepEqual(Object.keys(after), Object.keys(before));
  const oldEvents = before.company_member_admin_events;
  const newEvents = after.company_member_admin_events.filter(row => !oldEvents.some(old => old.id === row.id));
  assert.equal(newEvents.length, 1);
  const event = newEvents[0];
  assert.match(event.id, uuid); assert.match(event.request_id, uuid);
  assert.ok(!oldEvents.some(old => old.request_id === event.request_id));
  assert.deepEqual(Object.keys(event).sort(), ['id', 'tenant_id', 'actor_identity_id', 'actor_issuer',
    'actor_subject', 'target_identity_id', 'action', 'previous_role', 'requested_role', 'outcome',
    'request_id', 'created_at'].sort());
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(event[key], value, key);
  assert.ok(Date.parse(event.created_at) >= lower && Date.parse(event.created_at) <= upper);
  assert.deepEqual(orderedRows(after.company_member_admin_events.filter(row => row.id !== event.id)), orderedRows(oldEvents));
  for (const table of Object.keys(before)) {
    if (table !== 'company_member_admin_events') assert.deepEqual(orderedRows(after[table]), orderedRows(changed[table] ?? before[table]), table);
  }
  return event;
}
// The permitted provisioning delta is declared from the approval input and old row.
function expectProvision(before, after, input, lower, upper) {
  const old = before.member_directory.find(row => row.member_id === input.memberId && row.tenant_id === input.tenantId);
  assert.ok(old);
  const next = after.member_directory.find(row => row.member_id === input.memberId && row.tenant_id === input.tenantId);
  assert.ok(next);
  assert.ok(Date.parse(next.updated_at) >= lower && Date.parse(next.updated_at) <= upper);
  const expected = { ...old, display_label: input.displayLabel, source_category: input.sourceCategory,
    source_ref: input.sourceRef, approval_ref: input.approvalRef, actor_ref: input.actorRef,
    revision: input.expectedRevision + 1, updated_at: next.updated_at };
  const directory = before.member_directory.map(row => row === old ? expected : row);
  assert.deepEqual(orderedRows(after.member_directory), orderedRows(directory));
  const receipt = after.member_directory_events.find(row => row.tenant_id === input.tenantId && row.approval_ref === input.approvalRef);
  assert.ok(receipt);
  assert.ok(Date.parse(receipt.created_at) >= lower && Date.parse(receipt.created_at) <= upper);
  assert.deepEqual(receipt, { tenant_id: input.tenantId, approval_ref: input.approvalRef, member_id: input.memberId,
    request_hash: createHash('sha256').update(JSON.stringify(input)).digest('hex'), previous_revision: input.expectedRevision,
    result_entry: { tenantId: input.tenantId, memberId: input.memberId, memberCode: old.member_code,
      displayLabel: input.displayLabel, sourceCategory: input.sourceCategory, sourceRef: input.sourceRef,
      approvalRef: input.approvalRef, actorRef: input.actorRef, revision: input.expectedRevision + 1,
      updatedAt: new Date(next.updated_at).toISOString() }, created_at: receipt.created_at });
  assert.deepEqual(orderedRows(after.member_directory_events.filter(row => row !== receipt)), orderedRows(before.member_directory_events));
  return { member_directory: directory, member_directory_events: after.member_directory_events };
}
const serverTime = async owner => new Date((await owner.query('SELECT clock_timestamp() AS at')).rows[0].at).getTime();
const beginActor = async (client, tenant, principal) => {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query("SELECT set_config('wonffice.tenant_id',$1,true), set_config('wonffice.oidc_issuer',$2,true), set_config('wonffice.oidc_subject',$3,true)",
    [tenant, principal.issuer, principal.subject]);
};
const guardedSql = 'SELECT * FROM wonffice.company_member_change_confirmed($1,$2,$3,$4,$5,$6)';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const waitForBlocked = async (owner, blocked, blocker) => {
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    const row = (await owner.query('SELECT wait_event_type, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1', [blocked])).rows[0];
    if (row?.wait_event_type === 'Lock' && row.blockers.includes(blocker)) return row;
    await new Promise(done => setTimeout(done, 20));
  }
  throw new Error('actual_lock_wait_not_observed');
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
  const owner = await connect('wonffice_owner');
  const applied = await migrate(owner);
  const migrationRows = (await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
  save('migration-baseline.json', { applied, rows: migrationRows });
  if (!baseline) assert.ok(migrationRows.some(row => row.id === '0017_company_member_confirmation'), 'Integration_must_register_0017');
  const tenantId = randomUUID(), actorId = randomUUID(), targetId = randomUUID();
  const issuer = 'https://idp.example.test/synthetic-377';
  const principal = { issuer, subject: 'synthetic-owner-377' };
  await owner.query('INSERT INTO wonffice.tenants(id,name) VALUES($1,$2)', [tenantId, 'Synthetic377']);
  await owner.query('INSERT INTO wonffice.identities(id,issuer,subject) VALUES($1,$2,$3),($4,$2,$5)',
    [actorId, issuer, principal.subject, targetId, 'synthetic-colleague-377']);
  await owner.query(`INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role)
    VALUES($1,$2,'owner'),($1,$3,'viewer')`, [tenantId, actorId, targetId]);
  const manifest = { tenantId, memberId: targetId, displayLabel: 'Synthetic original colleague',
    sourceCategory: 'company_roster', sourceRef: 'roster:377-original',
    approvalRef: 'approval:377-original', actorRef: 'synthetic:377-private-owner', expectedRevision: null };
  const original = await provisionMemberDirectory(owner, manifest);
  const pool = new pg.Pool({ ...config('wonffice_app'), max: 1 }); pools.push(pool);
  const store = new CompanyMemberStore(pool);
  const displayed = (await store.listMembers(principal, tenantId)).members.find(member => member.memberId === targetId);
  assert.ok(displayed);
  assert.equal(displayed.identification.state, 'identified');
  assert.equal(displayed.identification.revision, original.entry.revision);
  const renamed = await provisionMemberDirectory(owner, { ...manifest,
    displayLabel: 'Synthetic renamed colleague', sourceRef: 'roster:377-renamed',
    approvalRef: 'approval:377-renamed', expectedRevision: displayed.identification.revision });
  assert.equal(renamed.entry.revision, displayed.identification.revision + 1);
  assert.equal(renamed.entry.memberCode, displayed.identification.memberCode);
  // The rename has committed before the stale request. Do not refresh the displayed revision.
  const before = await ledger(owner); save('before-stale-attempt.json', before);
  const lower = await serverTime(owner);
  let result, error;
  try { result = await store.setRole(principal, tenantId, targetId, 'editor', displayed.identification.revision); }
  catch (value) { error = value; }
  const after = await ledger(owner); save('after-stale-attempt.json', after);
  save('observed-stale-attempt.json', { tenantId, actorId, targetId, displayed, renamed,
    result: result ?? null, error: error ? { name: error.name, message: error.message } : null,
    targetBefore: before.tenant_memberships.find(row => row.identity_id === targetId),
    targetAfter: after.tenant_memberships.find(row => row.identity_id === targetId),
    qualification: 'Actual compiled store and protected SQL; approved rename wins before original displayed revision request.' });
  assert.ok(error instanceof CompanyMemberConflictError, 'stale_directory_revision_must_require_reconfirmation');
  assert.deepEqual(after.tenant_memberships, before.tenant_memberships, 'stale_confirmation_must_not_change_membership');
  const auditExpected = { tenant_id: tenantId, actor_identity_id: actorId, actor_issuer: issuer,
    actor_subject: principal.subject, target_identity_id: targetId, action: 'set_role',
    previous_role: 'viewer', requested_role: 'editor', outcome: 'conflict' };
  if (!baseline) {
    expectAudit(before, after, auditExpected, lower, await serverTime(owner));
    const check = async (name, work) => { await work(); console.log(JSON.stringify({ result: 'passed', check: name })); };
    const inspect = async (name, action, role, outcome, work, changed = {}) => {
      const before = await ledger(owner), lower = await serverTime(owner);
      let failure;
      try { await work(); } catch (error) { failure = error; }
      const after = await ledger(owner);
      save(`${name}.json`, { before, after, expected: { ...auditExpected, action, requested_role: role, outcome },
        failure: failure ? { name: failure.name, message: failure.message } : null });
      if (failure) throw failure;
      return expectAudit(before, after, { ...auditExpected, action, requested_role: role, outcome }, lower, await serverTime(owner), changed);
    };
    await check('stale revoke refuses with exactly one audit and every table unchanged', async () => {
      await inspect('stale-revoke', 'revoke', null, 'conflict',
        () => assert.rejects(store.revoke(principal, tenantId, targetId, 1), CompanyMemberConflictError));
    });
    await check('unidentified exact target refuses without role effect', async () => {
      await owner.query('DELETE FROM wonffice.member_directory_events WHERE tenant_id=$1 AND member_id=$2', [tenantId, targetId]);
      await owner.query('DELETE FROM wonffice.member_directory WHERE tenant_id=$1 AND member_id=$2', [tenantId, targetId]);
      await inspect('unidentified-target', 'set_role', 'editor', 'conflict',
        () => assert.rejects(store.setRole(principal, tenantId, targetId, 'editor', 2), CompanyMemberConflictError));
      // A separate explicitly approved synthetic setup; no production backfill.
      await provisionMemberDirectory(owner, { ...manifest, approvalRef: 'approval:377-recreated' });
    });
    const recreated = (await store.listMembers(principal, tenantId)).members.find(member => member.memberId === targetId);
    const revision = recreated.identification.revision;
    assert.equal(revision, 1);
    await check('app legacy entry point and PUBLIC grant are closed', async () => {
      const grants = (await owner.query(`SELECT
        has_function_privilege('wonffice_app','wonffice.company_member_change(uuid,uuid,text,text,uuid)','EXECUTE') AS legacy,
        has_function_privilege('wonffice_app','wonffice.company_member_change_confirmed(uuid,uuid,text,text,integer,uuid)','EXECUTE') AS guarded,
        EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
          WHERE p.oid IN ('wonffice.company_member_change(uuid,uuid,text,text,uuid)'::regprocedure,
            'wonffice.company_member_change_confirmed(uuid,uuid,text,text,integer,uuid)'::regprocedure)
            AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute`)).rows[0];
      assert.deepEqual(grants, { legacy: false, guarded: true, public_execute: false });
      const before = await ledger(owner);
      await assert.rejects(pool.query("SELECT * FROM wonffice.company_member_change($1,$2,'set_role','editor',$3)",
        [tenantId, targetId, randomUUID()]), { code: '42501' });
      assert.deepEqual(await ledger(owner), before); save('privilege-closure.json', grants);
    });
    const mutation = await connect('wonffice_app');
    const mutationPid = (await mutation.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const ownerPid = (await owner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await check('guarded mutation wins and blocks approved rename until its commit', async () => {
      const before = await ledger(owner), lower = await serverTime(owner), requestId = randomUUID();
      await beginActor(mutation, tenantId, principal);
      const result = (await mutation.query(guardedSql, [tenantId, targetId, 'set_role', 'editor', revision, requestId])).rows[0];
      save('mutation-first-returned-result.json', { before, result, requestId, stage: 'actual SQL result before commit/provisioning; no committed after ledger yet' });
      assert.deepEqual(result, { status: 'applied', previous_role: 'viewer', new_role: 'editor', active: true });
      const pending = provisionMemberDirectory(owner, { ...manifest, displayLabel: 'Synthetic mutation-first rename',
        approvalRef: 'approval:377-mutation-first', expectedRevision: revision });
      const settling = pending.then(value => ({ value }), error => ({ error }));
      try {
        const lock = await waitForBlocked(admin, ownerPid, mutationPid); save('mutation-first-lock.json', lock);
        await mutation.query('COMMIT');
      } catch (error) { await mutation.query('ROLLBACK'); await settling; throw error; }
      const settled = await settling; if (settled.error) throw settled.error;
      const after = await ledger(owner);
      save('mutation-first-effects.json', { before, after, result, provisioning: settled.value });
      const expectedMemberships = before.tenant_memberships.map(row => row.identity_id === targetId ? { ...row, role: 'editor' } : row);
      const upper = await serverTime(owner);
      const provisioning = expectProvision(before, after, { ...manifest, displayLabel: 'Synthetic mutation-first rename',
        approvalRef: 'approval:377-mutation-first', expectedRevision: revision }, lower, upper);
      expectAudit(before, after, { ...auditExpected, outcome: 'applied', request_id: requestId }, lower, upper,
        { tenant_memberships: expectedMemberships, ...provisioning });

    });
    await check('approved rename wins; waiting stale guarded mutation refuses after commit', async () => {
      const before = await ledger(owner), lower = await serverTime(owner), requestId = randomUUID();
      const reached = deferred(), release = deferred();
      const heldOwner = { query: async (...args) => {
        if (args[0] === 'COMMIT') { reached.resolve(); await release.promise; }
        return owner.query(...args);
      } };
      const rename = provisionMemberDirectory(heldOwner, { ...manifest, displayLabel: 'Synthetic rename-first',
        approvalRef: 'approval:377-rename-first', expectedRevision: 2 });
      const settledRename = rename.then(value => ({ value }), error => { reached.resolve(); return { error }; });
      await reached.promise;
      await beginActor(mutation, tenantId, principal);
      const pending = mutation.query(guardedSql, [tenantId, targetId, 'set_role', 'viewer', 2, requestId]);
      const settledMutation = pending.then(value => ({ value }), error => ({ error }));
      try {
        save('rename-first-lock.json', await waitForBlocked(admin, mutationPid, ownerPid));
        release.resolve();
        const result = await settledRename; if (result.error) throw result.error;
        const changed = await settledMutation; if (changed.error) throw changed.error;
        save('rename-first-returned-results.json', { before, mutation: changed.value.rows[0], provisioning: result.value, stage: 'actual responses before mutation commit' });
        assert.deepEqual(changed.value.rows[0], { status: 'conflict', previous_role: 'editor', new_role: null, active: null });
        await mutation.query('COMMIT');
      } finally { release.resolve(); await settledRename; await settledMutation; await mutation.query('ROLLBACK'); }
      const after = await ledger(owner);
      save('rename-first-effects.json', { before, after });
      const upper = await serverTime(owner);
      const provisioning = expectProvision(before, after, { ...manifest, displayLabel: 'Synthetic rename-first',
        approvalRef: 'approval:377-rename-first', expectedRevision: 2 }, lower, upper);
      expectAudit(before, after, { ...auditExpected, previous_role: 'editor', requested_role: 'viewer', outcome: 'conflict', request_id: requestId },
        lower, upper, provisioning);

    });
    await check('refusal audit failure rolls back without membership or ledger changes', async () => {
      await owner.query(`CREATE FUNCTION wonffice.reject_377_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$;
        CREATE TRIGGER reject_377_audit BEFORE INSERT ON wonffice.company_member_admin_events
        FOR EACH ROW EXECUTE FUNCTION wonffice.reject_377_audit()`);
      const before = await ledger(owner);
      try {
        await assert.rejects(store.setRole(principal, tenantId, targetId, 'viewer', 2), /synthetic_audit_failure/);
        const after = await ledger(owner); save('audit-failure-no-effects.json', { before, after });
        assert.deepEqual(after, before);
      } finally { await owner.query('DROP TRIGGER reject_377_audit ON wonffice.company_member_admin_events; DROP FUNCTION wonffice.reject_377_audit()'); }
    });
    await check('guard, directory, privilege closure and whole ledger survive PostgreSQL restart', async () => {
      const before = await ledger(owner);
      await Promise.all(pools.map(pool => pool.end())); pools.length = 0;
      await Promise.all(clients.map(client => client.end())); clients.length = 0;
      run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
      run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
      const restarted = await connect('wonffice_owner');
      assert.deepEqual(await ledger(restarted), before);
      assert.deepEqual(await migrate(restarted), []);
      const postPool = new pg.Pool({ ...config('wonffice_app'), max: 1 }); pools.push(postPool);
      const restartLower = await serverTime(restarted);
      await assert.rejects(new CompanyMemberStore(postPool).revoke(principal, tenantId, targetId, 2), CompanyMemberConflictError);
      const after = await ledger(restarted);
      save('restart-ledgers.json', { before, after });
      expectAudit(before, after, { ...auditExpected, action: 'revoke', previous_role: 'editor', requested_role: null, outcome: 'conflict' },
        restartLower, await serverTime(restarted));
      await assert.rejects(postPool.query("SELECT * FROM wonffice.company_member_change($1,$2,'revoke',NULL,$3)", [tenantId, targetId, randomUUID()]), { code: '42501' });
    });
  }
  console.log(JSON.stringify({ result: 'passed', check: 'stale displayed revision refuses after committed rename' }));
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) {
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    started = false;
    copyFileSync(join(directory, 'postgres.log'), join(evidence, 'postgres.log'));
  }
  rmSync(directory, { recursive: true, force: true });
}
