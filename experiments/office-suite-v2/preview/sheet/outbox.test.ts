import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewReplica } from './fixture.ts';
import { ReferenceIndex } from '../../src/references.ts';
import { bytesToBase64, relayAdmission } from '../../src/sheet-preview-protocol.ts';
import type { SheetRelayAppendRequest, SheetRelayReceipt } from '../../src/sheet-preview-protocol.ts';
import { openOutbox, outboxTransactionComplete, prepareOutboxEnqueue, prepareOutboxMark, validateOutboxSnapshot } from './outbox.ts';
import type { OutboxSnapshot, StoredClient, StoredPacket } from './outbox.ts';

async function hash(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()))].map(value => value.toString(16).padStart(2, '0')).join('');
}
async function fixture() {
  const replica = createPreviewReplica('durable-outbox-test');
  try {
    const bootstrap = replica.exportUpdate();
    const client: StoredClient = { version: 1, clientId: 'private-client', nextOrdinal: 0,
      session: { protocolVersion: 1, controlled: true, credential: 'a'.repeat(64), identity: replica.identity, context: replica.context },
      bootstrap: { updateId: 'bootstrap-original', byteLength: bootstrap.length, sha256: await hash(bootstrap), identity: replica.identity } };
    const key = new ReferenceIndex(replica.projection).keyAt('sheet-rates', 1, 1); assert.ok(key);
    const first = replica.commit({ kind: 'cells.commit', changes: [{ key, input: { kind: 'literal', value: 10 } }] }, 'first-native-event');
    const request: SheetRelayAppendRequest = { protocolVersion: 1, context: replica.context, admission: relayAdmission(replica.context),
      packet: { updateId: first.event.eventId, bytesBase64: bytesToBase64(first.update), byteLength: first.update.length, sha256: await hash(first.update) } };
    const fresh: OutboxSnapshot = { client, packets: [] };
    const plan = await prepareOutboxEnqueue(fresh, request, replica.identity);
    const snapshot: OutboxSnapshot = { client: plan.client, packets: [plan.packet] };
    const receipt: SheetRelayReceipt = { context: request.context, admission: request.admission, updateId: request.packet.updateId,
      sha256: request.packet.sha256, sequence: 2, frontierBase64: bytesToBase64(replica.frontier()) };
    return { client, fresh, request, packet: plan.packet, snapshot, receipt };
  } finally { replica.destroy(); }
}

test('native packet round trip checks exact canonical bytes/hash and preserves private credential/session', async () => {
  const f = await fixture();
  const loaded = await validateOutboxSnapshot(f.client.clientId, f.snapshot.client, f.snapshot.packets);
  assert.deepEqual(loaded, f.snapshot);
  assert.equal(loaded.packets[0]!.request.packet.bytesBase64, f.request.packet.bytesBase64);
  assert.equal(loaded.client!.session.credential, f.client.session.credential);
  assert.equal(loaded.packets[0]!.ordinal, 0); assert.equal(loaded.client!.nextOrdinal, 1);
  const mutated = structuredClone(loaded);
  Object.assign(mutated.client!.session, { credential: 'b'.repeat(64) });
  assert.equal(f.client.session.credential, 'a'.repeat(64));
});

test('exact retry keeps original ordinal and request; altered ID bytes/admission/identity cannot replace it', async () => {
  const f = await fixture();
  const again = await prepareOutboxEnqueue(f.snapshot, structuredClone(f.request), f.client.session.identity);
  assert.equal(again.changed, false); assert.deepEqual(again.packet, f.packet); assert.equal(again.client.nextOrdinal, 1);
  const otherBytes = new Uint8Array([0, 0]);
  await assert.rejects(prepareOutboxEnqueue(f.snapshot, { ...f.request, packet: { ...f.request.packet, bytesBase64: bytesToBase64(otherBytes), byteLength: otherBytes.length, sha256: await hash(otherBytes) } }, f.client.session.identity), /id-collision/);
  const changedContext = { ...f.request.context, generation: 'other-generation' };
  await assert.rejects(prepareOutboxEnqueue(f.snapshot, { ...f.request, context: changedContext, admission: relayAdmission(changedContext) }, f.client.session.identity), /session-mismatch/);
  await assert.rejects(prepareOutboxEnqueue(f.snapshot, f.request, { ...f.client.session.identity, sessionId: 'other-session' }), /session-mismatch/);
  assert.deepEqual(f.snapshot.packets[0], f.packet);
});

