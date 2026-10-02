// @vitest-environment jsdom
import { act, createElement, Fragment, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { CommandSearch, CommandSearchTrigger } from '@barocss/office-ui';
import { createSiteEditor, createSampleSite, pagesIn, siteFileText } from '@barocss/office-site';
import { useSiteMenuSearch, type SiteSearchContext, type SiteSearchEntry } from '../src/use-site-menu-search';
let host: HTMLDivElement, root: Root, editor: Editor, given: Editor;
let result: ReturnType<typeof useSiteMenuSearch>, context: SiteSearchContext;
let actual = false, blocked = false;
const entries: SiteSearchEntry[] = [
  { id: 'add', label: '새 페이지', category: '페이지', command: 'insertPage' },
  { id: 'view', label: '보기', category: '보기', view: 'focus' }
];
const viewed = vi.fn();
const native = () => siteFileText(editor.exportDocument(), 'fixed');
const payloadFor = () => ({ pageId: context.page });
const runEntry = (entry: SiteSearchEntry) => entry.command
  ? given.executeCommand(entry.command, payloadFor()) : viewed(entry.view);
function Harness() {
  const view = editorView;
  result = useSiteMenuSearch({ editor, given, view, context, revision: 0, entries,
    menuItems: entries.map(entry => ({ id: entry.id, disabled: blocked })), payloadFor, runEntry });
  return actual ? createElement(Fragment, null,
    createElement(CommandSearchTrigger, { onClick: result.openCommandSearch }),
    createElement(CommandSearch, { open: result.commandOpen, onOpenChange: result.setCommandOpen,
      commands: result.searchCommands, onPick: id => void result.pickSearchCommand(id),
      onPickIntent: result.prepareSearchCommandPick })) : null;
}
let editorView: EditorViewDOM;
const render = () => act(() => root.render(createElement(Harness)));
const open = () => act(() => result.openCommandSearch());
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSiteEditor(); editor.loadDocument(createSampleSite(), 'search432'); given = editor;
  const pages = pagesIn({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  context = { root: editor.getRootId(), page: pages[0].sid, scopeRoot: pages[0].sid,
    admin: undefined, writing: false, preview: false, dataset: undefined, mode: 'select' };
  editor.updateSelection({ type: 'node', startNodeId: pages[0].sid, endNodeId: pages[0].sid,
    nodeIds: [pages[0].sid], startOffset: 0, endOffset: 0, collapsed: false });
  editorView = { contentEditableElement: host, convertDOMSelectionToModel: () => undefined } as unknown as EditorViewDOM;
  actual = false; blocked = false; viewed.mockClear(); render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); editor.destroy(); vi.unstubAllGlobals(); });
it.each(['root', 'page', 'scopeRoot', 'admin', 'writing', 'preview', 'dataset', 'mode'] as const)('retires saved and retained view commands after %s changes and returns', async key => {
    open(); const pick = result.pickSearchCommand, accepted = result.prepareSearchCommandPick('view')!;
    const before = native(), previous = context;
    context = { ...context, [key]: typeof context[key] === 'boolean' ? !context[key] : 'other' }; render();
    context = previous; render();
    await act(async () => { await pick('view'); accepted(); });
    expect(viewed).not.toHaveBeenCalled(); expect(native()).toBe(before);
    open(); await act(async () => result.pickSearchCommand('view'));
    expect(viewed).toHaveBeenCalledWith('focus'); expect(native()).toBe(before);
  });
