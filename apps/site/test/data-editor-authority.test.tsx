// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createSampleSite, datasetsOf } from '@barocss/office-site';
import { registerPreCommitGuard } from '@barocss/model';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { RowForm } from '../src/data-editor';
import { createSiteRuntime, type SiteRuntime } from '../src/runtime';
import { siteNativeFixture } from '../../office/tests/helpers/site-native-fixture';
let runtime: SiteRuntime, root: Root, flushes: Set<() => Promise<void>>;
const registerFlush = (flush: () => Promise<void>) => { flushes.add(flush); return () => { flushes.delete(flush); }; };
function RevisionRowForm({ sid }: { sid: string }) {
  const revision = useEditorRevision(runtime.editor);
  return createElement(RowForm, { editor: runtime.editor, registerFlush, run: (name, payload) => runtime.editor.executeCommand(name, payload), revision, at: { sid, row: 0 }, onClose: () => {} });
}
beforeEach(async context => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  const host = document.createElement('div'), form = document.createElement('div'); document.body.append(host, form);
  const full = context.task.name.includes('full fixture');
  const source = (full ? siteNativeFixture(true) : createSampleSite()) as unknown as { content: { stype: string; content: unknown[] }[] };
  if (!full) source.content.find(node => node.stype === 'resources')!.content.push(
    { stype: 'dataset', attributes: { name: 'guarded-body', fields: [{ name: 'Body', kind: 'richText' }], rowIds: ['first'], records: [{ Body: 'text:guarded-body' }] } },
    { stype: 'richText', attributes: { id: 'guarded-body' }, metadata: { owner: 'native' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'kept', marks: [] }] }] }
  );
  if (full) {
    const schedule = globalThis.setTimeout.bind(globalThis);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler as () => void, delay === 150 || delay === 350 ? 60_000 : delay, ...args)) as typeof setTimeout);
  }
  if (context.task.name.includes('nested portal')) {
    const resources = source.content.find(node => node.stype === 'resources')!;
    const body = resources.content.find(node => (node as { attributes?: { id?: string } }).attributes?.id === 'guarded-body') as { content: unknown[] };
    body.content.push({ stype: 'noteDatabase', attributes: { source: 'nested-tasks' } }, { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'nested-tasks', fields: [{ name: 'Name', kind: 'text' }], rowIds: ['nested-item', 'next-item'], records: [{ Name: 'Nested item' }, { Name: 'Next item' }] } },
      { stype: 'richText', attributes: { id: 'nested-item' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'nested kept', marks: [] }] }] },
      { stype: 'richText', attributes: { id: 'next-item' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'next kept', marks: [] }] }] }
    ] });
    if (context.task.name.includes('two-level')) {
      const inner = (body.content.at(-1) as { content: { attributes?: { id?: string }; content?: unknown[] }[] }).content.find(node => node.attributes?.id === 'nested-item')!;
      inner.content!.push({ stype: 'noteDatabase', attributes: { source: 'deep-tasks' } }, { stype: 'resources', content: [
        { stype: 'dataset', attributes: { name: 'deep-tasks', fields: [{ name: 'Name', kind: 'text' }], rowIds: ['deep-item'], records: [{ Name: 'Deep item' }] } },
        { stype: 'richText', attributes: { id: 'deep-item' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'deep kept', marks: [] }] }] }
      ] });
      const schedule = globalThis.setTimeout.bind(globalThis);
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
        schedule(handler as () => void, delay === 150 || delay === 350 ? 60_000 : delay, ...args)) as typeof setTimeout);
    }
  }
  runtime = createSiteRuntime(host, { initialDocument: source, editable: true }); root = createRoot(form); flushes = new Set();
  const dataset = datasetsOf({ rootId: runtime.editor.getRootId()!, getNode: id => runtime.editor.dataStore.getNode(id) }).find(one => one.name === (full ? '글' : 'guarded-body'))!;
  await act(async () => root.render(full ? createElement(RevisionRowForm, { sid: dataset.sid! }) : createElement(RowForm, { editor: runtime.editor, registerFlush, run: (name, payload) => runtime.editor.executeCommand(name, payload), revision: 0, at: { sid: dataset.sid!, row: 0 }, onClose: () => {} })));
  expect(flushes.size).toBe(full ? 2 : 1);
});
afterEach(async () => { await act(async () => root.unmount()); runtime.dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(Range.prototype, 'getClientRects'); Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect'); });
function leaf() {
  const walker = document.createTreeWalker(document.querySelector('[data-note-body]')!, NodeFilter.SHOW_TEXT);
  let next: Node | null; while ((next = walker.nextNode())) if (next.textContent === 'kept' || next.textContent?.startsWith('kept')) return next as Text;
  throw new Error('Actual native Note text was not mounted');
}
function typeLast() {
  const text = leaf(); text.data += ' last';
  const range = document.createRange(); range.setStart(text, text.length); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
}
const snapshot = () => structuredClone({ native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory(), selection: runtime.editor.selection });
const flush = () => [...flushes][0]();
it('awaits actual deepest DOM input and its held host body commit without blur', async () => {
  const before = snapshot(); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  const remove = registerPreCommitGuard(runtime.editor, async () => { entered(); await gate; });
  typeLast(); let done = false; let pending!: Promise<void>;
  await act(async () => { pending = flush().then(() => { done = true; }); await started; });
  expect(done).toBe(false); expect(snapshot()).toEqual(before); expect(leaf().data).toBe('kept last');
  expect(([...flushes][0] as import('../src/data-editor').BodyInputDelivery).captureInputIntent?.()).toBeNull();
  await act(async () => { release(); await pending; }); remove();
  expect(JSON.stringify(runtime.exportNativeDocument())).toContain('kept last');
  expect(runtime.editor.historyManager.getHistory()).toHaveLength(before.history.length + 1);
  const after = runtime.exportNativeDocument(); await runtime.editor.undo(); expect(runtime.exportNativeDocument()).toEqual(before.native);
  await runtime.editor.redo(); expect(runtime.exportNativeDocument()).toEqual(after);
});
it('refuses active composition and then delivers the same retained actual input after composition ends', async () => {
  const before = snapshot(); const body = document.querySelector('[data-note-body]')!;
  body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); typeLast();
  await act(async () => { await expect(flush()).rejects.toThrow(); }); expect(snapshot()).toEqual(before);
  body.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  await act(async () => { await flush(); }); expect(JSON.stringify(runtime.exportNativeDocument())).toContain('kept last');
});
it('keeps failed host body delivery for an explicit current-owner retry', async () => {
  const before = snapshot(); const remove = registerPreCommitGuard(runtime.editor, () => 'synthetic durable refusal'); typeLast();
  await act(async () => { await expect(flush()).rejects.toThrow(); });
  expect(snapshot()).toEqual(before); expect(leaf().data).toBe('kept last');
  remove(); await act(async () => { await flush(); });
  expect(JSON.stringify(runtime.exportNativeDocument())).toContain('kept last');
});

it('refuses a real held deepest host commit across authority ABA with native and history unchanged', async () => {
  const before = snapshot(); let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  const remove = registerPreCommitGuard(runtime.editor, async () => { entered(); await gate; });
  typeLast(); let pending!: Promise<void>;
  await act(async () => { pending = flush(); void pending.catch(() => {}); await started; });
  await act(async () => { runtime.editor.setEditable(false); runtime.editor.setEditable(true); release(); await expect(pending).rejects.toThrow(); });
  remove(); expect(snapshot()).toEqual(before); expect(leaf().data).toBe('kept last');
});
it('retains an explicit blocked witness when a real dirty rich-body view unmounts before delivery', async () => {
  const before = snapshot(); const body = document.querySelector('[data-note-body]')!;
  body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); typeLast();
  body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: ' last' }));
  const captured = [...flushes][0];
  await act(async () => root.unmount());
  expect(flushes.has(captured)).toBe(true); await expect(captured()).rejects.toThrow();
  expect(snapshot()).toEqual(before);
});
it('correlates an actual thrown host body command for explicit retry without clearing an unrelated runtime failure', async () => {
  const error = new Error('actual hosted rich-body failure');
  runtime.editor.registerCommand({ name: 'setRichText', canExecute: () => true, execute: async () => { throw error; } });
  typeLast(); await act(async () => { await expect(flush()).rejects.toThrow(); });
  const failure = runtime.commandFailure()!; expect(failure.error).toBe(error);
  expect(runtime.view.hasFailedInputDeliveryError(error)).toBe(false);
  const owned = [...flushes][0] as (() => Promise<void>) & { hasFailedInputDeliveryError?: (error: unknown) => boolean; retryInputDelivery?: (current: () => boolean) => Promise<boolean> };
  runtime.editor.getSortedExtensions().find(extension => extension.name === 'siteData')!.onCreate!(runtime.editor);
  await act(async () => { await flush(); });
  expect(JSON.stringify(runtime.exportNativeDocument())).toContain('kept last');
  expect(await runtime.flushPendingInput(() => true)).toBe(false); // successful body retry alone cannot clear the exact runtime error
  expect(owned.hasFailedInputDeliveryError?.(error)).toBe(true);
  expect(owned.hasFailedInputDeliveryError?.(new Error('unrelated prior failure'))).toBe(false);
  expect(await owned.retryInputDelivery?.(() => false)).toBe(false);
  let retried = false; await act(async () => { retried = !!await owned.retryInputDelivery?.(() => true); });
  expect(retried).toBe(true);
  expect(failure.acknowledge(() => owned.hasFailedInputDeliveryError!(failure.error))).toBe(true);
  expect(await runtime.flushPendingInput(() => true)).toBe(true);
});
it.each(['beforeinput', 'compositionstart'] as const)('retires an exact clean body witness on immediate portal %s before any model mutation', async event => {
  const delivery = [...flushes][0] as import('../src/data-editor').BodyInputDelivery;
  const intent = delivery.captureInputIntent?.(); expect(intent?.()).toBe(true);
  const body = document.querySelector('[data-note-body]')!;
  const shell = document.querySelector('.st-shell'); expect(shell?.contains(body) ?? false).toBe(false);
  const before = snapshot();
  const mainIntent = runtime.captureInputIntent(); expect(mainIntent?.()).toBe(true);
  if (event === 'beforeinput') body.dispatchEvent(new InputEvent(event, { bubbles: true, inputType: 'insertText', data: '!' }));
  else body.dispatchEvent(new CompositionEvent(event, { bubbles: true, data: '가' }));
  expect(snapshot()).toEqual(before); expect(mainIntent?.()).toBe(true);
  expect(intent?.()).toBe(false); expect(delivery.captureInputIntent?.()).toBeNull();
});
it('keeps a fresh exact body witness after successful current deepest input settlement and retires it on unmount', async () => {
  const delivery = [...flushes][0] as import('../src/data-editor').BodyInputDelivery;
  typeLast(); document.querySelector('[data-note-body]')!.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' last' }));
  expect(delivery.captureInputIntent?.()).toBeNull();
  await act(async () => { await flush(); }); const current = delivery.captureInputIntent?.(); expect(current?.()).toBe(true);
  await act(async () => root.unmount()); expect(current?.()).toBe(false); expect(delivery.captureInputIntent?.()).toBeNull();
});

