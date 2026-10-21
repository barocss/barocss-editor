import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import * as Y from 'yjs';
import { encodeCellKey } from '../src/contracts.ts';
import type { CellInput, CellKey, WorkbookEvent } from '../src/contracts.ts';
import { createWorkbookContext } from '../src/workbook.ts';
import { SheetReplica, sheetAdmission, sheetUpdateValidator } from '../src/collaboration.ts';
import { DisposableDurableStore, PendingUpdates } from '../src/durable-store.ts';

const context = createWorkbookContext({ documentId: 'controlled-workbook', workbookId: 'workbook-1', generation: 'generation-1' });
const actorA = Object.freeze({ actorId: 'controlled-user-a', sessionId: 'session-a' });
const actorB = Object.freeze({ actorId: 'controlled-user-b', sessionId: 'session-b' });
const key: CellKey = Object.freeze({ sheetId: 's1', rowId: 'r1', columnId: 'c1' });
const literal = (value: string | number): CellInput => ({ kind: 'literal', value });
function seed(): SheetReplica {
  const replica = new SheetReplica(context, actorA);
  replica.commit({ kind: 'sheet.insert', sheetId: 's1', name: 'Sheet1', afterSheetId: null }, 'seed-sheet-1');
  replica.commit({ kind: 'sheet.insert', sheetId: 's2', name: 'Sheet2', afterSheetId: 's1' }, 'seed-sheet-2');
  for (const sheetId of ['s1', 's2']) {
    replica.commit({ kind: 'axis.insert', sheetId, axis: 'row', id: 'r1', afterId: null }, `seed-${sheetId}-r1`);
    replica.commit({ kind: 'axis.insert', sheetId, axis: 'row', id: 'r2', afterId: 'r1' }, `seed-${sheetId}-r2`);
    replica.commit({ kind: 'axis.insert', sheetId, axis: 'column', id: 'c1', afterId: null }, `seed-${sheetId}-c1`);
  }
  return replica;
}
function sync(a: SheetReplica, b: SheetReplica): void {
  const left = a.exportUpdate(), right = b.exportUpdate();
  a.receive(right); b.receive(left);
  assert.deepEqual(a.projection, b.projection);
}
function service(): DisposableDurableStore {
  return DisposableDurableStore.create({ admission: sheetAdmission(context), currentAccess: session => ['controlled-user-a', 'controlled-user-b'].includes(session.actorId), validateDocument: sheetUpdateValidator(context) });
}
function close(store: DisposableDurableStore): void { store.close(); rmSync(store.directory, { recursive: true, force: true }); }

function dependencyFixture(template: SheetReplica, specs: readonly { id: string; dependencies: readonly string[] }[]): Uint8Array {
  const original = new Y.Doc(), updates = new Y.Doc();
  try {
    original.getMap('native-events-v1'); Y.applyUpdate(original, template.exportUpdate());
    const body = original.getMap<string>('native-events-v1').get('seed-sheet-1'); assert(body);
    for (const spec of specs) {
      const event = JSON.parse(body); event.eventId = spec.id; event.dependencies = spec.dependencies;
      event.command.sheetId = `sheet-${spec.id}`; event.command.name = spec.id;
      updates.getMap('native-events-v1').set(spec.id, JSON.stringify(event));
    }
    return Y.encodeStateAsUpdate(updates);
  } finally { original.destroy(); updates.destroy(); }
}

function assertCausalCoverage(observed: readonly string[], event: WorkbookEvent, events: readonly WorkbookEvent[]): void {
  const known = new Map(events.map(item => [item.eventId, item]));
  const reached = new Set<string>(), stack = [...event.dependencies];
  while (stack.length) {
    const id = stack.pop();
    if (id === undefined || reached.has(id)) continue;
    reached.add(id);
    for (const dependency of known.get(id)?.dependencies ?? []) stack.push(dependency);
  }
  for (const id of observed) assert(reached.has(id), `observed event ${id} was lost from causal context`);
}

