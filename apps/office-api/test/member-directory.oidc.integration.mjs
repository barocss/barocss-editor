import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, constants, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import pg from 'pg';
import { migrate } from '../../office-service/dist/migrate.js';
import { MembershipStore } from '../../office-service/dist/membership-store.js';
import { CompanyMemberStore } from '../../office-service/dist/company-member-store.js';
import { provisionMemberDirectory } from '../../office-service/dist/member-directory-admin.js';
import { createApiServer } from '../dist/server.js';
import { readAuthConfig } from '../dist/auth-config.js';
import { createOidcVerifier } from '../dist/oidc.js';

const fixturePath = process.env.WONFFICE_LOCAL_KEYCLOAK_USERS_FILE;
if (!fixturePath || statSync(fixturePath).mode & 0o077) {
  throw new Error('missing_or_unsafe_synthetic_oidc_fixture');
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+\/realms\/wonffice-local$/.test(fixture.issuer) ||
  fixture.clientId !== 'wonffice-browser' || fixture.audience !== 'wonffice-api' ||
  !fixture.users['alpha-editor']?.id || !fixture.users['beta-viewer']?.id) {
  throw new Error('unexpected_synthetic_oidc_fixture');
}
// Integration supplies a fresh private child path. Never reuse an old evidence directory.
if (!process.env.WONFFICE_377_DIRECTORY_EVIDENCE_DIR) throw new Error('fresh_directory_evidence_required');
const evidence = resolve(process.env.WONFFICE_377_DIRECTORY_EVIDENCE_DIR);
mkdirSync(evidence, { mode: 0o700 });
const secrets = [fixture.users['alpha-editor'].password, fixture.users['beta-viewer'].password];
const save = (name, value) => {
  // Tokens/passwords are never request evidence. If a defective reply contains one,
  // retain a redacted failure record, not the secret itself.
  let text = JSON.stringify(value, null, 2);
  let redacted = false;
  for (const secret of secrets.filter(value => typeof value === 'string' && value.length > 0)) {
    const encoded = JSON.stringify(secret).slice(1, -1);
    if (text.includes(encoded)) { text = text.split(encoded).join('[REDACTED_SECRET]'); redacted = true; }
  }
  writeFileSync(join(evidence, name), text + '\n', { mode: 0o600, flag: 'wx' });
  if (redacted) throw new Error('secret_in_evidence_refused_after_redacted_capture');
};
const redirectUri = 'http://127.0.0.1:18200/callback';
const callbacks = new Map();
const callbackServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', redirectUri);
  const pending = callbacks.get(url.searchParams.get('state'));
  if (url.pathname !== '/callback' || !pending) return response.writeHead(400).end();
  callbacks.delete(url.searchParams.get('state'));
  response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('Complete');
  pending(url.searchParams.get('code'));
});

const bin = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync('/tmp/wonffice-directory-oidc-');
const data = join(directory, 'data');
const socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = user => ({ host: socket, port: 5432, user, database: 'office_test' });
let started = false;
let callbackStarted = false;
let browser;
let app;
let pool;
let owner;
let admin;
let executionFailure;
let cleanupFailure;
let sequence = 0;
const contexts = [];

