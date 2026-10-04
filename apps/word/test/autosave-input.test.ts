// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerPreCommitGuard } from '../../../packages/model/src';
import { createSampleDocument, readWordFile, wordFileText } from '@barocss/office-word';
import { registerProductReplacementPreparation, type LibrarySnapshot } from '@barocss/shared';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useWordMathInplace } from '../../../packages/office-word/src/math-inplace';
import { WordAutosave, wordDrafts, wordStore } from '../src/autosave';
import { mountWordRuntime, type WordRuntime } from '../src/runtime';

type NativeNode = { stype?: string; text?: string; marks?: unknown[]; content?: NativeNode[] };
const sessions: WordAutosave[] = [], runtimes: WordRuntime[] = [], hosts: HTMLElement[] = [], cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers(); history.replaceState(null, '', '#');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup());
  sessions.splice(0).forEach(session => session.stop());
  runtimes.splice(0).forEach(runtime => runtime.dispose()); hosts.splice(0).forEach(host => host.remove());
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve };
}
async function fixture(native: boolean | 'snapshot-only' = true) {
  const records = new Map<string, LibrarySnapshot>();
  const keep = vi.spyOn(wordStore, 'keep').mockImplementation(async (entry, text) => {
    const row = { ...entry, savedAt: 1, revision: (records.get(entry.name)?.row.revision ?? 0) + 1 };
    records.set(entry.name, { row, text }); return row;
  });
  vi.spyOn(wordStore, 'read').mockImplementation(async id => records.get(id));
  vi.spyOn(wordDrafts, 'read').mockResolvedValue(undefined);
  vi.spyOn(wordDrafts, 'keep').mockImplementation(async entry => ({ ...entry, savedAt: 1, revision: 1 }));
  const host = document.createElement('div'); document.body.append(host); hosts.push(host);
  const source = createSampleDocument();
  const runtime = mountWordRuntime(host, { initialDocument: source, editable: true }); runtimes.push(runtime);
  expect(runtime.exportNativeDocument()).toEqual(source);
  const notify = vi.fn(), session = new WordAutosave(runtime.editor, notify, native === 'snapshot-only' ? { exportNativeDocument: runtime.exportNativeDocument, loadNativeDocument: runtime.loadNativeDocument } : native ? runtime : undefined);
  sessions.push(session); await session.start(); expect(await session.flush()).toBe(true);
  const store = runtime.editor.dataStore;
  const run = [...store.getNodes().values()].find(node => node.stype === 'inline-text' && node.text && node.parentId &&
    store.getNode(node.parentId)?.stype === 'paragraph' && store.getNode(node.parentId)?.parentId &&
    store.getNode(store.getNode(node.parentId)!.parentId!)?.stype === 'surface')!;
  const leaf = () => document.createTreeWalker(host.querySelector(`[data-bc-sid="${run.sid}"]`)!, NodeFilter.SHOW_TEXT).nextNode() as Text;
  const selectEnd = () => {
    const text = leaf(), range = document.createRange(); range.setStart(text, text.length); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: text.length, endOffset: text.length, collapsed: true });
  };
  selectEnd();
  const original = runtime.exportNativeDocument(), originalHistory = runtime.editor.getHistoryStats();
  const expected = (prefix: string, suffix = '') => {
    const document = structuredClone(original) as NativeNode; let found = false;
    const fill = (node: NativeNode, parent?: NativeNode) => {
      if (!found && node.stype === 'inline-text' && node.text === run.text && parent?.stype === 'paragraph') {
        node.text = `${prefix}${node.text}${suffix}`; node.marks ??= []; found = true;
      }
      node.content?.forEach(child => fill(child, node));
    };
    fill(document); expect(found).toBe(true); return document;
  };
  const saved = () => records.get(session.id)!.text;
  return { runtime, session, host, records, keep, notify, leaf, selectEnd, original, originalHistory, expected, saved, run };
}

it('delivers pending real DOM input before saving the exact rich native original and preserves undo/redo', async () => {
  const one = await fixture(), before = one.saved();
  one.leaf().data = `LAST INPUT ${one.run.text}`; one.selectEnd();
  expect(one.runtime.exportNativeDocument()).toEqual(one.original);
  expect(await one.session.beforeReplace()).toBe(true);
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('LAST INPUT '));
  expect(one.saved()).toBe(wordFileText(one.expected('LAST INPUT '), '')); expect(one.saved()).not.toBe(before);
  expect(await one.runtime.editor.undo()).toBe(true); expect(one.runtime.exportNativeDocument()).toEqual(one.original);
  expect(await one.runtime.editor.redo()).toBe(true); expect(one.runtime.exportNativeDocument()).toEqual(one.expected('LAST INPUT '));
});

