import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerSession } from './peer-session.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { createPreviewReplica } from './fixture.ts';
import { ReferenceIndex } from '../../src/references.ts';
import { CalculationEngine } from '../../src/calculation.ts';
import { encodeCellKey } from '../../src/contracts.ts';
import type { CellKey } from '../../src/contracts.ts';

type Wire = { v: 1; roomId: string; from: string; kind: string; id?: string; bytes?: Uint8Array; bootstrap?: Uint8Array; to?: string };
function room() {
  const packets: Wire[] = [];
  const all: PeerSession[] = [];
  const add = (sessionId: string, create = false) => {
    const peer = new PeerSession({ roomId: 'room-test', sessionId, create, send: packet => packets.push(packet as Wire), changed: () => {} });
    all.push(peer); return peer;
  };
  const flush = () => {
    let count = 0;
    while (packets.length) {
      assert.ok(++count < 2000, 'the peer protocol must settle');
      const packet = packets.shift()!;
      for (const peer of all) peer.receive(packet);
    }
  };
  const a = add('session-a', true), b = add('session-b');
  a.start(); b.start(); flush();
  const close = () => { for (const peer of all) { peer.close(); peer.replica?.destroy(); } };
  return { a, b, add, packets, flush, close };
}
function key(replica: SheetReplica, sheet = 'sheet-rates', row = 1, column = 1): CellKey {
  const result = new ReferenceIndex(replica.projection).keyAt(sheet, row, column); assert.ok(result); return result;
}
function commit(peer: PeerSession, value: number | string, eventId: string, cell?: CellKey) {
  assert.ok(peer.replica);
  const result = peer.replica.commit({ kind: 'cells.commit', changes: [{ key: cell ?? key(peer.replica), input: { kind: 'literal', value } }] }, eventId);
  peer.publish(result.event.eventId, result.update); return result;
}
function calculated(peer: PeerSession, cell: CellKey) {
  assert.ok(peer.replica);
  const projection = peer.replica.projection;
  const engine = new CalculationEngine(projection);
  engine.recalculate();
  const result = engine.read(cell);
  assert.equal(result.status, 'fresh');
  assert.ok(result.status === 'fresh'); return result.value;
}

test('creator seeds once; joining/reloaded sessions use exact native bootstrap and independent identities', () => {
  const f = room();
  try {
    assert.ok(f.a.replica); assert.ok(f.b.replica);
    assert.notEqual(f.a.replica, f.b.replica);
    assert.notDeepEqual(f.a.replica.identity, f.b.replica.identity);
    assert.deepEqual(f.a.bootstrap, f.b.bootstrap);
    assert.deepEqual(f.a.replica.projection, f.b.replica.projection);
    const proof = f.b.bootstrap!; proof.fill(0); assert.notDeepEqual(proof, f.b.bootstrap);
    commit(f.a, 10, 'a-edit'); f.flush();
    const reload = f.add('session-reload'); reload.start(); f.flush();
    assert.deepEqual(reload.bootstrap, f.a.bootstrap);
    assert.deepEqual(reload.replica?.projection, f.a.replica.projection);
    const isolated = new PeerSession({ roomId: 'missing-room', sessionId: 'reload', create: false, send: () => {}, changed: () => {} });
    isolated.start(); assert.equal(isolated.replica, undefined); assert.equal(isolated.inspect().phase, 'waiting'); isolated.close();
  } finally { f.close(); }
});

test('native cross-sheet calculation converges and peer ACK is non-durable', () => {
  const f = room();
  try {
    const total = key(f.a.replica!, 'sheet-budget', 3, 3);
    assert.equal(calculated(f.a, total), 44);
    commit(f.b, 10, 'b-price'); assert.equal(f.b.inspect().pending, 1);
    f.flush();
    assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection);
    assert.equal(calculated(f.a, total), 38); assert.equal(calculated(f.b, total), 38);
    assert.equal(f.b.inspect().pending, 0); assert.match(f.b.inspect().notice, /Nothing is saved/);
  } finally { f.close(); }
});