it.each(['beforeinput', 'compositionstart'] as const)('retires the outer exact body witness on nested portal %s without waiting for model mutation', async event => {
  const field = document.querySelector('[data-site-note-field]')!;
  const opener = field.querySelector<HTMLButtonElement>('button[aria-label="행 1 열기"]'); expect(opener).not.toBeNull();
  await act(async () => opener!.click());
  const child = document.querySelector<HTMLElement>('.ondb-body-note [data-note-body]'); expect(child).not.toBeNull();
  expect(field.contains(child)).toBe(false);
  const delivery = [...flushes][0] as import('../src/data-editor').BodyInputDelivery;
  const intent = delivery.captureInputIntent?.(); expect(intent?.()).toBe(true);
  const main = runtime.captureInputIntent(); expect(main?.()).toBe(true);
  const before = snapshot();
  if (event === 'beforeinput') child!.dispatchEvent(new InputEvent(event, { bubbles: true, inputType: 'insertText', data: '!' }));
  else child!.dispatchEvent(new CompositionEvent(event, { bubbles: true, data: '가' }));
  expect(snapshot()).toEqual(before); expect(main?.()).toBe(true);
  expect(intent?.()).toBe(false); expect(delivery.captureInputIntent?.()).toBeNull();
});

it.each(['닫기', '다음 항목'] as const)('retains actual nested portal composition and full native history when %s requests replacement', async action => {
  const opener = document.querySelector<HTMLButtonElement>('[data-site-note-field] button[aria-label="행 1 열기"]')!;
  await act(async () => opener.click());
  const child = document.querySelector<HTMLElement>('.ondb-body-note [data-note-body]')!;
  const before = snapshot(); const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  let next: Node | null, text: Text | undefined;
  while ((next = walker.nextNode())) if (next.textContent === 'nested kept') { text = next as Text; break; }
  expect(text).toBeDefined();
  child.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '가' }));
  text!.data += ' last'; const range = document.createRange(); range.setStart(text!, text!.length); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  child.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: ' last' }));
  const button = document.querySelector<HTMLButtonElement>(`.ondb-peek button[aria-label="${action}"]`); expect(button).not.toBeNull();
  await act(async () => button!.click());
  expect(child.isConnected).toBe(true); expect(text!.data).toBe('nested kept last'); expect(snapshot()).toEqual(before);
  child.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' last' }));
  await act(async () => { await flush(); });
  const delivered = snapshot(); expect(JSON.stringify(delivered.native)).toContain('nested kept last');
  await act(async () => button!.click());
  expect(child.isConnected).toBe(false); expect(snapshot()).toEqual(delivered);
});

