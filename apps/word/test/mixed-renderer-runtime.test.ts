// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { registerPreCommitGuard } from '../../../packages/model/src';
import { createSampleDocument, getWordSchemaDefinition, PAGE_BREAK_STYPE, TABLE_BREAK_STYPE, TABLE_CELL_BREAK_STYPE, TABLE_HEADER_REPEAT_STYPE } from '@barocss/office-word';
import { createSampleDeck, getSlidesSchemaDefinition, normalizeSlidesNativeDocument } from '../../../packages/office-slides/src';
import { mountWordRuntime, type WordRuntime } from '../src/runtime';
import { createSlidesRuntime, type SlidesRuntime } from '../../slide/src/runtime';

const runtimes: Array<WordRuntime | SlidesRuntime> = [], hosts: HTMLElement[] = [];
beforeEach(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { runtimes.splice(0).reverse().forEach(runtime => runtime.dispose()); hosts.splice(0).forEach(host => host.remove()); vi.unstubAllGlobals(); });
function host() { const value = document.createElement('div'); document.body.append(value); hosts.push(value); return value; }
function richWord() {
  const native = createSampleDocument();
  // Keep the complete sample's tables, resources, headers and fields; add Word's real SVG drawing.
  const surface = native.content!.find(node => typeof node !== 'string' && node.stype === 'surface');
  if (!surface || typeof surface === 'string') throw new Error('Missing rich Word surface');
  surface.content!.push({ stype: 'canvasBlock', attributes: { width: 3000, height: 1500 }, content: [
    { stype: 'rectangle', attributes: { x: 150, y: 150, width: 1800, height: 900, fill: '#336699' } }
  ] });
  return native;
}
function word() {
  const container = host(), source = richWord();
  const runtime = mountWordRuntime(container, { initialDocument: source, editable: true }); runtimes.push(runtime);
  expect(runtime.exportNativeDocument()).toEqual(source);
  expect(container.querySelector('.w-surface')).not.toBeNull();
  expect(container.querySelector('svg.w-canvas rect.w-shape-rectangle')).not.toBeNull();
  expect(container.querySelector('table')).not.toBeNull();
  return { container, runtime };
}
function slides() {
  const container = host(), source = normalizeSlidesNativeDocument(createSampleDeck());
  const runtime = createSlidesRuntime(container, { initialDocument: source, editable: true }); runtimes.push(runtime);
  expect(runtime.exportNativeDocument()).toEqual(source);
  expect(container.querySelector('.sl-slide')).not.toBeNull();
  return { container, runtime };
}
function globalSnapshot() {
  const registry = getGlobalRegistry();
  const types = new Set([...Object.keys(getWordSchemaDefinition().nodes), ...Object.keys(getSlidesSchemaDefinition().nodes),
    PAGE_BREAK_STYPE, TABLE_BREAK_STYPE, TABLE_CELL_BREAK_STYPE, TABLE_HEADER_REPEAT_STYPE]);
  return { renderers: registry.getAll(), components: [...types].map(type => [type, registry.getComponent(type)]) };
}

it('keeps the rich Word renderer and held last native input while a Slides target initializes', async () => {
  const global = globalSnapshot(), source = word(), before = source.runtime.exportNativeDocument();
  const store = source.runtime.editor.dataStore;
  const run = [...store.getNodes().values()].find(node => {
    const parent = node.parentId && store.getNode(node.parentId);
    return node.stype === 'inline-text' && node.text && parent && parent.stype === 'paragraph' &&
      parent.parentId && store.getNode(parent.parentId)?.stype === 'surface';
  })!;
  type NativeNode = { stype?: string; text?: string; marks?: unknown[]; content?: NativeNode[] };
  const expected = structuredClone(before) as NativeNode;
  let changed = false;
  const expectInput = (node: NativeNode, parent?: NativeNode) => {
    if (!changed && node.stype === 'inline-text' && node.text === run.text && parent?.stype === 'paragraph') {
      node.text = `SOURCE LAST INPUT ${node.text}`; node.marks ??= []; changed = true;
    }
    node.content?.forEach(child => expectInput(child, node));
  };
  expectInput(expected); expect(changed).toBe(true);
  source.runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const off = registerPreCommitGuard(source.runtime.editor, async () => { entered(); await gate; });
  try {
    const input = source.runtime.editor.run('insertText', { text: 'SOURCE LAST INPUT ' }); await waiting;
    const target = slides(), targetNative = target.runtime.exportNativeDocument(), targetHistory = target.runtime.editor.getHistoryStats(), targetSelection = target.runtime.editor.selection;
    release(); expect(await input).toBe(true); await source.runtime.flushCommands(); source.runtime.view.render();
    expect(source.container.querySelector('.w-surface')).not.toBeNull();
    expect(source.container.querySelector('svg.w-canvas rect.w-shape-rectangle')).not.toBeNull();
    expect(source.container.querySelector('.sl-slide')).toBeNull();
    expect(source.runtime.exportNativeDocument()).toEqual(expected);
    expect(target.runtime.exportNativeDocument()).toEqual(targetNative);
    expect(target.runtime.editor.getHistoryStats()).toEqual(targetHistory); expect(target.runtime.editor.selection).toEqual(targetSelection);
    expect(await source.runtime.editor.undo()).toBe(true); expect(source.runtime.exportNativeDocument()).toEqual(before);
    expect(await source.runtime.editor.redo()).toBe(true); expect(source.runtime.exportNativeDocument()).toEqual(expected);
    expect(globalSnapshot()).toEqual(global);
  } finally { release(); off(); }
});

it('keeps the Slides canvas renderer and exact native/history/selection when Word initializes and rerenders', () => {
  const global = globalSnapshot(), source = slides();
  const native = source.runtime.exportNativeDocument(), history = source.runtime.editor.getHistoryStats(), selection = source.runtime.editor.selection;
  word(); source.runtime.view.render();
  expect(source.container.querySelector('.sl-slide')).not.toBeNull();
  expect(source.container.querySelector('.w-surface')).toBeNull();
  expect(source.runtime.exportNativeDocument()).toEqual(native);
  expect(source.runtime.editor.getHistoryStats()).toEqual(history); expect(source.runtime.editor.selection).toEqual(selection);
  expect(globalSnapshot()).toEqual(global);
});
