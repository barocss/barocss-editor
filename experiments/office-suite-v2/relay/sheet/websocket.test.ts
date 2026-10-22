import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { SheetRelayService } from './service.ts';
import { attachSheetRelayWebSocket } from './websocket.ts';
import type { SheetRelayWebSocketOptions } from './websocket.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { updateHash } from '../../src/durable-store.ts';
import { base64ToBytes, bytesToBase64, decodeSheetRelayServerFrame, encodeSheetRelayWsFrame, relayAdmission, SHEET_RELAY_WS_LIMITS, SHEET_RELAY_WS_PATH } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAppendRequest, SheetRelayClientFrame, SheetRelayServerFrame, SheetRelaySession } from '../../src/sheet-preview-protocol.ts';

const key = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
function packet(session: SheetRelaySession, bytes: Uint8Array, updateId: string): SheetRelayAppendRequest {
  return { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId, bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes) } };
}
async function fixture(service = SheetRelayService.create(), options: Pick<SheetRelayWebSocketOptions, 'holdAppendAck'> = {}) {
  const server = createServer((_request, response) => { response.writeHead(404); response.end(); });
  const transport = attachSheetRelayWebSocket(server, { service, allowedOrigins: ['http://127.0.0.1:55555'], ...options });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('test-listener-required');
  return { service, server, url: `ws://127.0.0.1:${address.port}${SHEET_RELAY_WS_PATH}`, async close(remove = true) {
    await transport.close(); assert.equal(server.listenerCount('upgrade'), 0);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    service.close(); if (remove) rmSync(service.directory, { recursive: true, force: true });
  } };
}
type Waiter = { predicate: (frame: SheetRelayServerFrame) => boolean; resolve: (frame: SheetRelayServerFrame) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
async function client(url: string) {
  const socket = new WebSocket(url), frames: SheetRelayServerFrame[] = [], waiters: Waiter[] = [];
  socket.on('error', () => {});
  socket.on('message', bytes => {
    const frame = decodeSheetRelayServerFrame(bytes.toString());
    const index = waiters.findIndex(waiter => waiter.predicate(frame));
    if (index < 0) frames.push(frame);
    else { const [waiter] = waiters.splice(index, 1); if (waiter) { clearTimeout(waiter.timer); waiter.resolve(frame); } }
  });
  socket.on('close', () => { for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error('socket-closed-before-frame')); } });
  await once(socket, 'open');
  return { socket, frames,
    send(frame: SheetRelayClientFrame) { socket.send(encodeSheetRelayWsFrame(frame)); },
    next(predicate: (frame: SheetRelayServerFrame) => boolean): Promise<SheetRelayServerFrame> {
      const index = frames.findIndex(predicate);
      if (index >= 0) { const frame = frames.splice(index, 1)[0]; if (frame) return Promise.resolve(frame); }
      return new Promise((resolve, reject) => {
        const waiter: Waiter = { predicate, resolve, reject, timer: setTimeout(() => { const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1); reject(new Error('test-frame-timeout')); }, 10_000) };
        waiters.push(waiter);
      });
    },
  };
}
type Client = Awaited<ReturnType<typeof client>>;
async function authenticate(connection: Client, credential?: string) {
  connection.send({ protocolVersion: 1, type: 'authenticate', requestId: 'auth', session: { protocolVersion: 1, ...(credential === undefined ? {} : { resumeCredential: credential }) } });
  const frame = await connection.next(value => value.type === 'authenticated');
  assert.equal(frame.type, 'authenticated'); if (frame.type !== 'authenticated') throw new Error('authenticated-required');
  return frame;
}
function append(connection: Client, requestId: string, request: SheetRelayAppendRequest, delayAckMs = 0) {
  connection.send({ protocolVersion: 1, type: 'append', requestId, request, delayAckMs });
}

