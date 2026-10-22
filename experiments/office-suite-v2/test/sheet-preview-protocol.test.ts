import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64ToBytes, bytesToBase64, parseSheetRelayAppendRequest, parseSheetRelaySessionRequest, relayAdmission, SHEET_RELAY_LIMITS } from '../src/sheet-preview-protocol.ts';
import { createWorkbookContext } from '../src/workbook.ts';

const context = createWorkbookContext({ documentId: 'controlled-sheet', workbookId: 'book', generation: 'generation' });
const request = { protocolVersion: 1, context, admission: relayAdmission(context), packet: { updateId: 'exact-packet', bytesBase64: 'AAEC/w==', byteLength: 4, sha256: 'a'.repeat(64) } };
test('browser-neutral packet bytes are exact and canonical within the native cap', () => {
  const bytes = new Uint8Array([0, 1, 2, 255]);
  assert.equal(bytesToBase64(bytes), 'AAEC/w=='); assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  const limit = new Uint8Array(SHEET_RELAY_LIMITS.updateBytes); assert.equal(base64ToBytes(bytesToBase64(limit)).length, limit.length);
  for (const bad of ['AA', 'AB==', 'AA==\n', '_w==', '!!!!']) assert.throws(() => base64ToBytes(bad));
  assert.throws(() => bytesToBase64(new Uint8Array(SHEET_RELAY_LIMITS.updateBytes + 1)));
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
