import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { SheetRelayService, startSheetRelay } from './index.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { updateHash } from '../../src/durable-store.ts';
import { base64ToBytes, bytesToBase64, decodeSheetRelayServerFrame, relayAdmission, SHEET_RELAY_LIMITS, SHEET_RELAY_PATH, SHEET_RELAY_WS_PATH } from '../../src/sheet-preview-protocol.ts';

test('owned port0 HTTP binds credentials, rejects origin/body abuse, commits before ACK loss and returns exact retry receipt', async () => {
  const service = SheetRelayService.create(), listener = await startSheetRelay({ service, port: 0, allowedOrigins: ['http://127.0.0.1:55555'] });
  const session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  const post = (path: string, value: unknown, extra: Record<string, string> = {}) => fetch(`${listener.url}${SHEET_RELAY_PATH}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.credential}`, ...extra }, body: JSON.stringify(value) });
  try {
    assert.equal((await post('/session', { protocolVersion: 1, actorId: 'self-authorized' })).status, 400);
    assert.equal((await post('/session', { protocolVersion: 1 }, { origin: 'https://untrusted.invalid' })).status, 403);
    assert.equal((await fetch(`${listener.url}${SHEET_RELAY_PATH}/open`)).status, 401);
    const initial = service.open(session.credential);
    const update = client.commit({ kind: 'cell.commit', key: { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' }, input: { kind: 'literal', value: 10 } }, 'http-edit');
    const request = { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId: 'http-packet', bytesBase64: bytesToBase64(update.update), byteLength: update.update.length, sha256: updateHash(update.update) } };
    await assert.rejects(() => post('/append', { ...request, loseAck: true }));
    const accepted = service.open(session.credential); assert.equal(accepted.latestSequence, initial.latestSequence + 1);
    assert.notEqual(accepted.state.sha256, initial.state.sha256);
    const retry = await post('/append', request); assert.equal(retry.status, 200);
    const receipt = await retry.json(); assert.equal(receipt.status, 'durable'); assert.equal(receipt.receipt.updateId, 'http-packet'); assert.equal(receipt.receipt.sha256, request.packet.sha256);
    const again = await post('/append', request); assert.deepEqual(await again.json(), receipt);
    const oversize = await fetch(`${listener.url}${SHEET_RELAY_PATH}/append`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.credential}` }, body: ' '.repeat(SHEET_RELAY_LIMITS.httpBodyBytes) + '{}' });
    assert.equal(oversize.status, 413); assert.equal(service.open(session.credential).latestSequence, accepted.latestSequence);
  } finally { client.destroy(); await listener.close(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});

test('public relay listener serves actual WebSocket auth on the same owned port and closes only its resources', async () => {
  const service = SheetRelayService.create(), listener = await startSheetRelay({ service, port: 0 });
  const session = service.issueSession({ protocolVersion: 1 });
  const socket = new WebSocket(`${listener.url.replace('http:', 'ws:')}${SHEET_RELAY_WS_PATH}`);
  try {
    await once(socket, 'open');
    const message = once(socket, 'message');
    socket.send(JSON.stringify({ protocolVersion: 1, type: 'authenticate', requestId: 'public-listener-auth', session: { protocolVersion: 1, resumeCredential: session.credential } }));
    const [bytes] = await message, frame = decodeSheetRelayServerFrame(String(bytes));
    assert.equal(frame.type, 'authenticated');
    if (frame.type === 'authenticated') {
      assert.equal(frame.requestId, 'public-listener-auth'); assert.deepEqual(frame.session.identity, session.identity);
      assert.equal(frame.state.state.sha256, service.open(session.credential).state.sha256);
    }
    const closed = once(socket, 'close'); await listener.close(); await closed;
    await listener.close(); // Idempotent listener closure retains the live service/store.
    assert.equal(service.open(session.credential).latestSequence, 1);
  } finally { socket.terminate(); await listener.close(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});

test('HTTP post-COMMIT marker failure closes reply and never labels a committed packet rejected', async () => {
  const service = SheetRelayService.create(), listener = await startSheetRelay({ service, port: 0 });
  const session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  const updateId = 'http-marker-failure', marker = join(service.directory, 'receipt-audit', `${updateHash(new TextEncoder().encode(updateId))}.json`);
  try {
    const update = client.commit({ kind: 'cell.commit', key: { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' }, input: { kind: 'literal', value: 12 } }, 'http-marker-native');
    const request = { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId, bytesBase64: bytesToBase64(update.update), byteLength: update.update.length, sha256: updateHash(update.update) } };
    mkdirSync(marker); // Owned real filesystem fault; production never repairs it.
    const append = () => fetch(`${listener.url}${SHEET_RELAY_PATH}/append`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.credential}` }, body: JSON.stringify(request) });
    await assert.rejects(append);
    assert.equal(service.open(session.credential).latestSequence, 2);
    rmSync(marker, { recursive: true }); // Explicit test-only removal of our blocker.
    const response = await append(), result = await response.json();
    assert.equal(response.status, 200); assert.equal(result.receipt.sequence, 2); assert.equal(result.receipt.updateId, updateId);
  } finally { client.destroy(); await listener.close(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});

