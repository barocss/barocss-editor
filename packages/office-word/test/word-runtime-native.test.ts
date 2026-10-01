import { createSampleDocument } from '../src/sample-document';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createStarterDocument, readWordFile, wordFileText } from '../src/index';
import { assertWordNativeDocument, mountWordRuntime, type WordRuntime } from '../../../apps/word/src/runtime';

let runtime: WordRuntime | undefined;
afterEach(() => { runtime?.dispose(); runtime = undefined; vi.restoreAllMocks(); });

it('preserves original metadata and missing attributes through native load/export and refuses a malformed replacement', () => {
  // This unit checks the native boundary. Browser checks exercise pagination and input.
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const source = createStarterDocument();
  source.metadata = { loadedAt: 'owner-supplied-timestamp', origin: 'synthetic-private-source' };
  const native = readWordFile(wordFileText(source));
  if ('error' in native) throw new Error(native.error);
  const host = document.createElement('div');
  document.body.appendChild(host);
  runtime = mountWordRuntime(host, { initialDocument: native.document, editable: true });
  expect(runtime.exportNativeDocument()).toEqual(native.document);
  expect(window.editor).toBeUndefined();
  expect(() => runtime?.loadNativeDocument({ stype: 'unknown-native-node', attributes: {} })).toThrow();
  expect(runtime.exportNativeDocument()).toEqual(native.document);
  runtime.dispose();
  runtime.dispose();
  expect(() => runtime?.loadNativeDocument(native.document)).toThrow('disposed');
  expect(document.head.querySelector('[data-word-print]')).toBeNull();
  host.remove();
});

it('prevalidates supported native trees without a view and refuses fields the loader would drop', () => {
  const source = createStarterDocument();
  expect(() => assertWordNativeDocument(source)).not.toThrow();
  expect(document.head.querySelector('[data-word-print]')).toBeNull();
  expect(() => assertWordNativeDocument({ ...source, unsupportedDurableData: 'must-not-disappear' })).toThrow('without changes');
});

it('blocks viewer mutation events but allows reader navigation and follows editable changes', () => {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'); document.body.appendChild(host);
  runtime = mountWordRuntime(host, { initialDocument: createStarterDocument(), editable: false });
  const surface = runtime.view.contentEditableElement;
  expect(surface.contentEditable).toBe('false');
  for (const type of ['beforeinput', 'paste', 'cut', 'drop']) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    surface.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  }
  const editing = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true });
  surface.dispatchEvent(editing); expect(editing.defaultPrevented).toBe(true);
  const copy = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
  // Check the ancestor boundary independently of the view's own shortcut implementation.
  const reached = vi.fn(); surface.addEventListener('keydown', reached, { once: true });
  surface.dispatchEvent(copy); expect(reached).toHaveBeenCalledOnce();
  runtime.editor.setEditable(true);
  expect(surface.contentEditable).toBe('true');
  const writable = new Event('paste', { bubbles: true, cancelable: true });
  host.dispatchEvent(writable); expect(writable.defaultPrevented).toBe(false);
  runtime.editor.setEditable(false); expect(surface.contentEditable).toBe('false');
  runtime.dispose(); host.remove();
});

it('synchronous native-load listeners receive the exact replacement without loader timestamps', () => {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'); document.body.appendChild(host);
  runtime = mountWordRuntime(host, { initialDocument: createStarterDocument(), editable: true });
  const replacement = createStarterDocument(); replacement.metadata = { origin: 'second-synthetic-source' };
  const file = readWordFile(wordFileText(replacement)); if ('error' in file) throw new Error(file.error);
  const snapshots: unknown[] = [];
  runtime.editor.on('editor:content.change', () => snapshots.push(runtime!.exportNativeDocument()));
  runtime.loadNativeDocument(replacement);
  expect(snapshots).toEqual([file.document]);
  expect(runtime.exportNativeDocument()).toEqual(file.document);
  runtime.dispose(); host.remove();
});

it('accepts the complete shipped native Word sample without dropping metadata or references', () => {
  const source = createSampleDocument();
  source.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  expect(() => assertWordNativeDocument(source)).not.toThrow();
});

it('loads and exports shipped rich native Word source without adding local default resources', () => {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const source = createSampleDocument();
  source.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const file = readWordFile(wordFileText(source)); if ('error' in file) throw new Error(file.error);
  expect(() => assertWordNativeDocument(source)).not.toThrow();
  const host = document.createElement('div'); document.body.appendChild(host);
  runtime = mountWordRuntime(host, { initialDocument: file.document, editable: true });
  expect(runtime.exportNativeDocument()).toEqual(file.document);
  runtime.loadNativeDocument(file.document);
  expect(runtime.exportNativeDocument()).toEqual(file.document);
  runtime.dispose(); host.remove();
});
