import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';
import type { PoolClient } from 'pg';
import type { MembershipStore, TenantRole, VerifiedPrincipal } from '../src/membership-store.js';
import { SheetAccessError, SheetAccessOperationUncertainError, SheetAccessStore } from '../src/sheet-access-store.ts';
import type { CurrentSheetGrant, SheetAccessScope } from '../src/sheet-access-store.ts';

// MODEL port evidence only. No PostgreSQL connection or actual row lock is used.
// Integration must separately apply the migration and verify real SQL/revocation.
const principal: VerifiedPrincipal = { issuer: 'https://verified.example', subject: 'account-a' };
const scope: SheetAccessScope = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  workspaceId: '20000000-0000-4000-8000-000000000002',
  documentId: '30000000-0000-4000-8000-000000000003',
};
function row(): CurrentSheetGrant {
  return { ...scope, userId: '40000000-0000-4000-8000-000000000004', access: 'read-write',
    workbookId: '50000000-0000-4000-8000-000000000005', generation: '60000000-0000-4000-8000-000000000006',
    grantVersion: 2, documentVersion: 3 };
}
interface ModelOptions {
  rows?: readonly unknown[];
  priorRole?: TenantRole;
  entryFailure?: Error;
  queryFailure?: Error;
  commitFailure?: Error;
  cleanupFailure?: Error;
}
class MembershipModel implements Pick<MembershipStore, 'withAuthorizedTenant'> {
  readonly events: string[] = [];
  readonly queries: { sql: string; values: readonly unknown[] }[] = [];
  readonly options: ModelOptions;
  readonly client: PoolClient;
  calls = 0;
  locked = false;
  receivedPrincipal: VerifiedPrincipal | undefined;
  receivedTenant: string | undefined;
  constructor(options: ModelOptions = {}) {
    this.options = options;
    // A never-connected pg Client supplies the structural query port without a
    // cast or legacy MembershipStore runtime import. Replace only its test port.
    const client = Object.assign(new Client(), { release() {} });
    Object.defineProperty(client, 'query', { value: async (sql: string, values: readonly unknown[] = []) => {
      this.queries.push({ sql, values }); this.events.push('sql-access');
      if (this.options.queryFailure) throw this.options.queryFailure;
      this.locked = true;
      const rows = this.options.rows ?? [row()];
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    } });
    this.client = client;
  }
  async withAuthorizedTenant<T>(verified: VerifiedPrincipal, tenantId: string,
    operation: (client: PoolClient, role: TenantRole) => Promise<T>): Promise<T> {
    this.calls++; this.receivedPrincipal = verified; this.receivedTenant = tenantId;
    this.events.push('begin');
    try {
      if (this.options.entryFailure) throw this.options.entryFailure;
      const result = await operation(this.client, this.options.priorRole ?? 'editor');
      this.events.push('pg-commit');
      if (this.options.commitFailure) throw this.options.commitFailure;
      this.events.push('context-cleanup');
      if (this.options.cleanupFailure) throw this.options.cleanupFailure;
      return result;
    } catch (error) { this.events.push('rollback-or-discard'); throw error; }
    finally { this.locked = false; this.events.push('release'); }
  }
}
function fixture(options: ModelOptions = {}) {
  const model = new MembershipModel(options);
  return { model, store: new SheetAccessStore(model) };
}
function hasCode(code: string, status: number) {
  return (error: unknown): boolean => error instanceof SheetAccessError && error.code === code && error.status === status;
}

test('MODEL current grant is bound to canonical identity/scope and synchronous callback remains inside the transaction', async () => {
  const { store, model } = fixture(); let calls = 0;
  const result = await store.withCurrentAccess(principal, scope, 'write', grant => {
    calls++; assert.equal(model.locked, true); assert.equal(Object.isFrozen(grant), true);
    assert.deepEqual(grant, row()); assert.equal(model.events.includes('pg-commit'), false);
    model.events.push('sync-native-and-enqueue'); return { accepted: true };
  });
  assert.deepEqual(result, { accepted: true }); assert.equal(calls, 1); assert.equal(model.locked, false);
  assert.deepEqual(model.events, ['begin', 'sql-access', 'sync-native-and-enqueue', 'pg-commit', 'context-cleanup', 'release']);
  assert.deepEqual(model.receivedPrincipal, principal); assert.equal(model.receivedTenant, scope.tenantId);
  assert.equal(model.queries.length, 1);
  assert.match(model.queries[0]?.sql ?? '', /sheet_current_access\(\$1::uuid,\$2::uuid,\$3::uuid,\$4::text\)/);
  assert.deepEqual(model.queries[0]?.values, [scope.tenantId, scope.workspaceId, scope.documentId, 'write']);
});