test('actual WS native commit broadcasts accepted state to current read-only peer and binds exact per-ID receipt', { timeout: 20_000 }, async () => {
  const owned = await fixture(), a = await client(owned.url), b = await client(owned.url);
  let replica: SheetReplica | undefined;
  try {
    const first = await authenticate(a), second = await authenticate(b);
    owned.service.setSessionAccess(second.session.credential, 'read-only');
    const access = await b.next(frame => frame.type === 'access'); assert.deepEqual(access, { protocolVersion: 1, type: 'access', access: 'read-only' });
    replica = new SheetReplica(first.session.context, first.session.identity, base64ToBytes(first.state.state.bytesBase64));
    const update = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'ws-edit');
    const request = packet(first.session, update.update, 'ws-native-packet');
    append(a, 'append-original', request);
    const response = await a.next(frame => frame.type === 'append-result');
    assert.equal(response.type, 'append-result'); if (response.type !== 'append-result' || response.result.status !== 'durable') throw new Error('durable-required');
    assert.equal(response.requestId, 'append-original'); assert.equal(response.result.receipt.updateId, request.packet.updateId);
    assert.equal(response.result.receipt.sha256, updateHash(update.update)); assert.equal(response.result.receipt.sequence, 2);
    const pushed = await b.next(frame => frame.type === 'accepted');
    assert.equal(pushed.type, 'accepted'); if (pushed.type !== 'accepted') throw new Error('accepted-required');
    assert.deepEqual(pushed.receipt, response.result.receipt); assert.equal(pushed.state.latestSequence, 2);
    assert.equal(pushed.state.state.sha256, owned.service.open(second.session.credential).state.sha256);
    append(b, 'reader-retry', request);
    assert.deepEqual(await b.next(frame => frame.type === 'rejected'), { protocolVersion: 1, type: 'rejected', requestId: 'reader-retry', code: 'read-only-denied' });
    b.send({ protocolVersion: 1, type: 'checkpoint', requestId: 'reader-checkpoint' });
    const denied = await b.next(frame => frame.type === 'rejected'); assert.equal(denied.type === 'rejected' && denied.code, 'read-only-denied');
    owned.service.revokeSession(second.session.credential);
    const revoked = await b.next(frame => frame.type === 'rejected'); assert.equal(revoked.type === 'rejected' && revoked.code, 'current-access-denied');
    await once(b.socket, 'close');
    const resume = await client(owned.url), closing = once(resume.socket, 'close');
    resume.send({ protocolVersion: 1, type: 'authenticate', requestId: 'denied-resume', session: { protocolVersion: 1, resumeCredential: second.session.credential } });
    const rejected = await resume.next(frame => frame.type === 'rejected'); assert.equal(rejected.type === 'rejected' && rejected.code, 'current-access-denied'); await closing;
  } finally { replica?.destroy(); await owned.close(); }
});

test('WS COMMIT-before-lost-reply, original credential restart and exact retry retain one native receipt', { timeout: 20_000 }, async () => {
  let owned = await fixture(); const first = await client(owned.url), auth = await authenticate(first);
  const replica = new SheetReplica(auth.session.context, auth.session.identity, base64ToBytes(auth.state.state.bytesBase64));
  try {
    const update = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'lost-event');
    const request = packet(auth.session, update.update, 'lost-exact-packet'), closed = once(first.socket, 'close');
    append(first, 'lost-request', { ...request, loseAck: true }); await closed;
    assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
    const directory = owned.service.directory; await owned.close(false);
    owned = await fixture(SheetRelayService.resume(directory));
    const retry = await client(owned.url), resumed = await authenticate(retry, auth.session.credential);
    assert.deepEqual(resumed.session.identity, auth.session.identity); assert.equal(resumed.state.bootstrap.sha256, auth.state.bootstrap.sha256); assert.equal(resumed.state.latestSequence, 2);
    append(retry, 'retry-request', request);
    const receipt = await retry.next(frame => frame.type === 'append-result');
    assert.equal(receipt.type, 'append-result'); if (receipt.type !== 'append-result' || receipt.result.status !== 'durable') throw new Error('durable-required');
    assert.equal(receipt.result.receipt.updateId, request.packet.updateId); assert.equal(receipt.result.receipt.sequence, 2);
    append(retry, 'retry-again', request);
    const again = await retry.next(frame => frame.type === 'append-result'); assert.equal(again.type, 'append-result'); if (again.type === 'append-result') assert.deepEqual(again.result, receipt.result);
    assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
  } finally { replica.destroy(); await owned.close(); }
});