test('paused independent edits retain native alternatives; each session Undo excludes the other edit', () => {
  const f = room();
  try {
    const cell = key(f.a.replica!);
    f.a.setPaused(true); f.b.setPaused(true);
    const left = commit(f.a, 8, 'a-concurrent'), right = commit(f.b, 9, 'b-concurrent');
    assert.equal(f.packets.length, 0);
    f.a.setPaused(false); f.b.setPaused(false); f.flush();
    assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection);
    const alternatives = f.a.replica!.projection.cells[encodeCellKey(cell)]!.alternatives.filter(item => item.state === 'winner' || item.state === 'alternative');
    assert.equal(alternatives.length, 2);
    assert.deepEqual(alternatives.map(item => item.eventId).sort(), [left.event.eventId, right.event.eventId]);
    const undo = f.a.replica!.undo(left.event.eventId, 'a-undo'); f.a.publish(undo.event.eventId, undo.update); f.flush();
    assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection);
    assert.equal(calculated(f.a, cell), 9);
    const ownUndo = f.b.replica!.undo(right.event.eventId, 'b-undo'); f.b.publish(ownUndo.event.eventId, ownUndo.update); f.flush();
    assert.equal(calculated(f.a, cell), 12);
  } finally { f.close(); }
});

test('a missing Yjs base keeps the old projection then retries the original packet ID and bytes', () => {
  const f = room();
  try {
    commit(f.a, 20, 'lost-first'); f.packets.length = 0;
    const later = commit(f.a, 21, 'later-original');
    const packet = f.packets.shift()!; assert.equal(packet.id, 'later-original');
    const before = f.b.replica!.projection;
    f.b.receive(packet);
    assert.deepEqual(f.b.replica!.projection, before);
    assert.match(f.b.inspect().notice, /Missing native base/);
    assert.equal(f.b.inspect().received, 0);
    f.flush();
    assert.deepEqual(f.b.replica!.projection, f.a.replica!.projection);
    assert.equal(f.b.inspect().recovered, 1);
    assert.equal(f.b.inspect().received, 2);
    assert.deepEqual(packet.bytes, later.update);
    assert.equal(f.a.inspect().pending, 0);
  } finally { f.close(); }
});

test('duplicate native bytes are idempotent; changed bytes with the same packet ID are refused', () => {
  const f = room();
  try {
    commit(f.a, 10, 'native-id'); const packet = f.packets[0]!; f.flush();
    const before = f.b.replica!.projection;
    f.b.receive(packet); assert.deepEqual(f.b.replica!.projection, before); assert.equal(f.b.inspect().received, 1);
    f.b.receive({ ...packet, bytes: new Uint8Array([1, 2, 3]) });
    assert.deepEqual(f.b.replica!.projection, before); assert.match(f.b.inspect().notice, /different bytes/);
  } finally { f.close(); }
});

test('wrong room/context, malformed data and changed bootstrap cannot mutate admitted cells', () => {
  const f = room();
  try {
    const before = f.b.replica!.projection;
    f.b.receive({ v: 1, roomId: 'other-room', from: 'other', kind: 'update', id: 'wrong', bytes: new Uint8Array([1]) });
    assert.deepEqual(f.b.replica!.projection, before);
    f.b.receive({ v: 1, roomId: 'room-test', from: 'other', kind: 'update', id: 'broken', bytes: new Uint8Array([1, 2, 3]) });
    assert.deepEqual(f.b.replica!.projection, before); assert.match(f.b.inspect().notice, /refused/);
    const foreign = createPreviewReplica('foreign-generation');
    try {
      f.b.receive({ v: 1, roomId: 'room-test', from: 'other', kind: 'update', id: 'wrong-context', bytes: foreign.exportUpdate() });
      assert.deepEqual(f.b.replica!.projection, before); assert.match(f.b.inspect().notice, /refused/);
    } finally { foreign.destroy(); }
    const sameRoomOtherCreator = createPreviewReplica('room-test');
    try {
      f.b.receive({ v: 1, roomId: 'room-test', from: 'other', kind: 'state', bootstrap: sameRoomOtherCreator.exportUpdate(), bytes: sameRoomOtherCreator.exportUpdate() });
      assert.deepEqual(f.b.replica!.projection, before); assert.match(f.b.inspect().notice, /bootstrap mismatch/);
    } finally { sameRoomOtherCreator.destroy(); }
  } finally { f.close(); }
});

