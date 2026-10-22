import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64ToBytes, bytesToBase64, parseSheetRelayAppendRequest, parseSheetRelaySessionRequest, relayAdmission, SHEET_RELAY_LIMITS,
  decodeSheetRelayClientFrame, decodeSheetRelayServerFrame, encodeSheetRelayWsFrame, parseSheetRelayClientFrame, parseSheetRelayServerFrame,
  SHEET_RELAY_WS_LIMITS, SHEET_RELAY_WS_PATH } from '../src/sheet-preview-protocol.ts';
import { createWorkbookContext } from '../src/workbook.ts';

const context = createWorkbookContext({ documentId: 'controlled-sheet', workbookId: 'book', generation: 'generation' });
const request = { protocolVersion: 1, context, admission: relayAdmission(context), packet: { updateId: 'exact-packet', bytesBase64: 'AAEC/w==', byteLength: 4, sha256: 'a'.repeat(64) } };
test('browser-neutral packet bytes are exact and canonical within the native cap', () => {
  const bytes = new Uint8Array([0, 1, 2, 255]);
  assert.equal(bytesToBase64(bytes), 'AAEC/w=='); assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  const limit = new Uint8Array(SHEET_RELAY_LIMITS.updateBytes); assert.equal(base64ToBytes(bytesToBase64(limit)).length, limit.length);
  assert.equal(base64ToBytes(bytesToBase64(new Uint8Array(8), SHEET_RELAY_LIMITS.frontierBytes), SHEET_RELAY_LIMITS.frontierBytes).length, 8);
  assert.throws(() => base64ToBytes(bytesToBase64(new Uint8Array(65)), 64));
  for (const bad of ['AA', 'AB==', 'AA==\n', '_w==', '!!!!']) assert.throws(() => base64ToBytes(bad));
  assert.throws(() => bytesToBase64(new Uint8Array(SHEET_RELAY_LIMITS.updateBytes + 1)));
});

const receipt = { context, admission: relayAdmission(context), updateId: request.packet.updateId, sha256: request.packet.sha256, sequence: 2, frontierBase64: 'AA==' };
const state = { protocolVersion: 1 as const, context, admission: relayAdmission(context), latestSequence: 2,
  state: { bytesBase64: 'AA==', byteLength: 1, sha256: 'b'.repeat(64), frontierBase64: 'AA==' },
  bootstrap: { updateId: 'original-bootstrap', byteLength: 1, sha256: 'c'.repeat(64), identity: { actorId: 'server-bootstrap', sessionId: 'bootstrap-session' } } };
