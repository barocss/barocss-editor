import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NoteEditor } from '../src/note-view';
import { openNoteTree, noteTreeOf, type NoteSession } from '../src/session';

let root: Root, host: HTMLDivElement, session: NoteSession;
const native = () => JSON.stringify(noteTreeOf(session.editor.dataStore, session.rootId));
const render = async (writeAllowed: boolean, extra: Partial<Parameters<typeof NoteEditor>[0]> = {}) => {
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, writeAllowed, ...extra })));
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original paragraph' }] }] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); host.remove(); vi.unstubAllGlobals(); });

it('keeps a writer continuously editable with the same native document, view and undo history', async () => {
  await render(true);
  expect(host.querySelector('[aria-label="읽기 모드"]')).toBeNull();
  expect(host.querySelector('[aria-label="글쓰기 모드"]')).toBeNull();
  const paragraph = session.editor.dataStore.getNode(session.rootId)?.content?.[0];
  const run = session.editor.dataStore.getNode(String(paragraph))?.content?.[0];
  await act(async () => { await session.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: run, endNodeId: run, startOffset: 0, endOffset: 8 }, text: 'Changed' }); });
  const changed = native();
  const body = host.querySelector('.on-doc');
  await render(false);
  expect(session.editor.isEditable).toBe(false);
  expect(host.querySelector('[contenteditable="true"]')).toBeNull();
  expect(native()).toBe(changed);
  expect(host.querySelector('.on-doc')).toBe(body);
  expect(host.querySelector('[data-note-grip]')).toBeNull();
  await render(true);
  expect(session.editor.isEditable).toBe(true);
  expect(host.querySelector('.on-doc')).toBe(body);
  expect(native()).toBe(changed);
  await act(async () => { await session.editor.undo(); });
  expect(native()).toContain('Original paragraph');
  await act(async () => { await session.editor.redo(); });
  expect(native()).toBe(changed);
});