it('awaits an actual held mutation transaction and captures its final bytes only after it commits', async () => {
  const one = await fixture(), entered = deferred<void>(), release = deferred<void>(), saved = one.saved();
  cleanups.push(registerPreCommitGuard(one.runtime.editor, async () => { entered.resolve(); await release.promise; }));
  one.leaf().data = `HELD INPUT ${one.run.text}`; one.selectEnd();
  let settled = false;
  const preparation = one.session.beforeReplace().then(value => { settled = true; return value; });
  await entered.promise; expect(settled).toBe(false); expect(one.saved()).toBe(saved);
  expect(one.runtime.exportNativeDocument()).toEqual(one.original); expect(one.runtime.editor.getHistoryStats()).toEqual(one.originalHistory);
  release.resolve(); expect(await preparation).toBe(true);
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('HELD INPUT '));
  expect(one.saved()).toBe(wordFileText(one.expected('HELD INPUT '), ''));
});

it('refuses active IME persistence, retains composing input and saves it after explicit completion', async () => {
  const one = await fixture(), before = one.saved(), imported = deferred<void>();
  const observe = () => imported.resolve();
  one.runtime.editor.on('editor:content.change', observe); cleanups.push(() => one.runtime.editor.off('editor:content.change', observe));
  one.runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
  one.leaf().data = `COMPOSING ${one.run.text}`; one.selectEnd();
  // Word intentionally imports composing text in the observer microtask. The
  // save boundary must preserve that input without persisting an unfinished IME.
  await imported.promise;
  const composing = one.runtime.exportNativeDocument(), history = one.runtime.editor.getHistoryStats();
  expect(composing).toEqual(one.expected('COMPOSING '));
  expect(await one.session.beforeReplace()).toBe(false);
  expect(one.runtime.exportNativeDocument()).toEqual(composing); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
  expect(one.saved()).toBe(before); expect(one.leaf().data).toBe(`COMPOSING ${one.run.text}`);
  expect(one.notify).toHaveBeenLastCalledWith('save-error');
  one.runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(await one.session.beforeReplace()).toBe(true);
  expect(one.saved()).toBe(wordFileText(one.expected('COMPOSING '), ''));
});

it('refuses failed actual native input without losing native history or persisted bytes', async () => {
  const one = await fixture(), before = one.saved();
  cleanups.push(registerPreCommitGuard(one.runtime.editor, () => 'Temporary native refusal'));
  one.leaf().data = `RETAINED INPUT ${one.run.text}`; one.selectEnd();
  expect(await one.session.beforeReplace()).toBe(false);
  expect(one.runtime.exportNativeDocument()).toEqual(one.original); expect(one.runtime.editor.getHistoryStats()).toEqual(one.originalHistory);
  expect(one.saved()).toBe(before); expect(one.leaf().data).toBe(`RETAINED INPUT ${one.run.text}`);
  expect(one.notify).toHaveBeenLastCalledWith('save-error');
});

it.each(['same-root reload', 'authority ABA', 'session stop', 'runtime dispose'])('refuses %s while delivery is held and does not apply the stale native mutation', async reason => {
  const one = await fixture(), started = deferred<void>(), release = deferred<void>(), records = structuredClone([...one.records]);
  const execute = one.runtime.editor.executeCommand.bind(one.runtime.editor);
  vi.spyOn(one.runtime.editor, 'executeCommand').mockImplementation(async (...args) => { started.resolve(); await release.promise; return execute(...args); });
  one.leaf().data = `OLD INPUT ${one.run.text}`; one.selectEnd();
  const pending = one.session.beforeReplace(); await started.promise;
  if (reason === 'same-root reload') one.runtime.loadNativeDocument(one.original);
  else if (reason === 'authority ABA') { one.runtime.editor.setEditable(false); one.runtime.editor.setEditable(true); }
  else if (reason === 'session stop') one.session.stop();
  else one.runtime.dispose();
  const native = one.runtime.editor.exportDocument(), history = one.runtime.editor.getHistoryStats();
  release.resolve(); expect(await pending).toBe(false);
  expect(one.runtime.editor.exportDocument()).toEqual(native); expect(one.runtime.editor.getHistoryStats()).toEqual(history);
  expect([...one.records]).toEqual(records);
});

