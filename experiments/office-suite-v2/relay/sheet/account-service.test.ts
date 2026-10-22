import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { AccountSheetRelay } from './account-service.ts';
import { RelayError, SheetRelayService } from './service.ts';
import { createAccountFixture, accountPacket, accountSignal } from './account-test-fixture.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { base64ToBytes, SHEET_RELAY_ACCOUNT_LIMITS } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAccountSession } from '../../src/sheet-preview-protocol.ts';

const key = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
const noop = () => {};
const rejected = (code: string) => (error: unknown) => error instanceof RelayError && error.code === code;
const forbidden = (error: unknown) => error instanceof RelayError && error.status === 403;
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('MODEL IdP/PG, ACTUAL native: admission probe does not create native sessions or change accepted state', async () => {
  const f = createAccountFixture();
  try {
    const before = f.relay.binding(), registry = readFileSync(join(f.relay.directory, 'relay-sessions.json'));
    const admission = await f.relay.admit({ ...f.scope, bearer: f.tokens.a, origin: f.origin }, accountSignal());
    assert.equal(admission.accountBinding.userId, f.users.a); assert.equal(admission.expiresAt, f.model.now + 5000);
    assert.deepEqual(f.relay.binding(), before); assert.deepEqual(readFileSync(join(f.relay.directory, 'relay-sessions.json')), registry);
    assert.equal(JSON.parse(registry.toString()).sessions.length, 0);
    assert.equal(f.model.lockHeld, false); assert.ok(f.model.pgCalls > 0 && f.model.gateCalls > 0);
  } finally { f.close(); }
});

test('canonical account identities, modes, native grants and distinct A/B sessions use the actual native store', async () => {
  const f = createAccountFixture();
  try {
    const a = await f.authenticate(), b = await f.authenticate(f.tokens.b);
    assert.equal(a.session.controlled, false); assert.equal(b.session.controlled, false);
    assert.equal(a.session.identity.actorId, f.users.a); assert.equal(b.session.identity.actorId, f.users.b);
    assert.notEqual(a.session.identity.sessionId, b.session.identity.sessionId); assert.deepEqual(a.session.context, f.context);
    assert.equal(a.state.latestSequence, 1); assert.equal(a.state.bootstrap.sha256, b.state.bootstrap.sha256);
    await f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, (native, session) => {
      assert.equal(f.model.lockHeld, true); assert.throws(() => native.issueSession({ protocolVersion: 1 }), rejected('account-mode-required'));
      assert.equal(native.open(session.credential).latestSequence, 1);
    });
    const manifest = JSON.parse(readFileSync(join(f.relay.directory, 'relay-manifest.json'), 'utf8'));
    const registry = JSON.parse(readFileSync(join(f.relay.directory, 'relay-sessions.json'), 'utf8'));
    assert.equal(manifest.version, 2); assert.equal(manifest.mode, 'account'); assert.equal(registry.mode, 'account');
    for (const token of Object.values(f.tokens)) assert.equal(JSON.stringify({ manifest, registry }).includes(token), false);
  } finally { f.close(); }
});

test('one-use ticket is origin-bound, expires and burns before awaited current authority', async () => {
  const f = createAccountFixture();
  const admit = () => f.relay.admit({ ...f.scope, bearer: f.tokens.a, origin: f.origin }, accountSignal());
  let release: (() => void) | undefined;
  try {
    const wrongOrigin = await admit();
    await assert.rejects(f.relay.consumeTicket(wrongOrigin.ticket, 'http://127.0.0.1:55556', accountSignal(), noop), rejected('account-ticket-denied'));
    await assert.rejects(f.relay.consumeTicket(wrongOrigin.ticket, f.origin, accountSignal(), noop), rejected('account-ticket-denied'));
    const expired = await admit(); f.model.now = expired.expiresAt;
    await assert.rejects(f.relay.consumeTicket(expired.ticket, f.origin, accountSignal(), noop), rejected('account-ticket-denied'));
    const current = await admit(), entered = deferred(), gate = deferred(); release = gate.resolve;
    f.model.beforeGate = async () => { entered.resolve(); await gate.promise; };
    const first = f.relay.consumeTicket(current.ticket, f.origin, accountSignal(), noop);
    await entered.promise;
    await assert.rejects(f.relay.consumeTicket(current.ticket, f.origin, accountSignal(), noop), rejected('account-ticket-denied'));
    f.model.beforeGate = undefined; gate.resolve(); const bound = await first;
    assert.ok(bound.sessionId);
  } finally { release?.(); f.close(); }
});