test('held real old ACK retains original correlation while a newer native packet remains unsent, then commits separately', { timeout: 20_000 }, async () => {
  let release = () => {};
  let observed: Parameters<NonNullable<SheetRelayWebSocketOptions['holdAppendAck']>>[0] | undefined;
  let ready = () => {};
  const committed = new Promise<void>(resolve => { ready = resolve; });
  const owned = await fixture(SheetRelayService.create(), { holdAppendAck(metadata, signal) {
    if (metadata.requestId !== 'old-request') return Promise.resolve();
    observed = metadata; ready();
    return new Promise<void>(resolve => { release = resolve; signal.addEventListener('abort', () => resolve(), { once: true }); });
  } }), connection = await client(owned.url), auth = await authenticate(connection);
  const replica = new SheetReplica(auth.session.context, auth.session.identity, base64ToBytes(auth.state.state.bytesBase64));
  try {
    const old = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'old-event');
    const oldRequest = packet(auth.session, old.update, 'old-packet'); append(connection, 'old-request', oldRequest);
    await committed;
    assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
    assert.equal(observed?.receipt.updateId, oldRequest.packet.updateId); assert.equal(observed?.receipt.sha256, oldRequest.packet.sha256);
    const newer = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 9 } }, 'new-event');
    const unsent = packet(auth.session, newer.update, 'new-packet');
    assert.equal(connection.frames.filter(frame => frame.type === 'append-result').length, 0);
    release();
    const oldAck = await connection.next(frame => frame.type === 'append-result');
    assert.equal(oldAck.type, 'append-result'); if (oldAck.type !== 'append-result' || oldAck.result.status !== 'durable') throw new Error('durable-required');
    assert.equal(oldAck.requestId, 'old-request'); assert.equal(oldAck.result.receipt.updateId, oldRequest.packet.updateId); assert.equal(oldAck.result.receipt.sha256, oldRequest.packet.sha256);
    assert.notEqual(oldAck.result.receipt.updateId, unsent.packet.updateId); assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
    append(connection, 'new-request', unsent);
    const newAck = await connection.next(frame => frame.type === 'append-result');
    assert.equal(newAck.type, 'append-result'); if (newAck.type !== 'append-result' || newAck.result.status !== 'durable') throw new Error('durable-required');
    assert.equal(newAck.requestId, 'new-request'); assert.equal(newAck.result.receipt.updateId, unsent.packet.updateId); assert.equal(newAck.result.receipt.sequence, 3);
  } finally { replica.destroy(); await owned.close(); }
});

test('write permission is rechecked after a real delayed receipt; read-only still permits state', { timeout: 20_000 }, async () => {
  const owned = await fixture(), connection = await client(owned.url), auth = await authenticate(connection);
  const replica = new SheetReplica(auth.session.context, auth.session.identity, base64ToBytes(auth.state.state.bytesBase64));
  try {
    const update = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'downgrade-event');
    append(connection, 'downgrade-request', packet(auth.session, update.update, 'downgrade-packet'), 200);
    for (let i = 0; i < 100 && owned.service.open(auth.session.credential).latestSequence !== 2; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
    owned.service.setSessionAccess(auth.session.credential, 'read-only');
    await connection.next(frame => frame.type === 'access');
    const refused = await connection.next(frame => frame.type === 'rejected');
    assert.equal(refused.type === 'rejected' && refused.code, 'read-only-denied');
    assert.equal(connection.frames.filter(frame => frame.type === 'append-result').length, 0);
    connection.send({ protocolVersion: 1, type: 'open', requestId: 'read-after-downgrade' });
    const state = await connection.next(frame => frame.type === 'state'); assert.equal(state.type === 'state' && state.state.latestSequence, 2);
  } finally { replica.destroy(); await owned.close(); }
});

test('trusted held actual receipt has a finite reply deadline and aborts without inventing rejection', { timeout: 20_000 }, async () => {
  let aborted = false;
  const owned = await fixture(SheetRelayService.create(), { holdAppendAck(_metadata, signal) {
    return new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
  } }), connection = await client(owned.url), auth = await authenticate(connection);
  const replica = new SheetReplica(auth.session.context, auth.session.identity, base64ToBytes(auth.state.state.bytesBase64));
  try {
    const update = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'deadline-event');
    const closed = once(connection.socket, 'close'), started = performance.now();
    append(connection, 'deadline-request', packet(auth.session, update.update, 'deadline-packet'));
    await closed;
    assert.equal(aborted, true); assert.equal(connection.frames.length, 0);
    assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
    assert(performance.now() - started >= SHEET_RELAY_WS_LIMITS.replyMs - 100);
    assert(performance.now() - started < SHEET_RELAY_WS_LIMITS.replyMs + 2_000);
  } finally { replica.destroy(); await owned.close(); }
});

