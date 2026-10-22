import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { SheetController } from './controller.ts';
import type { NativeLocalChange } from './controller.ts';
import { createPreviewReplica } from './fixture.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import type { CellKey } from '../../src/contracts.ts';

function pair(observer?: (change: NativeLocalChange) => void) {
  const bootstrap = createPreviewReplica('controller-peer-test-generation');
  let a: SheetReplica;
  let b: SheetReplica;
  try {
    const bytes = bootstrap.exportUpdate();
    a = new SheetReplica(bootstrap.context, { actorId: 'peer-a', sessionId: 'session-a' }, bytes);
    b = new SheetReplica(bootstrap.context, { actorId: 'peer-b', sessionId: 'session-b' }, bytes);
  } finally { bootstrap.destroy(); }
  const sentA: NativeLocalChange[] = [], sentB: NativeLocalChange[] = [];
  const left = new SheetController(a, change => { sentA.push(change); observer?.(change); });
  const right = new SheetController(b, change => { sentB.push(change); });
  const key = (sheetId: string, row: number, column: number): CellKey => {
    const cell = left.index.keyAt(sheetId, row - 1, column - 1);
    assert.ok(cell);
    return cell;
  };
  const value = (controller: SheetController, cell: CellKey) => {
    const result = controller.read(cell);
    assert.ok(result.status === 'fresh');
    assert.equal(result.token.revision, controller.projection.revision);
    return result.value;
  };
  const edit = (controller: SheetController, cell: CellKey, text: string) => {
    assert.equal(controller.select(cell), true);
    assert.equal(controller.startEdit(text), true);
    assert.equal(controller.commit(), true, controller.message);
  };
  const close = () => { left.destroy(); right.destroy(); };
  return { a, b, left, right, sentA, sentB, key, value, edit, close };
}

/** Build an admitted native event fixture, preserving the native canonical key order.
 * This changes causal dependencies in test bytes; it does not replace a workbook.
 */
function dependencyUpdate(template: SheetReplica, id: string, dependencies: readonly string[]): Uint8Array {
  const original = new Y.Doc(), fixture = new Y.Doc();
  try {
    original.getMap('native-events-v1');
    Y.applyUpdate(original, template.exportUpdate());
    const sheetInsert = template.events.find(event => event.command.kind === 'sheet.insert');
    assert.ok(sheetInsert);
    const body = original.getMap<string>('native-events-v1').get(sheetInsert.eventId);
    assert.ok(body);
    const native = JSON.parse(body) as {
      eventId: string; dependencies: readonly string[]; command: { sheetId: string; name: string };
    };
    native.eventId = id;
    native.dependencies = dependencies;
    native.command.sheetId = `sheet-${id}`;
    native.command.name = id;
    fixture.getMap<string>('native-events-v1').set(id, JSON.stringify(native));
    return Y.encodeStateAsUpdate(fixture);
  } finally { original.destroy(); fixture.destroy(); }
}

test('local commit and Undo callbacks deliver native event deltas to an independent replica', () => {
  const f = pair();
  try {
    assert.equal(f.left.sessionId, 'session-a');
    assert.equal(f.right.sessionId, 'session-b');
    assert.equal(f.sentA.length, 0, 'bootstrap is not a local controller edit');
    const cell = f.key('sheet-rates', 2, 2);
    f.edit(f.left, cell, '10');
    assert.equal(f.sentA.length, 1);
    const change = f.sentA[0]!;
    assert.ok(change.update instanceof Uint8Array);
    assert.ok(change.update.byteLength > 0);
    assert.equal(change.event.command.kind, 'cell.commit');
    assert.equal(change.event.sessionId, f.left.sessionId);
    f.b.receive(change.update);
    f.right.synchronize();
    assert.deepEqual(f.b.events.find(event => event.eventId === change.event.eventId), change.event);
    assert.deepEqual(f.right.projection, f.left.projection);
    assert.equal(f.value(f.right, cell), 10);
    assert.equal(f.left.undo(), true);
    assert.equal(f.sentA.length, 2);
    const undo = f.sentA[1]!;
    assert.deepEqual(undo.event.command, { kind: 'undo', targetEventId: change.event.eventId });
    f.b.receive(undo.update);
    f.right.synchronize();
    assert.deepEqual(f.right.projection, f.left.projection);
    assert.equal(f.value(f.right, cell), 12);
    assert.equal(f.sentB.length, 0, 'remote synchronization does not echo local callbacks');
  } finally { f.close(); }
});

