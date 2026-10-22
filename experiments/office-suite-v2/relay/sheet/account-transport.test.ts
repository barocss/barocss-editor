import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { startSheetRelay } from './http.ts';
import { SheetRelayService } from './service.ts';
import { accountPacket, createAccountFixture } from './account-test-fixture.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { encodeCellKey } from '../../src/contracts.ts';
import { base64ToBytes, decodeSheetRelayServerFrame, encodeSheetRelayWsFrame,
  parseSheetRelayAccountAdmissionResponse, SHEET_RELAY_WS_PATH, sheetRelayAccountAdmissionPath } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayClientFrame, SheetRelayServerFrame } from '../../src/sheet-preview-protocol.ts';

/** MODEL IdP/PG ports; actual account facade, native store, HTTP and WebSocket. */
async function connect(url: string, origin: string) {
  const socket = new WebSocket(url, { origin });
  const frames: SheetRelayServerFrame[] = [];
  const changes = new Set<() => void>();
  socket.on('error', () => {});
  socket.on('message', bytes => {
    frames.push(decodeSheetRelayServerFrame(bytes.toString()));
    for (const changed of [...changes]) changed();
  });
  const closed = new Promise<void>(resolve => socket.once('close', () => {
    resolve();
    for (const changed of [...changes]) changed();
  }));
  await once(socket, 'open');
  return {
    socket, frames, closed,
    send(frame: SheetRelayClientFrame) { socket.send(encodeSheetRelayWsFrame(frame)); },
    next(predicate: (frame: SheetRelayServerFrame) => boolean): Promise<SheetRelayServerFrame> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { changes.delete(check); reject(new Error('account-transport-frame-timeout')); }, 5_000);
        const check = () => {
          const frame = frames.find(predicate);
          if (frame) { clearTimeout(timer); changes.delete(check); resolve(frame); }
          else if (socket.readyState === WebSocket.CLOSED) {
            clearTimeout(timer); changes.delete(check); reject(new Error('account-transport-closed-before-frame'));
          }
        };
        changes.add(check); check();
      });
    },
  };
}