test('MODEL fresh locked access supersedes the earlier tenant-role hint', async () => {
  const downgraded = fixture({ priorRole: 'editor', rows: [{ ...row(), access: 'read-only' }] });
  let writes = 0;
  await assert.rejects(downgraded.store.withCurrentAccess(principal, scope, 'write', () => { writes++; }), hasCode('read-only-denied', 403));
  assert.equal(writes, 0);
  const current = fixture({ priorRole: 'viewer' });
  assert.equal(await current.store.withCurrentAccess(principal, scope, 'write', () => 'fresh-current-row'), 'fresh-current-row');
});

test('MODEL read-only grant permits current reads and exposes no implicit write', async () => {
  const { store } = fixture({ rows: [{ ...row(), access: 'read-only' }] });
  assert.equal(await store.withCurrentAccess(principal, scope, 'read', grant => grant.access), 'read-only');
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => assert.fail('must not write')), hasCode('read-only-denied', 403));
});

for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) test(`MODEL ${role} without a current document grant never enters native operation`, async () => {
  const { store } = fixture({ rows: [], priorRole: role });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'read', () => assert.fail('missing grant cannot authorize')), hasCode('current-access-denied', 403));
});

for (const reason of ['tenant_access_denied', 'sheet_access_denied', 'sheet_read_only']) test(`MODEL ${reason} is a sanitized pre-operation denial`, async () => {
  const { store } = fixture({ queryFailure: Object.assign(new Error(reason), { code: '42501' }) });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => assert.fail('denied callback')),
    hasCode(reason === 'sheet_read_only' ? 'read-only-denied' : 'current-access-denied', 403));
});

test('MODEL unprovisioned or revoked tenant membership stops before Sheet SQL', async () => {
  const { store, model } = fixture({ entryFailure: new Error('tenant_access_denied') });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'read', () => assert.fail('tenant denied')), hasCode('current-access-denied', 403));
  assert.equal(model.queries.length, 0);
});

const invalidRows: readonly [string, unknown][] = [
  ['foreign tenant', { ...row(), tenantId: '70000000-0000-4000-8000-000000000007' }],
  ['foreign workspace', { ...row(), workspaceId: '70000000-0000-4000-8000-000000000007' }],
  ['different document', { ...row(), documentId: '70000000-0000-4000-8000-000000000007' }],
  ['noncanonical account', { ...row(), userId: 'transport-generated-account' }],
  ['invalid workbook', { ...row(), workbookId: 'preview-workbook' }],
  ['invalid generation', { ...row(), generation: null }],
  ['unknown access', { ...row(), access: 'owner' }],
  ['unsafe grant version', { ...row(), grantVersion: Number.MAX_SAFE_INTEGER + 1 }],
  ['fractional document version', { ...row(), documentVersion: 1.5 }],
  ['zero version', { ...row(), documentVersion: 0 }],
];
for (const [name, value] of invalidRows) test(`MODEL ${name} from the SQL boundary fails closed`, async () => {
  const { store } = fixture({ rows: [value] });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'read', () => assert.fail('corrupt grant cannot authorize')), hasCode('sheet-access-unavailable', 503));
});

test('MODEL multiple SQL rows cannot pick an arbitrary account/grant', async () => {
  const { store } = fixture({ rows: [row(), row()] });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'read', () => assert.fail('ambiguous grant')), hasCode('current-access-denied', 403));
});

test('MODEL malformed scope, principal, intent and role-bearing scope are denied before the port', async () => {
  const { store, model } = fixture();
  await assert.rejects(store.withCurrentAccess(principal, { ...scope, documentId: "x' OR true--" }, 'read', () => undefined), hasCode('invalid-sheet-scope', 400));
  await assert.rejects(store.withCurrentAccess({ issuer: '', subject: 'person' }, scope, 'read', () => undefined), hasCode('invalid-principal', 400));
  await assert.rejects(store.withCurrentAccess(principal, Object.assign({ ...scope }, { role: 'owner' }), 'read', () => undefined), hasCode('invalid-sheet-scope', 400));
  const invalidIntent = Reflect.apply(store.withCurrentAccess, store, [principal, scope, 'admin', () => undefined]);
  await assert.rejects(invalidIntent, hasCode('invalid-sheet-intent', 400));
  assert.equal(model.calls, 0);
});

test('MODEL native-side callback completion followed by PG COMMIT failure remains uncertain', async () => {
  const { store, model } = fixture({ commitFailure: new Error('private PostgreSQL connection/password detail') });
  let synchronousEffects = 0;
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => { synchronousEffects++; return 'native-outcome-held-by-caller'; }),
    (error: unknown) => error instanceof SheetAccessOperationUncertainError && error.operationCompleted && error.code === 'sheet-operation-uncertain' && !error.message.includes('password'));
  assert.equal(synchronousEffects, 1); assert(model.events.includes('rollback-or-discard')); assert.equal(model.locked, false);
});

test('MODEL PG context cleanup failure after callback/COMMIT does not claim native rejection', async () => {
  const { store } = fixture({ cleanupFailure: new Error('SET LOCAL connection failed') });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => 'completed'),
    (error: unknown) => error instanceof SheetAccessOperationUncertainError && error.operationCompleted);
});