test('remote cross-sheet edits recalculate fresh values and survive the local session Undo', () => {
  const f = pair();
  try {
    const rate = f.key('sheet-rates', 2, 2);
    const quantity = f.key('sheet-budget', 3, 2);
    const total = f.key('sheet-budget', 4, 4);
    f.edit(f.left, quantity, '5');
    f.b.receive(f.sentA[0]!.update);
    f.right.synchronize();
    f.edit(f.right, rate, '10');
    f.a.receive(f.sentB[0]!.update);
    f.left.synchronize();
    assert.equal(f.value(f.left, f.key('sheet-budget', 2, 3)), 10);
    assert.equal(f.value(f.left, total), 50);
    assert.equal(f.left.undo(), true);
    assert.equal(f.value(f.left, quantity), 2);
    assert.equal(f.value(f.left, rate), 10);
    assert.equal(f.value(f.left, total), 38);
    assert.equal(f.left.canUndo, false);
    f.b.receive(f.sentA[1]!.update);
    f.right.synchronize();
    assert.deepEqual(f.left.projection, f.right.projection);
    assert.equal(f.value(f.right, total), 38);
  } finally { f.close(); }
});

test('concurrent same-cell native alternatives converge; own Undo removes only its contribution', () => {
  const f = pair();
  try {
    const cell = f.key('sheet-budget', 2, 2);
    f.edit(f.left, cell, '7');
    f.edit(f.right, cell, '11');
    const local = f.sentA[0]!, foreign = f.sentB[0]!;
    f.a.receive(foreign.update);
    f.b.receive(local.update);
    f.left.synchronize(); f.right.synchronize();
    assert.deepEqual(f.left.projection, f.right.projection);
    const active = f.left.selectedAlternatives.filter(item => item.state === 'winner' || item.state === 'alternative');
    assert.deepEqual(active.map(item => item.eventId).sort(), [local.event.eventId, foreign.event.eventId].sort());
    assert.equal(active.filter(item => item.state === 'alternative').length, 1);
    assert.equal(f.value(f.left, cell), f.value(f.right, cell));
    assert.equal(f.left.undo(), true);
    assert.equal(f.value(f.left, cell), 11);
    assert.equal(f.left.selectedAlternatives.find(item => item.eventId === local.event.eventId)?.state, 'undone');
    assert.equal(f.left.selectedAlternatives.find(item => item.eventId === foreign.event.eventId)?.state, 'winner');
    f.b.receive(f.sentA[1]!.update); f.right.synchronize();
    assert.deepEqual(f.left.projection, f.right.projection);
    assert.equal(f.value(f.right, cell), 11);
  } finally { f.close(); }
});

test('ordinary and composing drafts retain native identity and text through remote synchronize', () => {
  for (const composing of [false, true]) {
    const f = pair();
    try {
      const cell = f.key('sheet-budget', 2, 1);
      f.left.select(cell); f.left.startEdit('입력 중'); f.left.setComposing(composing);
      const draft = f.left.draft;
      f.edit(f.right, cell, 'remote cell text');
      f.a.receive(f.sentB[0]!.update); f.left.synchronize();
      assert.deepEqual(f.left.draft, draft);
      assert.deepEqual(f.left.selection, cell);
      assert.equal(f.value(f.left, cell), 'remote cell text');
      assert.equal(f.sentA.length, 0);
      if (composing) {
        assert.equal(f.left.commit(), false);
        assert.deepEqual(f.left.draft, draft);
        f.left.setComposing(false);
      }
      assert.equal(f.left.commit(), true);
      assert.equal(f.value(f.left, cell), '입력 중');
    } finally { f.close(); }
  }
});

test('invalid syntax creates no local native event or transport delta', () => {
  const f = pair();
  try {
    const before = f.left.projection;
    f.left.select(f.key('sheet-budget', 2, 2)); f.left.startEdit('=1+');
    assert.equal(f.left.commit(), false);
    assert.match(f.left.message, /Input refused/);
    assert.equal(f.sentA.length, 0);
    assert.deepEqual(f.left.projection, before);
    assert.deepEqual(f.a.projection, before);
  } finally { f.close(); }
});

test('observer exceptions preserve applied commit and Undo with an explicit delivery warning', () => {
  const f = pair(() => { throw new Error('controlled delivery exception'); });
  try {
    const cell = f.key('sheet-rates', 2, 2);
    f.edit(f.left, cell, '10');
    assert.equal(f.value(f.left, cell), 10);
    assert.equal(f.left.draft, null);
    assert.equal(f.left.canUndo, true);
    assert.deepEqual(f.left.projection.outcomes[f.sentA[0]!.event.eventId], { status: 'applied' });
    assert.match(f.left.transportWarning ?? '', /Peer delivery failed; input remains in this tab: controlled delivery exception/);
    assert.doesNotMatch(f.left.message, /refused/i);
    assert.equal(f.left.undo(), true);
    assert.equal(f.value(f.left, cell), 12);
    assert.deepEqual(f.left.projection.outcomes[f.sentA[1]!.event.eventId], { status: 'applied' });
    assert.match(f.left.transportWarning ?? '', /controlled delivery exception/);
  } finally { f.close(); }
});