test('WS auth binds original opaque credential; no URL/body role or identity authority', () => {
  assert.equal(SHEET_RELAY_WS_PATH, '/api/sheet-relay/v1/ws');
  const auth = { protocolVersion: 1, type: 'authenticate', requestId: 'auth-1', session: { protocolVersion: 1, resumeCredential: 'a'.repeat(64) } };
  assert.deepEqual(decodeSheetRelayClientFrame(JSON.stringify(auth)), auth);
  assert.deepEqual(parseSheetRelayClientFrame({ ...auth, session: { protocolVersion: 1 } }).type, 'authenticate');
  for (const bad of [{ ...auth, credential: 'a'.repeat(64) }, { ...auth, requestId: '' }, { ...auth, session: { ...auth.session, role: 'owner' } },
    { ...auth, session: { ...auth.session, actorId: 'forged' } }, { ...auth, session: { ...auth.session, sessionId: 'forged' } }]) assert.throws(() => parseSheetRelayClientFrame(bad));
  const session = { protocolVersion: 1, controlled: true, credential: 'd'.repeat(64), identity: { actorId: 'issued', sessionId: 'issued-session' }, context, access: 'read-only' };
  assert.equal(parseSheetRelayServerFrame({ protocolVersion: 1, type: 'authenticated', requestId: 'auth-1', session, state }).type, 'authenticated');
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'authenticated', requestId: 'auth-1', session: { ...session, access: 'owner' }, state }));
  assert.deepEqual(parseSheetRelayServerFrame({ protocolVersion: 1, type: 'access', access: 'read-only' }), { protocolVersion: 1, type: 'access', access: 'read-only' });
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'access', access: 'owner' }));
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'authenticated', requestId: 'auth-1', session, state: { ...state, context: { ...context, workbookId: 'foreign' } } }));
});
test('WS append retains exact packet and correlated per-update outcomes; accepted pushes bind native context', () => {
  const frame = parseSheetRelayClientFrame({ protocolVersion: 1, type: 'append', requestId: 'append-1', request, delayAckMs: 1_000 });
  assert.equal(frame.type, 'append');
  if (frame.type === 'append') assert.deepEqual(frame.request, request);
  for (const delayAckMs of [-1, 1001, 0.5, '10']) assert.throws(() => parseSheetRelayClientFrame({ protocolVersion: 1, type: 'append', requestId: 'a', request, delayAckMs }));
  const durable = { protocolVersion: 1 as const, type: 'append-result' as const, requestId: 'append-1', result: { protocolVersion: 1 as const, status: 'durable' as const, receipt } };
  assert.deepEqual(decodeSheetRelayServerFrame(encodeSheetRelayWsFrame(durable)), durable);
  assert.equal(parseSheetRelayServerFrame({ protocolVersion: 1, type: 'accepted', receipt, state }).type, 'accepted');
  assert.throws(() => parseSheetRelayServerFrame({ ...durable, result: { protocolVersion: 1, status: 'durable', updateId: receipt.updateId } }));
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'accepted', receipt: { ...receipt, sequence: 3 }, state }));
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'accepted', receipt: { ...receipt, context: { ...context, workbookId: 'foreign' } }, state }));
  assert.throws(() => parseSheetRelayClientFrame({ protocolVersion: 1, type: 'sync', requestId: 'raw', bytesBase64: 'AA==' }));
});
test('WS frame bound covers full native state and receipt frontiers without raising native caps', () => {
  const frontierBase64 = bytesToBase64(new Uint8Array(SHEET_RELAY_LIMITS.frontierBytes), SHEET_RELAY_LIMITS.frontierBytes);
  const largest = { ...state, state: { ...state.state, bytesBase64: bytesToBase64(new Uint8Array(SHEET_RELAY_LIMITS.updateBytes)), byteLength: SHEET_RELAY_LIMITS.updateBytes, frontierBase64 } };
  const encoded = encodeSheetRelayWsFrame({ protocolVersion: 1, type: 'accepted', state: largest, receipt: { ...receipt, frontierBase64 } });
  assert.ok(new TextEncoder().encode(encoded).length < SHEET_RELAY_WS_LIMITS.frameBytes);
  assert.equal(decodeSheetRelayServerFrame(encoded).type, 'accepted');
  assert.throws(() => decodeSheetRelayClientFrame(' '.repeat(SHEET_RELAY_WS_LIMITS.frameBytes + 1)));
  assert.throws(() => decodeSheetRelayServerFrame(' '.repeat(SHEET_RELAY_WS_LIMITS.frameBytes + 1)));
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'state', requestId: 's', state: { ...state, state: { ...state.state, byteLength: 2 } } }));
  assert.throws(() => parseSheetRelayServerFrame({ protocolVersion: 1, type: 'checkpoint', requestId: 'c', checkpoint: { protocolVersion: 1, throughSequence: 1, includedCount: 2, frontierBase64: 'AA==', stateSha256: 'a'.repeat(64) } }));
});
test('session requests cannot choose actor/session/role and resumption carries an opaque credential', () => {
  assert.deepEqual(parseSheetRelaySessionRequest({ protocolVersion: 1 }), { protocolVersion: 1 });
  assert.equal(parseSheetRelaySessionRequest({ protocolVersion: 1, resumeCredential: 'a'.repeat(64) }).resumeCredential, 'a'.repeat(64));
  for (const bad of [{ protocolVersion: 1, actorId: 'forged' }, { protocolVersion: 2 }, { protocolVersion: 1, resumeCredential: '' }, { protocolVersion: 1, role: 'owner' }]) assert.throws(() => parseSheetRelaySessionRequest(bad));
});
test('append DTO binds full context, admission, exact packet identity and declared byte length', () => {
  assert.deepEqual(parseSheetRelayAppendRequest(request), request);
  for (const bad of [
    { ...request, actorId: 'forged' }, { ...request, protocolVersion: 2 },
    { ...request, admission: { ...request.admission, generation: 'other' } },
    { ...request, context: { ...context, workbookId: '' } },
    { ...request, packet: { ...request.packet, byteLength: 3 } },
    { ...request, packet: { ...request.packet, sha256: 'not-a-hash' } },
    { ...request, packet: { ...request.packet, updateId: '' } },
  ]) assert.throws(() => parseSheetRelayAppendRequest(bad));
});
