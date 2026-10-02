// @vitest-environment jsdom
import { act, createElement, StrictMode, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSlidesEditor, createSampleDeck, deckSlides, deckFileText, slidesSearchCommands } from '@barocss/office-slides';
import { CommandSearch, CommandSearchTrigger } from '@barocss/office-ui';
import { useSlideMenuSearch } from '../src/use-slide-menu-search';
let host: HTMLDivElement, root: Root, editor: ReturnType<typeof createSlidesEditor>;
let result: ReturnType<typeof useSlideMenuSearch>, current: string, second: string;
let view: EditorViewDOM;
let actualSearch = false;
const file = vi.fn(), show = vi.fn();
const native = () => deckFileText(editor.exportDocument());
function Harness() {
  result = useSlideMenuSearch({ editor, view, current, slideNumber: 1, answers: 0,
    moveBy: 'press', auditing: false, mapping: false, focused: false,
    onFileAction: file, onViewAction: show });
  return actualSearch ? createElement(Fragment, null,
    createElement(CommandSearchTrigger, { onClick: result.openCommandSearch }),
    createElement(CommandSearch, { open: result.commandOpen, onOpenChange: result.setCommandOpen,
      commands: result.searchCommands, onPick: id => void result.pickSearchCommand(id),
      onPickIntent: result.prepareSearchCommandPick })) : null;
}
const render = () => act(() => root.render(createElement(Harness)));
const searchId = (command: string) => slidesSearchCommands(false).find(entry => entry.command === command)!.id;
const viewId = (action: string) => slidesSearchCommands(false).find(entry => entry.view === action)!.id;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'search432');
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  current = slides[0].sid; second = slides[1].sid;
  const box = String(editor.dataStore.getNode(current)!.content![0]);
  editor.updateSelection({ type: 'node', nodeIds: [box], startNodeId: box, endNodeId: box,
    startOffset: 0, endOffset: 0, collapsed: false });
  view = { contentEditableElement: host, convertDOMSelectionToModel: () => undefined } as unknown as EditorViewDOM;
  actualSearch = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  file.mockClear(); show.mockClear(); render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); editor.destroy(); vi.unstubAllGlobals(); });