// BEGIN matrix evidence helpers (source controls extract these actual functions).
function orderedRows(rows) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) :
    value && typeof value === 'object' ? Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return rows.map(row => ({ row, key: JSON.stringify(canonical(row)) }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(entry => entry.row);
}
const ledger = async () => {
  const tables = (await owner.query("SELECT tablename FROM pg_tables WHERE schemaname='wonffice' ORDER BY tablename")).rows;
  const result = {};
  for (const { tablename } of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) throw new Error('unsafe_table_name');
    result[tablename] = (await owner.query(`SELECT to_jsonb(t) AS row FROM wonffice."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.row);
  }
  return result;
};
const serverTime = async () => Date.parse((await owner.query('SELECT clock_timestamp()::text AS at')).rows[0].at);
const failureRecord = error => ({ name: error.name ?? 'Error', message: error.message ?? String(error) });
// Each work function is invoked ONCE. Even a transport/parse/SQL error is saved
// with its available before/after ledgers before any caller assertion can run.
async function capturePhase(name, work) {
  const record = { name, before: null, after: null, lower: null, upper: null, result: null, error: null, captureError: null };
  let failure;
  try {
    record.before = await ledger(); record.lower = await serverTime();
    record.result = await work(record.before);
  } catch (error) { failure = error; record.error = failureRecord(error); }
  try { record.after = await ledger(); record.upper = await serverTime(); }
  catch (error) { failure ??= error; record.captureError = failureRecord(error); }
  save(`${String(++sequence).padStart(3, '0')}-${name}.json`, record);
  if (failure) throw failure;
  return record;
}
function expectTables(before, after, changed = {}) {
  assert.equal(Object.keys(before).length, 25, 'exact_current_25_table_graph_required');
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  for (const table of Object.keys(before)) assert.deepEqual(orderedRows(after[table]), orderedRows(changed[table] ?? before[table]), table);
}
function expectAudit(record, expected, changed = {}) {
  const { before, after, lower, upper } = record;
  const oldEvents = before.company_member_admin_events;
  const newEvents = after.company_member_admin_events.filter(row => !oldEvents.some(old => old.id === row.id));
  assert.equal(newEvents.length, 1, 'exactly_one_existing_audit_append');
  const event = newEvents[0];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(event.id, uuid); assert.match(event.request_id, uuid);
  assert.ok(!oldEvents.some(old => old.request_id === event.request_id));
  assert.deepEqual(Object.keys(event).sort(), ['id', 'tenant_id', 'actor_identity_id', 'actor_issuer',
    'actor_subject', 'target_identity_id', 'action', 'previous_role', 'requested_role', 'outcome', 'request_id', 'created_at'].sort());
  assert.equal(Object.keys(expected).length, 9, 'all_nine_declared_audit_values_required');
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(event[key], value, key);
  assert.ok(Date.parse(event.created_at) >= lower && Date.parse(event.created_at) <= upper);
  expectTables(before, after, { ...changed, company_member_admin_events: [...oldEvents, event] });
}
function expectedMembership(record, tenantId, memberId, role, revoked) {
  const old = record.before.tenant_memberships.find(row => row.tenant_id === tenantId && row.identity_id === memberId);
  assert.ok(old);
  let next = { ...old, role };
  if (revoked) {
    const actual = record.after.tenant_memberships.find(row => row.tenant_id === tenantId && row.identity_id === memberId);
    assert.ok(actual?.revoked_at);
    assert.ok(Date.parse(actual.revoked_at) >= record.lower && Date.parse(actual.revoked_at) <= record.upper);
    next = { ...next, revoked_at: actual.revoked_at };
  }
  return record.before.tenant_memberships.map(row => row === old ? next : row);
}
// END matrix evidence helpers.

async function login(username) {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  const authorization = new URL(`${fixture.issuer}/protocol/openid-connect/auth`);
  authorization.search = new URLSearchParams({ client_id: fixture.clientId, response_type: 'code',
    scope: 'openid', redirect_uri: redirectUri, code_challenge_method: 'S256',
    code_challenge: challenge, state }).toString();
  const callback = new Promise(resolve => { callbacks.set(state, resolve); });
  await page.goto(authorization.href);
  await page.locator('#username').fill(fixture.users[username].username ?? username);
  await page.locator('#password').fill(fixture.users[username].password);
  await page.locator('#kc-login').click();
  await page.waitForURL(url => url.pathname === '/callback', { timeout: 15000 });
  const code = await Promise.race([callback, page.waitForTimeout(10000).then(() => null)]);
  if (!code) throw new Error('synthetic_oidc_authorization_failed');
  const tokenResponse = await fetch(`${fixture.issuer}/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: fixture.clientId,
      redirect_uri: redirectUri, code, code_verifier: verifier }),
  });
  if (!tokenResponse.ok) throw new Error('synthetic_oidc_token_exchange_failed');
  const token = (await tokenResponse.json()).access_token;
  if (typeof token !== 'string') throw new Error('synthetic_oidc_token_missing');
  return token;
}

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
  const applied = await migrate(owner);
  const migrations = (await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows;
  save('migration-baseline.json', { applied, migrations });
  assert.ok(migrations.some(row => row.id === '0017_company_member_confirmation'), 'Integration_must_register_0017');
  const alpha = randomUUID(), beta = randomUUID();
  const alphaOwnerId = randomUUID(), betaEditorId = randomUUID();
  await owner.query('INSERT INTO wonffice.tenants (id, name) VALUES ($1, $2), ($3, $4)',
    [alpha, 'Synthetic Alpha', beta, 'Synthetic Beta']);
  await owner.query('INSERT INTO wonffice.identities (id, issuer, subject) VALUES ($1, $2, $3), ($4, $2, $5)',
    [alphaOwnerId, fixture.issuer, fixture.users['alpha-editor'].id,
      betaEditorId, fixture.users['beta-viewer'].id]);
  await owner.query(`INSERT INTO wonffice.tenant_memberships (tenant_id, identity_id, role)
    VALUES ($1, $2, 'owner'), ($1, $3, 'editor'), ($4, $3, 'owner')`,
  [alpha, alphaOwnerId, betaEditorId, beta]);

  const directoryInput = (tenantId, memberId, approvalRef, expectedRevision = null,
    displayLabel = '가상 동명이인') => ({ tenantId, memberId, approvalRef, expectedRevision,
      displayLabel, sourceCategory: 'company_roster', sourceRef: 'roster:synthetic', actorRef: 'operator:synthetic' });
  const first = await provisionMemberDirectory(owner, directoryInput(alpha, alphaOwnerId, 'approval:owner'));
  const duplicate = await provisionMemberDirectory(owner, directoryInput(alpha, betaEditorId, 'approval:editor'));
  assert.equal(first.entry.displayLabel, duplicate.entry.displayLabel);
  assert.notEqual(first.entry.memberCode, duplicate.entry.memberCode);
  const renamed = await provisionMemberDirectory(owner, directoryInput(alpha, betaEditorId,
    'approval:rename', 1, '<가상 변경 구성원>'));
  assert.equal(renamed.entry.memberCode, duplicate.entry.memberCode);
  assert.equal(renamed.entry.revision, 2);
  assert.deepEqual(await provisionMemberDirectory(owner, directoryInput(alpha, betaEditorId, 'approval:editor')),
    { applied: false, entry: duplicate.entry });

  await new Promise((resolve, reject) => {
    callbackServer.once('error', reject);
    callbackServer.listen(18200, '127.0.0.1', resolve);
  });
  callbackStarted = true;
  browser = await chromium.launch({ headless: true });
  pool = new pg.Pool({ ...config('wonffice_app'), max: 3 });
  const authConfig = readAuthConfig({ OFFICE_OIDC_ISSUER: fixture.issuer,
    OFFICE_OIDC_JWKS_URL: `${fixture.issuer}/protocol/openid-connect/certs`,
    OFFICE_OIDC_AUDIENCE: fixture.audience, OFFICE_API_DATABASE_URL: 'postgresql://synthetic/app' });
  assert.ok(authConfig);
  app = createApiServer({ verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool), companyMembers: new CompanyMemberStore(pool) });
  await app.listen({ host: '127.0.0.1', port: 14208 });
  const apiAddress = new URL(app.server.address() ? `http://127.0.0.1:${app.server.address().port}` : '');

  const alphaToken = await login('alpha-editor');
  const betaToken = await login('beta-viewer');
  secrets.push(alphaToken, betaToken);
  const actors = new Map([[alphaToken, { id: alphaOwnerId, subject: fixture.users['alpha-editor'].id }],
    [betaToken, { id: betaEditorId, subject: fixture.users['beta-viewer'].id }]]);
  const request = async (token, method, path, status, payload) => {
    const record = await capturePhase(`http-${method.toLowerCase()}-${status}`, async () => {
      const response = await fetch(new URL(path, apiAddress), {
        method,
        headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const result = { method, path, payload: payload ?? null, status: response.status,
        headers: Object.fromEntries(response.headers), text: null, body: null, readError: null, parseError: null };
      try { result.text = await response.text(); }
      catch (error) { result.readError = failureRecord(error); return result; }
      try { result.body = JSON.parse(result.text); }
      catch (error) { result.parseError = failureRecord(error); }
      return result;
    });
    assert.equal(record.result.status, status, path);
    assert.equal(record.result.readError, null, 'actual_response_body_read_must_complete');
    assert.equal(record.result.parseError, null, 'actual_response_must_be_json');
    const route = /^\/v1\/tenants\/([0-9a-f-]+)\/members(?:\/([0-9a-f-]+))?$/.exec(path);
    if (!route || [400, 401, 503].includes(status)) expectTables(record.before, record.after);
    else {
      const actor = actors.get(token); assert.ok(actor);
      const tenantId = route[1], targetId = route[2] ?? null;
      const actorRow = record.before.tenant_memberships.find(row => row.tenant_id === tenantId && row.identity_id === actor.id);
      const target = record.before.tenant_memberships.find(row => row.tenant_id === tenantId && row.identity_id === targetId);
      const privileged = actorRow?.revoked_at === null && ['owner', 'admin'].includes(actorRow.role);
      const previousRole = targetId && privileged ? target?.role ?? null : null;
      const changed = {};
      if (status === 200 && targetId) changed.tenant_memberships = expectedMembership(record,
        tenantId, targetId, method === 'DELETE' ? target.role : payload.role, method === 'DELETE');
      expectAudit(record, { tenant_id: tenantId, actor_identity_id: actor.id,
        actor_issuer: fixture.issuer, actor_subject: actor.subject, target_identity_id: targetId,
        action: method === 'GET' ? 'list' : method === 'DELETE' ? 'revoke' : 'set_role',
        previous_role: previousRole, requested_role: method === 'PATCH' ? payload.role : null,
        outcome: status === 403 ? 'forbidden' : status === 409 ? 'conflict' :
          method === 'GET' ? 'allowed' : method === 'PATCH' && previousRole === payload.role ? 'no_change' : 'applied' }, changed);
    }
    return record.result.body;
  };
  const get = (token, path, status) => request(token, 'GET', path, status);
  const alphaMembers = `/v1/tenants/${alpha}/members`;
  const betaMembers = `/v1/tenants/${beta}/members`;
  assert.deepEqual((await get(alphaToken, alphaMembers, 200)).members.map(member => member.memberId).sort(),
    [alphaOwnerId, betaEditorId].sort());
  assert.deepEqual((await get(betaToken, betaMembers, 200)).members.map(member => member.memberId),
    [betaEditorId]);
  const initialList = await get(alphaToken, alphaMembers, 200);
  const observed = initialList.members.find(member => member.memberId === betaEditorId).identification;
  assert.deepEqual(observed, { state: 'identified', displayLabel: renamed.entry.displayLabel,
    memberCode: renamed.entry.memberCode, sourceCategory: 'company_roster', revision: 2,
    updatedAt: renamed.entry.updatedAt });
  const betaList = await get(betaToken, betaMembers, 200);
  assert.deepEqual(betaList.members[0].identification, { state: 'unidentified', displayLabel: null,
    memberCode: null, sourceCategory: null, revision: null, updatedAt: null });
  for (const privateValue of [fixture.issuer, 'approval:', 'roster:', 'operator:', 'password', 'access_token'])
    assert.ok(!JSON.stringify(initialList).includes(privateValue));
  assert.deepEqual(await request(alphaToken, 'POST', `${alphaMembers}/${betaEditorId}/directory`, 404,
    { displayLabel: 'not-approved' }), { status: 'not_found' });
  // Fixture role changes are private setup, never product grant API evidence.
  const setFixtureRole = async (memberId, previousRole, nextRole) => {
    const record = await capturePhase(`fixture-role-${previousRole}-${nextRole}`, before => {
      const row = before.tenant_memberships.find(row => row.tenant_id === alpha && row.identity_id === memberId);
      return owner.query(`UPDATE wonffice.tenant_memberships SET role=$3
        WHERE tenant_id=$1 AND identity_id=$2 AND role=$4
          AND created_at=$5::timestamptz AND revoked_at IS NOT DISTINCT FROM $6::timestamptz`,
      [alpha, memberId, nextRole, previousRole, row?.created_at, row?.revoked_at]);
    });
    assert.equal(record.result.rowCount, 1, 'exact_fixture_guard_required');
    assert.equal(record.before.tenant_memberships.find(row => row.tenant_id === alpha && row.identity_id === memberId).role, previousRole);
    expectTables(record.before, record.after, { tenant_memberships: expectedMembership(record, alpha, memberId, nextRole, false) });
  };
  await setFixtureRole(alphaOwnerId, 'owner', 'admin');
  assert.equal((await get(alphaToken, alphaMembers, 200)).members.length, 2);
  await setFixtureRole(alphaOwnerId, 'admin', 'viewer');
  assert.deepEqual(await get(alphaToken, alphaMembers, 403), { status: 'forbidden' });
  await setFixtureRole(alphaOwnerId, 'viewer', 'owner');
  assert.deepEqual(await get(betaToken, alphaMembers, 403), { status: 'forbidden' });
  assert.deepEqual(await get('invalid', alphaMembers, 401), { status: 'unauthorized' });

  // BEGIN genuine matrix. Observed target revision2 is fixed before every await.
  assert.equal(observed.revision, 2);
  const targetPath = `${alphaMembers}/${betaEditorId}`;
  const patch2 = { role: 'viewer', expectedDirectoryRevision: 2 };
  const delete2 = { expectedDirectoryRevision: 2 };
  for (const [method, path, body] of [['GET', alphaMembers, undefined], ['PATCH', targetPath, patch2], ['DELETE', targetPath, delete2]])
    assert.deepEqual(await request(null, method, path, 401, body), { status: 'unauthorized' });

  for (const actorRole of ['owner', 'admin']) {
    if (actorRole === 'admin') await setFixtureRole(alphaOwnerId, 'owner', 'admin');
    assert.deepEqual((await get(alphaToken, alphaMembers, 200)).members.map(row => row.memberId).sort(), [alphaOwnerId, betaEditorId].sort());
    assert.deepEqual(await request(alphaToken, 'PATCH', targetPath, 200,
      { role: 'editor', expectedDirectoryRevision: 2 }), { memberId: betaEditorId, role: 'editor', active: true, changed: false });
  }
  // Real admin-applied changes, then explicit restoration of the original editor.
  assert.deepEqual(await request(alphaToken, 'PATCH', targetPath, 200,
    { role: 'viewer', expectedDirectoryRevision: 2 }), { memberId: betaEditorId, role: 'viewer', active: true, changed: true });
  assert.deepEqual(await request(alphaToken, 'PATCH', targetPath, 200,
    { role: 'editor', expectedDirectoryRevision: 2 }), { memberId: betaEditorId, role: 'editor', active: true, changed: true });
  await setFixtureRole(alphaOwnerId, 'admin', 'editor');
  for (const actorRole of ['editor', 'viewer']) {
    if (actorRole === 'viewer') await setFixtureRole(alphaOwnerId, 'editor', 'viewer');
    for (const [method, path, body] of [['GET', alphaMembers, undefined], ['PATCH', targetPath, patch2], ['DELETE', targetPath, delete2]])
      assert.deepEqual(await request(alphaToken, method, path, 403, body), { status: 'forbidden' });
  }
  await setFixtureRole(alphaOwnerId, 'viewer', 'owner');
  for (const [token, members, memberId, revision] of [[alphaToken, betaMembers, betaEditorId, 1], [betaToken, alphaMembers, alphaOwnerId, 1]]) {
    assert.deepEqual(await get(token, members, 403), { status: 'forbidden' });
    assert.deepEqual(await request(token, 'PATCH', `${members}/${memberId}`, 403,
      { role: 'viewer', expectedDirectoryRevision: revision }), { status: 'forbidden' });
    assert.deepEqual(await request(token, 'DELETE', `${members}/${memberId}`, 403,
      { expectedDirectoryRevision: revision }), { status: 'forbidden' });
  }
  // The sole alpha owner uses its OWN displayed revision1, not the target's2.
  assert.equal(first.entry.revision, 1);
  for (const method of ['PATCH', 'DELETE']) assert.deepEqual(await request(alphaToken, method,
    `${alphaMembers}/${alphaOwnerId}`, 403, method === 'PATCH' ?
      { role: 'viewer', expectedDirectoryRevision: 1 } : { expectedDirectoryRevision: 1 }), { status: 'forbidden' });
  await setFixtureRole(betaEditorId, 'editor', 'admin');
  for (const method of ['PATCH', 'DELETE']) assert.deepEqual(await request(alphaToken, method,
    targetPath, 403, method === 'PATCH' ? patch2 : delete2), { status: 'forbidden' });
  await setFixtureRole(betaEditorId, 'admin', 'editor');
  for (const revision of [null, '2', true, 0, -1, 2.5, 2147483648]) {
    await request(alphaToken, 'PATCH', targetPath, 400, { role: 'viewer', expectedDirectoryRevision: revision });
    await request(alphaToken, 'DELETE', targetPath, 400, { expectedDirectoryRevision: revision });
  }
  for (const body of [{ role: 'viewer' }, { role: 'viewer', expectedDirectoryRevision: 2, extra: true },
    { role: 'owner', expectedDirectoryRevision: 2 }, { role: 'admin', expectedDirectoryRevision: 2 }])
    await request(alphaToken, 'PATCH', targetPath, 400, body);
  for (const body of [{}, { expectedDirectoryRevision: 2, extra: true }]) await request(alphaToken, 'DELETE', targetPath, 400, body);

  const renameInput = directoryInput(alpha, betaEditorId, 'approval:matrix-rename', 2, '<가상 재확인 구성원>');
  const renameRecord = await capturePhase('fixture-approved-rename-2-to-3', () => provisionMemberDirectory(owner, renameInput));
  const oldDirectory = renameRecord.before.member_directory.find(row => row.tenant_id === alpha && row.member_id === betaEditorId);
  const nextDirectory = renameRecord.after.member_directory.find(row => row.tenant_id === alpha && row.member_id === betaEditorId);
  assert.ok(oldDirectory && nextDirectory);
  assert.ok(Date.parse(nextDirectory.updated_at) >= renameRecord.lower && Date.parse(nextDirectory.updated_at) <= renameRecord.upper);
  const expectedDirectory = { ...oldDirectory, display_label: renameInput.displayLabel,
    source_category: renameInput.sourceCategory, source_ref: renameInput.sourceRef,
    approval_ref: renameInput.approvalRef, actor_ref: renameInput.actorRef, revision: 3, updated_at: nextDirectory.updated_at };
  const confirmed = { ...observed, displayLabel: renameInput.displayLabel, revision: 3,
    updatedAt: new Date(nextDirectory.updated_at).toISOString() };
  const expectedEntry = { tenantId: alpha, memberId: betaEditorId, memberCode: observed.memberCode,
    displayLabel: renameInput.displayLabel, sourceCategory: renameInput.sourceCategory,
    sourceRef: renameInput.sourceRef, approvalRef: renameInput.approvalRef, actorRef: renameInput.actorRef,
    revision: 3, updatedAt: confirmed.updatedAt };
  assert.deepEqual(renameRecord.result, { applied: true, entry: expectedEntry });
  const approval = renameRecord.after.member_directory_events.find(row => row.tenant_id === alpha && row.approval_ref === renameInput.approvalRef);
  assert.ok(approval);
  assert.ok(Date.parse(approval.created_at) >= renameRecord.lower && Date.parse(approval.created_at) <= renameRecord.upper);
  assert.deepEqual(approval, { tenant_id: alpha, approval_ref: renameInput.approvalRef, member_id: betaEditorId,
    // Independent canonical input order, matching the existing provisioning wire contract.
    request_hash: createHash('sha256').update(JSON.stringify({ tenantId: alpha, memberId: betaEditorId,
      displayLabel: renameInput.displayLabel, sourceCategory: renameInput.sourceCategory,
      sourceRef: renameInput.sourceRef, approvalRef: renameInput.approvalRef, actorRef: renameInput.actorRef,
      expectedRevision: 2 })).digest('hex'), previous_revision: 2,
    result_entry: expectedEntry, created_at: approval.created_at });
  expectTables(renameRecord.before, renameRecord.after, {
    member_directory: renameRecord.before.member_directory.map(row => row === oldDirectory ? expectedDirectory : row),
    member_directory_events: [...renameRecord.before.member_directory_events, approval] });
  for (const [method, body] of [['PATCH', patch2], ['DELETE', delete2]])
    assert.deepEqual(await request(alphaToken, method, targetPath, 409, body), { status: 'conflict' });
  assert.deepEqual((await get(alphaToken, alphaMembers, 200)).members.find(row => row.memberId === betaEditorId).identification, confirmed);
  assert.deepEqual(await request(alphaToken, 'PATCH', targetPath, 200,
    { role: 'editor', expectedDirectoryRevision: 3 }), { memberId: betaEditorId, role: 'editor', active: true, changed: false });

  // ONE isolated eligible unidentified identity/membership. No IdP user/login.
  const unidentifiedId = randomUUID(), unidentifiedSubject = `private-unidentified-${randomUUID()}`;
  const setup = await capturePhase('fixture-unidentified-setup', async () => {
    await owner.query('BEGIN');
    try {
      await owner.query('INSERT INTO wonffice.identities(id,issuer,subject) VALUES($1,$2,$3)', [unidentifiedId, fixture.issuer, unidentifiedSubject]);
      await owner.query("INSERT INTO wonffice.tenant_memberships(tenant_id,identity_id,role) VALUES($1,$2,'viewer')", [alpha, unidentifiedId]);
      await owner.query('COMMIT');
      return { qualification: 'private fixture rows, not an IdP account or product grant', memberId: unidentifiedId };
    } catch (error) { await owner.query('ROLLBACK'); throw error; }
  });
  const syntheticIdentity = setup.after.identities.find(row => row.id === unidentifiedId);
  const syntheticMember = setup.after.tenant_memberships.find(row => row.tenant_id === alpha && row.identity_id === unidentifiedId);
  for (const row of [syntheticIdentity, syntheticMember]) assert.ok(row && Date.parse(row.created_at) >= setup.lower && Date.parse(row.created_at) <= setup.upper);
  assert.deepEqual(syntheticIdentity, { id: unidentifiedId, issuer: fixture.issuer, subject: unidentifiedSubject, created_at: syntheticIdentity.created_at });
  assert.deepEqual(syntheticMember, { tenant_id: alpha, identity_id: unidentifiedId, role: 'viewer', revoked_at: null, created_at: syntheticMember.created_at });
  expectTables(setup.before, setup.after, { identities: [...setup.before.identities, syntheticIdentity],
    tenant_memberships: [...setup.before.tenant_memberships, syntheticMember] });
  assert.deepEqual((await get(alphaToken, alphaMembers, 200)).members.find(row => row.memberId === unidentifiedId),
    { memberId: unidentifiedId, role: 'viewer', active: true, isSelf: false,
      identification: { state: 'unidentified', displayLabel: null, memberCode: null,
        sourceCategory: null, revision: null, updatedAt: null } });
  for (const method of ['PATCH', 'DELETE']) assert.deepEqual(await request(alphaToken, method,
    `${alphaMembers}/${unidentifiedId}`, 409, method === 'PATCH' ?
      { role: 'editor', expectedDirectoryRevision: 1 } : { expectedDirectoryRevision: 1 }), { status: 'conflict' });

  const triggerSetup = await capturePhase('fixture-reject-audit-setup', () => owner.query(`
    CREATE FUNCTION wonffice.synthetic_directory_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$;
    CREATE TRIGGER synthetic_directory_reject_audit BEFORE INSERT ON wonffice.company_member_admin_events
      FOR EACH ROW EXECUTE FUNCTION wonffice.synthetic_directory_reject_audit();`));
  expectTables(triggerSetup.before, triggerSetup.after);
  try {
    for (const [method, path, body] of [['GET', alphaMembers, undefined], ['PATCH', targetPath, patch2],
      ['PATCH', targetPath, { role: 'viewer', expectedDirectoryRevision: 3 }], ['DELETE', targetPath, { expectedDirectoryRevision: 3 }]])
      assert.deepEqual(await request(alphaToken, method, path, 503, body), { status: 'service_unavailable' });
  } finally {
    const cleanup = await capturePhase('fixture-reject-audit-cleanup', async () => {
      await owner.query('DROP TRIGGER synthetic_directory_reject_audit ON wonffice.company_member_admin_events; DROP FUNCTION wonffice.synthetic_directory_reject_audit()');
      return (await owner.query("SELECT to_regprocedure('wonffice.synthetic_directory_reject_audit()') IS NULL AS function_absent, NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='synthetic_directory_reject_audit') AS trigger_absent")).rows[0];
    });
    assert.deepEqual(cleanup.result, { function_absent: true, trigger_absent: true });
    expectTables(cleanup.before, cleanup.after);
  }
  const cleanup = await capturePhase('fixture-unidentified-cleanup', async () => {
    await owner.query('BEGIN');
    try {
      const membership = await owner.query(`DELETE FROM wonffice.tenant_memberships
        WHERE tenant_id=$1 AND identity_id=$2 AND role='viewer' AND revoked_at IS NULL AND created_at=$3::timestamptz`,
      [alpha, unidentifiedId, syntheticMember.created_at]);
      const identity = await owner.query('DELETE FROM wonffice.identities WHERE id=$1 AND issuer=$2 AND subject=$3 AND created_at=$4::timestamptz',
        [unidentifiedId, fixture.issuer, unidentifiedSubject, syntheticIdentity.created_at]);
      await owner.query('COMMIT'); return { membership: membership.rowCount, identity: identity.rowCount };
    } catch (error) { await owner.query('ROLLBACK'); throw error; }
  });
  assert.deepEqual(cleanup.result, { membership: 1, identity: 1 });
  expectTables(cleanup.before, cleanup.after, { identities: cleanup.before.identities.filter(row => row.id !== unidentifiedId),
    tenant_memberships: cleanup.before.tenant_memberships.filter(row => !(row.tenant_id === alpha && row.identity_id === unidentifiedId)) });
  // END genuine matrix; original applied-role/revoke and restart observations follow.
  assert.deepEqual(await request(alphaToken, 'PATCH', `${alphaMembers}/${betaEditorId}`, 200,
    { role: 'viewer', expectedDirectoryRevision: 3 }), { memberId: betaEditorId, role: 'viewer', active: true, changed: true });
  assert.deepEqual(await get(betaToken, `/v1/tenants/${alpha}/access`, 200), { tenantId: alpha, role: 'viewer' });
  assert.deepEqual(await request(alphaToken, 'PATCH', `${alphaMembers}/${alphaOwnerId}`, 403,
    { role: 'viewer', expectedDirectoryRevision: 1 }), { status: 'forbidden' });
  assert.deepEqual(await request(alphaToken, 'DELETE', `${alphaMembers}/${betaEditorId}`, 200, { expectedDirectoryRevision: 3 }),
    { memberId: betaEditorId, role: 'viewer', active: false, changed: true });
  assert.deepEqual(await get(betaToken, `/v1/tenants/${alpha}/access`, 403), { status: 'forbidden' });
  assert.deepEqual(await get(betaToken, alphaMembers, 403), { status: 'forbidden' });
  for (const method of ['PATCH', 'DELETE']) assert.deepEqual(await request(betaToken, method,
    `${alphaMembers}/${alphaOwnerId}`, 403, method === 'PATCH' ?
      { role: 'viewer', expectedDirectoryRevision: 1 } : { expectedDirectoryRevision: 1 }), { status: 'forbidden' });
  assert.deepEqual(await get(betaToken, `/v1/tenants/${beta}/access`, 200), { tenantId: beta, role: 'owner' });
  const beforeRestart = await ledger();
  save('before-api-postgres-restart.json', { tables: beforeRestart, migrations });
  await app.close(); app = null;
  await pool.end(); pool = null;
  await owner.end(); owner = null;
  await admin.end(); admin = null;
  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres-restart.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
  owner = new pg.Client(config('wonffice_owner')); await owner.connect();
  pool = new pg.Pool({ ...config('wonffice_app'), max: 3 });
  app = createApiServer({ verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool), companyMembers: new CompanyMemberStore(pool) });
  await app.listen({ host: '127.0.0.1', port: 14208 });
  apiAddress.port = String(app.server.address().port);
  // Capture exact equality BEFORE any post-restart request can append an audit.
  const afterRestart = await ledger();
  const migrationReplay = await capturePhase('restart-migration-replay', async () => ({
    applied: await migrate(owner), rows: (await owner.query('SELECT id,checksum FROM wonffice_meta.migrations ORDER BY id')).rows,
  }));
  save('after-api-postgres-restart.json', { tables: afterRestart, migrations: migrationReplay.result });
  expectTables(beforeRestart, afterRestart);
  expectTables(migrationReplay.before, migrationReplay.after);
  assert.deepEqual(migrationReplay.result, { applied: [], rows: migrations });
  assert.deepEqual(await get(betaToken, `/v1/tenants/${alpha}/access`, 403), { status: 'forbidden' });
  for (const [method, path, payload] of [['GET', alphaMembers, undefined],
    ['PATCH', `${alphaMembers}/${alphaOwnerId}`, { role: 'viewer', expectedDirectoryRevision: 1 }],
    ['DELETE', `${alphaMembers}/${alphaOwnerId}`, { expectedDirectoryRevision: 1 }]])
    assert.deepEqual(await request(betaToken, method, path, 403, payload), { status: 'forbidden' });
  assert.deepEqual(await get(betaToken, `/v1/tenants/${beta}/access`, 200), { tenantId: beta, role: 'owner' });
  const restartedList = await get(alphaToken, alphaMembers, 200);
  assert.deepEqual(restartedList.members.find(member => member.memberId === betaEditorId).identification, confirmed);
  const replay = await capturePhase('restart-original-directory-approval-replay', () =>
    provisionMemberDirectory(owner, directoryInput(alpha, betaEditorId, 'approval:editor')));
  assert.deepEqual(replay.result, { applied: false, entry: duplicate.entry });
  expectTables(replay.before, replay.after);
  const finalLedger = await ledger(); save('final-ledger.json', finalLedger);
  assert.equal(finalLedger.member_directory_events.length, 4);
  const audit = finalLedger.company_member_admin_events;
  for (const secret of secrets) assert.ok(!JSON.stringify(audit).includes(JSON.stringify(secret).slice(1, -1)), 'audit_must_not_contain_tokens_or_passwords');
  assert.ok(audit.some(row => row.action === 'revoke' && row.outcome === 'applied'));
  console.log(JSON.stringify({ event: 'member_directory_oidc_verified', accounts: 2,
    independentContexts: 2, duplicateNames: true, identifiedAndUnidentified: true, privateProvenanceExcluded: true, immutableReplay: true, revokedWithSameToken: true, apiRestarted: true, postgresRestarted: true,
    fullTableLedgers: 25, httpMatrix: true, staleRevisionReconfirmation: true, auditFailureRollback: true }));
} catch (error) {
  executionFailure = error;
  save('execution-failure.json', failureRecord(error));
  throw error;
} finally {
  const failures = [];
  const close = async (name, work) => { try { await work(); } catch (error) { failures.push({ name, ...failureRecord(error) }); } };
  for (const context of contexts) await close('oidc-context', () => context.close());
  await close('browser', () => browser?.close());
  await close('api', () => app?.close());
  await close('pool', () => pool?.end());
  await close('owner', () => owner?.end());
  await close('admin', () => admin?.end());
  if (callbackStarted) await close('callback', () => new Promise(resolve => callbackServer.close(resolve)));
  if (started) await close('postgres-normal-stop', () => {
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
  });
  for (const name of ['postgres.log', 'postgres-restart.log']) {
    await close(`retain-${name}`, () => {
      try {
        copyFileSync(join(directory, name), join(evidence, name), constants.COPYFILE_EXCL);
        chmodSync(join(evidence, name), 0o600);
      }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    });
  }
  save('cleanup.json', { failures, postgresStopped: !started, retainedDataDirectory: started || failures.length ? directory : null });
  if (!started && !failures.length) rmSync(directory, { recursive: true, force: true });
  if (!executionFailure && failures.length) cleanupFailure = new Error('directory_matrix_cleanup_failed');
}
if (cleanupFailure) throw cleanupFailure;