test('MODEL failure inside a native-side callback is not presumed to precede its side effects', async () => {
  const { store } = fixture();
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => { throw new Error('private native receipt failure'); }),
    (error: unknown) => error instanceof SheetAccessOperationUncertainError && !error.operationCompleted && error.message === 'sheet-operation-uncertain');
});

test('MODEL PG failure before callback is unavailable and cannot leak SQL/private details', async () => {
  const { store } = fixture({ queryFailure: new Error('SQL SELECT password=secret at private-host') });
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => assert.fail('SQL failed')),
    (error: unknown) => error instanceof SheetAccessError && !(error instanceof SheetAccessOperationUncertainError) && error.code === 'sheet-access-unavailable' && !error.message.includes('secret'));
});

test('MODEL AsyncFunction is rejected before entering the membership transaction', async () => {
  const { store, model } = fixture(); let entered = false;
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', async () => { entered = true; return 1; }), hasCode('sync-operation-required', 400));
  assert.equal(entered, false); assert.equal(model.calls, 0);
});

test('MODEL a hidden thenable return violates the trusted synchronous callback contract', async () => {
  const { store } = fixture();
  await assert.rejects(store.withCurrentAccess(principal, scope, 'write', () => Promise.resolve('not-synchronous')),
    (error: unknown) => error instanceof SheetAccessOperationUncertainError && !error.operationCompleted);
});

import { createAccountFixture, accountPacket, accountSignal } from '../../../experiments/office-suite-v2/relay/sheet/account-test-fixture.ts';
import { RelayError } from '../../../experiments/office-suite-v2/relay/sheet/service.ts';
import { SheetReplica } from '../../../experiments/office-suite-v2/src/collaboration.ts';
import { base64ToBytes } from '../../../experiments/office-suite-v2/src/sheet-preview-protocol.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Actual SheetAccessStore error transport with existing MODEL membership/SQL. */
function useActualAccessStore(f: ReturnType<typeof createAccountFixture>): void {
  const access = new SheetAccessStore({ async withAuthorizedTenant(verified, tenantId, operation) {
    const person = verified.subject === 'account-a' ? 'a' : 'b';
    const model = new MembershipModel({ rows: [{ ...f.scope, userId: f.users[person],
      access: person === 'a' ? f.model.accessA : f.model.accessB, workbookId: f.context.workbookId,
      generation: f.context.generation, grantVersion: 1, documentVersion: 1 }] });
    return model.withAuthorizedTenant(verified, tenantId, operation);
  } });
  f.options.accessStore.withCurrentAccess = access.withCurrentAccess.bind(access);
}
const accountNoop = () => {};
const accountKey = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
test('actual SheetAccessStore preserves pre-COMMIT account session mismatch as403', async () => {
  const f = createAccountFixture(); useActualAccessStore(f);
  try {
    const a = await f.authenticate(), before = f.relay.binding();
    const registry = readFileSync(join(f.relay.directory, 'relay-sessions.json'));
    await assert.rejects(f.authenticate(f.tokens.b, a.session.credential), error =>
      error instanceof RelayError && error.status === 403);
    assert.deepEqual(f.relay.binding(), before);
    assert.deepEqual(readFileSync(join(f.relay.directory, 'relay-sessions.json')), registry);
    const resumed = await f.authenticate(f.tokens.a, a.session.credential);
    assert.equal(resumed.session.credential, a.session.credential);
  } finally { f.close(); }
});

test('actual SheetAccessStore cannot turn post-COMMIT callback denial into rejection', async () => {
  const f = createAccountFixture(); useActualAccessStore(f); let replica: SheetReplica | undefined;
  try {
    const a = await f.authenticate(); replica = new SheetReplica(a.session.context, a.session.identity, base64ToBytes(a.state.state.bytesBase64));
    const edit = replica.commit({ kind: 'cell.commit', key: accountKey, input: { kind: 'literal', value: 81 } });
    const packet = accountPacket(a.session, edit.update, 'actual-store-postcommit-denial');
    await assert.rejects(f.relay.withAuthorized(a.bound, 'write', accountSignal(), accountNoop, (native, session) => {
      assert.equal(native.append(session.credential, packet).status, 'durable');
      throw new RelayError('account-session-mismatch', 403);
    }), error => error instanceof RelayError && error.code === 'native-commit-acknowledgment-unknown');
    const retried = await f.relay.withAuthorized(a.bound, 'write', accountSignal(), accountNoop, (native, session) => native.append(session.credential, packet));
    assert.ok(retried.status === 'durable'); assert.equal(retried.receipt.sequence, 2);
    await assert.rejects(f.relay.withAuthorized(a.bound, 'read', accountSignal(), accountNoop, () => { throw new Error('private callback detail'); }),
      error => error instanceof RelayError && error.status === 503 && error.message === 'account-authority-unavailable');
  } finally { replica?.destroy(); f.close(); }
});
