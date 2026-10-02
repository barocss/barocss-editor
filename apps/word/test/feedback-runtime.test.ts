import { afterEach, expect, it, vi } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { createStarterDocument, createWordFeedbackHost } from '@barocss/office-word';
import { mountWordRuntime, type WordRuntime } from '../src/runtime';

const runtimes: WordRuntime[] = [], hosts: HTMLElement[] = [];
afterEach(() => { runtimes.splice(0).forEach(runtime => runtime.dispose()); hosts.splice(0).forEach(host => host.remove()); vi.unstubAllGlobals(); });
function fixture() {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const host = document.createElement('div'); document.body.append(host); hosts.push(host);
  const runtime = mountWordRuntime(host, { initialDocument: createStarterDocument(), editable: true });
  runtimes.push(runtime);
  return { host, runtime };
}
it('reading keeps native authority distinct, blocks body input, and never enables a revoked writer', () => {
  const { host, runtime } = fixture(), before = runtime.exportNativeDocument();
  runtime.setReading(true);
  expect(runtime.editor.isEditable).toBe(true);
  expect(runtime.view.contentEditableElement.contentEditable).toBe('false');
  const typing = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Do not insert' });
  runtime.view.contentEditableElement.dispatchEvent(typing);
  expect(typing.defaultPrevented).toBe(true); expect(runtime.exportNativeDocument()).toEqual(before);
  runtime.editor.setEditable(false); runtime.setReading(false);
  expect(runtime.editor.isEditable).toBe(false); expect(runtime.view.contentEditableElement.contentEditable).toBe('false');
  expect(host.isConnected).toBe(true);
});
it('flush waits for an entered native command and rejects unfinished composition', async () => {
  const { runtime } = fixture();
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(runtime.editor, async () => { entered(); await gate; });
  const write = runtime.editor.run('insertText', { text: '마지막 입력' });
  await waiting;
  let flushed = false;
  const flush = runtime.flushCommands().then(() => { flushed = true; });
  await Promise.resolve(); expect(flushed).toBe(false); finish();
  expect(await write).toBe(true); await flush; off();
  expect(JSON.stringify(runtime.exportNativeDocument())).toContain('마지막 입력');
  runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
  await expect(runtime.flushCommands()).rejects.toThrow('Finish');
  expect(() => runtime.setReading(true)).toThrow('Finish');
  expect(runtime.view.contentEditableElement.contentEditable).toBe('true');
  runtime.view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
});

it('retries the same native feedback identity after a rendered document update without a second thread', async () => {
  const { runtime } = fixture();
  const run = [...runtime.editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  runtime.editor.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  expect(await runtime.editor.run('insertText', { text: '검토할 실제 원문' })).toBe(true);
  runtime.editor.updateSelection({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 3, collapsed: false });
  const host = createWordFeedbackHost({ editor: runtime.editor, id: () => 'word-document', canComment: () => true,
    captureSelection: () => runtime.editor.selection });
  const target = host.capture()!; expect(target).not.toBeNull();
  const before = runtime.exportNativeDocument();
  expect(await host.comment(target, '원문에 대한 의견')).toEqual(target);
  const committed = runtime.exportNativeDocument();
  expect(await host.comment(target, '원문에 대한 의견')).toEqual(target);
  expect(runtime.exportNativeDocument()).toEqual(committed);
  expect(await runtime.editor.undo()).toBe(true); expect(runtime.exportNativeDocument()).toEqual(before);
  expect(await runtime.editor.redo()).toBe(true);
  runtime.loadNativeDocument(committed);
  expect(runtime.exportNativeDocument()).toEqual(committed);
  expect(host.locate(target)).toBe('located');
  host.dispose();
});