async function closesWithin(closed: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([closed.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function login(fixture: ReturnType<typeof createAccountFixture>, url: string, token: string, requestId: string) {
  const response = await fetch(`${url}${sheetRelayAccountAdmissionPath(fixture.scope.tenantId, fixture.scope.documentId)}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, origin: fixture.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1 }),
  });
  assert.equal(response.status, 200);
  const admission = parseSheetRelayAccountAdmissionResponse(await response.json());
  const connection = await connect(`${url.replace('http:', 'ws:')}${SHEET_RELAY_WS_PATH}`, fixture.origin);
  try {
    connection.send({ protocolVersion: 1, type: 'authenticate-account', requestId, ticket: admission.ticket });
    const authenticated = await connection.next(frame => frame.type === 'account-authenticated' && frame.requestId === requestId);
    if (authenticated.type !== 'account-authenticated') throw new Error('account-authenticated-required');
    return { connection, authenticated };
  } catch (error) { connection.socket.terminate(); throw error; }
}

for (const change of ['downgrade', 'revoke'] as const) {
  test(`post-COMMIT ${change} keeps ACK unknown`, { timeout: 15_000 }, async () => {
    const fixture = createAccountFixture();
    let release = () => {};
    let held = () => {};
    const committed = new Promise<void>(resolve => { held = resolve; });
    const listener = await startSheetRelay({ mode: 'account', account: fixture.relay, port: 0,
      allowedOrigins: [fixture.origin], holdAppendAck(metadata, signal) {
        assert.equal(metadata.requestId, 'original-append');
        assert.equal(metadata.receipt.sequence, 2);
        held();
        return new Promise<void>(resolve => {
          release = resolve;
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      } });
    let connection: Awaited<ReturnType<typeof connect>> | undefined;
    let replica: SheetReplica | undefined, observed: SheetReplica | undefined;
    try {
      const response = await fetch(`${listener.url}${sheetRelayAccountAdmissionPath(fixture.scope.tenantId, fixture.scope.documentId)}`, {
        method: 'POST', headers: { authorization: `Bearer ${fixture.tokens.a}`, origin: fixture.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ protocolVersion: 1 }),
      });
      assert.equal(response.status, 200);
      const admission = parseSheetRelayAccountAdmissionResponse(await response.json());
      connection = await connect(`${listener.url.replace('http:', 'ws:')}${SHEET_RELAY_WS_PATH}`, fixture.origin);
      connection.send({ protocolVersion: 1, type: 'authenticate-account', requestId: 'account-login', ticket: admission.ticket });
      const authenticated = await connection.next(frame => frame.type === 'account-authenticated');
      assert.equal(authenticated.type, 'account-authenticated');
      if (authenticated.type !== 'account-authenticated') throw new Error('account-authenticated-required');
      assert.equal(authenticated.session.controlled, false);
      replica = new SheetReplica(authenticated.session.context, authenticated.session.identity, base64ToBytes(authenticated.state.state.bytesBase64));
      const key = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
      const edit = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 73 } }, `transport-${change}`);
      const original = accountPacket(authenticated.session, edit.update, `transport-${change}-packet`);
      const originalBytes = JSON.stringify(original);
      const pending = new Map([[original.packet.updateId, original]]);
      connection.send({ protocolVersion: 1, type: 'append', requestId: 'original-append', request: original });
      await Promise.race([committed, new Promise<never>((_resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('native-commit-not-observed')), 5_000);
        committed.then(() => clearTimeout(timeout));
      })]);
      if (change === 'downgrade') fixture.model.accessA = 'read-only';
      else fixture.model.revokedA = true;
      release();
      const closed = await closesWithin(connection.closed, 1_500);

      // Independently read the actual committed state as B before asserting the
      // sender outcome: an authorization change cannot undo the native COMMIT.
      const second = await fixture.authenticate(fixture.tokens.b);
      assert.equal(second.state.latestSequence, 2);
      observed = new SheetReplica(second.session.context, second.session.identity, base64ToBytes(second.state.state.bytesBase64));
      assert.deepEqual(observed.projection.cells[encodeCellKey(key)]?.winner?.input, { kind: 'literal', value: 73 });

      const correlated = connection.frames.filter(frame =>
        (frame.type === 'rejected' || frame.type === 'append-result') && frame.requestId === 'original-append');
      assert.deepEqual(correlated, [], 'a committed packet must not receive a correlated rejection or append-result after authority changes');
      assert.equal(closed, true, 'post-COMMIT authority change must close the owned socket within a finite deadline');
      assert.equal(JSON.stringify(pending.get(original.packet.updateId)), originalBytes);
      assert.equal(pending.size, 1, 'the original exact packet remains pending without a correlated durable acknowledgment');
    } finally {
      release(); connection?.socket.terminate(); replica?.destroy(); observed?.destroy();
      await listener.close(); fixture.close();
    }
  });
}

test('actual account WS binds canonical A/B, broadcasts exact receipts and fences read-only and revoked readers', { timeout: 20_000 }, async () => {
  const fixture = createAccountFixture();
  fixture.model.accessB = 'read-only';
  const listener = await startSheetRelay({ mode: 'account', account: fixture.relay, port: 0, allowedOrigins: [fixture.origin] });
  const connections: Awaited<ReturnType<typeof connect>>[] = [];
  let writer: SheetReplica | undefined, reader: SheetReplica | undefined;
  try {
    const a = await login(fixture, listener.url, fixture.tokens.a, 'login-a'); connections.push(a.connection);
    const b = await login(fixture, listener.url, fixture.tokens.b, 'login-b'); connections.push(b.connection);
    for (const [result, userId, access] of [[a, fixture.users.a, 'read-write'], [b, fixture.users.b, 'read-only']] as const) {
      assert.equal(result.authenticated.session.controlled, false);
      assert.equal(result.authenticated.session.accountBinding.userId, userId);
      assert.equal(result.authenticated.session.identity.actorId, userId);
      assert.equal(result.authenticated.session.access, access);
    }
    assert.notEqual(a.authenticated.session.identity.sessionId, b.authenticated.session.identity.sessionId);
    assert.notEqual(a.authenticated.session.accountBinding.loginBindingId, b.authenticated.session.accountBinding.loginBindingId);
    writer = new SheetReplica(a.authenticated.session.context, a.authenticated.session.identity, base64ToBytes(a.authenticated.state.state.bytesBase64));
    reader = new SheetReplica(b.authenticated.session.context, b.authenticated.session.identity, base64ToBytes(b.authenticated.state.state.bytesBase64));
    const key = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
    const first = writer.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 41 } }, 'account-first-event');
    const original = accountPacket(a.authenticated.session, first.update, 'account-first-packet');
    a.connection.send({ protocolVersion: 1, type: 'append', requestId: 'account-first-append', request: original });
    const acknowledged = await a.connection.next(frame => frame.type === 'append-result' && frame.requestId === 'account-first-append');
    assert.ok(acknowledged.type === 'append-result' && acknowledged.result.status === 'durable');
    const pushed = await b.connection.next(frame => frame.type === 'accepted' && frame.receipt.updateId === original.packet.updateId);
    assert.equal(pushed.type, 'accepted');
    if (pushed.type !== 'accepted') throw new Error('accepted-state-required');
    assert.deepEqual(pushed.receipt, acknowledged.result.receipt);
    assert.equal(pushed.receipt.sha256, original.packet.sha256);
    assert.equal(pushed.state.latestSequence, 2);
    reader.receive(base64ToBytes(pushed.state.state.bytesBase64));
    assert.deepEqual(reader.projection.cells[encodeCellKey(key)]?.winner?.input, { kind: 'literal', value: 41 });
    a.connection.send({ protocolVersion: 1, type: 'open', requestId: 'writer-current-state' });
    const writerState = await a.connection.next(frame => frame.type === 'state' && frame.requestId === 'writer-current-state');
    assert.ok(writerState.type === 'state');
    assert.deepEqual(writerState.state, pushed.state);

    const refusedKey = { ...key, rowId: 'row-3' };
    const readOnlyEdit = reader.commit({ kind: 'cell.commit', key: refusedKey, input: { kind: 'literal', value: 99 } }, 'reader-local-event');
    b.connection.send({ protocolVersion: 1, type: 'append', requestId: 'reader-append', request: accountPacket(b.authenticated.session, readOnlyEdit.update, 'reader-local-packet') });
    assert.deepEqual(await b.connection.next(frame => frame.type === 'rejected' && frame.requestId === 'reader-append'),
      { protocolVersion: 1, type: 'rejected', requestId: 'reader-append', code: 'read-only-denied' });
    b.connection.send({ protocolVersion: 1, type: 'open', requestId: 'reader-current-state' });
    const stillReadable = await b.connection.next(frame => frame.type === 'state' && frame.requestId === 'reader-current-state');
    assert.ok(stillReadable.type === 'state');
    assert.deepEqual(stillReadable.state, pushed.state, 'read-only append cannot increment native sequence or alter durable state');
    assert.equal(b.connection.frames.some(frame => frame.type === 'append-result' && frame.requestId === 'reader-append'), false);

    // A separate current B socket checks push revocation independently from the
    // B socket whose explicit open is denied and closed below.
    const observer = await login(fixture, listener.url, fixture.tokens.b, 'login-b-observer'); connections.push(observer.connection);
    fixture.model.revokedB = true;
    b.connection.send({ protocolVersion: 1, type: 'open', requestId: 'revoked-reader-open' });
    assert.deepEqual(await b.connection.next(frame => frame.type === 'rejected' && frame.requestId === 'revoked-reader-open'),
      { protocolVersion: 1, type: 'rejected', requestId: 'revoked-reader-open', code: 'current-access-denied' });
    assert.equal(await closesWithin(b.connection.closed, 1_500), true);
    assert.equal(b.connection.frames.some(frame => frame.type === 'state' && frame.requestId === 'revoked-reader-open'), false);

    const second = writer.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 42 } }, 'account-second-event');
    const nextPacket = accountPacket(a.authenticated.session, second.update, 'account-second-packet');
    a.connection.send({ protocolVersion: 1, type: 'append', requestId: 'account-second-append', request: nextPacket });
    const secondAck = await a.connection.next(frame => frame.type === 'append-result' && frame.requestId === 'account-second-append');
    assert.ok(secondAck.type === 'append-result' && secondAck.result.status === 'durable');
    assert.equal(secondAck.result.receipt.sequence, 3);
    assert.equal(await closesWithin(observer.connection.closed, 1_500), true);
    assert.equal(observer.connection.frames.some(frame => frame.type === 'accepted' && frame.receipt.updateId === nextPacket.packet.updateId), false,
      'revoked observer cannot receive newly accepted state');
  } finally {
    for (const connection of connections) connection.socket.terminate();
    writer?.destroy(); reader?.destroy(); await listener.close(); fixture.close();
  }
});

test('actual account HTTP and WS reject anonymous legacy sessions without controlled fallback', { timeout: 10_000 }, async () => {
  const fixture = createAccountFixture();
  const listener = await startSheetRelay({ mode: 'account', account: fixture.relay, port: 0, allowedOrigins: [fixture.origin] });
  let connection: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    const path = sheetRelayAccountAdmissionPath(fixture.scope.tenantId, fixture.scope.documentId);
    const missing = await fetch(`${listener.url}${path}`, { method: 'POST', headers: { origin: fixture.origin, 'content-type': 'application/json' }, body: '{"protocolVersion":1}' });
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { protocolVersion: 1, status: 'rejected', code: 'account-authentication-required' });
    const legacy = await fetch(`${listener.url}/api/sheet-relay/v1/session`, { method: 'POST', headers: { origin: fixture.origin, 'content-type': 'application/json' }, body: '{"protocolVersion":1}' });
    assert.equal(legacy.status, 404);
    assert.equal(fixture.model.gateCalls, 0); assert.equal(fixture.model.pgCalls, 0);
    connection = await connect(`${listener.url.replace('http:', 'ws:')}${SHEET_RELAY_WS_PATH}`, fixture.origin);
    connection.send({ protocolVersion: 1, type: 'authenticate', requestId: 'legacy-anonymous', session: { protocolVersion: 1 } });
    assert.deepEqual(await connection.next(frame => frame.type === 'rejected' && frame.requestId === 'legacy-anonymous'),
      { protocolVersion: 1, type: 'rejected', requestId: 'legacy-anonymous', code: 'account-authentication-required' });
    assert.equal(await closesWithin(connection.closed, 1_500), true);
    assert.equal(connection.frames.some(frame => frame.type === 'authenticated' || frame.type === 'account-authenticated'), false);
    assert.equal(fixture.model.gateCalls, 0); assert.equal(fixture.model.pgCalls, 0);
  } finally { connection?.socket.terminate(); await listener.close(); fixture.close(); }
});

test('actual account WS refuses state encoded after its authorization deadline', { timeout: 10_000 }, async () => {
  const fixture = createAccountFixture();
  const listener = await startSheetRelay({ mode: 'account', account: fixture.relay, port: 0, allowedOrigins: [fixture.origin] });
  const originalOpen = SheetRelayService.prototype.open;
  let connection: Awaited<ReturnType<typeof connect>> | undefined;
  let crossedDeadline = false;
  try {
    const authenticated = await login(fixture, listener.url, fixture.tokens.a, 'deadline-login');
    connection = authenticated.connection;
    let armed = true;
    SheetRelayService.prototype.open = function (this: SheetRelayService, credential: string) {
      const state = originalOpen.call(this, credential);
      if (armed && credential === authenticated.authenticated.session.credential) {
        armed = false;
        assert.equal(fixture.model.lockHeld, true, 'state encoding must run inside the current PG grant callback');
        fixture.model.now += 5_001;
        crossedDeadline = true;
      }
      return state;
    };
    connection.send({ protocolVersion: 1, type: 'open', requestId: 'deadline-state-open' });
    const closed = await closesWithin(connection.closed, 1_500);
    assert.equal(crossedDeadline, true, 'the actual native open must cross the absolute authorization deadline');
    assert.equal(connection.frames.some(frame => frame.type === 'state' && frame.requestId === 'deadline-state-open'), false,
      'the account response must recheck current authority after native state encoding and before socket enqueue');
    assert.equal(closed, true, 'an expired authorization cannot leave the owned state request alive');
  } finally {
    SheetRelayService.prototype.open = originalOpen;
    connection?.socket.terminate(); await listener.close(); fixture.close();
  }
});
