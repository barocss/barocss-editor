import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildTableGrid } from '@barocss/model';
import { openNoteTree, type NoteSession } from '../src/index';
import { TableContext } from '../src/table-context';

let session: NoteSession;
let root: Root;
let scope: HTMLDivElement;
let editable: HTMLDivElement;
let tableId: string;
const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
const grid = () => buildTableGrid(session.editor.dataStore, tableId);
const action = (command: string) => document.querySelector<HTMLButtonElement>(`[data-note-table-action="${command}"]`)!;
const surface = () => document.querySelector('[data-note-table-context]');

function draw(sid: string): HTMLElement {
  const node = session.editor.dataStore.getNode(sid)!;
  const element = document.createElement('div');
  element.dataset.bcSid = sid;
  if (typeof node.text === 'string') element.textContent = node.text;
  for (const child of node.content ?? []) if (typeof child === 'string') element.append(draw(child));
  return element;
}
function firstText(sid: string): string {
  const node = session.editor.dataStore.getNode(sid)!;
  if (typeof node.text === 'string') return sid;
  const child = node.content?.[0];
  if (typeof child !== 'string') throw new Error('Expected cell text');
  return firstText(child);
}
async function select(from = grid().slots[0][0].sid!, to = from, cells = false) {
  await act(async () => {
    editable.replaceChildren(draw(session.rootId));
    editable.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    editable.focus();
    const start = firstText(from), end = firstText(to);
    session.editor.selectionManager.setSelection({
      type: cells ? 'cell' : 'range', ...(cells ? { nodeIds: [from, to] } : {}),
      startNodeId: cells ? from : start, endNodeId: cells ? to : end,
      startOffset: 0, endOffset: 0, collapsed: from === to
    });
    const range = document.createRange();
    range.setStart(editable.querySelector(`[data-bc-sid="${start}"]`)!, 0);
    range.setEnd(editable.querySelector(`[data-bc-sid="${end}"]`)!, 0);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
async function openMenu(group = 'row') {
  const label = group === 'row' ? '행 편집' : group === 'column' ? '열 편집' : group === 'theme' ? '표 테마' : '셀 편집';
  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
}
async function press(command: string) {
  await act(async () => {
    action(command).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(100, 100, 120, 30));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [new DOMRect(100, 100, 120, 30)] as unknown as DOMRectList);
  session = openNoteTree({ stype: 'note', content: [
    { stype: 'bTable', content: [{ stype: 'bTableBody', content: [
      { stype: 'bTableRow', content: ['A', 'B'].map(text => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text }] })) },
      { stype: 'bTableRow', content: ['C', 'D'].map(text => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text }] })) }
    ] }] }, paragraph('Outside')
  ] });
  const first = session.editor.dataStore.getNode(session.rootId)!.content![0];
  if (typeof first !== 'string') throw new Error('Expected table sid');
  tableId = first;
  scope = document.createElement('div');
  editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  editable.tabIndex = 0;
  scope.append(editable);
  document.body.append(scope);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(TableContext, { editor: session.editor, scope: { current: scope } })));
  await select();
});
afterEach(async () => {
  await act(async () => root.unmount());
  session.close();
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Note table context uses the selected table', () => {
  it('colors only the held cell and restores its previous appearance with undo', async () => {
    const before = session.editor.exportDocument();
    const first = grid().slots[0][0].sid!, neighbor = grid().slots[0][1].sid!;
    await openMenu('cell');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="셀 배경색 · 연한 파랑"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(session.editor.dataStore.getNode(first)?.attributes?.shadingFill).toBe('DBEAFE');
    expect(session.editor.dataStore.getNode(neighbor)?.attributes?.shadingFill).toBeUndefined();
    await act(async () => { expect(await session.editor.undo()).toBe(true); });
    expect(session.editor.exportDocument()).toEqual(before);
  });

  it('applies a chosen table theme without changing any cell text and undoes it once', async () => {
    const before = session.editor.exportDocument();
    await openMenu('theme');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-note-table-theme="blue"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(session.editor.dataStore.getNode(tableId)?.attributes?.theme).toBe('blue');
    expect(document.querySelector('[data-note-table-theme="blue"]')?.getAttribute('aria-current')).toBe('true');
    await act(async () => { expect(await session.editor.undo()).toBe(true); });
    expect(session.editor.exportDocument()).toEqual(before);
  });

  it('colors every cell when the whole table is selected', async () => {
    await act(async () => {
      session.editor.selectionManager.setSelection({ type: 'table', nodeIds: [tableId],
        startNodeId: tableId, endNodeId: tableId, startOffset: 0, endOffset: 0, collapsed: false });
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(session.editor.selection?.type).toBe('table');
    await openMenu('cell');
    expect(action('mergeCells').disabled).toBe(true);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="셀 배경색 · 연한 초록"]')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(grid().slots.flatMap(row => row.map(cell => session.editor.dataStore.getNode(cell.sid!)?.attributes?.shadingFill)))
      .toEqual(['DCFCE7', 'DCFCE7', 'DCFCE7', 'DCFCE7']);
  });

  it('keeps a newly opened menu and its clicked row when model selection arrives late', async () => {
    const first = grid().slots[0][0].sid!, last = grid().slots[1][0].sid!;
    const originalRows = [...grid().rowIds];
    await select(last);
    await act(async () => {
      const target = editable.querySelector<HTMLElement>(`[data-bc-sid="${first}"]`)!;
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      const range = document.createRange();
      range.setStart(editable.querySelector(`[data-bc-sid="${firstText(first)}"]`)!, 0);
      range.collapse(true);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await openMenu('row');
    await act(async () => {
      const sid = firstText(first);
      session.editor.selectionManager.setSelection({ type: 'range', startNodeId: sid, endNodeId: sid,
        startOffset: 0, endOffset: 0, collapsed: true });
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(action('insertRowBelow')).not.toBeNull();
    await press('insertRowBelow');
    expect(grid().rowIds).toHaveLength(3);
    expect(grid().rowIds[0]).toBe(originalRows[0]);
    expect(grid().rowIds[2]).toBe(originalRows[1]);
  });

  it.each([
    ['insertRowAbove', 3, 2], ['insertRowBelow', 3, 2], ['deleteRow', 1, 2],
    ['insertColumnLeft', 2, 3], ['insertColumnRight', 2, 3], ['deleteColumn', 2, 1]
  ])('%s changes only the requested dimension and can be undone', async (command, rows, columns) => {
    const before = session.editor.exportDocument();
    await openMenu(String(command).includes('Column') ? 'column' : 'row');
    expect(action(String(command)).disabled).toBe(false);
    await press(String(command));
    expect(grid().rowIds).toHaveLength(Number(rows));
    expect(grid().columnCount).toBe(columns);
    await act(async () => { expect(await session.editor.undo()).toBe(true); });
    expect(session.editor.exportDocument()).toEqual(before);
  });

  it('merges the saved cell range after menu focus, then splits the merged cell', async () => {
    const [first, second] = grid().slots[0].map(slot => slot.sid!);
    await select(first, second, true);
    await openMenu('cell');
    expect(action('mergeCells').disabled).toBe(false);
    expect(action('splitCell').disabled).toBe(true);
    await act(async () => {
      action('mergeCells').focus();
      document.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(surface()).not.toBeNull();
    await press('mergeCells');
    expect(session.editor.dataStore.getNode(first)?.attributes?.colspan).toBe(2);
    expect(grid().slots[0].filter(slot => slot.isOrigin)).toHaveLength(1);
    await select(first, grid().slots[1][0].sid!, true);
    await openMenu('cell');
    expect(action('mergeCells').disabled).toBe(true); // Would cut through the existing two-column merge.
    await select(first);
    await openMenu('cell');
    expect(action('splitCell').disabled).toBe(false);
    await press('splitCell');
    expect(grid().slots[0].filter(slot => slot.isOrigin)).toHaveLength(2);
  });

  it('preserves the required final body row even when a header remains', async () => {
    await act(async () => root.render(null));
    session.close();
    const cell = { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Body' }] };
    session = openNoteTree({ stype: 'note', content: [{ stype: 'bTable', content: [
      { stype: 'bTableHeader', content: [{ stype: 'bTableHeaderCell', content: [{ stype: 'inline-text', text: 'Header' }] }] },
      { stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [cell] }] }
    ] }] });
    const first = session.editor.dataStore.getNode(session.rootId)!.content![0];
    if (typeof first !== 'string') throw new Error('Expected table sid');
    tableId = first;
    await act(async () => root.render(createElement(TableContext, { editor: session.editor, scope: { current: scope } })));
    await select(grid().slots[1][0].sid!);
    await openMenu('row');
    expect(action('deleteRow').disabled).toBe(true);
    await select(grid().slots[0][0].sid!);
    await openMenu('row');
    expect(action('deleteRow').disabled).toBe(false);
    await press('deleteRow');
    expect(grid().rowIds).toHaveLength(1);
    expect(session.editor.exportDocument()).toMatchObject({ content: [{ content: [{ stype: 'bTableBody' }] }] });
  });

  it('disables unavailable merge, split and deletion of the last row or column', async () => {
    await openMenu('cell');
    expect(action('mergeCells').disabled).toBe(true);
    expect(action('splitCell').disabled).toBe(true);
    await openMenu('row');
    await press('deleteRow');
    await select();
    await openMenu();
    expect(action('deleteRow').disabled).toBe(true);
    await openMenu('column');
    await press('deleteColumn');
    await select();
    await openMenu('column');
    expect(action('deleteColumn').disabled).toBe(true);
  });

  it('hides for prose or another focused surface and dismisses until a new selection', async () => {
    expect(surface()).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(surface()).toBeNull();
    await select(grid().slots[0][1].sid!);
    expect(surface()).not.toBeNull();
    const outside = session.editor.dataStore.getNode(session.rootId)!.content![1];
    if (typeof outside !== 'string') throw new Error('Expected prose sid');
    await select(outside);
    expect(surface()).toBeNull();
    await select();
    const input = document.createElement('input');
    document.body.append(input);
    await act(async () => input.focus());
    expect(surface()).toBeNull();
  });
});