test('post-COMMIT receipt sidecar failure closes WS without rejected ACK or accepted broadcast', { timeout: 20_000 }, async () => {
  const owned = await fixture(), writer = await client(owned.url), observer = await client(owned.url);
  const auth = await authenticate(writer); await authenticate(observer);
  const replica = new SheetReplica(auth.session.context, auth.session.identity, base64ToBytes(auth.state.state.bytesBase64));
  try {
    const update = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'sidecar-event');
    const request = packet(auth.session, update.update, 'sidecar-packet');
    const blocked = join(owned.service.directory, 'receipt-audit', `${updateHash(new TextEncoder().encode(request.packet.updateId))}.json`); mkdirSync(blocked);
    const closed = once(writer.socket, 'close'); append(writer, 'sidecar-request', request); await closed;
    assert.equal(owned.service.open(auth.session.credential).latestSequence, 2);
    assert.equal(writer.frames.length, 0); assert.equal(observer.frames.length, 0);
    rmSync(blocked, { recursive: true }); // Test-owned fault removal; production never repairs it.
  } finally { replica.destroy(); await owned.close(); }
});

test('pending delayed receipts are bounded and permission changes recheck before the old reply', { timeout: 20_000 }, async () => {
  const owned = await fixture(), connection = await client(owned.url), auth = await authenticate(connection);
  const replica = new SheetReplica(auth.session.context, auth.session.identity, base64ToBytes(auth.state.state.bytesBase64));
  try {
    const update = replica.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'bounded-event');
    const request = packet(auth.session, update.update, 'bounded-packet');
    for (let i = 0; i <= SHEET_RELAY_WS_LIMITS.pendingRequests; i++) append(connection, `queued-${i}`, request, 1_000);
    const denied = await connection.next(frame => frame.type === 'rejected');
    assert.equal(denied.type === 'rejected' && denied.code, 'pending-request-limit');
    owned.service.revokeSession(auth.session.credential);
    const closed = once(connection.socket, 'close');
    const revoked = await connection.next(frame => frame.type === 'rejected'); assert.equal(revoked.type === 'rejected' && revoked.code, 'current-access-denied'); await closed;
    assert.equal(connection.frames.filter(frame => frame.type === 'append-result').length, 0);
  } finally { replica.destroy(); await owned.close(); }
});

test('WS upgrade rejects foreign origin, wrong host/path, URL credentials and subprotocols', { timeout: 20_000 }, async () => {
  const owned = await fixture();
  try {
    for (const options of [
      { url: owned.url, headers: { origin: 'https://untrusted.invalid' } },
      { url: owned.url, headers: { host: 'localhost:12345' } },
      { url: `${owned.url}?credential=${'0'.repeat(64)}`, headers: {} },
      { url: owned.url.replace('/ws', '/other'), headers: {} },
    ]) {
      const socket = new WebSocket(options.url, { headers: options.headers });
      const error = await new Promise<Error>(resolve => socket.once('error', resolve)); assert.match(error.message, /403/);
    }
    const socket = new WebSocket(owned.url, 'credential-subprotocol');
    const error = await new Promise<Error>(resolve => socket.once('error', resolve)); assert.match(error.message, /403/);
  } finally { await owned.close(); }
});

test('WS malformed/binary/oversize messages fail closed and authentication deadline cleans owned socket', { timeout: 20_000 }, async () => {
  const owned = await fixture();
  try {
    for (const payload of ['not json', Buffer.from('binary'), 'x'.repeat(SHEET_RELAY_WS_LIMITS.frameBytes + 1)]) {
      const connection = await client(owned.url), closed = once(connection.socket, 'close'); connection.socket.send(payload); await closed;
      assert.equal(owned.service.binding().latestSequence, 1);
    }
    const fragmented = await client(owned.url), fragmentsClosed = once(fragmented.socket, 'close');
    for (let i = 0; i <= SHEET_RELAY_WS_LIMITS.fragments; i++) fragmented.socket.send('x', { fin: false });
    fragmented.socket.send('x', { fin: true }); await fragmentsClosed;
    assert.equal(owned.service.binding().latestSequence, 1);
    const idle = await client(owned.url), closing = once(idle.socket, 'close');
    const started = performance.now(); const refusal = await idle.next(frame => frame.type === 'rejected');
    assert.equal(refusal.type === 'rejected' && refusal.code, 'authentication-timeout'); await closing;
    assert(performance.now() - started >= SHEET_RELAY_WS_LIMITS.handshakeMs - 100);
    assert(performance.now() - started < SHEET_RELAY_WS_LIMITS.handshakeMs + 2_000);
  } finally { await owned.close(); }
});