it('rejects same-ID native root replacement without changing the selected page', async () => {
  open(); const before = native(), rootId = editor.getRootId()!, node = editor.dataStore.getNode(rootId)!;
  const selection = structuredClone(editor.selection);
  editor.dataStore.setNode({ ...node, attributes: { ...node.attributes } });
  expect(editor.getRootId()).toBe(rootId); expect(editor.selection).toEqual(selection);
  const restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand('add'));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('retires a selection ABA and an authority ABA before an admitted dispatch', async () => {
  open(); const before = native(), first = result.prepareSearchCommandPick('add')!;
  const selection = structuredClone(editor.selection!);
  act(() => { editor.updateSelection(null); editor.updateSelection(selection); });
  await act(async () => first()); expect(native()).toBe(before);
  render(); open(); const second = result.prepareSearchCommandPick('add')!;
  act(() => { editor.setEditable(false); editor.setEditable(true); });
  await act(async () => second()); expect(native()).toBe(before);
});
it('retires search after a native page insert and exact undo', async () => {
  const before = native(); open();
  await act(async () => { await editor.executeCommand('insertPage', payloadFor()); await editor.undo(); });
  expect(native()).toBe(before); const restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand('add'));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('checks the current given writer capability before restoring selection', async () => {
  open(); const before = native(), restore = vi.spyOn(editor, 'updateSelection');
  given = Object.create(editor) as Editor; given.canExecuteCommand = () => false; render();
  open(); await act(async () => result.pickSearchCommand('add'));
  expect(result.prepareSearchCommandPick('add')).toBeUndefined();
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('reports a retired search target without admitting a native command', () => {
  open(); const before = native(), restore = vi.spyOn(editor, 'updateSelection');
  const node = editor.dataStore.getNode(editor.getRootId()!)!;
  editor.dataStore.setNode({ ...node, attributes: { ...node.attributes } });
  act(() => { expect(result.prepareSearchCommandPick('add')).toBeUndefined(); });
  expect(result.commandOpen).toBe(false); expect(result.error).toContain('문서 또는 편집 화면이 변경되었습니다.');
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('refuses current disabled view entries and preview opening without restoring native selection', async () => {
  open(); const before = native(), restore = vi.spyOn(editor, 'updateSelection');
  blocked = true; render(); await act(async () => result.pickSearchCommand('view'));
  expect(viewed).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
  act(() => result.setCommandOpen(false)); context = { ...context, preview: true }; render(); open();
  expect(result.commandOpen).toBe(false); expect(native()).toBe(before);
});
it('rejects raw dismissal and reopened pending callbacks but consumes a fresh accepted choice once', async () => {
  open(); const before = native(), old = result.pickSearchCommand;
  act(() => result.setCommandOpen(false)); await act(async () => old('add')); expect(native()).toBe(before);
  open(); const retired = result.prepareSearchCommandPick('add')!;
  act(() => result.setCommandOpen(false)); open(); await act(async () => retired()); expect(native()).toBe(before);
  const accepted = result.prepareSearchCommandPick('add')!; act(() => result.setCommandOpen(false));
  await act(async () => accepted()); const changed = native(); expect(changed).not.toBe(before);
  await act(async () => accepted()); expect(native()).toBe(changed);
  await act(async () => editor.undo()); expect(native()).toBe(before);
  await act(async () => editor.redo()); expect(native()).toBe(changed);
});
it('keeps fresh StrictMode search usable and retires its admitted callback on unmount', async () => {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); open();
  const accepted = result.prepareSearchCommandPick('add'); expect(accepted).toBeDefined();
  const before = native(); act(() => root.unmount()); root = createRoot(host);
  await act(async () => accepted!()); expect(native()).toBe(before);
});
it('executes actual CommandSearch after Dialog closure and focus return with exact native undo and redo', async () => {
  actual = true; render(); const trigger = host.querySelector<HTMLButtonElement>('button')!, before = native();
  act(() => { trigger.focus(); trigger.click(); });
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    .find(button => button.id.endsWith('-add'))!;
  expect(option).toBeDefined(); act(() => option.click()); expect(native()).toBe(before);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  const changed = native(); expect(changed).not.toBe(before);
  await act(async () => editor.undo()); expect(native()).toBe(before);
  await act(async () => editor.redo()); expect(native()).toBe(changed);
});

it('allows current read-only viewing without restoring selection and refuses native page edits', async () => {
  act(() => editor.setEditable(false)); render(); open();
  const before = native(), restore = vi.spyOn(editor, 'updateSelection');
  const accepted = result.prepareSearchCommandPick('view')!;
  expect(accepted).toBeDefined(); expect(result.prepareSearchCommandPick('add')).toBeUndefined();
  act(() => result.setCommandOpen(false)); await act(async () => accepted());
  expect(viewed).toHaveBeenCalledWith('focus'); expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
