// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSampleDocument } from '@barocss/office-word';
import { registerPreCommitGuard } from '../../../packages/model/src';
import { createWordCommandOwner } from '../src/command-owner';
import { mountWordRuntime, type WordRuntime } from '../src/runtime';

let runtime: WordRuntime, host: HTMLElement, owner: ReturnType<typeof createWordCommandOwner>, stop: () => void;
let current = true;
beforeEach(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  host = document.createElement('div'); document.body.append(host);
  runtime = mountWordRuntime(host, { initialDocument: createSampleDocument(), editable: true });
  // jsdom does not make contentEditable=true focusable as a browser does.
  runtime.view.contentEditableElement.tabIndex = -1;
  const store = runtime.editor.dataStore;
  const run = [...store.getNodes().values()].find(node => node.stype === 'inline-text' && node.text === 'Normal')!;
  runtime.editor.updateSelection({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 6, collapsed: false });
  current = true; owner = createWordCommandOwner(runtime, () => current); stop = owner.track();
});
afterEach(() => { stop(); runtime.dispose(); host.remove(); vi.unstubAllGlobals(); });
const snapshot = () => ({ native: runtime.exportNativeDocument(), history: runtime.editor.getHistoryStats(), selection: structuredClone(runtime.editor.selection) });

it('restores native focus and the owned range without a content/history edit, then formats with exact undo/redo', async () => {
  const before = snapshot(), target = owner.capture()!;
  const field = document.createElement('input'); document.body.append(field); field.focus();
  expect(target.isCurrent()).toBe(true); expect(target.restore()).toBe(true);
  expect(document.activeElement).toBe(runtime.view.contentEditableElement); expect(snapshot()).toEqual(before);
  expect(await runtime.editor.executeCommand('toggleBold')).toBe(true);
  const formatted = runtime.exportNativeDocument(); expect(formatted).not.toEqual(before.native);
  expect(target.isCurrent()).toBe(false);
  expect(await runtime.editor.undo()).toBe(true); expect(runtime.exportNativeDocument()).toEqual(before.native);
  expect(await runtime.editor.redo()).toBe(true); expect(runtime.exportNativeDocument()).toEqual(formatted);
  field.remove();
});

it.each(['selection', 'authority', 'same-root'] as const)('refuses a %s ABA after pick and before dispatch without restoring or editing it', kind => {
  const target = owner.capture()!, selection = structuredClone(runtime.editor.selection);
  if (kind === 'selection') { runtime.editor.updateSelection(null); runtime.editor.updateSelection(selection); }
  else if (kind === 'authority') { runtime.editor.setEditable(false); runtime.editor.setEditable(true); }
  else {
    const root = runtime.editor.getRootId(); runtime.editor.loadDocument(runtime.editor.exportDocument(), String(runtime.editor.dataStore.getSessionId()));
    expect(runtime.editor.getRootId()).toBe(root); runtime.editor.updateSelection(selection);
  }
  const replacement = snapshot();
  expect(target.isCurrent()).toBe(false); expect(target.restore()).toBe(false); expect(snapshot()).toEqual(replacement);
  expect(owner.capture()!.isCurrent()).toBe(true);
});

it('keeps identical selection reports current, but retires immediate DOM input and completed composition', () => {
  const target = owner.capture()!, before = snapshot();
  runtime.editor.updateSelection(structuredClone(runtime.editor.selection)); expect(target.isCurrent()).toBe(true);
  runtime.view.contentEditableElement.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: 'x' }));
  expect(target.restore()).toBe(false); expect(snapshot()).toEqual(before);
  const fresh = owner.capture()!;
  runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
  expect(owner.capture()).toBeUndefined(); expect(fresh.isCurrent()).toBe(false);
  runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
  expect(fresh.restore()).toBe(false); expect(owner.capture()!.isCurrent()).toBe(true); expect(snapshot()).toEqual(before);
});

it('refuses disconnected and retired App owners, including cleanup and retracking the same runtime', () => {
  const target = owner.capture()!, before = snapshot();
  current = false; expect(target.restore()).toBe(false); current = true;
  host.remove(); expect(target.restore()).toBe(false); document.body.append(host);
  stop(); expect(target.restore()).toBe(false); stop = owner.track();
  expect(target.restore()).toBe(false); expect(owner.capture()!.isCurrent()).toBe(true); expect(snapshot()).toEqual(before);
});

it('permits an unchanged read-only document view intent and refuses a later authority change', () => {
  runtime.editor.setEditable(false);
  const before = snapshot(), target = owner.capture()!;
  expect(target.isCurrent()).toBe(true); expect(target.restore()).toBe(true); expect(snapshot()).toEqual(before);
  runtime.editor.setEditable(true); expect(target.restore()).toBe(false); expect(snapshot()).toEqual(before);
});

it('refuses retained failed native input without retrying it or clearing its draft', async () => {
  const store = runtime.editor.dataStore;
  const run = [...store.getNodes().values()].find(node => node.stype === 'inline-text' && node.text && node.parentId &&
    store.getNode(node.parentId)?.stype === 'paragraph' && !node.marks?.length && store.getNode(node.parentId)?.parentId &&
    store.getNode(store.getNode(node.parentId)!.parentId!)?.stype === 'surface')!;
  const native = host.querySelector(`[data-bc-sid="${run.sid}"]`)!;
  const leaf = document.createTreeWalker(native, NodeFilter.SHOW_TEXT).nextNode() as Text;
  runtime.editor.updateSelection({ selection: { type: 'range', startNodeId: run.sid!, endNodeId: run.sid!,
    startOffset: leaf.length, endOffset: leaf.length, collapsed: true }, applySelectionToView: true });
  const before = snapshot();
  const stopFailure = registerPreCommitGuard(runtime.editor, () => { throw new Error('Synthetic failed native input'); });
  try {
    leaf.data = `RETAINED ${leaf.data}`;
    expect(await runtime.view.deliverInput(() => current)).toBe(false);
    expect(runtime.view.hasFailedInputDelivery).toBe(true); expect(snapshot()).toEqual(before);
    expect(runtime.captureInputIntent({ selection: 'gesture' })).not.toBeNull();
    expect(owner.capture()).toBeUndefined();
  } finally { stopFailure(); }
  expect(runtime.view.hasFailedInputDelivery).toBe(true);
  expect(leaf.data).toBe(`RETAINED ${run.text}`);
  expect(owner.capture()).toBeUndefined(); expect(snapshot()).toEqual(before);
});