test('late peer ACK removes only the original pending ID and paused input recovers safely', () => {
  const f = room();
  try {
    commit(f.a, 13, 'first'); const first = f.packets.shift()!;
    commit(f.a, 14, 'second'); const second = f.packets.shift()!;
    f.b.setPaused(true); f.b.receive(first); f.b.receive(second);
    assert.equal(calculated(f.b, key(f.b.replica!)), 12);
    f.a.receive({ v: 1, roomId: 'room-test', from: 'session-b', to: 'session-a', kind: 'ack', id: 'first' });
    assert.equal(f.a.inspect().pending, 1);
    f.a.receive({ v: 1, roomId: 'room-test', from: 'session-b', to: 'session-a', kind: 'ack', id: 'unknown' });
    assert.equal(f.a.inspect().pending, 1);
    f.b.setPaused(false); f.flush();
    assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection); assert.equal(f.a.inspect().pending, 0);
  } finally { f.close(); }
});

test('appended pending/refused native events travel and bounds/observer failures preserve state', () => {
  const f = room();
  try {
    const result = f.a.replica!.undo('no-such-event', 'pending-undo');
    f.a.publish(result.event.eventId, result.update); f.flush();
    assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection);
    assert.ok(f.b.replica!.events.some(event => event.eventId === 'pending-undo'));
    const foreign = f.b.replica!.undo(f.a.replica!.events.find(event => event.command.kind === 'sheet.insert')!.eventId, 'refused-undo');
    assert.equal(f.b.replica!.projection.outcomes['refused-undo']!.status, 'refused');
    f.b.publish(foreign.event.eventId, foreign.update); f.flush();
    assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection);
    const before = f.b.replica!.projection;
    f.b.receive({ v: 1, roomId: 'room-test', from: 'other', kind: 'update', id: 'large', bytes: new Uint8Array(1_000_001) });
    assert.deepEqual(f.b.replica!.projection, before); assert.match(f.b.inspect().notice, /bounds/);
    const safe = new PeerSession({ roomId: 'safe', create: false, changed: () => { throw new Error('observer'); }, send: () => { throw new Error('send'); } });
    assert.doesNotThrow(() => safe.start()); assert.match(safe.inspect().notice, /delivery failed/); safe.close();
  } finally { f.close(); }
});


test('queued metadata reports original IDs, lengths and SHA256 without exposing bytes', async () => {
  const f = room();
  try {
    f.a.setPaused(true);
    const result = commit(f.a, 15, 'hash-original');
    const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', result.update.slice()))].map(value => value.toString(16).padStart(2, '0')).join('');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(f.a.inspect().queuedPackets, [{ updateId: 'hash-original', bytes: result.update.length, hash: expected }]);
    const queue = f.a.inspect().queuedPackets as { updateId: string; bytes: number; hash: string | null }[];
    queue.length = 0; assert.equal(f.a.inspect().queuedPackets.length, 1);
    f.a.setPaused(false); f.flush(); assert.deepEqual(f.a.inspect().queuedPackets, []);
  } finally { f.close(); }
});