test('independent pinned Yjs replicas converge atomic native cell commits and retain alternatives', () => {
  const a = seed(), b = new SheetReplica(context, actorB, a.exportUpdate());
  try {
    a.commit({ kind: 'cell.commit', key, input: literal(10) }, 'cell-a');
    b.commit({ kind: 'cell.commit', key, input: literal(20) }, 'cell-b'); sync(a, b);
    const cell = a.projection.cells[encodeCellKey(key)];
    assert(cell); assert.equal(cell.alternatives.length, 2); assert.equal(cell.winner?.eventId, 'cell-b');
    assert.equal(cell.alternatives.filter(alternative => alternative.state === 'alternative').length, 1);
    a.undo('cell-a', 'undo-cell-a'); sync(a, b);
    assert.equal(a.projection.cells[encodeCellKey(key)]?.winner?.eventId, 'cell-b');
    assert.equal(a.projection.sheets.length, 2);
    assert.throws(() => a.replaceSnapshot(), /snapshot-replacement-refused/);
  } finally { a.destroy(); b.destroy(); }
});

test('insert vs cross-sheet formula commit preserves stable reference and deterministic row order', () => {
  const a = seed(), b = new SheetReplica(context, actorB, a.exportUpdate());
  const destination = { sheetId: 's2', rowId: 'r1', columnId: 'c1' };
  const input: CellInput = { kind: 'formula', version: 1, context: destination, ast: { kind: 'reference', reference: { sheetId: 's1', rowId: 'r2', columnId: 'c1', absRow: false, absColumn: false, sheetQualified: true } } };
  try {
    a.commit({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'inserted', afterId: 'r1' }, 'a-insert');
    b.commit({ kind: 'cell.commit', key: destination, input }, 'b-formula'); sync(a, b);
    assert.deepEqual(a.projection.sheets[0]?.rows.filter(row => !row.deleted).map(row => row.id), ['r1', 'inserted', 'r2']);
    assert.deepEqual(a.projection.cells[encodeCellKey(destination)]?.winner?.input, input);
    // Formula calculation/display behavior remains owned by Formula, not reimplemented here.
  } finally { a.destroy(); b.destroy(); }
});

test('delete vs remote cell commit retains content; deletion undo restores same identity', () => {
  const a = seed(), b = new SheetReplica(context, actorB, a.exportUpdate());
  try {
    a.commit({ kind: 'axis.delete', sheetId: 's1', axis: 'row', id: 'r1' }, 'delete-r1');
    b.commit({ kind: 'cell.commit', key, input: literal('remote-survives') }, 'remote-commit'); sync(a, b);
    assert.equal(a.projection.cells[encodeCellKey(key)]?.deleted, true);
    assert.equal(a.projection.cells[encodeCellKey(key)]?.winner?.input.kind, 'literal');
    a.undo('delete-r1', 'undo-delete'); sync(a, b);
    assert.equal(a.projection.cells[encodeCellKey(key)]?.deleted, false);
    assert.deepEqual(a.projection.cells[encodeCellKey(key)]?.winner?.input, literal('remote-survives'));
  } finally { a.destroy(); b.destroy(); }
});

test('structural undo refuses another session contribution and unsupported operations remain explicit', () => {
  const a = seed(), b = new SheetReplica(context, actorB, a.exportUpdate());
  try {
    a.commit({ kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'new', afterId: 'r1' }, 'new-row');
    b.receive(a.exportUpdate()); b.commit({ kind: 'cell.commit', key: { ...key, rowId: 'new' }, input: literal('foreign') }, 'foreign-on-new');
    a.receive(b.exportUpdate()); a.undo('new-row', 'undo-new-row'); sync(a, b);
    assert.deepEqual(a.projection.outcomes['undo-new-row'], { status: 'refused', code: 'UNDO_CONFLICT', recoverable: true });
    assert.equal(a.projection.sheets[0]?.rows.find(row => row.id === 'new')?.deleted, false);
    a.commit({ kind: 'unsupported', operation: 'row.move' }, 'unsupported-move'); sync(a, b);
    assert.equal(a.projection.outcomes['unsupported-move']?.status, 'refused');
    const fresh = new SheetReplica(context, { ...actorA, sessionId: 'new-tab' }, a.exportUpdate());
    try { fresh.undo('new-row', 'foreign-session-undo'); assert.equal(fresh.projection.outcomes['foreign-session-undo']?.status, 'refused'); }
    finally { fresh.destroy(); }
  } finally { a.destroy(); b.destroy(); }
});

