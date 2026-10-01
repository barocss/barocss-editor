import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NoteEditor } from '../src/note-view';
import { openNoteTree, noteTreeOf, type NoteSession } from '../src/session';

let root: Root, host: HTMLDivElement, session: NoteSession;
const native = () => JSON.stringify(noteTreeOf(session.editor.dataStore, session.rootId));
const button = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const click = async (label: string) => { await act(async () => { button(label).click(); await new Promise(resolve => setTimeout(resolve, 15)); }); };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original paragraph' }] }] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); host.remove(); vi.unstubAllGlobals(); });

it('keeps the same native document, view and undo history while reading and returning to writing', async () => {
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed: true })));
  const text = session.editor.dataStore.getNode(session.rootId)?.content?.[0];
  const run = session.editor.dataStore.getNode(String(text))?.content?.[0];
  await act(async () => { await session.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: run, endNodeId: run, startOffset: 0, endOffset: 8 }, text: 'Changed' }); });
  const changed = native();
  const body = host.querySelector('.on-doc');
  await click('읽기 모드');
  expect(session.editor.isEditable).toBe(false);
  expect(host.querySelector('[contenteditable="true"]')).toBeNull();
  expect(host.querySelector('[data-note-mode]')?.getAttribute('data-note-mode')).toBe('reading');
  expect(native()).toBe(changed);
  expect(host.querySelector('.on-doc')).toBe(body);
  expect(host.querySelector('[data-note-grip]')).toBeNull();
  await click('글쓰기 모드');
  expect(session.editor.isEditable).toBe(true);
  expect(native()).toBe(changed);
  await act(async () => { await session.editor.undo(); });
  expect(native()).toContain('Original paragraph');
  await act(async () => { await session.editor.redo(); });
  expect(native()).toBe(changed);
});

it('refuses a mode switch during composition and permits retry after composition ends', async () => {
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed: true })));
  const editor = host.querySelector('[data-note-editor]')!;
  const initial = native();
  await act(async () => editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await click('읽기 모드');
  expect(session.editor.isEditable).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('입력을 마친 뒤');
  expect(native()).toBe(initial);
  await act(async () => editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await click('읽기 모드');
  expect(session.editor.isEditable).toBe(false);
  expect(native()).toBe(initial);
});

it('never turns a viewer into a writer, including after changing the preference', async () => {
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed: false })));
  const initial = native();
  expect(session.editor.isEditable).toBe(false);
  expect(button('글쓰기 모드').disabled).toBe(true);
  await click('읽기 모드'); await click('글쓰기 모드');
  expect(session.editor.isEditable).toBe(false);
  expect(native()).toBe(initial);
});


it('keeps revoked authority disabled after a reader returns to writing', async () => {
  const render = async (writeAllowed: boolean) => { await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed }))); };
  await render(true); await click('읽기 모드');
  const initial = native();
  await render(false); await click('글쓰기 모드');
  expect(button('글쓰기 모드').disabled).toBe(true);
  expect(session.editor.isEditable).toBe(false);
  expect(native()).toBe(initial);
  await render(true);
  expect(session.editor.isEditable).toBe(false);
  await click('글쓰기 모드');
  expect(session.editor.isEditable).toBe(true);
  expect(native()).toBe(initial);
});

it('refuses a queued mode switch after the same session loads a replacement document', async () => {
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed: true })));
  await act(async () => {
    button('읽기 모드').click();
    session.editor.loadDocument({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Replacement document' }] }] }, String(session.editor.dataStore.getSessionId()));
    await new Promise(resolve => setTimeout(resolve, 15));
  });
  expect(session.editor.isEditable).toBe(true);
  expect(host.querySelector('[data-note-mode]')?.getAttribute('data-note-mode')).toBe('writing');
  expect(native()).toContain('Replacement document');
});


it('refuses queued writing when current authority is revoked before the switch settles', async () => {
  const render = (writeAllowed: boolean) => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed }));
  await act(async () => render(true)); await click('읽기 모드');
  const initial = native();
  await act(async () => {
    button('글쓰기 모드').click();
    render(false);
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  expect(session.editor.isEditable).toBe(false);
  expect(host.querySelector('[data-note-mode]')?.getAttribute('data-note-mode')).toBe('reading');
  expect(native()).toBe(initial);
});


it('permits editing a find query in reading without changing the document', async () => {
  await act(async () => root.render(createElement(NoteEditor, { editor: session.editor, rootId: session.rootId, documentMode: true, writeAllowed: true, navigationRequest: { mode: 'find', id: 1 } })));
  await click('읽기 모드');
  const initial = native();
  const input = document.querySelector<HTMLInputElement>('[aria-label="본문에서 찾기"]')!;
  expect(input).not.toBeNull();
  const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
  await act(async () => input.dispatchEvent(backspace));
  expect(backspace.defaultPrevented).toBe(false);
  expect(native()).toBe(initial);
});
