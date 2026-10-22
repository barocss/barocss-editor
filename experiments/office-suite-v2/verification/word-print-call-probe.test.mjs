import test from 'node:test';
import assert from 'node:assert/strict';
import { observeComputedStyleMap, runWordPrintCallProbe, inlinePixelSize } from './word-print-call-probe.mjs';

function fixture() {
  class Element {
    constructor(parent = null, surface = false) { this.parentElement = parent; this.surface = surface; this.children = []; parent?.children.push(this); }
    get classList() { return { contains: name => name === 'w-surface' && this.surface }; }
    contains(node) { for (let current = node; current; current = current.parentElement) if (current === this) return true; return false; }
    toJSON() { throw new Error('A DOM element must not be serialized'); }
  }
  const returns = new WeakMap(), received = [], token = {};
  const nativeError = new Error('native failure');
  function native(...args) {
    received.push({ receiver: this, args });
    if (args[0] === 'throw') throw nativeError;
    if (!returns.has(this)) returns.set(this, { toJSON() { throw new Error('A returned map must not be serialized'); } });
    return returns.get(this);
  }
  const descriptor = { configurable: true, enumerable: false, writable: true, value: native };
  Object.defineProperty(Element.prototype, 'computedStyleMap', descriptor);
  const source = new Element(), surface = new Element(source, true), nested = new Element(surface), nestedSurface = new Element(nested, true), outside = new Element();
  return { Element, native, descriptor, source, surface, nested, nestedSurface, outside, returns, received, token, nativeError };
}

test('native this/arguments/return identity and descriptor flags pass through untouched', () => {
  const f = fixture(); let returned;
  const report = observeComputedStyleMap(f.source, () => {
    const wrapped = Object.getOwnPropertyDescriptor(f.Element.prototype, 'computedStyleMap');
    assert.equal(wrapped.enumerable, f.descriptor.enumerable); assert.equal(wrapped.configurable, true); assert.equal(wrapped.writable, true);
    assert.notEqual(wrapped.value, f.native);
    returned = f.source.computedStyleMap(f.token, 9);
    assert.equal(returned, f.returns.get(f.source));
    assert.equal(f.source.computedStyleMap(f.token, 9), returned);
  }, { ElementClass: f.Element });
  assert.equal(f.received[0].receiver, f.source); assert.equal(f.received[0].args[0], f.token); assert.equal(f.received[0].args[1], 9);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.Element.prototype, 'computedStyleMap'), f.descriptor);
  assert.equal(report.calls, 2); assert.equal(report.distinctReturnedMaps, 1); assert.equal(report.elements[0].distinctReturnedMaps, 1);
  assert.equal(report.descriptorRestored, true); assert.equal('result' in report, false);
});

test('only root and its direct surface child are boundaries; nested calls remain unattributed', () => {
  const f = fixture();
  const report = observeComputedStyleMap(f.source, () => {
    for (const element of [f.source, f.surface, f.nested, f.nestedSurface, f.outside]) element.computedStyleMap();
  }, { ElementClass: f.Element });
  assert.deepEqual(report.elements.map(row => row.classification), ['source-root', 'direct-surface-boundary', 'nested-nonboundary', 'nested-nonboundary', 'outside-source']);
  assert.deepEqual(report.classifications['nested-nonboundary'], { elements: 2, calls: 2, returnedObjects: 2, distinctReturnedMapsPerElement: 2 });
  assert.equal(report.nestedCalls, 2); assert.equal(report.nonboundaryCalls, 3);
  assert.match(report.attribution, /Whole synchronous operation scope/);
  assert.equal(report.calls, 5); assert.equal(report.distinctReturnedMaps, 5);
});

test('boundary count uses actual direct surface children and excludes nested surfaces', () => {
  const f = fixture();
  new f.Element(f.source, true); new f.Element(f.source, false);
  const report = observeComputedStyleMap(f.source, () => {}, { ElementClass: f.Element });
  assert.equal(report.boundaryExpected, 3); assert.equal(report.calls, 0);
});