test('ticket cap refuses extra probes and expired probes free capacity without native session writes', async () => {
  const f = createAccountFixture();
  const admit = () => f.relay.admit({ ...f.scope, bearer: f.tokens.a, origin: f.origin }, accountSignal());
  try {
    const before = f.relay.binding();
    for (let i = 0; i < SHEET_RELAY_ACCOUNT_LIMITS.tickets; i++) await admit();
    await assert.rejects(admit(), rejected('account-ticket-limit'));
    f.model.now += SHEET_RELAY_ACCOUNT_LIMITS.ticketMs;
    assert.ok((await admit()).ticket); assert.deepEqual(f.relay.binding(), before);
  } finally { f.close(); }
});

test('original native credential refuses another account/login SID but survives same-SID renewed authentication', async () => {
  const f = createAccountFixture();
  try {
    const original = await f.authenticate();
    const registry = readFileSync(join(f.relay.directory, 'relay-sessions.json'));
    await assert.rejects(f.authenticate(f.tokens.b, original.session.credential), forbidden);
    await assert.rejects(f.authenticate(f.tokens.aOtherSid, original.session.credential), forbidden);
    assert.deepEqual(readFileSync(join(f.relay.directory, 'relay-sessions.json')), registry);
    const renewed = await f.authenticate(f.tokens.aRenewed, original.session.credential);
    assert.equal(renewed.session.credential, original.session.credential); assert.deepEqual(renewed.session.identity, original.session.identity);
    assert.deepEqual(renewed.session.accountBinding, original.session.accountBinding);
    assert.ok(renewed.session.expiresAt > original.session.expiresAt);
    assert.deepEqual(readFileSync(join(f.relay.directory, 'relay-sessions.json')), registry);
  } finally { f.close(); }
});

test('read-only and revocation gate original durable dedup retry before native callback; read-only can still read', async () => {
  const f = createAccountFixture(); let replica: SheetReplica | undefined;
  try {
    const a = await f.authenticate(); replica = new SheetReplica(a.session.context, a.session.identity, base64ToBytes(a.state.state.bytesBase64));
    const change = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } });
    const packet = accountPacket(a.session, change.update, 'account-original-packet');
    const accepted = await f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) => native.append(session.credential, packet));
    assert.equal(accepted.status, 'durable');
    let entered = false; f.model.accessA = 'read-only';
    await assert.rejects(f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) => { entered = true; return native.append(session.credential, packet); }), rejected('read-only-denied'));
    assert.equal(entered, false);
    const state = await f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, (native, session) => { assert.equal(session.access, 'read-only'); return native.open(session.credential); });
    assert.equal(state.latestSequence, 2);
    f.model.revokedA = true;
    await assert.rejects(f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, () => { entered = true; }), rejected('current-access-denied'));
    assert.equal(entered, false);
    f.model.revokedA = false; f.model.accessA = 'read-write'; f.model.active.set('model-login-a', false);
    await assert.rejects(f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, () => { entered = true; }), rejected('account-session-denied'));
    assert.equal(entered, false);
  } finally { replica?.destroy(); f.close(); }
});

test('cloned server capability and leaked native operations outside the synchronous grant are refused', async () => {
  const f = createAccountFixture();
  try {
    const a = await f.authenticate(); let native: SheetRelayService | undefined;
    await assert.rejects(f.relay.withAuthorized({ ...a.bound }, 'read', accountSignal(), noop, noop), rejected('account-session-denied'));
    await f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, service => { native = service; assert.equal(f.model.lockHeld, true); });
    assert.ok(native); assert.equal(f.model.lockHeld, false); const leaked = native;
    assert.throws(() => leaked.open(a.session.credential), rejected('account-fence-required'));
    assert.throws(() => leaked.checkpoint(a.session.credential), rejected('account-fence-required'));
    await assert.rejects(f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, async () => {}), rejected('account-session-denied'));
  } finally { f.close(); }
});

test('aborted queued work cannot mutate native state after the earlier PG wait is released', async () => {
  const f = createAccountFixture(); const waiting = deferred(), entered = deferred();
  let first: Promise<unknown> | undefined, second: Promise<unknown> | undefined;
  try {
    const a = await f.authenticate(), before = f.relay.binding();
    f.model.beforePG = async () => { entered.resolve(); await waiting.promise; };
    first = f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, (native, session) => native.open(session.credential));
    await entered.promise;
    const control = new AbortController(); let mutated = false;
    second = f.relay.withAuthorized(a.bound, 'write', control.signal, noop, () => { mutated = true; });
    const refused = assert.rejects(second, rejected('account-operation-aborted')); control.abort(); await refused;
    f.model.beforePG = undefined; waiting.resolve(); await first;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(mutated, false); assert.deepEqual(f.relay.binding(), before);
  } finally { waiting.resolve(); await Promise.allSettled([first, second]); f.close(); }
});

