import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildTableGrid } from '@barocss/model';
import { openNoteTree, type NoteSession } from '../src/session';
import { TableManipulation } from '../src/table-manipulation';

let session: NoteSession;
let root: Root;
let scope: HTMLDivElement;
let tableId: string;
const grid = () => buildTableGrid(session.editor.dataStore, tableId);
const grow = () => document.querySelector<HTMLButtonElement>('[data-note-table-grow]')!;
const resize = (column = 0) => document.querySelector<HTMLElement>(`[data-note-column-resize="${column}"]`)!;
const renderNode = (sid: string): HTMLElement => {
  const node = session.editor.dataStore.getNode(sid)!;
  const tags: Record<string, string> = { bTable: 'table', bTableBody: 'tbody', bTableRow: 'tr', bTableCell: 'td' };
  const element = document.createElement(tags[node.stype!] ?? 'span');
  element.dataset.bcSid = sid;
  if (typeof node.text === 'string') element.textContent = node.text;
  for (const child of node.content ?? []) if (typeof child === 'string') element.append(renderNode(child));
  return element;
};
async function pointer(target: EventTarget, type: string, x: number, y: number) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [new DOMRect(0, 0, 1, 1)] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'TABLE') return new DOMRect(100, 100, 400, 80);
    if (this.tagName === 'TR') return new DOMRect(100, 100 + [...this.parentElement!.children].indexOf(this) * 40, 400, 40);
    if (this.tagName === 'TD') return new DOMRect(100 + [...this.parentElement!.children].indexOf(this) * 200,
      100 + [...this.parentElement!.parentElement!.children].indexOf(this.parentElement!) * 40, 200, 40);
    return new DOMRect(0, 0, 700, 600);
  });
  session = openNoteTree({ stype: 'note', content: [{ stype: 'bTable', content: [{ stype: 'bTableBody', content: [0, 1].map(row => ({
    stype: 'bTableRow', content: [0, 1].map(column => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text: `${row}:${column}` }] }))
  })) }] }] });
  const first = session.editor.dataStore.getNode(session.rootId)!.content![0];
  if (typeof first !== 'string') throw new Error('Expected stored table sid');
  tableId = first;
  scope = document.createElement('div');
  scope.append(renderNode(tableId));
  document.body.append(scope);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(TableManipulation, { editor: session.editor, scope: { current: scope }, tableId })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  session.close();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('direct table manipulation keeps gestures out of document history until commit', () => {
  it('adds one row with a keyboard click and undoes it once', async () => {
    const before = session.editor.exportDocument();
    await act(async () => { grow().click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(grid().rowIds).toHaveLength(3);
    await act(async () => { expect(await session.editor.undo()).toBe(true); });
    expect(session.editor.exportDocument()).toEqual(before);
  });
  it('previews two dragged rows, commits them together, and undoes the entire gesture', async () => {
    const before = session.editor.exportDocument();
    await pointer(grow(), 'pointerdown', 200, 190);
    await pointer(window, 'pointermove', 200, 270);
    expect(document.querySelector('[data-note-table-grow-preview]')?.textContent).toBe('2행 추가');
    expect(session.editor.exportDocument()).toEqual(before);
    await pointer(window, 'pointerup', 200, 270);
    expect(grid().rowIds).toHaveLength(4);
    await act(async () => { expect(await session.editor.undo()).toBe(true); });
    expect(session.editor.exportDocument()).toEqual(before);
  });
  it('caps a long drag at 100 rows and cancels without changing the document', async () => {
    const before = session.editor.exportDocument();
    await pointer(grow(), 'pointerdown', 200, 190);
    await pointer(window, 'pointermove', 200, 9000);
    expect(document.querySelector('[data-note-table-grow-preview]')?.textContent).toBe('100행 추가');
    await pointer(window, 'pointercancel', 200, 9000);
    expect(document.querySelector('[data-note-table-grow-preview]')).toBeNull();
    expect(session.editor.exportDocument()).toEqual(before);
    expect(session.editor.canUndo()).toBe(false);
  });
  it('does not add rows when the drag returns above its starting point', async () => {
    await pointer(grow(), 'pointerdown', 200, 190);
    await pointer(window, 'pointermove', 200, 140);
    await pointer(window, 'pointerup', 200, 140);
    expect(grid().rowIds).toHaveLength(2);
    expect(session.editor.canUndo()).toBe(false);
  });
  it('cancels the window fallback when the dragged handle unmounts before pointerup', async () => {
    const before = session.editor.exportDocument();
    await pointer(grow(), 'pointerdown', 200, 190);
    await pointer(window, 'pointermove', 200, 270);
    expect(document.querySelector('[data-note-table-grow-preview]')).not.toBeNull();
    await act(async () => root.render(null));
    await pointer(window, 'pointerup', 200, 270);
    expect(session.editor.exportDocument()).toEqual(before);
    expect(session.editor.canUndo()).toBe(false);
  });
  it('inserts at the chosen row and column boundary rather than the current caret', async () => {
    const rows = [...grid().rowIds];
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-note-row-boundary="0"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(grid().rowIds[0]).toBe(rows[0]);
    expect(grid().rowIds[2]).toBe(rows[1]);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-note-column-boundary="0"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(grid().columnCount).toBe(3);
    const first = grid().slots[0].map(slot => session.editor.dataStore.getNode(slot.sid!)?.content?.[0]);
    expect(first.map(sid => typeof sid === 'string' ? session.editor.dataStore.getNode(sid)?.text : '')).toEqual(['0:0', '', '0:1']);
  });
  it('previews column width, preserves the neighboring width and commits one undo entry', async () => {
    const before = session.editor.exportDocument();
    await pointer(resize(), 'pointerdown', 300, 140);
    await pointer(window, 'pointermove', 360, 140);
    expect(document.querySelector('[data-note-table-resize-preview]')?.textContent).toBe('260 px');
    expect(session.editor.exportDocument()).toEqual(before);
    await pointer(window, 'pointerup', 360, 140);
    expect(session.editor.dataStore.getNode(tableId)?.attributes?.grid).toBe('3900,3000');
    await act(async () => { expect(await session.editor.undo()).toBe(true); });
    expect(session.editor.exportDocument()).toEqual(before);
  });
  it('cancels a column resize on Escape without creating an undo entry', async () => {
    const before = session.editor.exportDocument();
    await pointer(resize(), 'pointerdown', 300, 140);
    await pointer(window, 'pointermove', 380, 140);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[data-note-table-resize-preview]')).toBeNull();
    expect(session.editor.exportDocument()).toEqual(before);
    expect(session.editor.canUndo()).toBe(false);
  });
});