test('first-call stacks remain bounded metadata and do not capture argument or return objects', () => {
  const f = fixture();
  const report = observeComputedStyleMap(f.source, () => {
    for (let i = 0; i < 8; i++) f.nested.computedStyleMap(f.token);
  }, { ElementClass: f.Element });
  assert.equal(report.callerStackSamples.length, 3);
  assert.deepEqual(report.callerStackSamples.map(sample => sample.callOrdinal), [1, 2, 3]);
  for (const sample of report.callerStackSamples) { assert.equal(typeof sample.stack, 'string'); assert.ok(sample.stack.length <= 2048); assert.equal(sample.classification, 'nested-nonboundary'); }
  assert.doesNotThrow(() => JSON.stringify(report)); assert.equal(report.calls, 8); assert.equal(report.distinctReturnedMaps, 1);
});

test('inline geometry preserves positive px, actual zero and absent/invalid values distinctly', () => {
  assert.deepEqual(inlinePixelSize('816.25px'), { status: 'AVAILABLE', pixels: 816.25 });
  assert.deepEqual(inlinePixelSize('0px'), { status: 'NONPOSITIVE', pixels: 0 });
  assert.deepEqual(inlinePixelSize(''), { status: 'ABSENT', pixels: null });
  for (const value of ['auto', 'calc(100% - 2px)', 'NaNpx', '-2px']) assert.deepEqual(inlinePixelSize(value), { status: 'INVALID_OR_NOT_PX', pixels: null });
});

test('shared native return maps have global and separate per-element identity counts', () => {
  const f = fixture(), shared = {};
  f.returns.set(f.source, shared); f.returns.set(f.surface, shared);
  const report = observeComputedStyleMap(f.source, () => {
    f.source.computedStyleMap(); f.source.computedStyleMap(); f.surface.computedStyleMap();
  }, { ElementClass: f.Element });
  assert.equal(report.returnedObjects, 3); assert.equal(report.distinctReturnedMaps, 1);
  assert.deepEqual(report.elements.map(row => row.distinctReturnedMaps), [1, 1]);
});

test('throwing operation preserves its exception identity and restores the exact descriptor', () => {
  const f = fixture(), failure = new Error('operation failure');
  assert.throws(() => observeComputedStyleMap(f.source, () => { f.source.computedStyleMap(); throw failure; }, { ElementClass: f.Element }), error => error === failure);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.Element.prototype, 'computedStyleMap'), f.descriptor);
});

test('native exceptions pass through without replacement and calls remain observable', () => {
  const f = fixture();
  const report = observeComputedStyleMap(f.source, () => {
    assert.throws(() => f.source.computedStyleMap('throw'), error => error === f.nativeError);
    f.source.computedStyleMap();
  }, { ElementClass: f.Element });
  assert.equal(report.calls, 2); assert.equal(report.nativeThrows, 1); assert.equal(report.elements[0].nativeThrows, 1); assert.equal(report.returnedObjects, 1);
});

test('missing/accessor/unreplaceable native capability fails before the operation; no shim', () => {
  let called = false;
  class Missing {}
  assert.throws(() => observeComputedStyleMap(new Missing(), () => { called = true; }, { ElementClass: Missing }), /native.*computedStyleMap/i);
  class Accessor {}
  Object.defineProperty(Accessor.prototype, 'computedStyleMap', { get() { throw new Error('Must not invoke getter'); } });
  assert.throws(() => observeComputedStyleMap(new Accessor(), () => { called = true; }, { ElementClass: Accessor }), /data method/);
  class Fixed {}
  const fixed = { configurable: false, enumerable: true, writable: false, value() { return {}; } };
  Object.defineProperty(Fixed.prototype, 'computedStyleMap', fixed);
  assert.throws(() => observeComputedStyleMap(new Fixed(), () => { called = true; }, { ElementClass: Fixed }), /cannot be observed/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Fixed.prototype, 'computedStyleMap'), fixed); assert.equal(called, false);
});

test('serialized metadata holds no source elements, arguments, native functions or returned maps', () => {
  const f = fixture();
  const report = observeComputedStyleMap(f.source, () => { f.source.computedStyleMap(f.token); f.nested.computedStyleMap(); }, { ElementClass: f.Element });
  const serialized = JSON.stringify(report); assert.ok(serialized.includes('nested-nonboundary'));
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    assert.equal(value instanceof f.Element, false); assert.notEqual(value, f.returns.get(f.source)); assert.notEqual(value, f.token);
    for (const child of Object.values(value)) { assert.notEqual(child, f.native); visit(child); }
  };
  visit(report); assert.equal(report.observationErrors, 0);
});

test('browser entry point refuses absent browser capability without a native allocation claim', async () => {
  await assert.rejects(runWordPrintCallProbe({}), /actual Word browser window/i);
});