test('server binds NEW native events to authenticated actor/session and allows known foreign sync events', () => {
  const a = seed(), b = new SheetReplica(context, actorB, a.exportUpdate()), store = service();
  try {
    const admission = sheetAdmission(context);
    assert.equal(store.append(actorA, { admission, updateId: 'seed', bytes: a.exportUpdate() }).status, 'durable');
    b.commit({ kind: 'cell.commit', key, input: literal('b') }, 'from-b');
    const fullB = { admission, updateId: 'full-b', bytes: b.exportUpdate() };
    assert.equal(store.append(actorA, fullB).status, 'rejected');
    assert.equal(store.append({ ...actorB, sessionId: 'spoofed-tab' }, fullB).status, 'rejected');
    assert.equal(store.append(actorB, fullB).status, 'durable');
    assert.equal(store.append(actorB, fullB).status, 'durable');
    assert.deepEqual(store.includedUpdateIds(), ['seed', 'full-b']);
    const restored = new SheetReplica(context, { ...actorA, sessionId: 'restart' }, store.exportUpdate());
    try { assert.deepEqual(restored.projection, b.projection); } finally { restored.destroy(); }
  } finally { a.destroy(); b.destroy(); close(store); }
});

test('raw delete/overwrite/hidden collision and duplicate native writers cannot alter admitted events', () => {
  const a = seed(), store = service();
  try {
    const admission = sheetAdmission(context), initial = a.exportUpdate();
    assert.equal(store.append(actorA, { admission, updateId: 'seed', bytes: initial }).status, 'durable');
    const changes = [
      (doc: Y.Doc) => doc.getMap('native-events-v1').delete('seed-sheet-1'),
      (doc: Y.Doc) => {
        const log = doc.getMap<string>('native-events-v1');
        const body = log.get('seed-sheet-1'); assert(body);
        log.set('seed-sheet-1', body.replace('Sheet1', 'Changed'));
      },
      (doc: Y.Doc) => {
        const log = doc.getMap<string>('native-events-v1');
        const body = log.get('seed-sheet-1'); assert(body);
        log.delete('seed-sheet-1'); log.set('seed-sheet-1', body);
      },
    ];
    let attempt = 0;
    for (const mutate of changes) {
      const bad = new Y.Doc();
      try {
        bad.getMap('native-events-v1'); Y.applyUpdate(bad, initial); mutate(bad);
        const supplied = { admission, updateId: `attack-${attempt++}`, bytes: Y.encodeStateAsUpdate(bad) };
        const pending = new PendingUpdates(); pending.add(supplied);
        const rejection = store.append(actorA, supplied); pending.result(supplied.updateId, rejection);
        assert.equal(rejection.status, 'rejected'); assert.equal(pending.pending().length, 1);
        assert.deepEqual(pending.results(supplied.updateId), [rejection]);
        assert.throws(() => a.receive(supplied.bytes));
      } finally { bad.destroy(); }
    }
    const original = new Y.Doc(); original.getMap('native-events-v1'); Y.applyUpdate(original, initial);
    try {
      const body = original.getMap<string>('native-events-v1').get('seed-sheet-1'); assert(body);
      for (const content of [body, body.replace('Sheet1', 'Hidden')]) {
        const independent = new Y.Doc(); independent.clientID = 1;
        try {
          independent.getMap('native-events-v1').set('seed-sheet-1', content);
          assert.equal(store.append(actorA, { admission, updateId: `collision-${attempt++}`, bytes: Y.encodeStateAsUpdate(independent) }).status, 'rejected');
        } finally { independent.destroy(); }
      }
    } finally { original.destroy(); }
    assert.deepEqual(store.includedUpdateIds(), ['seed']); assert.deepEqual(store.exportUpdate(), initial);
  } finally { a.destroy(); close(store); }
});