test('PG failure after real native COMMIT is ACK unknown and exact original retry returns durable receipt', async () => {
  const f = createAccountFixture(); let replica: SheetReplica | undefined;
  try {
    const a = await f.authenticate(); replica = new SheetReplica(a.session.context, a.session.identity, base64ToBytes(a.state.state.bytesBase64));
    const change = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 7 } });
    const packet = accountPacket(a.session, change.update, 'account-unknown-packet');
    f.model.pgCommitFailure = true;
    await assert.rejects(f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) => native.append(session.credential, packet)), rejected('native-commit-acknowledgment-unknown'));
    f.model.pgCommitFailure = false;
    const state = await f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, (native, session) => native.open(session.credential));
    assert.equal(state.latestSequence, 2);
    const retried = await f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) => native.append(session.credential, packet));
    assert.equal(retried.status, 'durable'); assert.ok(retried.status === 'durable');
    assert.equal(retried.receipt.sequence, 2); assert.equal(retried.receipt.updateId, packet.packet.updateId); assert.equal(retried.receipt.sha256, packet.packet.sha256);
  } finally { replica?.destroy(); f.close(); }
});

test('account resume refuses an old controlled store and controlled resume refuses the account store', () => {
  const f = createAccountFixture(), controlled = SheetRelayService.create(); const directory = controlled.directory;
  try {
    controlled.close();
    assert.throws(() => AccountSheetRelay.resume(directory, f.options), rejected('store-mode-mismatch'));
    const registry = readFileSync(join(f.relay.directory, 'relay-sessions.json')); f.relay.close();
    assert.throws(() => SheetRelayService.resume(f.relay.directory), rejected('store-mode-mismatch'));
    assert.deepEqual(readFileSync(join(f.relay.directory, 'relay-sessions.json')), registry);
  } finally { controlled.close(); rmSync(directory, { recursive: true, force: true }); f.close(); }
});

test('account restart reuses original native bytes and requires fresh current authority for original-session resume', async () => {
  const f = createAccountFixture(); let resumed: AccountSheetRelay | undefined;
  try {
    const a = await f.authenticate(), before = f.relay.binding(); f.relay.close();
    resumed = AccountSheetRelay.resume(f.relay.directory, f.options);
    assert.equal(resumed.binding().acceptedStateSha256, before.acceptedStateSha256);
    const current = resumed;
    const admission = await current.admit({ ...f.scope, bearer: f.tokens.aRenewed, origin: f.origin, resumeCredential: a.session.credential }, accountSignal());
    const bound = await current.consumeTicket(admission.ticket, f.origin, accountSignal(), noop);
    const session: SheetRelayAccountSession = await current.withAuthorized(bound, 'read', accountSignal(), noop, (_native, session) => session);
    assert.deepEqual(session.identity, a.session.identity); assert.equal(session.credential, a.session.credential);
    f.model.revokedA = true;
    await assert.rejects(current.withAuthorized(bound, 'read', accountSignal(), noop, noop), rejected('current-access-denied'));
  } finally { resumed?.close(); f.close(); }
});

test('own verified-session logout works after Sheet revocation and leaves other login sessions active', async () => {
  const f = createAccountFixture();
  try {
    const a = await f.authenticate(), b = await f.authenticate(f.tokens.b);
    f.model.revokedA = true;
    await f.relay.logout(f.tokens.a, accountSignal());
    assert.equal(f.model.active.get('model-login-a'), false);
    assert.equal(f.model.active.get('model-login-b'), true);
    assert.equal(f.model.active.get('model-login-a-other'), true);
    await assert.rejects(f.relay.withAuthorized(a.bound, 'read', accountSignal(), noop, noop), rejected('account-session-denied'));
    const state = await f.relay.withAuthorized(b.bound, 'read', accountSignal(), noop, (native, session) => native.open(session.credential));
    assert.equal(state.latestSequence, 1);
  } finally { f.close(); }
});

function persistedPacketCount(directory: string, updateId: string): number {
  const db = new DatabaseSync(join(directory, 'updates.sqlite'), { readOnly: true });
  try { return Number(db.prepare('SELECT count(*) AS count FROM updates WHERE update_id=?').get(updateId)?.count); }
  finally { db.close(); }
}

/** Test-only synchronous hook inside the ACTUAL native candidate validator.
 * Match the new event so reads of the previous admitted document cannot advance
 * the clock. The prototype is restored before native.append returns or throws.
 */