it('rejects a saved search after selection leaves and returns without restoring it', async () => {
  act(() => result.openCommandSearch()); const id = searchId('duplicateBoxes');
  const selection = structuredClone(editor.selection!), before = native();
  act(() => { editor.updateSelection(null); editor.updateSelection(selection); });
  const restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand(id));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
  expect(editor.canRun('undo')).toBe(false); expect(result.commandError).not.toBe('');
});
it('rejects a saved search after a same-session native root replacement', async () => {
  act(() => result.openCommandSearch()); const id = searchId('insertSlide');
  const document = editor.exportDocument();
  act(() => editor.loadDocument(document, 'search432'));
  const before = native(), restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand(id));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('rejects saved search after content edit and undo returns to the exact original deck', async () => {
  const before = native(); act(() => result.openCommandSearch()); const id = searchId('duplicateBoxes');
  await act(async () => { await editor.run('nudgeBoxes', { dx: 120, dy: 0 }); await editor.undo(); });
  expect(native()).toBe(before);
  const restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand(id));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('rejects saved search and retained menu callbacks after authority is revoked and restored', async () => {
  act(() => result.openCommandSearch()); const id = searchId('insertSlide'), oldMenu = result.onMenu;
  const before = native(); act(() => { editor.setEditable(false); editor.setEditable(true); });
  await act(async () => { await result.pickSearchCommand(id); oldMenu(id); });
  expect(native()).toBe(before); expect(editor.canRun('undo')).toBe(false);
});
it('rejects retained search and direct menu callbacks after slide A to B to A', async () => {
  act(() => result.openCommandSearch()); const id = searchId('insertSlide');
  const oldPick = result.pickSearchCommand, oldRun = result.runEntry, oldOpen = result.openCommandSearch;
  const first = current, before = native(); current = second; render(); current = first; render();
  await act(async () => { await oldPick(id); oldRun({ command: 'insertSlide' }); oldOpen(); });
  expect(native()).toBe(before); expect(editor.canRun('undo')).toBe(false);
  act(() => result.openCommandSearch()); await act(async () => result.pickSearchCommand(id));
  expect(native()).not.toBe(before);
});
it('does not restore the captured selection before rejecting an unavailable command', async () => {
  act(() => result.openCommandSearch()); const id = searchId('duplicateBoxes');
  vi.spyOn(editor, 'canExecuteCommand').mockReturnValue(false);
  const before = native(), restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand(id));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('runs a fresh native command with exact undo and redo, then refuses a repeated stale search', async () => {
  const before = native(); act(() => result.openCommandSearch()); const id = searchId('duplicateBoxes');
  await act(async () => result.pickSearchCommand(id)); const changed = native(); expect(changed).not.toBe(before);
  await act(async () => result.pickSearchCommand(id)); expect(native()).toBe(changed);
  await act(async () => editor.undo()); expect(native()).toBe(before);
  await act(async () => editor.redo()); expect(native()).toBe(changed);
});
it('permits fresh viewer presentation and library while blocking document setup and edits', async () => {
  act(() => editor.setEditable(false)); render(); const before = native();
  act(() => result.openCommandSearch()); await act(async () => result.pickSearchCommand(viewId('present')));
  expect(show).toHaveBeenLastCalledWith('present');
  act(() => result.onMenu(viewId('library'))); expect(show).toHaveBeenLastCalledWith('library');
  show.mockClear(); act(() => result.runEntry({ view: 'dialog.size' }));
  expect(show).not.toHaveBeenCalled();
  expect(result.searchCommands.find(entry => entry.id === viewId('dialog.size'))?.disabled).toBe(true);
  act(() => result.onMenu(searchId('insertSlide'))); expect(native()).toBe(before);
});

it('rejects a native root object replacement that retains its exact root ID and selection', async () => {
  act(() => result.openCommandSearch()); const id = searchId('insertSlide');
  const rootId = editor.getRootId()!, previous = editor.dataStore.getNode(rootId)!;
  const before = native(), selection = structuredClone(editor.selection);
  editor.dataStore.setNode({ ...previous, attributes: { ...previous.attributes } });
  expect(editor.getRootId()).toBe(rootId); expect(editor.selection).toEqual(selection);
  expect(editor.dataStore.getNode(rootId)).not.toBe(previous); expect(native()).toBe(before);
  const restore = vi.spyOn(editor, 'updateSelection');
  await act(async () => result.pickSearchCommand(id));
  expect(restore).not.toHaveBeenCalled(); expect(native()).toBe(before);
});
it('rejects a dismissed search callback even after a fresh popup opens for the same selection', async () => {
  act(() => result.openCommandSearch()); const id = searchId('duplicateBoxes');
  const pick = result.pickSearchCommand, before = native();
  act(() => result.setCommandOpen(false));
  await act(async () => pick(id)); expect(native()).toBe(before);
  act(() => result.openCommandSearch());
  await act(async () => pick(id)); expect(native()).toBe(before);
  await act(async () => result.pickSearchCommand(id)); expect(native()).not.toBe(before);
});

it('keeps a fresh menu usable after the product StrictMode effect replay', async () => {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
  const before = native(), id = searchId('insertSlide');
  await act(async () => result.onMenu(id)); expect(native()).not.toBe(before);
});

it('retires retained search and menu callbacks when the product hook unmounts', async () => {
  act(() => result.openCommandSearch()); const id = searchId('insertSlide');
  const pick = result.pickSearchCommand, menu = result.onMenu, before = native();
  act(() => root.unmount()); root = createRoot(host);
  await act(async () => { await pick(id); menu(id); });
  expect(native()).toBe(before); expect(editor.canRun('undo')).toBe(false);
});

it('dispatches a real CommandSearch choice only after its Dialog closes and focus returns', async () => {
  actualSearch = true; render(); const before = native();
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  act(() => { trigger.focus(); trigger.click(); });
  const id = searchId('duplicateBoxes');
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    .find(button => button.id.endsWith(`-${encodeURIComponent(id)}`))!;
  expect(option).toBeDefined(); expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => option.click()); expect(native()).toBe(before);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  const changed = native(); expect(changed).not.toBe(before);
  await act(async () => editor.undo()); expect(native()).toBe(before);
  await act(async () => editor.redo()); expect(native()).toBe(changed);
});
it('retires an admitted close callback when a new search opens or authority changes before dispatch', async () => {
  act(() => result.openCommandSearch()); const id = searchId('duplicateBoxes'), before = native();
  const first = result.prepareSearchCommandPick(id)!; act(() => result.setCommandOpen(false));
  act(() => result.openCommandSearch()); await act(async () => first()); expect(native()).toBe(before);
  const revoked = result.prepareSearchCommandPick(id)!; act(() => result.setCommandOpen(false));
  act(() => { editor.setEditable(false); editor.setEditable(true); });
  await act(async () => revoked()); expect(native()).toBe(before);
  act(() => result.openCommandSearch()); const accepted = result.prepareSearchCommandPick(id)!;
  act(() => result.setCommandOpen(false)); await act(async () => accepted()); const changed = native();
  expect(changed).not.toBe(before); await act(async () => accepted()); expect(native()).toBe(changed);
});
