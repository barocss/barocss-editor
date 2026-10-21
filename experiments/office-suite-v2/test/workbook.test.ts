import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_LIMITS, encodeCellKey, decodeCellKey } from '../src/contracts.ts';
import type { WorkbookCommand, WorkbookEvent, CellInput, FormulaNode, CreateEvent, ProjectWorkbook, ValidateEvent, DiffWorkbook, RequestUndo, CreateWorkbookContext } from '../src/contracts.ts';
import { createWorkbookContext, createEvent, validateEvent, projectWorkbook, requestUndo, diffWorkbook } from '../src/workbook.ts';

const context = createWorkbookContext({ documentId: 'doc', workbookId: 'book', generation: 'g1' });
const key = { sheetId: 's1', rowId: 'r1', columnId: 'c1' };
function event(eventId: string, command: WorkbookCommand, dependencies: readonly string[], sessionId = 'A'): WorkbookEvent {
  return createEvent(context, { eventId, actorId: 'actor-' + sessionId, sessionId }, dependencies, command);
}
function bootstrap(): WorkbookEvent[] {
  const commands: WorkbookCommand[] = [
    { kind: 'sheet.insert', sheetId: 's1', name: 'One', afterSheetId: null },
    { kind: 'sheet.insert', sheetId: 's2', name: 'Two', afterSheetId: 's1' },
    { kind: 'axis.insert', sheetId: 's1', axis: 'row', id: 'r1', afterId: null },
    { kind: 'axis.insert', sheetId: 's1', axis: 'column', id: 'c1', afterId: null },
    { kind: 'axis.insert', sheetId: 's2', axis: 'row', id: 'r2', afterId: null },
    { kind: 'axis.insert', sheetId: 's2', axis: 'column', id: 'c2', afterId: null },
  ];
  return commands.map((command, i) => event('b' + i, command, i === 0 ? [] : ['b' + (i - 1)]));
}
const literal = (value: number | string | boolean | null): CellInput => ({ kind: 'literal', value });