test('unknown roots, malformed bytes, wrong native versions and identity collisions leave replicas unchanged', () => {
  const a = seed();
  try {
    const before = a.exportUpdate();
    assert.throws(() => a.receive(new Uint8Array([255])));
    assert.throws(() => a.commit({ kind: 'cell.commit', key, input: literal('bad') }, 'seed-sheet-1'), /duplicate/);
    const invalid = new Y.Doc();
    try { invalid.getMap('unknown').set('snapshot', {}); assert.throws(() => a.receive(Y.encodeStateAsUpdate(invalid)), /unknown-sheet-root/); }
    finally { invalid.destroy(); }
    const wrong = new Y.Doc();
    try {
      wrong.getMap('native-events-v1').set('bad', JSON.stringify({ eventId: 'bad', context: { ...context, schemaVersion: 2 } }));
      assert.throws(() => a.receive(Y.encodeStateAsUpdate(wrong)), /native-event/);
    } finally { wrong.destroy(); }
    assert.deepEqual(a.exportUpdate(), before);
  } finally { a.destroy(); }
});

test('valid native missing dependencies remain pending and later apply; transport pending is a separate refusal', () => {
  const fixture = seed(), transport = new Y.Doc(), template = new Y.Doc(), store = service();
  try {
    template.getMap('native-events-v1'); Y.applyUpdate(template, fixture.exportUpdate());
    const body = template.getMap<string>('native-events-v1').get('seed-sheet-1'); assert(body);
    // Preserve canonical key order from a real provider event while making a missing-dependency fixture.
    const pending = JSON.parse(body); pending.eventId = 'pending-event'; pending.dependencies = ['missing-event'];
    pending.command.sheetId = 'pending-sheet'; pending.command.name = 'PendingSheet';
    transport.getMap('native-events-v1').set(pending.eventId, JSON.stringify(pending));
    const admission = sheetAdmission(context);
    assert.equal(store.append(actorA, { admission, updateId: 'pending-domain', bytes: Y.encodeStateAsUpdate(transport) }).status, 'durable');
    const client = new SheetReplica(context, actorB, store.exportUpdate());
    try {
      assert.deepEqual(client.projection.outcomes['pending-event'], { status: 'pending', missing: ['missing-event'] });
      assert.equal(client.events.length, 1);
      const frontier = Y.encodeStateVector(transport);
      const dependency = JSON.parse(body); dependency.eventId = 'missing-event'; dependency.command.sheetId = 'dependency-sheet'; dependency.command.name = 'DependencySheet';
      transport.getMap('native-events-v1').set(dependency.eventId, JSON.stringify(dependency));
      const update = Y.encodeStateAsUpdate(transport, frontier);
      assert.equal(store.append(actorA, { admission, updateId: 'dependency-domain', bytes: update }).status, 'durable');
      client.receive(store.exportUpdate());
      assert.equal(client.projection.outcomes['pending-event']?.status, 'applied');
      assert.equal(client.projection.sheets.length, 2);
    } finally { client.destroy(); }
  } finally { fixture.destroy(); template.destroy(); transport.destroy(); close(store); }
});