it('settles two-level nested portal composition after a refused Close through the actual complete body flush with idle delivery held', async () => {
  await act(async () => document.querySelector<HTMLButtonElement>('[data-site-note-field] button[aria-label="행 1 열기"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('.ondb-body-note button[aria-label="행 1 열기"]')!.click());
  const child = [...document.querySelectorAll<HTMLElement>('.ondb-body-note [data-note-body]')].at(-1)!;
  const before = snapshot(); const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  let next: Node | null, text: Text | undefined;
  while ((next = walker.nextNode())) if (next.textContent === 'deep kept') { text = next as Text; break; }
  expect(text).toBeDefined();
  child.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  text!.data += ' last'; const range = document.createRange(); range.setStart(text!, text!.length); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  child.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: ' last' }));
  await act(async () => { await expect(flush()).rejects.toThrow(); });
  const close = [...document.querySelectorAll<HTMLButtonElement>('.ondb-peek button[aria-label="닫기"]')].at(-1)!;
  await act(async () => close.click());
  expect(child.isConnected).toBe(true); expect(snapshot()).toEqual(before);
  child.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' last' }));
  await act(async () => { await flush(); });
  expect(JSON.stringify(runtime.exportNativeDocument())).toContain('deep kept last');
  const delivery = [...flushes][0] as import('../src/data-editor').BodyInputDelivery;
  expect(delivery.captureInputIntent?.()?.()).toBe(true);
  expect(runtime.editor.historyManager.getHistory()).toHaveLength(before.history.length + 1);
});