test('new native packet allocation advances only the new ordinal and leaves the older pending record unchanged', async () => {
  const f = await fixture();
  const request = { ...f.request, packet: { ...f.request.packet, updateId: 'second-envelope' } };
  const next = await prepareOutboxEnqueue(f.snapshot, request, f.client.session.identity);
  assert.equal(next.packet.ordinal, 1); assert.equal(next.client.nextOrdinal, 2); assert.equal(next.packet.state, 'pending');
  assert.equal(f.snapshot.packets[0]!.ordinal, 0); assert.equal(f.snapshot.client!.nextOrdinal, 1);
});

test('unknown records reject hash, base64, credential, schema and identity tampering without repair', async () => {
  const f = await fixture();
  const hashTamper = { ...f.packet, request: { ...f.request, packet: { ...f.request.packet, sha256: '0'.repeat(64) } } };
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [hashTamper]), /hash-mismatch/);
  const noncanonical = { ...f.packet, request: { ...f.request, packet: { ...f.request.packet, bytesBase64: 'AB==', byteLength: 1 } } };
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [noncanonical]), /noncanonical/);
  const badCredential = { ...f.snapshot.client!, session: { ...f.client.session, credential: 'secret' } };
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, badCredential, [f.packet]), /invalid-session/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, { ...f.snapshot.client!, extra: true }, [f.packet]), /invalid-client/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [{ ...f.packet, version: 2 }]), /invalid-packet/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [{ ...f.packet, identity: { actorId: 'other', sessionId: 'other' } }]), /client-packet-mismatch/);
  assert.equal(f.packet.request.packet.sha256, f.request.packet.sha256);
});

test('orphan, sparse, missing, duplicate and nonfinite ordinals block reopening and preserve input records', async () => {
  const f = await fixture();
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, null, [f.packet]), /orphan/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, new Array(1)), /invalid-record-list/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, { ...f.snapshot.client!, nextOrdinal: 2 }, [f.packet]), /missing-ordinal/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, { ...f.snapshot.client!, nextOrdinal: 2 }, [f.packet, f.packet]), /duplicate/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [{ ...f.packet, ordinal: Number.NaN }]), /invalid-packet/);
  assert.equal(f.snapshot.packets.length, 1); assert.equal(f.snapshot.client!.nextOrdinal, 1);
});

test('late matching ACK binds only its original ID/hash/context and durable never downgrades', async () => {
  const f = await fixture();
  const unknown = prepareOutboxMark(f.packet, { state: 'acknowledgment-unknown', error: 'response lost' });
  const durable = prepareOutboxMark(unknown, { state: 'durable', receipt: f.receipt });
  assert.equal(durable.state, 'durable'); assert.deepEqual(durable.receipt, f.receipt); assert.equal(durable.error, undefined);
  assert.equal(prepareOutboxMark(durable, { state: 'rejected', error: 'late network failure' }), durable);
  assert.equal(prepareOutboxMark(durable, { state: 'acknowledgment-unknown' }), durable);
  const newer = { ...f.packet, ordinal: 1, request: { ...f.request, packet: { ...f.request.packet, updateId: 'newer-update' } } };
  assert.throws(() => prepareOutboxMark(newer, { state: 'durable', receipt: f.receipt }), /receipt-mismatch/);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, sha256: '0'.repeat(64) } }), /receipt-mismatch/);
  assert.throws(() => prepareOutboxMark(durable, { state: 'durable', receipt: { ...f.receipt, sequence: 3 } }), /receipt-changed/);
  assert.equal(newer.state, 'pending'); assert.equal(newer.ordinal, 1);
});

test('rejected original stays retained and manual retry changes only its delivery state', async () => {
  const f = await fixture();
  const rejected = prepareOutboxMark(f.packet, { state: 'rejected', error: 'relay validation refused' });
  const retry = prepareOutboxMark(rejected, { state: 'pending' });
  assert.deepEqual(retry.request, f.packet.request); assert.equal(retry.ordinal, f.packet.ordinal); assert.equal(retry.error, undefined);
  const loaded = await validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [rejected]);
  assert.equal(loaded.packets.length, 1); assert.equal(loaded.packets[0]!.state, 'rejected');
});