test('runtime exports satisfy exact C function contracts', () => {
  const types: [CreateWorkbookContext, CreateEvent, ValidateEvent, ProjectWorkbook, RequestUndo, DiffWorkbook] =
    [createWorkbookContext, createEvent, validateEvent, projectWorkbook, requestUndo, diffWorkbook];
  assert.equal(types.length, 6);
});
test('two-sheet native workbook is sparse, ordered and identity-bound', () => {
  const result = projectWorkbook(context, bootstrap());
  assert.deepEqual(result.sheets.map(sheet => sheet.id), ['s1', 's2']);
  assert.deepEqual(result.sheets[0]?.rows.map(row => row.id), ['r1']);
  assert.equal(Object.keys(result.cells).length, 0);
  assert.equal(Object.values(result.outcomes).every(outcome => outcome.status === 'applied'), true);
});
test('cell key tuple round-trips delimiter and prototype names', () => {
  const unusual = { sheetId: '__proto__', rowId: 'x,"y', columnId: '[z]' };
  assert.deepEqual(decodeCellKey(encodeCellKey(unusual)), unusual);
  assert.throws(() => decodeCellKey('["x",3,"z"]'), TypeError);
});
test('concurrent value/formula commits converge and retain atomic alternatives', () => {
  const base = bootstrap();
  const a = event('a', { kind: 'cell.commit', key, input: literal(7) }, ['b5']);
  const formula: CellInput = { kind: 'formula', version: 1, context: key, ast: { kind: 'binary', operator: '+', left: { kind: 'number', value: 1 }, right: { kind: 'number', value: 2 } } };
  const z = event('z', { kind: 'cell.commit', key, input: formula }, ['b5'], 'B');
  const expected = projectWorkbook(context, [...base, a, z]);
  for (const events of [[z, ...base.reverse(), a], [a, z, ...base], [z, z, a, ...base]]) {
    assert.deepEqual(projectWorkbook(context, events), expected);
  }
  const cell = expected.cells[encodeCellKey(key)];
  assert.equal(cell?.winner?.eventId, 'z');
  assert.deepEqual(cell?.winner?.input, formula);
  assert.deepEqual(cell?.alternatives.map(item => item.state), ['alternative', 'winner']);
});
test('causal successor wins despite lexically smaller ID; prior inputs remain', () => {
  const first = event('z', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const second = event('a', { kind: 'cell.commit', key, input: literal(2) }, ['z'], 'B');
  const cell = projectWorkbook(context, [...bootstrap(), second, first]).cells[encodeCellKey(key)];
  assert.equal(cell?.winner?.eventId, 'a');
  assert.deepEqual(cell?.alternatives.map(item => item.state), ['superseded', 'winner']);
});
test('own cell undo preserves later remote value and its superseded history', () => {
  const first = event('a', { kind: 'cell.commit', key, input: literal('local') }, ['b5']);
  const remote = event('b', { kind: 'cell.commit', key, input: literal('remote') }, ['a'], 'B');
  const undo = requestUndo(context, { eventId: 'u', actorId: 'actor-A', sessionId: 'A' }, ['b'], 'a');
  const projection = projectWorkbook(context, [...bootstrap(), undo, remote, first]);
  assert.deepEqual(projection.cells[encodeCellKey(key)]?.winner?.input, literal('remote'));
  assert.equal(projection.cells[encodeCellKey(key)]?.alternatives[0]?.state, 'undone');
  assert.equal(projection.outcomes.u?.status, 'applied');
});
test('another tab of same actor cannot undo another session; repeat undo refuses', () => {
  const a = event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const foreign = requestUndo(context, { eventId: 'foreign', actorId: 'actor-A', sessionId: 'new-tab' }, ['a'], 'a');
  const own = event('own', { kind: 'undo', targetEventId: 'a' }, ['a']);
  const repeat = event('repeat', { kind: 'undo', targetEventId: 'a' }, ['own']);
  const projection = projectWorkbook(context, [...bootstrap(), a, foreign, own, repeat]);
  assert.deepEqual(projection.outcomes.foreign, { status: 'refused', code: 'UNDO_SESSION', recoverable: false });
  assert.deepEqual(projection.outcomes.repeat, { status: 'refused', code: 'ALREADY_UNDONE', recoverable: false });
});
test('batch failure is atomic and supported batch undo removes only own contributions', () => {
  const wrongKey = { ...key, rowId: 'missing' };
  const bad = event('bad', { kind: 'cells.commit', changes: [{ key, input: literal(1) }, { key: wrongKey, input: literal(2) }] }, ['b5']);
  const good = event('good', { kind: 'cells.commit', changes: [{ key, input: literal(3) }, { key: { sheetId: 's2', rowId: 'r2', columnId: 'c2' }, input: literal(4) }] }, ['b5']);
  const before = projectWorkbook(context, [...bootstrap(), bad]);
  assert.equal(Object.keys(before.cells).length, 0);
  assert.equal(before.outcomes.bad?.status, 'refused');
  const undo = event('undo', { kind: 'undo', targetEventId: 'good' }, ['good']);
  const result = projectWorkbook(context, [...bootstrap(), good, undo]);
  assert.equal(Object.keys(result.cells).length, 2);
  assert.equal(Object.values(result.cells).every(cell => cell.winner === null && cell.alternatives[0]?.state === 'undone'), true);
});
test('dependencies retain pending descendants and cycles, then resolve by retry', () => {
  const a = event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const pending = projectWorkbook(context, [a]);
  assert.deepEqual(pending.outcomes.a, { status: 'pending', missing: ['b5'] });
  const child = event('child', { kind: 'cell.commit', key, input: literal(2) }, ['a']);
  assert.deepEqual(projectWorkbook(context, [child, a]).outcomes.child, { status: 'pending', missing: ['a'] });
  assert.equal(projectWorkbook(context, [...bootstrap(), child, a]).outcomes.child?.status, 'applied');
  const x = event('x', { kind: 'unsupported', operation: 'merge' }, ['y']);
  const y = event('y', { kind: 'unsupported', operation: 'row.move' }, ['x']);
  assert.equal(projectWorkbook(context, [x, y]).outcomes.x?.status, 'pending');
  assert.equal(JSON.stringify(projectWorkbook(context, [x, y])), JSON.stringify(projectWorkbook(context, [y, x])));
});
test('same-ID retry deduplicates but different body rejects projection', () => {
  const a = event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const collision = event('a', { kind: 'cell.commit', key, input: literal(2) }, ['b5']);
  assert.equal(projectWorkbook(context, [...bootstrap(), a, a]).eventIds.length, 7);
  assert.throws(() => projectWorkbook(context, [...bootstrap(), a, collision]), /collision/);
  const negativeZero = event('zero', { kind: 'cell.commit', key, input: literal(-0) }, ['b5']);
  const positiveZero = event('zero', { kind: 'cell.commit', key, input: literal(0) }, ['b5']);
  const zeroResult = projectWorkbook(context, [...bootstrap(), negativeZero, positiveZero]);
  assert.deepEqual(zeroResult.cells[encodeCellKey(key)]?.winner?.input, literal(0));
  assert.deepEqual(zeroResult, projectWorkbook(context, [...bootstrap(), JSON.parse(JSON.stringify(negativeZero))]));
});
test('projection and constructors detach and recursively freeze input', () => {
  const raw = { ...event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']), command: { kind: 'cell.commit', key: { ...key }, input: { kind: 'literal', value: 1 } } };
  const checked = validateEvent(raw, context);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  raw.command.input.value = 99;
  const projection = projectWorkbook(context, [...bootstrap(), checked.event]);
  assert.deepEqual(projection.cells[encodeCellKey(key)]?.winner?.input, literal(1));
  assert.equal(Object.isFrozen(projection.cells[encodeCellKey(key)]?.alternatives[0]?.input), true);
  assert.throws(() => Object.assign(projection.cells, { bogus: 1 }), TypeError);
});
test('validation rejects malformed JSON without executing accessors', () => {
  const good = event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  let called = false;
  const accessor = { ...good };
  Object.defineProperty(accessor, 'command', { enumerable: true, get() { called = true; return good.command; } });
  const sparse = new Array<string>(2); sparse[1] = 'b5';
  const invalid: unknown[] = [undefined, NaN, Infinity, new Date(), { ...good, extra: 1 }, { ...good, dependencies: sparse },
    { ...good, dependencies: ['b5', 'b5'] }, { ...good, dependencies: ['a'] }, { ...good, eventId: '' },
    { ...good, eventId: 'x'.repeat(CORE_LIMITS.idLength + 1) }, { ...good, command: { kind: 'unknown' } },
    { ...good, context: { ...context, schemaVersion: 2 } }, { ...good, command: { kind: 'cell.commit', key, input: literal(Infinity) } },
    { ...good, command: { kind: 'cell.commit', key, input: { kind: 'literal', value: undefined } } }, accessor];
  const cycle: Record<string, unknown> = {}; cycle.self = cycle; invalid.push(cycle);
  for (const value of invalid) assert.equal(validateEvent(value, context).ok, false);
  assert.equal(called, false);
  const collection: WorkbookEvent[] = [];
  Object.defineProperty(collection, 0, { enumerable: true, get() { called = true; return good; } });
  assert.throws(() => projectWorkbook(context, collection), TypeError);
  assert.equal(called, false);
  const identity = { documentId: 'doc', workbookId: 'book', generation: 'g1' };
  Object.defineProperty(identity, 'documentId', { enumerable: true, get() { called = true; return 'doc'; } });
  assert.throws(() => createWorkbookContext(identity), TypeError);
  assert.equal(called, false);
  const extendedIdentity = { documentId: 'doc', workbookId: 'book', generation: 'g1', engineVersion: 2 };
  assert.throws(() => createWorkbookContext(extendedIdentity), TypeError);
});
test('AST limits, non-atomic formula fields and duplicate batch keys reject', () => {
  let ast: FormulaNode = { kind: 'number', value: 1 };
  for (let i = 0; i < CORE_LIMITS.astDepth; i++) ast = { kind: 'unary', operator: '-', operand: ast };
  const input: CellInput = { kind: 'formula', version: 1, context: key, ast };
  assert.throws(() => event('deep', { kind: 'cell.commit', key, input }, ['b5']), TypeError);
  const valid = event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  assert.equal(validateEvent({ ...valid, command: { ...valid.command, source: '=1' } }, context).ok, false);
  assert.throws(() => event('batch', { kind: 'cells.commit', changes: [{ key, input: literal(1) }, { key, input: literal(2) }] }, ['b5']), TypeError);
  const tooManyNodes: FormulaNode = { kind: 'call', name: 'SUM', arguments: Array.from({ length: CORE_LIMITS.astNodes }, () => ({ kind: 'number', value: 1 })) };
  assert.throws(() => event('wide', { kind: 'cell.commit', key, input: { kind: 'formula', version: 1, context: key, ast: tooManyNodes } }, ['b5']), TypeError);
  assert.equal(validateEvent({ ...valid, dependencies: Array.from({ length: CORE_LIMITS.dependencies + 1 }, (_, i) => String(i)) }, context).ok, false);
  const oversized = { ...valid, command: { kind: 'cells.commit', changes: Array.from({ length: 40 }, (_, i) => ({ key: { ...key, rowId: String(i) }, input: { kind: 'literal', value: 'x'.repeat(CORE_LIMITS.textLength) } })) } };
  assert.deepEqual(validateEvent(oversized, context), { ok: false, code: 'LIMIT', message: 'Event exceeds byte limit' });
});
test('revision includes body/context; diff identifies changed cell and structure sheets', () => {
  const a = event('a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const b = event('a', { kind: 'cell.commit', key, input: literal(2) }, ['b5']);
  const before = projectWorkbook(context, bootstrap());
  const after = projectWorkbook(context, [...bootstrap(), a]);
  assert.notEqual(after.revision, projectWorkbook(context, [...bootstrap(), b]).revision);
  assert.deepEqual(diffWorkbook(before, after).changedCellKeys, [key]);
  assert.deepEqual(diffWorkbook(before, after).changedStructureSheetIds, []);
  const different = projectWorkbook(createWorkbookContext({ documentId: 'other', workbookId: 'other', generation: 'g1' }), []);
  assert.throws(() => diffWorkbook(before, different), TypeError);
});

test('replayed immutable input stays equivalent and external JSON stays untrusted', () => {
  const input: CellInput = { kind: 'formula', version: 1, context: key, ast: { kind: 'number', value: 7 } };
  const accepted = event('accepted', { kind: 'cell.commit', key, input }, ['b5']);
  const before = projectWorkbook(context, [...bootstrap(), accepted]);
  const after = projectWorkbook(context, [...bootstrap().reverse(), accepted]);
  assert.deepEqual(before, after);
  assert.equal(Object.isFrozen(after.cells[encodeCellKey(key)]?.winner?.input), true);

  const raw = { ...accepted, command: { kind: 'cell.commit', key: { ...key }, input: { kind: 'literal', value: 5 } } } satisfies WorkbookEvent;
  const checked = validateEvent(raw, context);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  Object.freeze(raw); // A caller's shallow freeze is not a Core admission receipt.
  raw.command.input.value = 99;
  assert.deepEqual(projectWorkbook(context, [...bootstrap(), checked.event]).cells[encodeCellKey(key)]?.winner?.input, literal(5));
  assert.deepEqual(projectWorkbook(context, [...bootstrap(), raw]).cells[encodeCellKey(key)]?.winner?.input, literal(99));
  raw.command.input.value = Infinity;
  assert.throws(() => projectWorkbook(context, [...bootstrap(), raw]), /INVALID_JSON/);
  const anotherGeneration = createWorkbookContext({ documentId: 'doc', workbookId: 'book', generation: 'g2' });
  assert.throws(() => projectWorkbook(anotherGeneration, [accepted]), /INVALID_CONTEXT/);
});

test('native reuse and JSON replay produce exact equal revisions, records and diffs', () => {
  const events = bootstrap();
  let previous = projectWorkbook(context, events);
  const steps: WorkbookCommand[] = [
    { kind: 'cell.commit', key, input: { kind: 'formula', version: 1, context: key, ast: { kind: 'number', value: 7 } } },
    { kind: 'cell.commit', key, input: literal(8) },
    { kind: 'undo', targetEventId: 'step1' },
    { kind: 'axis.delete', sheetId: 's1', axis: 'row', id: 'r1' },
    { kind: 'undo', targetEventId: 'step3' },
    { kind: 'unsupported', operation: 'merge' },
  ];
  for (let i = 0; i < steps.length; i++) {
    const command = steps[i];
    if (!command) throw new Error('Missing test step');
    events.push(event('step' + i, command, [events.at(-1)?.eventId ?? 'b5']));
    const next = projectWorkbook(context, events);
    const cold = projectWorkbook(context, JSON.parse(JSON.stringify(events.toReversed())));
    assert.deepEqual(next, cold);
    const reparsedBefore = JSON.parse(JSON.stringify(previous));
    const reparsedAfter = JSON.parse(JSON.stringify(next));
    assert.deepEqual(diffWorkbook(previous, next), diffWorkbook(reparsedBefore, reparsedAfter));
    assert.deepEqual(diffWorkbook(previous, next), diffWorkbook(previous, reparsedAfter));
    previous = next;
  }
});

test('caller-frozen projections retain canonical number and key comparison semantics', () => {
  const zero = event('zero', { kind: 'cell.commit', key, input: literal(0) }, ['b5']);
  const native = projectWorkbook(context, [...bootstrap(), zero]);
  const external = JSON.parse(JSON.stringify(native));
  const record = external.cells[encodeCellKey(key)];
  record.winner.input.value = -0;
  record.key = Object.fromEntries(Object.entries(record.key).reverse());
  Object.freeze(external); // Provenance cannot be forged with a shallow freeze.
  assert.deepEqual(diffWorkbook(native, external).changedCellKeys, []);
  record.winner.input.value = 42;
  assert.deepEqual(diffWorkbook(native, external).changedCellKeys, [key]);
});


// Compare the complete public value and diff against a fresh wire replay. The
// replay deliberately has different object identities and input ordering.
function assertAppendReplay(prefix: WorkbookEvent[], appended: WorkbookEvent[]): ReturnType<typeof projectWorkbook> {
  const before = projectWorkbook(context, prefix);
  const nextEvents = [...prefix, ...appended];
  const native = projectWorkbook(context, nextEvents);
  const cold = projectWorkbook(context, JSON.parse(JSON.stringify(nextEvents.toReversed())));
  assert.deepEqual(native, cold);
  assert.equal(native.revision, cold.revision);
  assert.deepEqual(diffWorkbook(before, native), diffWorkbook(JSON.parse(JSON.stringify(before)), cold));
  assert.equal(Object.getPrototypeOf(native.cells), null);
  assert.equal(Object.getPrototypeOf(native.outcomes), null);
  assert.deepEqual(Object.keys(native.cells), Object.keys(cold.cells));
  assert.deepEqual(Object.keys(native.outcomes), Object.keys(cold.outcomes));
  return native;
}

test('native sequential overwrite retains exact undone and alternative history with an earlier ID', () => {
  const a = event('history-a', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const b = event('history-b', { kind: 'cell.commit', key, input: literal(2) }, ['b5'], 'B');
  const undo = event('history-undo', { kind: 'undo', targetEventId: 'history-a' }, ['history-a', 'history-b']);
  const prefix = [...bootstrap(), a, b, undo];
  // Causal order and exact revision event-ID order intentionally disagree.
  const next = event('0-before-bootstrap', { kind: 'cell.commit', key, input: literal(3) }, ['history-undo']);
  const result = assertAppendReplay(prefix, [next]);
  const cell = result.cells[encodeCellKey(key)];
  assert.equal(cell?.winner?.eventId, next.eventId);
  assert.deepEqual(cell?.alternatives.map(item => [item.eventId, item.state]), [
    ['history-a', 'undone'], ['history-b', 'superseded'], ['0-before-bootstrap', 'winner'],
  ]);
  const again = event('next', { kind: 'cell.commit', key, input: literal(4) }, [next.eventId]);
  assertAppendReplay([...prefix, next], [again]);
});

test('one native overwrite batch matches cold replay across existing cells and prior winners', () => {
  const otherKey = { sheetId: 's2', rowId: 'r2', columnId: 'c2' };
  const initial = event('initial', { kind: 'cells.commit', changes: [
    { key, input: literal(1) }, { key: otherKey, input: literal(2) },
  ] }, ['b5']);
  const overwrite = event('overwrite', { kind: 'cells.commit', changes: [
    { key: otherKey, input: literal(20) },
    { key, input: { kind: 'formula', version: 1, context: key, ast: { kind: 'number', value: 10 } } },
  ] }, ['initial']);
  const result = assertAppendReplay([...bootstrap(), initial], [overwrite]);
  assert.deepEqual(Object.values(result.cells).map(cell => cell.winner?.eventId), ['overwrite', 'overwrite']);
  assert.deepEqual(diffWorkbook(projectWorkbook(context, [...bootstrap(), initial]), result).changedCellKeys, [key, otherKey]);
});

test('covering tip and concurrent same-tip suffix preserve causal alternatives', () => {
  const first = event('first', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const left = event('left', { kind: 'cell.commit', key, input: literal(2) }, ['first']);
  const right = event('right', { kind: 'cell.commit', key, input: literal(3) }, ['first'], 'B');
  const concurrent = assertAppendReplay([...bootstrap(), first, left], [right]);
  assert.deepEqual(concurrent.cells[encodeCellKey(key)]?.alternatives.map(item => item.state), ['superseded', 'alternative', 'winner']);
  const observesOnlyRight = event('only-right', { kind: 'cell.commit', key, input: literal(4) }, ['right']);
  const partial = assertAppendReplay([...bootstrap(), first, left, right], [observesOnlyRight]);
  assert.equal(partial.cells[encodeCellKey(key)]?.alternatives.find(item => item.eventId === 'left')?.state, 'alternative');
  const coversBoth = event('covers-both', { kind: 'cell.commit', key, input: literal(5) }, ['left', 'right']);
  const complete = assertAppendReplay([...bootstrap(), first, left, right], [coversBoth]);
  assert.equal(complete.cells[encodeCellKey(key)]?.winner?.eventId, 'covers-both');
  assert.equal(complete.cells[encodeCellKey(key)]?.alternatives.filter(item => item.state === 'alternative').length, 0);
  // Two appended events are concurrent, even though each sees the stored tip.
  assertAppendReplay([...bootstrap(), first], [left, right]);
});

test('raw, shallow-frozen and replaced prefixes never reuse stale admitted content', () => {
  const first = event('first', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const prefix = [...bootstrap(), first];
  const next = event('next', { kind: 'cell.commit', key, input: literal(2) }, ['first']);
  projectWorkbook(context, prefix);
  const raw = JSON.parse(JSON.stringify(first));
  Object.freeze(raw);
  raw.command.input.value = 9;
  const changedPrefix = [...prefix.slice(0, -1), raw];
  const changed = assertAppendReplay(changedPrefix, [next]);
  assert.deepEqual(changed.cells[encodeCellKey(key)]?.alternatives[0]?.input, literal(9));
  raw.command.input.value = 10;
  assert.deepEqual(assertAppendReplay(changedPrefix, [next]).cells[encodeCellKey(key)]?.alternatives[0]?.input, literal(10));
  const replacement = event('first', { kind: 'cell.commit', key, input: literal(11) }, ['b5']);
  const replaced = assertAppendReplay([...prefix.slice(0, -1), replacement], [next]);
  assert.deepEqual(replaced.cells[encodeCellKey(key)]?.alternatives[0]?.input, literal(11));
  assertAppendReplay(prefix.toReversed(), [next]);
});

test('duplicate, collision, pending resolution and error recovery match complete replay', () => {
  const first = event('first', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const prefix = [...bootstrap(), first];
  assertAppendReplay(prefix, [first]);
  const collision = event('first', { kind: 'cell.commit', key, input: literal(2) }, ['b5']);
  projectWorkbook(context, prefix);
  assert.throws(() => projectWorkbook(context, [...prefix, collision]), /collision/);
  const next = event('next', { kind: 'cell.commit', key, input: literal(3) }, ['first']);
  assertAppendReplay(prefix, [next]);
  const unknown = event('unknown-dependency', { kind: 'cell.commit', key, input: literal(99) }, ['first', 'not-yet-known']);
  const stillPending = assertAppendReplay(prefix, [unknown]);
  assert.deepEqual(stillPending.outcomes['unknown-dependency'], { status: 'pending', missing: ['not-yet-known'] });
  assert.equal(stillPending.cells[encodeCellKey(key)]?.winner?.eventId, 'first');
  const pending = event('pending', { kind: 'cell.commit', key, input: literal(5) }, ['missing']);
  const resolves = event('missing', { kind: 'cell.commit', key, input: literal(4) }, ['first']);
  const resolved = assertAppendReplay([...prefix, pending], [resolves]);
  assert.equal(resolved.outcomes.pending?.status, 'applied');
  assert.equal(resolved.cells[encodeCellKey(key)]?.winner?.eventId, 'pending');
  const malformed = { ...next, command: { kind: 'cell.commit', key, input: literal(Infinity) } } satisfies WorkbookEvent;
  projectWorkbook(context, prefix);
  assert.throws(() => projectWorkbook(context, [...prefix, malformed]), /INVALID_JSON/);
  assertAppendReplay(prefix, [next]);
});

test('new and missing batch cells use atomic complete replay semantics', () => {
  const first = event('first', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const prefix = [...bootstrap(), first];
  const otherKey = { sheetId: 's2', rowId: 'r2', columnId: 'c2' };
  const newCell = event('new-cell', { kind: 'cells.commit', changes: [
    { key, input: literal(2) }, { key: otherKey, input: literal(3) },
  ] }, ['first']);
  assert.equal(Object.keys(assertAppendReplay(prefix, [newCell]).cells).length, 2);
  const bad = event('bad', { kind: 'cells.commit', changes: [
    { key, input: literal(7) }, { key: { ...key, rowId: 'missing' }, input: literal(8) },
  ] }, ['first']);
  const refused = assertAppendReplay(prefix, [bad]);
  assert.equal(refused.outcomes.bad?.status, 'refused');
  assert.deepEqual(refused.cells[encodeCellKey(key)]?.winner?.input, literal(1));
});

test('repeated and interleaved contexts preserve revisions and reject incompatible reuse', () => {
  const first = event('first', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const next = event('next', { kind: 'cell.commit', key, input: literal(2) }, ['first']);
  const prefix = [...bootstrap(), first];
  const before = projectWorkbook(context, prefix);
  const other = createWorkbookContext({ documentId: 'other', workbookId: 'other', generation: 'g2' });
  const otherEvent = createEvent(other, { eventId: 'other-sheet', actorId: 'actor-A', sessionId: 'A' }, [], { kind: 'sheet.insert', sheetId: 'other', name: 'Other', afterSheetId: null });
  projectWorkbook(other, [otherEvent]);
  assert.deepEqual(projectWorkbook(context, prefix), before);
  const result = projectWorkbook(context, [...prefix, next]);
  projectWorkbook(other, [otherEvent]);
  assert.deepEqual(projectWorkbook(context, [...prefix, next]), result);
  assert.throws(() => projectWorkbook(other, [...prefix, next]), /INVALID_CONTEXT/);
  assertAppendReplay(prefix, [next]);
});


test('mutable projection contexts are revalidated after an otherwise eligible prefix', () => {
  const first = event('first', { kind: 'cell.commit', key, input: literal(1) }, ['b5']);
  const next = event('next', { kind: 'cell.commit', key, input: literal(2) }, ['first']);
  const prefix = [...bootstrap(), first];
  const mutableContext = { ...context };
  projectWorkbook(mutableContext, prefix);
  mutableContext.generation = 'g2';
  assert.throws(() => projectWorkbook(mutableContext, [...prefix, next]), /INVALID_CONTEXT/);
  mutableContext.generation = context.generation;
  assert.deepEqual(projectWorkbook(mutableContext, [...prefix, next]), projectWorkbook(context, JSON.parse(JSON.stringify([...prefix, next].toReversed()))));
  assertAppendReplay(prefix, [next]);
});
