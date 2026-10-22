import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountBootstrap } from './account-bootstrap.ts';
import { SheetReplica } from '../../src/collaboration.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import type { WorkbookContext, WorkbookEvent } from '../../src/contracts.ts';
import { encodeCellKey } from '../../src/contracts.ts';
import { CalculationEngine } from '../../src/calculation.ts';
import { ReferenceIndex } from '../../src/references.ts';

const actorId = '00000000-0000-4000-8000-000000000004';
const context = createWorkbookContext({ documentId: '00000000-0000-4000-8000-000000000001',
  workbookId: '00000000-0000-4000-8000-000000000002', generation: '00000000-0000-4000-8000-000000000003' });

test('account bootstrap replays actual Budget/Rates commands under exact PG UUID context and canonical actor', () => {
  const replica = createAccountBootstrap(context, actorId);
  let restored: SheetReplica | undefined;
  try {
    assert.deepEqual(replica.context, context);
    assert.equal(replica.identity.actorId, actorId);
    assert.match(replica.identity.sessionId, /^[0-9a-f-]{36}$/);
    const projection = replica.projection;
    assert.deepEqual(projection.sheets.map(sheet => [sheet.id, sheet.name, sheet.rows.length, sheet.columns.length]),
      [['sheet-budget', 'Budget', 32, 12], ['sheet-rates', 'Rates', 32, 12]]);
    assert.equal(replica.events.length, 91);
    const index = new ReferenceIndex(projection), calculation = new CalculationEngine(projection);
    calculation.recalculate();
    for (const [row, expected] of [[4, 44], [5, 'Review']] as const) {
      const key = index.keyAt('sheet-budget', row - 1, 3); assert.ok(key);
      const result = calculation.read(key); assert.equal(result.status, 'fresh');
      assert.ok(result.status === 'fresh'); assert.equal(result.value, expected);
    }
    for (const event of replica.events) {
      assert.deepEqual(event.context, context); assert.equal(event.actorId, actorId);
      assert.equal(event.sessionId, replica.identity.sessionId);
      assert.equal(projection.outcomes[event.eventId]?.status, 'applied');
    }
    for (const record of Object.values(projection.cells)) {
      if (record.winner?.input.kind === 'formula') {
        assert.deepEqual(record.winner.input.context, record.key);
        assert.equal(encodeCellKey(record.winner.input.context), encodeCellKey(record.key));
      }
    }
    restored = new SheetReplica(context, replica.identity, replica.exportUpdate());
    assert.deepEqual(restored.events, replica.events);
    assert.deepEqual(restored.exportUpdate(), replica.exportUpdate());
    const encoded = JSON.stringify(replica.events);
    assert.equal(encoded.includes('sheet-preview'), false);
    assert.equal(encoded.includes('budget-example'), false);
    assert.equal(encoded.includes('local-preview-user'), false);
  } finally { restored?.destroy(); replica.destroy(); }
});

test('fresh bootstraps use distinct native sessions and event identities', () => {
  const first = createAccountBootstrap(context, actorId), second = createAccountBootstrap(context, actorId);
  try {
    assert.notEqual(first.identity.sessionId, second.identity.sessionId);
    const firstIds = new Set(first.events.map(event => event.eventId));
    assert.equal(second.events.some(event => firstIds.has(event.eventId)), false);
  } finally { first.destroy(); second.destroy(); }
});

test('malformed, noncanonical or extended account scopes fail before creating a native fixture', t => {
  const commit = t.mock.method(SheetReplica.prototype, 'commit');
  const invalid: unknown[] = [null, {}, { ...context, documentId: 'sheet-preview' }, { ...context, workbookId: 'budget-example' },
    { ...context, generation: 'old' }, { ...context, engineVersion: 2 }, { ...context, extra: true },
    { ...context, documentId: 'AAAAAAAA-0000-4000-8000-000000000001' }, { ...context, [Symbol('hidden')]: true }];
  const accessor = { ...context }; Object.defineProperty(accessor, 'documentId', { get() { throw new Error('must-not-read-accessor'); }, enumerable: true });
  invalid.push(accessor);
  for (const input of invalid) assert.throws(() => createAccountBootstrap(input as WorkbookContext, actorId), /invalid-account-bootstrap-context/);
  for (const actor of ['', 'controlled-user', 'AAAAAAAA-0000-4000-8000-000000000004', undefined]) {
    assert.throws(() => createAccountBootstrap(context, actor as string), /invalid-account-bootstrap-context/);
  }
  assert.equal(commit.mock.callCount(), 0);
});

test('source native fixture is read-only and destroyed after successful replay', t => {
  const descriptor = Object.getOwnPropertyDescriptor(SheetReplica.prototype, 'events'); assert.ok(descriptor?.get);
  const read = descriptor.get;
  const sources = new Set<SheetReplica>();
  let original: string | undefined, destroyed = false;
  Object.defineProperty(SheetReplica.prototype, 'events', { ...descriptor, get(this: SheetReplica) {
    const events = read.call(this) as readonly WorkbookEvent[];
    if (this.identity.actorId === 'local-preview-user' && events.length === 91) { sources.add(this); original ??= JSON.stringify(events); }
    return events;
  } });
  const destroy = SheetReplica.prototype.destroy;
  t.mock.method(SheetReplica.prototype, 'destroy', function(this: SheetReplica) {
    if (sources.has(this)) { assert.equal(JSON.stringify(read.call(this)), original); destroyed = true; }
    destroy.call(this);
  });
  let target: SheetReplica | undefined;
  try {
    target = createAccountBootstrap(context, actorId);
    assert.equal(sources.size, 1); assert.equal(destroyed, true); assert.equal(sources.has(target), false);
  } finally { Object.defineProperty(SheetReplica.prototype, 'events', descriptor); target?.destroy(); }
});

test('unsupported source chain refuses seeding and destroys the source without creating target events', t => {
  const descriptor = Object.getOwnPropertyDescriptor(SheetReplica.prototype, 'events'); assert.ok(descriptor?.get);
  const read = descriptor.get;
  const sources = new Set<SheetReplica>();
  let destroyed = false, accountCommits = 0;
  Object.defineProperty(SheetReplica.prototype, 'events', { ...descriptor, get(this: SheetReplica) {
    const events = read.call(this) as readonly WorkbookEvent[];
    if (this.identity.actorId !== 'local-preview-user' || events.length !== 91) return events;
    sources.add(this);
    return events.map(event => ({ ...event, dependencies: [] }));
  } });
  const destroy = SheetReplica.prototype.destroy, commit = SheetReplica.prototype.commit;
  t.mock.method(SheetReplica.prototype, 'destroy', function(this: SheetReplica) { if (sources.has(this)) destroyed = true; destroy.call(this); });
  t.mock.method(SheetReplica.prototype, 'commit', function(this: SheetReplica, ...args: Parameters<SheetReplica['commit']>) {
    if (this.identity.actorId === actorId) accountCommits++;
    return commit.apply(this, args);
  });
  try {
    assert.throws(() => createAccountBootstrap(context, actorId), /unsupported-account-bootstrap-seed/);
    assert.equal(sources.size, 1); assert.equal(destroyed, true); assert.equal(accountCommits, 0);
  } finally { Object.defineProperty(SheetReplica.prototype, 'events', descriptor); }
});