test('HTTP read-only gates and revocation stop a delayed real receipt after COMMIT', async () => {
  const service = SheetRelayService.create(), listener = await startSheetRelay({ service, port: 0 });
  const session = service.issueSession({ protocolVersion: 1 }), observer = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.credential}` };
  try {
    const issued = await (await fetch(`${listener.url}${SHEET_RELAY_PATH}/session`, { method: 'POST', headers, body: JSON.stringify({ protocolVersion: 1, resumeCredential: session.credential }) })).json();
    assert.deepEqual(Object.keys(issued).sort(), ['context', 'controlled', 'credential', 'identity', 'protocolVersion']);
    service.setSessionAccess(session.credential, 'read-only');
    assert.equal((await fetch(`${listener.url}${SHEET_RELAY_PATH}/open`, { headers })).status, 200);
    assert.equal((await fetch(`${listener.url}${SHEET_RELAY_PATH}/checkpoint`, { method: 'POST', headers, body: '{"protocolVersion":1}' })).status, 403);
    service.setSessionAccess(session.credential, 'read-write');
    const update = client.commit({ kind: 'cell.commit', key: { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' }, input: { kind: 'literal', value: 13 } }, 'http-revoked-late');
    const request = { protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId: 'http-revoked-late-packet', bytesBase64: bytesToBase64(update.update), byteLength: update.update.length, sha256: updateHash(update.update) } };
    const pending = fetch(`${listener.url}${SHEET_RELAY_PATH}/append`, { method: 'POST', headers: { ...headers, 'x-sheet-relay-delay-ack-ms': '200' }, body: JSON.stringify(request) });
    for (let i = 0; i < 40 && service.open(observer.credential).latestSequence < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(service.open(observer.credential).latestSequence, 2);
    service.revokeSession(session.credential);
    const denied = await pending; assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'current-access-denied');
    assert.equal((await fetch(`${listener.url}${SHEET_RELAY_PATH}/open`, { headers })).status, 403);
  } finally { client.destroy(); await listener.close(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});

test('late real ACK stays bound to its original packet while a newer update is independently accepted', async () => {
  const service = SheetRelayService.create(), listener = await startSheetRelay({ service, port: 0 });
  const session = service.issueSession({ protocolVersion: 1 });
  const client = new SheetReplica(session.context, session.identity, base64ToBytes(service.open(session.credential).state.bytesBase64));
  const append = (updateId: string, bytes: Uint8Array, delay: string) => fetch(`${listener.url}${SHEET_RELAY_PATH}/append`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.credential}`, 'x-sheet-relay-delay-ack-ms': delay }, body: JSON.stringify({ protocolVersion: 1, context: session.context, admission: relayAdmission(session.context), packet: { updateId, bytesBase64: bytesToBase64(bytes), byteLength: bytes.length, sha256: updateHash(bytes) } }) });
  try {
    const key = { sheetId: 'sheet-rates', rowId: 'row-2', columnId: 'column-2' };
    const first = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 10 } }, 'late-first');
    const delayed = append('packet-first', first.update, '200');
    for (let i = 0; i < 40 && service.open(session.credential).latestSequence < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(service.open(session.credential).latestSequence, 2, 'first request must commit before second');
    const second = client.commit({ kind: 'cell.commit', key, input: { kind: 'literal', value: 9 } }, 'late-second');
    const newer = await (await append('packet-second', second.update, '0')).json();
    const older = await (await delayed).json();
    assert.equal(older.receipt.updateId, 'packet-first'); assert.equal(older.receipt.sha256, updateHash(first.update));
    assert.equal(newer.receipt.updateId, 'packet-second'); assert.equal(newer.receipt.sha256, updateHash(second.update));
    assert(older.receipt.sequence < newer.receipt.sequence); assert.equal(service.open(session.credential).latestSequence, 3);
  } finally { client.destroy(); await listener.close(); service.close(); rmSync(service.directory, { recursive: true, force: true }); }
});