test('two offline Sheet writers converge through durable ACK loss, checkpoint/restart and session undo', () => {
  const a = seed(), b = new SheetReplica(context, actorB, a.exportUpdate());
  let store = service();
  try {
    const admission = sheetAdmission(context), pending = new PendingUpdates();
    assert.equal(store.append(actorA, { admission, updateId: 'seed', bytes: a.exportUpdate() }).status, 'durable');
    const first = a.commit({ kind: 'cell.commit', key, input: literal(10) }, 'offline-a');
    const second = b.commit({ kind: 'cell.commit', key, input: literal(20) }, 'offline-b');
    const packetA = { admission, updateId: 'packet-a', bytes: first.update };
    pending.add(packetA); pending.result('packet-a', store.append(actorA, packetA, true));
    assert.equal(pending.state('packet-a'), 'acknowledgment-unknown');
    assert.equal(store.append(actorB, { admission, updateId: 'packet-b', bytes: second.update }).status, 'durable');
    a.receive(store.exportUpdate()); b.receive(store.exportUpdate()); assert.deepEqual(a.projection, b.projection);
    assert.equal(a.projection.cells[encodeCellKey(key)]?.alternatives.length, 2);
    const checkpoint = store.checkpoint(); assert.equal(checkpoint.throughSequence, 3);
    const directory = store.directory; store.close();
    store = DisposableDurableStore.reopen(directory, { admission, currentAccess: () => true, validateDocument: sheetUpdateValidator(context) });
    pending.result('packet-a', store.append(actorA, packetA)); assert.equal(pending.state('packet-a'), 'durable');
    const fresh = new SheetReplica(context, { ...actorA, sessionId: 'new-session' }, store.exportUpdate());
    try {
      assert.deepEqual(fresh.projection, a.projection);
      const undo = a.undo('offline-a', 'undo-offline-a');
      assert.equal(store.append(actorA, { admission, updateId: 'undo-packet', bytes: undo.update }).status, 'durable');
      b.receive(store.exportUpdate()); fresh.receive(store.exportUpdate());
      assert.deepEqual(a.projection, b.projection); assert.deepEqual(a.projection, fresh.projection);
      assert.deepEqual(fresh.projection.cells[encodeCellKey(key)]?.winner?.input, literal(20));
      const edit = fresh.commit({ kind: 'cell.commit', key: { ...key, sheetId: 's2' }, input: literal('fresh-open-reedit') }, 'fresh-edit');
      assert.equal(store.append({ ...actorA, sessionId: 'new-session' }, { admission, updateId: 'fresh-packet', bytes: edit.update }).status, 'durable');
      a.receive(store.exportUpdate()); b.receive(store.exportUpdate());
      assert.deepEqual(a.projection, fresh.projection); assert.deepEqual(a.projection, b.projection);
    } finally { fresh.destroy(); }
  } finally { a.destroy(); b.destroy(); close(store); }
});

test('bounded sequential/concurrent histories store linear dependency edges and preserve convergence/undo', () => {
  const a = seed();
  let b: SheetReplica | undefined;
  try {
    const sequential = [];
    for (let i = 0; i < 64; i++) sequential.push(a.commit({ kind: 'cell.commit', key, input: literal(i) }, `sequential-${i}`).event);
    const sequentialEdges = sequential.reduce((total, event) => total + event.dependencies.length, 0);
    assert.equal(sequentialEdges, 64, 'a sequential edit depends on its one causal frontier, not every historical event');
    b = new SheetReplica(context, actorB, a.exportUpdate());
    for (let i = 0; i < 16; i++) {
      a.commit({ kind: 'cell.commit', key, input: literal(`a-${i}`) }, `branch-a-${i}`);
      b.commit({ kind: 'cell.commit', key, input: literal(`b-${i}`) }, `branch-b-${i}`);
    }
    sync(a, b);
    const observed = a.events.map(event => event.eventId);
    const join = a.commit({ kind: 'cell.commit', key: { ...key, sheetId: 's2' }, input: literal('join') }, 'join-branches').event;
    assert.deepEqual(join.dependencies, ['branch-a-15', 'branch-b-15']);
    assertCausalCoverage(observed, join, a.events);
    assert.equal(a.commit({ kind: 'unsupported', operation: 'merge' }, 'refused-after-join').event.dependencies.length, 1);
    const undo = a.undo('branch-a-15', 'undo-after-join').event;
    assert.deepEqual(undo.dependencies, ['refused-after-join']);
    sync(a, b);
    assert.deepEqual(a.projection.cells[encodeCellKey(key)]?.winner?.input, literal('b-15'));
    assert.equal(a.projection.outcomes['undo-after-join']?.status, 'applied');
    assert.equal(a.projection.outcomes['refused-after-join']?.status, 'refused');
    const totalEdges = a.events.reduce((total, event) => total + event.dependencies.length, 0);
    assert(totalEdges <= a.events.length + 1, `dependency edges ${totalEdges} exceeded linear fixture bound`);
  } finally { a.destroy(); b?.destroy(); }
});