function duringCandidateValidation<T>(eventId: string, advance: () => void, operation: () => T): T {
  const getMap = Y.Doc.prototype.getMap;
  let advanced = false;
  Y.Doc.prototype.getMap = function<V>(this: Y.Doc, name?: string): Y.Map<V> {
    const map = getMap.call(this, name) as Y.Map<V>;
    if (!advanced && name === 'native-events-v1' && map.has(eventId)) { advanced = true; advance(); }
    return map;
  };
  try { return operation(); }
  finally { Y.Doc.prototype.getMap = getMap; assert.equal(advanced, true, 'real candidate validation hook must run'); }
}

test('authorization deadline reached during actual native candidate validation prevents SQLite COMMIT', async () => {
  const f = createAccountFixture(); let replica: SheetReplica | undefined;
  try {
    const a = await f.authenticate(); replica = new SheetReplica(a.session.context, a.session.identity, base64ToBytes(a.state.state.bytesBase64));
    const change = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 71 } });
    const packet = accountPacket(a.session, change.update, 'deadline-during-native-validation');
    const before = f.relay.binding(), deadline = f.model.now + SHEET_RELAY_ACCOUNT_LIMITS.authorizationMs;
    const [outcome] = await Promise.allSettled([f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) =>
      duringCandidateValidation(change.event.eventId, () => { assert.equal(f.model.lockHeld, true); f.model.now = deadline + 1; },
        () => native.append(session.credential, packet)))]);
    const after = f.relay.binding(); f.relay.close(); // Native owns an exclusive SQLite writer until close.
    assert.equal(persistedPacketCount(f.relay.directory, packet.packet.updateId), 0, 'expired authorization must not COMMIT its native packet');
    assert.equal(after.acceptedStateSha256, before.acceptedStateSha256);
    assert.equal(outcome?.status, 'rejected');
  } finally { replica?.destroy(); f.close(); }
});

test('JWT expiry reached during actual native candidate validation prevents SQLite COMMIT', async () => {
  const f = createAccountFixture(); let replica: SheetReplica | undefined;
  try {
    const a = await f.authenticate(); replica = new SheetReplica(a.session.context, a.session.identity, base64ToBytes(a.state.state.bytesBase64));
    const change = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 72 } });
    const packet = accountPacket(a.session, change.update, 'jwt-expiry-during-native-validation'), before = f.relay.binding();
    // Stay inside the authorization deadline: this case isolates JWT expiry.
    f.model.now = a.session.expiresAt - 1000;
    const [outcome] = await Promise.allSettled([f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) =>
      duringCandidateValidation(change.event.eventId, () => { assert.equal(f.model.lockHeld, true); f.model.now = a.session.expiresAt; },
        () => native.append(session.credential, packet)))]);
    const after = f.relay.binding(); f.relay.close();
    assert.equal(persistedPacketCount(f.relay.directory, packet.packet.updateId), 0, 'expired JWT must not COMMIT its native packet');
    assert.equal(after.acceptedStateSha256, before.acceptedStateSha256);
    assert.equal(outcome?.status, 'rejected');
  } finally { replica?.destroy(); f.close(); }
});

test('confirmed own-session logout during PG wait prevents native effect after the PG gate returns', async () => {
  const f = createAccountFixture(); let replica: SheetReplica | undefined;
  const entered = deferred(), released = deferred(); let work: Promise<unknown> | undefined;
  try {
    const a = await f.authenticate(); replica = new SheetReplica(a.session.context, a.session.identity, base64ToBytes(a.state.state.bytesBase64));
    const change = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 73 } });
    const packet = accountPacket(a.session, change.update, 'logout-during-pg-wait'), before = f.relay.binding();
    f.model.beforePG = async () => { entered.resolve(); await released.promise; };
    let nativeEntered = false;
    work = f.relay.withAuthorized(a.bound, 'write', accountSignal(), noop, (native, session) => {
      nativeEntered = true; return native.append(session.credential, packet);
    });
    const settled = Promise.allSettled([work]);
    await entered.promise;
    await f.relay.logout(f.tokens.a, accountSignal());
    assert.equal(f.model.active.get('model-login-a'), false, 'own-session provider logout is confirmed');
    f.model.beforePG = undefined; released.resolve(); const [outcome] = await settled;
    const after = f.relay.binding(); f.relay.close();
    assert.equal(persistedPacketCount(f.relay.directory, packet.packet.updateId), 0, 'confirmed logout must fence work waiting for PG');
    assert.equal(nativeEntered, false); assert.equal(after.acceptedStateSha256, before.acceptedStateSha256);
    assert.equal(outcome?.status, 'rejected');
  } finally { released.resolve(); await Promise.allSettled([work]); replica?.destroy(); f.close(); }
});