test('altered deferred IDs refuse and original missing-base bytes still recover', () => {
  const f = room();
  try {
    commit(f.a, 20, 'lost'); f.packets.length = 0;
    commit(f.a, 21, 'deferred-original'); const original = f.packets.shift()!;
    f.b.receive(original);
    const before = f.b.replica!.projection;
    f.b.receive({ ...original, bytes: new Uint8Array([1, 2, 3]) });
    assert.deepEqual(f.b.replica!.projection, before); assert.match(f.b.inspect().notice, /different bytes/);
    assert.equal(f.b.inspect().queuedPackets[0]!.updateId, original.id);
    assert.equal(f.b.inspect().queuedPackets[0]!.bytes, original.bytes!.length);
    f.flush(); assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection); assert.equal(f.b.inspect().recovered, 1);
  } finally { f.close(); }
});

test('paused state/hello never advance cells; malformed queued packets cannot throw on resume', () => {
  const f = room();
  try {
    f.b.setPaused(true); const before = f.b.replica!.projection;
    commit(f.a, 17, 'while-paused');
    f.b.receive({ v: 1, roomId: 'room-test', from: 'session-a', kind: 'state', bootstrap: f.a.bootstrap!, bytes: f.a.replica!.exportUpdate() });
    f.b.receive({ v: 1, roomId: 'room-test', from: 'session-a', kind: 'hello' });
    f.b.receive({ v: 1, roomId: 'room-test', from: 'malformed', kind: 'update', id: 'bad', bytes: new Uint8Array([1, 2, 3]) });
    assert.deepEqual(f.b.replica!.projection, before); assert.equal(f.b.inspect().received, 0);
    assert.doesNotThrow(() => f.b.setPaused(false)); assert.match(f.b.inspect().notice, /refused/);
    assert.deepEqual(f.b.replica!.projection, before);
    assert.deepEqual(f.b.inspect().queuedPackets.map(item => [item.updateId, item.bytes]), [['bad', 3]]);
    f.flush(); assert.deepEqual(f.a.replica!.projection, f.b.replica!.projection);
    assert.deepEqual(f.b.inspect().queuedPackets.map(item => [item.updateId, item.bytes]), [['bad', 3]]);
  } finally { f.close(); }
});

test('joining refuses a valid native state that does not contain the declared original bootstrap', () => {
  const source = createPreviewReplica('room-test'), other = createPreviewReplica('room-test');
  const waiting = new PeerSession({ roomId: 'room-test', sessionId: 'waiting', create: false, send: () => {}, changed: () => {} });
  try {
    waiting.receive({ v: 1, roomId: 'room-test', from: 'peer', kind: 'state', bootstrap: source.exportUpdate(), bytes: other.exportUpdate() });
    assert.equal(waiting.replica, undefined); assert.match(waiting.inspect().notice, /omits the room bootstrap/);
    waiting.receive({ v: 1, roomId: 'room-test', from: 'peer', kind: 'state', bootstrap: source.exportUpdate(), bytes: source.exportUpdate() });
    assert.equal(waiting.inspect().phase, 'ready'); assert.deepEqual(waiting.bootstrap, source.exportUpdate());
  } finally { waiting.close(); waiting.replica?.destroy(); source.destroy(); other.destroy(); }
});

test('pending queue overflow keeps native events local and reports a sticky blocked notice', () => {
  const peer = new PeerSession({ roomId: 'bounded-room', sessionId: 'bounded', create: true, send: () => {}, changed: () => {} });
  try {
    peer.setPaused(true);
    for (let i = 0; i < 257; i++) {
      const native = peer.replica!.commit({ kind: 'undo', targetEventId: 'missing-target' }, `bounded-${i}`);
      peer.publish(native.event.eventId, native.update);
    }
    assert.equal(peer.inspect().pending, 256); assert.equal(peer.inspect().queuedPackets.length, 256);
    assert.match(peer.inspect().notice, /queue is full/);
    assert.ok(peer.replica!.events.some(event => event.eventId === 'bounded-256'));
    peer.setPaused(false);
    peer.receive({ v: 1, roomId: 'bounded-room', from: 'peer', kind: 'ack', id: 'bounded-0' });
    assert.equal(peer.inspect().pending, 255); assert.match(peer.inspect().notice, /synchronization is blocked/);
  } finally { peer.close(); peer.replica?.destroy(); }
});
