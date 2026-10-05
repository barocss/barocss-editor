import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NoteEditor, type NoteCommandTarget, type NoteInputDelivery } from '../src/note-view';
import { openNoteTree, noteTreeOf, type NoteSession } from '../src/session';

let root: Root, host: HTMLDivElement, session: NoteSession, target: NoteCommandTarget;
const fixture = { stype: 'note', attributes: { title: 'Owned commands' }, metadata: { preserve: ['all'] },
  content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'kept' }] }] };
const native = () => noteTreeOf(session.editor.dataStore, session.rootId);
const register = (one: NoteCommandTarget) => { target = one; return () => {}; };
const select = () => {
  const paragraph = String(session.editor.dataStore.getNode(session.rootId)!.content![0]);
  const run = String(session.editor.dataStore.getNode(paragraph)!.content![0]);
  session.editor.updateSelection({ type: 'range', startNodeId: run, endNodeId: run, startOffset: 0, endOffset: 4, collapsed: false });
};
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  session = openNoteTree(fixture);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId,
    registerCommandTarget: register })));
  await act(async () => { select(); });
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); host.remove(); delete (Range.prototype as unknown as Record<string, unknown>).getClientRects; delete (Range.prototype as unknown as Record<string, unknown>).getBoundingClientRect; vi.unstubAllGlobals(); });

it('runs the real native mark command and meaningful undo without replacing the body', async () => {
  const before = native(), body = host.querySelector('.on-doc');
  expect(await target.flush()).toBe(true); expect(target.capture()?.isCurrent()).toBe(true);
  await act(async () => { expect(await target.execute('toggleBold', () => true)).toBe(true); });
  expect(native()).not.toEqual(before); expect(host.querySelector('.on-doc')).toBe(body);
  await act(async () => { expect(await target.execute('historyUndo', () => true)).toBe(true); });
  expect(native()).toEqual(before); expect(host.querySelector('.on-doc')).toBe(body);
});
it('retires an exact selection witness through selection ABA and preserves all native fields', async () => {
  const before = native(), captured = target.capture()!;
  await act(async () => { session.editor.updateSelection(null); select(); });
  expect(captured.isCurrent()).toBe(false); expect(native()).toEqual(before);
  expect(target.capture()?.isCurrent()).toBe(true);
});
it('refuses a real mark transaction held across authority ABA without consuming history', async () => {
  const before = native(), lock = await session.editor.dataStore.acquireLock('held-command');
  const pending = target.execute('toggleBold', () => true);
  await act(async () => { session.editor.setEditable(false); session.editor.setEditable(true); });
  session.editor.dataStore.releaseLock(lock);
  await act(async () => { expect(await pending).toBe(false); });
  expect(native()).toEqual(before); expect(session.editor.canUndo()).toBe(false);
});
it('refuses queued command after newer actual input intent', async () => {
  const before = native(), lock = await session.editor.dataStore.acquireLock('held-input-command');
  const pending = target.execute('toggleBold', () => true);
  await act(async () => target.element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: 'later' })));
  session.editor.dataStore.releaseLock(lock);
  await act(async () => { expect(await pending).toBe(false); });
  expect(native()).toEqual(before); expect(session.editor.canUndo()).toBe(false);
});
it('refuses composition and permits fresh preparation only after actual end and flush', async () => {
  const before = native();
  await act(async () => target.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  expect(target.capture()).toBeNull(); expect(await target.flush()).toBe(false);
  expect(await target.execute('toggleBold', () => true)).toBe(false);
  await act(async () => target.element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  expect(target.capture()).toBeNull(); expect(await target.flush()).toBe(true);
  expect(target.capture()?.isCurrent()).toBe(true); expect(native()).toEqual(before);
});
it('retires the old body and witness after same-session root replacement', async () => {
  const old = target, captured = old.capture()!;
  await act(async () => session.editor.loadDocument({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'replacement' }] }] }, session.session));
  expect(old.isCurrent()).toBe(false); expect(captured.isCurrent()).toBe(false); expect(old.capture()).toBeNull();
  const before = session.editor.exportDocument(); expect(await old.execute('toggleBold', () => true)).toBe(false);
  expect(session.editor.exportDocument()).toEqual(before);
});