it('keeps every full fixture sibling and deep body witness clean after actual held-idle composition recovery', async () => {
  await act(async () => document.querySelector<HTMLButtonElement>('[data-site-note-field] button[aria-label="행 1 열기"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('.ondb-body-note button[aria-label="행 1 열기"]')!.click());
  const child = [...document.querySelectorAll<HTMLElement>('.ondb-body-note [data-note-body]')].at(-1)!;
  const before = snapshot(); const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  let next: Node | null, text: Text | undefined;
  while ((next = walker.nextNode())) if (next.textContent === 'Nested seed') { text = next as Text; break; }
  expect(text).toBeDefined();
  child.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  text!.data += ' last'; const range = document.createRange(); range.setStart(text!, text!.length); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  child.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: ' last' }));
  const actualFlush = async () => {
    if (!await runtime.flushPendingInput(() => true) || !await runtime.view.deliverInput(() => true)) throw new Error('The actual Site view refused delivery');
    for (const delivery of [...flushes].reverse()) await delivery();
  };
  await act(async () => { await expect(actualFlush()).rejects.toThrow(); });
  const close = [...document.querySelectorAll<HTMLButtonElement>('.ondb-peek button[aria-label="닫기"]')].at(-1)!;
  await act(async () => close.click()); expect(child.isConnected).toBe(true); expect(snapshot()).toEqual(before);
  child.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' last' }));
  await act(async () => {
    await actualFlush();
    expect([...flushes].map(delivery => (delivery as import('../src/data-editor').BodyInputDelivery).captureInputIntent?.()?.())).toEqual([true, true]);
    await runtime.flushCommands();
    await actualFlush();
    expect([...flushes].map(delivery => (delivery as import('../src/data-editor').BodyInputDelivery).captureInputIntent?.()?.())).toEqual([true, true]);
  });
  expect(JSON.stringify(runtime.exportNativeDocument())).toContain('Nested seed last');
  expect([...flushes].map(delivery => (delivery as import('../src/data-editor').BodyInputDelivery).captureInputIntent?.()?.())).toEqual([true, true]);
  expect(runtime.editor.historyManager.getHistory()).toHaveLength(before.history.length + 1);
});