test('durable records require exact receipt and bounded canonical frontier', async () => {
  const f = await fixture();
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable' }), /receipt-required/);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'pending', receipt: f.receipt }), /without-durable-state/);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, sequence: -1 } }), /receipt-mismatch/);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, frontierBase64: 'AB==' } }), /noncanonical/);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, frontierBase64: '' } }), /frontier-limit/);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, frontierBase64: 'A'.repeat(90_000) } }), /receipt-mismatch/);
  await assert.rejects(validateOutboxSnapshot(f.client.clientId, f.snapshot.client, [{ ...f.packet, state: 'durable' }]), /receipt-mismatch/);
});

test('P1 frontier permits 64000 decoded bytes and refuses 64001 without conflating encoded length', async () => {
  const f = await fixture();
  const accepted = bytesToBase64(new Uint8Array(64_000));
  assert.equal(accepted.length, 85_336);
  const durable = prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, frontierBase64: accepted } });
  assert.equal(durable.state, 'durable');
  const beyond = bytesToBase64(new Uint8Array(64_001));
  assert.equal(beyond.length, 85_336);
  assert.throws(() => prepareOutboxMark(f.packet, { state: 'durable', receipt: { ...f.receipt, frontierBase64: beyond } }), /frontier-limit/);
  assert.equal(f.packet.state, 'pending');
});

test('bounded outbox refuses new packets at 256 records without pruning durable or rejected history', async () => {
  const f = await fixture();
  const packets = Array.from({ length: 256 }, (_, ordinal) => ({ ...f.packet, ordinal, request: { ...f.request, packet: { ...f.request.packet, updateId: `original-${ordinal}` } } }));
  const full = { client: { ...f.client, nextOrdinal: 256 }, packets };
  await assert.rejects(prepareOutboxEnqueue(full, f.request, f.client.session.identity), /capacity/);
  assert.equal(full.packets.length, 256); assert.equal(full.client.nextOrdinal, 256); assert.equal(full.packets[0]!.request.packet.updateId, 'original-0');
});

test('8MB lifetime byte cap refuses a new original without pruning retained records', async () => {
  const f = await fixture();
  const payload = new Uint8Array(500_000), sha256 = await hash(payload), bytesBase64 = bytesToBase64(payload);
  const packets = Array.from({ length: 16 }, (_, ordinal) => ({ ...f.packet, ordinal,
    request: { ...f.request, packet: { updateId: `retained-${ordinal}`, byteLength: payload.length, bytesBase64, sha256 } } }));
  const full = await validateOutboxSnapshot(f.client.clientId, { ...f.client, nextOrdinal: 16 }, packets);
  assert.equal(full.packets.reduce((sum, packet) => sum + packet.request.packet.byteLength, 0), 8_000_000);
  await assert.rejects(prepareOutboxEnqueue(full, f.request, f.client.session.identity), /capacity/);
  assert.equal(full.packets.length, 16); assert.equal(full.client!.nextOrdinal, 16);
});

class TransactionModel extends EventTarget { error: DOMException | null = null; }
test('Node transaction completion model: request success cannot prove persistence and a later abort rejects', async () => {
  const success = new TransactionModel(); let completed = false;
  const proof = outboxTransactionComplete(success).then(() => { completed = true; });
  success.dispatchEvent(new Event('success')); await Promise.resolve(); assert.equal(completed, false);
  success.dispatchEvent(new Event('complete')); await proof; assert.equal(completed, true);
  const aborted = new TransactionModel(), failure = outboxTransactionComplete(aborted); let rejected = false;
  void failure.catch(() => { rejected = true; });
  aborted.dispatchEvent(new Event('success')); aborted.error = new DOMException('quota rollback', 'QuotaExceededError');
  aborted.dispatchEvent(new Event('error')); await Promise.resolve(); assert.equal(rejected, false);
  aborted.dispatchEvent(new Event('abort')); await assert.rejects(failure, /quota rollback/); assert.equal(rejected, true);
});

test('Node without IndexedDB rejects open explicitly; this is not actual browser IDB proof', { skip: globalThis.indexedDB !== undefined }, async () => {
  await assert.rejects(openOutbox(), /indexeddb-unavailable/);
});