it('refuses later input during the real snapshot lock and accepts an explicit fresh preparation', async () => {
  const one = await fixture(), before = one.saved(), started = deferred<void>(), release = deferred<void>();
  const acquire = one.runtime.editor.dataStore.acquireLock.bind(one.runtime.editor.dataStore);
  let hold = true;
  vi.spyOn(one.runtime.editor.dataStore, 'acquireLock').mockImplementation(async (...args) => {
    const token = await acquire(...args);
    if (hold && args[0] === 'word-snapshot-input') { hold = false; started.resolve(); await release.promise; }
    return token;
  });
  one.leaf().data = `DELIVERED ${one.run.text}`; one.selectEnd();
  const pending = one.session.beforeReplace(); await started.promise;
  one.runtime.view.contentEditableElement.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertCompositionText', data: ' LATE' }));
  one.leaf().data += ' LATE'; one.selectEnd(); release.resolve();
  expect(await pending).toBe(false); expect(one.saved()).toBe(before);
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('DELIVERED '));
  expect(await one.session.beforeReplace()).toBe(true);
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('DELIVERED ', ' LATE'));
  expect(one.saved()).toBe(wordFileText(one.expected('DELIVERED ', ' LATE'), ''));
});

it('keeps failed storage bytes retryable after actual input delivery without changing the rich native shape', async () => {
  const one = await fixture(), before = one.saved();
  one.keep.mockRejectedValueOnce(new Error('Local storage unavailable'));
  one.leaf().data = `PROTECTED ${one.run.text}`; one.selectEnd();
  expect(await one.session.beforeReplace()).toBe(false); expect(one.saved()).toBe(before);
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('PROTECTED '));
  expect(await one.session.beforeReplace()).toBe(true);
  expect(one.saved()).toBe(wordFileText(one.expected('PROTECTED '), ''));
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('PROTECTED '));
});

it('keeps editor-only consumers saving actual commands without requiring a native view contract', async () => {
  const one = await fixture(false);
  expect(one.session.options.beforeSnapshot).toBeUndefined();
  expect(await one.runtime.editor.run('insertText', { text: 'EDITOR ONLY ' })).toBe(true);
  expect(await one.session.beforeReplace()).toBe(true);
  const parsed = readWordFile(one.saved()); if ('error' in parsed) throw new Error(parsed.error);
  expect(JSON.stringify(parsed.document)).toContain('EDITOR ONLY ');
});

it('refuses the actual nested math draft without snapshotting or changing the native original', async () => {
  const one = await fixture(), before = one.saved();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const chrome = document.createElement('div'); document.body.append(chrome); hosts.push(chrome);
  const root = createRoot(chrome); let open!: () => void;
  function MathControl() {
    const control = useWordMathInplace(one.runtime.editor, one.runtime.view); open = control.open;
    return control.surface;
  }
  await act(async () => { root.render(createElement(MathControl)); });
  try {
    await act(async () => { open(); });
    expect(one.host.querySelector('.w-math-draft')).not.toBeNull();
    expect(await one.session.beforeReplace()).toBe(false); expect(one.saved()).toBe(before);
    expect(one.runtime.exportNativeDocument()).toEqual(one.original); expect(one.runtime.editor.getHistoryStats()).toEqual(one.originalHistory);
  } finally { await act(async () => { root.unmount(); }); }
});

it('actual autosave delivery does not prepare unrelated replacement feedback', async () => {
  const one = await fixture();
  const capture = vi.fn(() => ({ prepare: async () => false, isPrepared: () => false }));
  cleanups.push(registerProductReplacementPreparation(capture));
  one.leaf().data = `AUTOSAVED ${one.run.text}`; one.selectEnd();
  expect(await one.session.flush()).toBe(true);
  expect(one.saved()).toBe(wordFileText(one.expected('AUTOSAVED '), '')); expect(capture).not.toHaveBeenCalled();
  expect(await one.session.beforeReplace()).toBe(false); expect(capture).toHaveBeenCalledTimes(1);
  expect(one.runtime.exportNativeDocument()).toEqual(one.expected('AUTOSAVED '));
});

it('preserves export/load-only native consumers without a view delivery contract', async () => {
  const one = await fixture('snapshot-only');
  expect(one.session.options.beforeSnapshot).toBeUndefined();
  expect(await one.runtime.editor.run('insertText', { text: 'COMPATIBLE NATIVE ' })).toBe(true);
  expect(await one.session.beforeReplace()).toBe(true);
  expect(one.saved()).toBe(wordFileText(one.runtime.exportNativeDocument(), ''));
});