test('a refused native repeat Undo still emits its returned delta before reporting refusal', () => {
  const callbackBeforeReport: boolean[] = [];
  const f = pair(change => {
    callbackBeforeReport.push(f.left.projection.outcomes[change.event.eventId] === undefined);
  });
  try {
    const cell = f.key('sheet-rates', 2, 2);
    f.edit(f.left, cell, '10');
    f.b.receive(f.sentA[0]!.update); f.right.synchronize();
    const externalUndo = f.a.undo(f.sentA[0]!.event.eventId);
    f.left.synchronize();
    f.b.receive(externalUndo.update); f.right.synchronize();
    assert.equal(f.value(f.left, cell), 12);
    assert.equal(f.left.undo(), false);
    assert.equal(f.sentA.length, 2);
    assert.deepEqual(callbackBeforeReport, [true, true]);
    const repeated = f.sentA[1]!;
    assert.equal(repeated.event.command.kind, 'undo');
    assert.deepEqual(f.left.projection.outcomes[repeated.event.eventId], { status: 'refused', code: 'ALREADY_UNDONE', recoverable: false });
    assert.match(f.left.message, /Refused: ALREADY_UNDONE/);
    f.b.receive(repeated.update); f.right.synchronize();
    assert.deepEqual(f.left.projection, f.right.projection);
    assert.equal(f.value(f.right, cell), 12);
  } finally { f.close(); }
});

test('a native pending local commit emits a mergeable delta and stays pending until its dependency arrives', () => {
  const f = pair();
  try {
    const pending = dependencyUpdate(f.a, 'pending-head', ['missing-later']);
    f.a.receive(pending); f.b.receive(pending);
    f.left.synchronize(); f.right.synchronize();
    const cell = f.key('sheet-budget', 2, 2);
    f.left.select(cell); f.left.startEdit('9');
    assert.equal(f.left.commit(), false);
    assert.equal(f.sentA.length, 1);
    const change = f.sentA[0]!;
    assert.ok(change.event.dependencies.includes('pending-head'));
    assert.equal(f.left.projection.outcomes[change.event.eventId]?.status, 'pending');
    assert.match(f.left.message, /Pending native dependencies/);
    assert.equal(f.value(f.left, cell), 3);
    assert.equal(f.left.canUndo, false);
    f.b.receive(change.update); f.right.synchronize();
    assert.deepEqual(f.left.projection, f.right.projection);
    assert.equal(f.right.projection.outcomes[change.event.eventId]?.status, 'pending');
    const dependency = dependencyUpdate(f.a, 'missing-later', []);
    f.a.receive(dependency); f.b.receive(dependency);
    f.left.synchronize(); f.right.synchronize();
    assert.equal(f.left.projection.outcomes[change.event.eventId]?.status, 'applied');
    assert.equal(f.value(f.left, cell), 9);
    assert.deepEqual(f.left.projection, f.right.projection);
  } finally { f.close(); }
});

test('a local pending edit promoted to applied remains available to own Undo', () => {
  const f = pair();
  try {
    const cell = f.key('sheet-budget', 2, 2);
    const original = f.value(f.left, cell);
    const pending = dependencyUpdate(f.a, 'pending-undo-head', ['missing-undo-dependency']);
    f.a.receive(pending); f.b.receive(pending);
    f.left.synchronize(); f.right.synchronize();
    f.left.select(cell); f.left.startEdit('9');
    assert.equal(f.left.commit(), false);
    const local = f.sentA[0]!;
    assert.equal(f.left.projection.outcomes[local.event.eventId]?.status, 'pending');
    f.b.receive(local.update); f.right.synchronize();
    const dependency = dependencyUpdate(f.a, 'missing-undo-dependency', []);
    f.a.receive(dependency); f.b.receive(dependency);
    f.left.synchronize(); f.right.synchronize();
    assert.equal(f.left.projection.outcomes[local.event.eventId]?.status, 'applied');
    assert.equal(f.value(f.left, cell), 9);
    assert.ok(f.left.draft, 'the pending attempt keeps its draft until cancellation');
    assert.equal(f.left.cancel(), true);
    assert.equal(f.left.undo(), true, 'a now-applied local event must stay in own-session Undo history');
    assert.equal(f.value(f.left, cell), original);
    assert.equal(f.left.selectedAlternatives.find(item => item.eventId === local.event.eventId)?.state, 'undone');
    const undo = f.sentA[1]!;
    assert.deepEqual(undo.event.command, { kind: 'undo', targetEventId: local.event.eventId });
    f.b.receive(undo.update); f.right.synchronize();
    assert.deepEqual(f.left.projection, f.right.projection);
    assert.equal(f.value(f.right, cell), original);
  } finally { f.close(); }
});
