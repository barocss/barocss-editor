import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStarterDocument, createWordFeedbackHost, exportWordDocx, readWordDocx } from '@barocss/office-word';
import { registerProductDocumentHost, registerProductReplacementPreparation } from '@barocss/shared';
import { registerPreCommitGuard } from '@barocss/model';
import { DocxImport } from '../src/docx-import';
import { DocumentLibrary, type DocumentLibraryHandle } from '../src/document-library';
import { WordAutosave } from '../src/autosave';
import { mountWordRuntime, type WordRuntime } from '../src/runtime';

let root: Root, runtime: WordRuntime, container: HTMLElement, native: HTMLElement;
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  container = document.createElement('div'); native = document.createElement('div'); document.body.append(container, native);
  root = createRoot(container); runtime = mountWordRuntime(native, { initialDocument: createStarterDocument(), editable: true });
});
afterEach(async () => {
  await act(async () => root.unmount()); cleanups.splice(0).reverse().forEach(off => off());
  runtime.dispose(); container.remove(); native.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function fixture(beforeOpen: () => Promise<void> = () => runtime.flushCommands()) {
  const opened = vi.fn();
  await act(async () => root.render(<DocxImport editor={runtime.editor} native={runtime} beforeOpen={beforeOpen} onOpened={opened} />));
  return { ...await upload(), opened };
}
async function upload() {
  const bytes = exportWordDocx(createStarterDocument()).bytes;
  const file = new File([new Uint8Array(bytes)], 'loaded.docx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(bytes).buffer });
  const input = document.querySelector('input[aria-label="DOCX 파일 선택"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === '새 문서로 열기')!;
  expect(button).toBeDefined();
  return { button, imported: readWordDocx(bytes, 'loaded').document };
}
async function begin(button: HTMLButtonElement) { await act(async () => button.click()); }
function source() { return { native: runtime.exportNativeDocument(), history: runtime.editor.getHistoryStats() }; }

it('prepares owned feedback before native input persistence and installs the real DOCX', async () => {
  const order: string[] = [];
  cleanups.push(registerProductReplacementPreparation(() => ({ prepare: async () => { order.push('feedback'); return true; }, isPrepared: () => true })));
  const { button, opened, imported } = await fixture(async () => { order.push('native'); await runtime.flushCommands(); });
  await begin(button);
  expect(order).toEqual(['feedback', 'native']); expect(opened).toHaveBeenCalledOnce();
  expect(runtime.exportNativeDocument()).toEqual(imported);
});
it('keeps the full native document and history when feedback changes during native persistence', async () => {
  let current = true;
  cleanups.push(registerProductReplacementPreparation(() => ({ prepare: async () => true, isPrepared: () => current })));
  const gate = deferred(); const { button, opened } = await fixture(() => gate.promise); const before = source();
  await begin(button); current = false; await act(async () => gate.release());
  expect(source()).toEqual(before); expect(opened).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')).not.toBeNull();
});
it.each(['registration', 'document ABA', 'unmount'] as const)('refuses a retired source after %s while persistence is held', async kind => {
  cleanups.push(registerProductDocumentHost({ product: 'word', id: () => 'original', beforeNavigate: async () => true }));
  const gate = deferred(); const { button, opened } = await fixture(() => gate.promise); await begin(button);
  if (kind === 'registration') cleanups.push(registerProductDocumentHost({ product: 'word', id: () => 'original', beforeNavigate: async () => true }));
  if (kind === 'document ABA') { const original = runtime.exportNativeDocument(); runtime.loadNativeDocument(createStarterDocument()); runtime.loadNativeDocument(original); }
  if (kind === 'unmount') await act(async () => root.render(null));
  const before = source(); await act(async () => gate.release());
  expect(source()).toEqual(before); expect(opened).not.toHaveBeenCalled();
});
it('preserves real last input and history rather than replacing it after a held native save', async () => {
  const gate = deferred(); const { button, opened } = await fixture(() => gate.promise); await begin(button);
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  expect(await runtime.editor.run('insertText', { text: 'last native input' })).toBe(true);
  const before = source(); await act(async () => gate.release());
  expect(source()).toEqual(before); expect(JSON.stringify(before.native)).toContain('last native input'); expect(opened).not.toHaveBeenCalled();
});
it.each(['failed save', 'composition'] as const)('keeps the real source when native preparation rejects %s', async kind => {
  const { button, opened } = await fixture(async () => { if (kind === 'failed save') throw new Error('quota'); await runtime.flushCommands(); });
  if (kind === 'composition') runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
  const before = source(); await begin(button); expect(source()).toEqual(before); expect(opened).not.toHaveBeenCalled();
  if (kind === 'composition') runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
});
it.each(['composition', 'authority ABA'] as const)('refuses %s entered after delivery while the save is held', async kind => {
  const gate = deferred(); const { button, opened } = await fixture(() => gate.promise); await begin(button);
  if (kind === 'composition') runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
  else { runtime.editor.setEditable(false); runtime.editor.setEditable(true); }
  const before = source(); await act(async () => gate.release());
  expect(source()).toEqual(before); expect(opened).not.toHaveBeenCalled();
  if (kind === 'composition') runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
});
it('delivers an already entered native command before saving and permits its owned revision', async () => {
  const gate = deferred(), entered = deferred();
  cleanups.push(registerPreCommitGuard(runtime.editor, async () => { entered.release(); await gate.promise; }));
  let saved: unknown;
  const { button, opened, imported } = await fixture(async () => { saved = runtime.exportNativeDocument(); });
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  const write = runtime.editor.run('insertText', { text: 'entered before import' }); await entered.promise;
  await begin(button); expect(opened).not.toHaveBeenCalled();
  await act(async () => { gate.release(); expect(await write).toBe(true); });
  await act(async () => { await vi.waitFor(() => expect(opened).toHaveBeenCalledOnce()); });
  expect(JSON.stringify(saved)).toContain('entered before import'); expect(runtime.exportNativeDocument()).toEqual(imported);
});
it('does not start native persistence after refused feedback', async () => {
  cleanups.push(registerProductReplacementPreparation(() => ({ prepare: async () => false, isPrepared: () => false })));
  const save = vi.fn(async () => {}), { button, opened } = await fixture(save), before = source();
  await begin(button); expect(save).not.toHaveBeenCalled(); expect(opened).not.toHaveBeenCalled(); expect(source()).toEqual(before);
});
it('saves the actual feedback comment before replacing and permits that owned edit revision', async () => {
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  expect(await runtime.editor.run('insertText', { text: 'original feedback target' })).toBe(true);
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 3, collapsed: false });
  const host = createWordFeedbackHost({ editor: runtime.editor, id: () => 'original', canComment: () => true, captureSelection: () => runtime.editor.selection });
  cleanups.push(() => host.dispose());
  const target = host.capture()!; expect(target).not.toBeNull();
  let prepared = false, saved: unknown;
  cleanups.push(registerProductReplacementPreparation(() => ({ prepare: async () => {
    prepared = !!await host.comment(target, 'real feedback before DOCX'); return prepared;
  }, isPrepared: () => prepared })));
  const { button, opened, imported } = await fixture(async () => { saved = runtime.exportNativeDocument(); });
  await begin(button); expect(opened).toHaveBeenCalledOnce();
  expect(JSON.stringify(saved)).toContain('real feedback before DOCX'); expect(runtime.exportNativeDocument()).toEqual(imported);
});
it('keeps the parsed DOCX available for an explicit retry after feedback refusal', async () => {
  let allowed = false;
  cleanups.push(registerProductReplacementPreparation(() => ({ prepare: async () => allowed, isPrepared: () => allowed })));
  const { button, opened, imported } = await fixture(); await begin(button); expect(opened).not.toHaveBeenCalled();
  allowed = true; await begin(button); expect(opened).toHaveBeenCalledOnce(); expect(runtime.exportNativeDocument()).toEqual(imported);
});
it.each([true, false])('uses the current library controller beforeReplace result %s rather than plain autosave flush', async saved => {
  vi.spyOn(WordAutosave.prototype, 'start').mockResolvedValue(undefined);
  const prepare = vi.spyOn(WordAutosave.prototype, 'beforeReplace').mockResolvedValue(saved);
  const flush = vi.spyOn(WordAutosave.prototype, 'flush').mockRejectedValue(new Error('plain flush must not replace'));
  const handle = createRef<DocumentLibraryHandle>();
  await act(async () => root.render(<DocumentLibrary ref={handle} editor={runtime.editor} native={runtime} />));
  await act(async () => handle.current!.open('actions'));
  const { button, imported } = await upload(), before = source(); await begin(button);
  expect(prepare).toHaveBeenCalledOnce(); expect(flush).not.toHaveBeenCalled();
  if (saved) expect(runtime.exportNativeDocument()).toEqual(imported);
  else { expect(source()).toEqual(before); expect(document.querySelector('[role="alert"]')).not.toBeNull(); }
});