it('refuses snapshot delivery during composition, then permits delivery after composition ends', async () => {
  let flush: (() => Promise<boolean>) | undefined;
  await render(true, { registerBeforeSnapshot: callback => { flush = callback; return () => { flush = undefined; }; } });
  const editor = host.querySelector('[data-note-editor]')!;
  const initial = native();
  await act(async () => editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  expect(await flush!()).toBe(false);
  expect(session.editor.isEditable).toBe(true);
  expect(native()).toBe(initial);
  await act(async () => editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  expect(await flush!()).toBe(true);
  expect(native()).toBe(initial);
});

it('makes current viewer authority non-editable and refuses mutation input without disabling copy', async () => {
  await render(false);
  const initial = native();
  const editor = host.querySelector('.on-doc')!;
  expect(session.editor.isEditable).toBe(false);
  expect(host.querySelector('[contenteditable="true"]')).toBeNull();
  for (const type of ['beforeinput', 'paste', 'drop', 'cut']) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    await act(async () => editor.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  }
  for (const key of ['Backspace', 'Delete', 'b', 'z']) {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: key.length === 1, bubbles: true, cancelable: true });
    await act(async () => editor.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  }
  const copy = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
  await act(async () => editor.dispatchEvent(copy));
  expect(copy.defaultPrevented).toBe(false);
  expect(native()).toBe(initial);
});

it('updates revoked and restored host authority without a local preference or native change', async () => {
  await render(true);
  const initial = native();
  const body = host.querySelector('.on-doc');
  await render(false);
  expect(session.editor.isEditable).toBe(false);
  expect(host.querySelector('[data-note-editable]')?.getAttribute('data-note-editable')).toBe('false');
  await render(false);
  expect(session.editor.isEditable).toBe(false);
  await render(true);
  expect(session.editor.isEditable).toBe(true);
  expect(host.querySelector('[data-note-editable]')?.getAttribute('data-note-editable')).toBe('true');
  expect(host.querySelector('.on-doc')).toBe(body);
  expect(native()).toBe(initial);
});

it('refuses queued snapshot delivery after the same session loads a replacement document', async () => {
  let flush: (() => Promise<boolean>) | undefined;
  await render(true, { registerBeforeSnapshot: callback => { flush = callback; return () => { flush = undefined; }; } });
  const delivery = flush!();
  await act(async () => {
    session.editor.loadDocument({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Replacement document' }] }] }, String(session.editor.dataStore.getSessionId()));
  });
  expect(await delivery).toBe(false);
  expect(native()).toContain('Replacement document');
  expect(session.editor.isEditable).toBe(true);
});

it('permits editing a viewer find query without changing the document', async () => {
  await render(false, { navigationRequest: { mode: 'find', id: 1 } });
  const initial = native();
  const input = document.querySelector<HTMLInputElement>('[aria-label="본문에서 찾기"]')!;
  expect(input).not.toBeNull();
  const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
  await act(async () => input.dispatchEvent(backspace));
  expect(backspace.defaultPrevented).toBe(false);
  expect(session.editor.isEditable).toBe(false);
  expect(native()).toBe(initial);
});

it.each(['hidden', 'inert'])('retires navigation when its owner becomes %s without reviving on restoration', async attribute => {
  await render(false, { navigationRequest: { mode: 'find', id: 1 } });
  const initial = native();
  expect(host.querySelector('[data-document-navigation]')).not.toBeNull();
  await act(async () => { host.setAttribute(attribute, ''); });
  expect(host.querySelector('[data-document-navigation]')).toBeNull();
  await act(async () => { host.removeAttribute(attribute); });
  await render(false, { navigationRequest: { mode: 'find', id: 1 } });
  expect(host.querySelector('[data-document-navigation]')).toBeNull();
  expect(native()).toBe(initial);
  await render(false, { navigationRequest: { mode: 'find', id: 2 } });
  expect(host.querySelector('[data-document-navigation]')).not.toBeNull();
  expect(native()).toBe(initial);
});

it('retires navigation when its owning host is detached', async () => {
  await render(false, { navigationRequest: { mode: 'find', id: 1 } });
  const initial = native();
  await act(async () => { host.remove(); });
  expect(host.querySelector('[data-document-navigation]')).toBeNull();
  await act(async () => { document.body.append(host); });
  expect(host.querySelector('[data-document-navigation]')).toBeNull();
  expect(native()).toBe(initial);
});

it('retires old-root navigation when the same editor opens another body', async () => {
  session.close();
  session = openNoteTree({ stype: 'note', content: [{ stype: 'callout', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Second body' }] }
  ] }] });
  await render(false, { navigationRequest: { mode: 'find', id: 1 } });
  const initial = native();
  const child = session.editor.dataStore.getNode(session.rootId)!.content![0] as string;
  await render(false, { rootId: child });
  expect(host.querySelector('[data-document-navigation]')).toBeNull();
  expect(native()).toBe(initial);
  await render(false);
  expect(host.querySelector('[data-document-navigation]')).toBeNull();
  expect(native()).toBe(initial);
});


it('delivers an embedded body without replacing the enclosing document or its history', async () => {
  session.close();
  session = openNoteTree({ stype: 'note', content: [{ stype: 'callout', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Embedded body' }] }
  ] }] });
  const child = session.editor.dataStore.getNode(session.rootId)!.content![0] as string;
  let flush: (() => Promise<boolean>) | undefined;
  await act(async () => root.render(createElement(NoteEditor, {
    editor: session.editor, rootId: child, writeAllowed: true,
    registerBeforeSnapshot: callback => { flush = callback; return () => { flush = undefined; }; }
  })));
  const original = native();
  const body = host.querySelector('.on-doc');
  expect(await flush!()).toBe(true);
  expect(native()).toBe(original);
  expect(host.querySelector('.on-doc')).toBe(body);
});