it('registers the actual nested database body and runs history only in that child editor', async () => {
  const nested = { stype: 'note', attributes: { title: 'Nested commands' }, content: [
    { stype: 'noteDatabase', attributes: { source: 'tasks' } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Title', kind: 'text' }], records: [{ Title: 'Task' }], rowIds: ['task-row'] } },
      { stype: 'richText', attributes: { id: 'task-row' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'nested' }] }] }
    ] }
  ] };
  let topFlush: NoteInputDelivery | undefined;
  await act(async () => {
    session.editor.loadDocument(nested, session.session);
    root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.editor.getRootId()!,
      registerCommandTarget: register, registerBeforeSnapshot: flush => { topFlush = flush; return () => {}; } }));
  });
  const top = target;
  const opener = host.querySelector<HTMLButtonElement>('[aria-label="행 1 열기"]');
  expect(opener).not.toBeNull();
  await act(async () => opener!.click());
  expect(target.editor).not.toBe(top.editor);
  expect(target.element.closest('[data-db-item-body]')).not.toBeNull();
  const child = target;
  const childRoot = child.editor.dataStore.getNode(child.rootId)!;
  const paragraph = String(childRoot.content![0]), run = String(child.editor.dataStore.getNode(paragraph)!.content![0]);
  await act(async () => child.editor.updateSelection({ type: 'range', startNodeId: run, endNodeId: run,
    startOffset: 0, endOffset: 6, collapsed: false }));
  const original = child.editor.exportDocument(), parentBefore = session.editor.exportDocument();
  expect(await child.flush()).toBe(true);
  await act(async () => { expect(await child.execute('toggleBold', () => top.isCurrent())).toBe(true); });
  expect(child.editor.exportDocument()).not.toEqual(original);
  await act(async () => { expect(await child.execute('historyUndo', () => top.isCurrent())).toBe(true); });
  expect(child.editor.exportDocument()).toEqual(original);
  await act(async () => { expect(await topFlush!()).toBe(true); });
  expect(session.editor.exportDocument()).toEqual(parentBefore);
});

it('captures the genuine owned DOM range without a content or history transaction and retires the old view callback', async () => {
  const paragraph = host.querySelector('.on-doc p')!;
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode()!;
  let scope = paragraph.parentElement!;
  while (scope.parentElement && scope.contentEditable !== 'true') scope = scope.parentElement;
  // jsdom does not make contentEditable focusable; this is only the test DOM focus scaffold.
  scope.tabIndex = -1; scope.focus();
  const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 4);
  const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  await act(async () => session.editor.updateSelection(null));
  const before = session.editor.exportDocument();
  let captured!: ReturnType<NoteCommandTarget['capture']>;
  await act(async () => { captured = target.capture(); });
  expect(captured?.selection).toMatchObject({ type: 'range', startOffset: 0, endOffset: 4, collapsed: false });
  expect(session.editor.exportDocument()).toEqual(before); expect(session.editor.canExecuteCommand('historyUndo')).toBe(false);
  const old = target;
  await act(async () => session.editor.loadDocument({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'replacement' }] }] }, session.session));
  const replacement = session.editor.exportDocument(), nextSelection = session.editor.selection;
  expect(old.capture()).toBeNull(); expect(captured?.isCurrent()).toBe(false);
  expect(session.editor.exportDocument()).toEqual(replacement); expect(session.editor.selection).toEqual(nextSelection);
});

it('refuses a held native Undo after a newer input owner and retains the meaningful history entry', async () => {
  const original = native();
  await act(async () => { expect(await target.execute('toggleBold', () => true)).toBe(true); });
  const marked = native();
  const lock = await session.editor.dataStore.acquireLock('held-history-command');
  const pending = target.execute('historyUndo', () => true);
  target.element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
  session.editor.dataStore.releaseLock(lock);
  await act(async () => { expect(await pending).toBe(false); });
  expect(native()).toEqual(marked); expect(session.editor.canExecuteCommand('historyUndo')).toBe(true);
  target.element.dispatchEvent(new Event('compositionend', { bubbles: true }));
  expect(await target.flush()).toBe(true);
  await act(async () => { expect(await target.execute('historyUndo', () => true)).toBe(true); });
  expect(native()).toEqual(original);
});