test('causal frontier retains unrelated pending/refused events and unblocks only after the missing event arrives', () => {
  const a = seed();
  let b: SheetReplica | undefined;
  try {
    a.commit({ kind: 'unsupported', operation: 'merge' }, 'refused-last');
    a.receive(dependencyFixture(a, [{ id: 'pending-head', dependencies: ['missing-later'] }]));
    const observed = a.events.map(event => event.eventId);
    const blocked = a.commit({ kind: 'cell.commit', key, input: literal('after-all-observed') }, 'blocked-local').event;
    assert.deepEqual(blocked.dependencies, ['pending-head', 'refused-last']);
    assertCausalCoverage(observed, blocked, a.events);
    assert.equal(a.projection.outcomes['blocked-local']?.status, 'pending');
    assert.equal(a.projection.outcomes['refused-last']?.status, 'refused');
    a.receive(dependencyFixture(a, [{ id: 'missing-later', dependencies: [] }]));
    assert.equal(a.projection.outcomes['blocked-local']?.status, 'applied');
    assert.equal(a.projection.outcomes['pending-head']?.status, 'applied');
    const next = a.commit({ kind: 'cell.commit', key, input: literal('next') }, 'after-resolution').event;
    assert.deepEqual(next.dependencies, ['blocked-local']);
    b = new SheetReplica(context, actorB, a.exportUpdate());
    assert.deepEqual(a.projection, b.projection);
    a.undo('after-resolution', 'undo-resolved'); sync(a, b);
    assert.deepEqual(a.projection.cells[encodeCellKey(key)]?.winner?.input, literal('after-all-observed'));
  } finally { a.destroy(); b?.destroy(); }
});

test('cyclic pending components keep a deterministic covering frontier instead of disappearing', () => {
  const a = seed();
  let b: SheetReplica | undefined;
  try {
    a.commit({ kind: 'unsupported', operation: 'merge' }, 'refused-last');
    a.receive(dependencyFixture(a, [
      { id: 'cycle-alpha', dependencies: ['cycle-omega'] },
      { id: 'cycle-omega', dependencies: ['cycle-alpha'] },
      { id: 'pending-head', dependencies: ['not-observed'] },
    ]));
    b = new SheetReplica(context, actorB, a.exportUpdate());
    const observed = a.events.map(event => event.eventId);
    const event = a.commit({ kind: 'cell.commit', key, input: literal('pending') }, 'cycle-dependent').event;
    assert.deepEqual(event.dependencies, ['cycle-alpha', 'pending-head', 'refused-last']);
    assertCausalCoverage(observed, event, a.events);
    assert.equal(a.projection.outcomes['cycle-alpha']?.status, 'pending');
    assert.equal(a.projection.outcomes['cycle-omega']?.status, 'pending');
    assert.equal(a.projection.outcomes['cycle-dependent']?.status, 'pending');
    assert.equal(a.projection.outcomes['refused-last']?.status, 'refused');
    const peer = b.commit({ kind: 'cell.commit', key, input: literal('peer-pending') }, 'cycle-peer').event;
    assert.deepEqual(peer.dependencies, event.dependencies);
    assertCausalCoverage(observed, peer, b.events);
    sync(a, b);
    const next = b.commit({ kind: 'cell.commit', key, input: literal('also-pending') }, 'next-dependent').event;
    assert.deepEqual(next.dependencies, ['cycle-dependent', 'cycle-peer']);
    assertCausalCoverage(a.events.map(item => item.eventId), next, b.events);
    sync(a, b); assert.equal(a.projection.outcomes['next-dependent']?.status, 'pending');
  } finally { a.destroy(); b?.destroy(); }
});
