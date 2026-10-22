import { SheetController } from './controller.ts';
import { GRID, cellRect, columnLabel, drawGrid, hitTest, visibleRange } from './grid.ts';
import type { Viewport } from './grid.ts';
import type { CalculationRead } from '../../src/calculation.ts';
import { displayFormula } from '../../src/formula.ts';

export interface KeyInput {
  readonly key: string;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  preventDefault(): void;
}
const composingKey = (event: KeyInput): boolean => event.isComposing === true || event.keyCode === 229;

export function tabSelection(controller: SheetController, backwards: boolean): void {
  const key = controller.selection;
  const position = controller.index.position(key);
  const sheet = controller.projection.sheets.find(item => item.id === key.sheetId);
  if (!position || !sheet) return;
  const count = sheet.columns.filter(column => !column.deleted).length;
  let column = position.column + (backwards ? -1 : 1);
  let row = position.row;
  if (column >= count) { column = 0; row++; }
  if (column < 0) { column = count - 1; row--; }
  const next = controller.index.keyAt(key.sheetId, row, column);
  if (next) controller.select(next);
}

/** Returns true only for a consumed editor command. Native caret/IME keys pass. */
export function editorKey(controller: SheetController, event: KeyInput): boolean {
  if (composingKey(event) || controller.draft?.composing) return false;
  if (event.key === 'Escape') { event.preventDefault(); controller.cancel(); return true; }
  if (event.key !== 'Enter' && event.key !== 'Tab') return false;
  event.preventDefault();
  if (controller.commit()) {
    if (event.key === 'Tab') tabSelection(controller, event.shiftKey === true);
    else controller.move(event.shiftKey ? -1 : 1, 0);
  }
  return true;
}

export function gridKey(controller: SheetController, event: KeyInput): boolean {
  if (composingKey(event)) return false;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault(); controller.undo(); return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const direction: Readonly<Record<string, readonly [number, number]>> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  };
  const step = direction[event.key];
  if (step) { event.preventDefault(); controller.move(...step); return true; }
  if (event.key === 'Tab') { event.preventDefault(); tabSelection(controller, event.shiftKey === true); return true; }
  if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); controller.startEdit(); return true; }
  if (event.key === 'Delete' || event.key === 'Backspace' || event.key.length === 1) {
    event.preventDefault(); controller.startEdit(event.key.length === 1 ? event.key : ''); return true;
  }
  return false;
}

export function valueText(read: CalculationRead): string {
  if (read.status !== 'fresh') return read.status === 'stale' ? 'Stale' : 'Not calculated';
  const value = read.value;
  if (value === null) return '';
  if (typeof value === 'object') return value.code;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export function mountSheetPreview(controller: SheetController): { refresh(): void; destroy(): void } {
  const element = (id: string): HTMLElement => {
    const result = document.getElementById(id);
    if (!result) throw new Error(`Missing Sheet preview element: ${id}`);
    return result;
  };
  const grid = element('sheet-grid');
  const scroller = element('sheet-scroll');
  const sizer = element('sheet-sizer');
  const accessible = element('accessible-cells');
  const tabs = element('sheet-tabs');
  const undo = element('undo');
  const edit = element('edit-cell');
  const status = element('preview-status');
  const address = element('cell-address');
  const source = element('formula-source');
  const cellStatus = element('cell-status');
  const canvas = element('sheet-canvas');
  const editor = element('cell-editor');
  const alternatives = document.getElementById('alternatives');
  if (!(canvas instanceof HTMLCanvasElement) || !(editor instanceof HTMLInputElement) || !(undo instanceof HTMLButtonElement)) throw new Error('Invalid Sheet DOM contract');
  let disposed = false;
  let frame = 0;
  let previousDraft = false;
  let view: Viewport = { width: 1, height: 1, scrollLeft: 0, scrollTop: 0 };
  let bounds = visibleRange(view, 0, 0);
  const events = new AbortController();
  const options = { signal: events.signal };

  const currentSheet = () => controller.projection.sheets.find(sheet => sheet.id === controller.selection.sheetId && !sheet.deleted);
  const size = () => {
    const sheet = currentSheet();
    return { rows: sheet?.rows.filter(row => !row.deleted).length ?? 0, columns: sheet?.columns.filter(column => !column.deleted).length ?? 0 };
  };
  const read = (row: number, column: number) => {
    const key = controller.index.keyAt(controller.selection.sheetId, row, column);
    const result: CalculationRead = key ? controller.read(key) : { status: 'stale' };
    return { text: valueText(result), state: result.status };
  };
  const updateView = (): void => {
    view = { width: scroller.clientWidth, height: scroller.clientHeight, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
  };
  const ensureVisible = (): void => {
    updateView();
    const position = controller.index.position(controller.selection);
    if (!position) return;
    const rect = cellRect(position.row, position.column, view);
    if (rect.x < GRID.rowHeader) scroller.scrollLeft -= GRID.rowHeader - rect.x;
    else if (rect.x + rect.width > view.width) scroller.scrollLeft += rect.x + rect.width - view.width;
    if (rect.y < GRID.columnHeader) scroller.scrollTop -= GRID.columnHeader - rect.y;
    else if (rect.y + rect.height > view.height) scroller.scrollTop += rect.y + rect.height - view.height;
  };
  const render = (): void => {
    if (disposed) return;
    updateView();
    const { rows, columns } = size();
    const selected = controller.index.position(controller.selection);
    sizer.style.width = `${GRID.rowHeader + columns * GRID.columnWidth}px`;
    sizer.style.height = `${GRID.columnHeader + rows * GRID.rowHeight}px`;
    updateView();
    bounds = visibleRange(view, rows, columns);
    drawGrid(canvas, view, window.devicePixelRatio || 1, rows, columns, selected, read);
    grid.setAttribute('aria-rowcount', String(rows));
    grid.setAttribute('aria-colcount', String(columns));
    const fragments = document.createDocumentFragment();
    for (let row = bounds.rowStart; row < bounds.rowEnd; row++) {
      const rowNode = document.createElement('div');
      rowNode.setAttribute('role', 'row');
      rowNode.setAttribute('aria-rowindex', String(row + 1));
      for (let column = bounds.columnStart; column < bounds.columnEnd; column++) {
        const cell = document.createElement('div');
        const cellAddress = `${columnLabel(column)}${row + 1}`;
        const result = read(row, column);
        cell.id = `cell-${cellAddress}`;
        cell.dataset.address = cellAddress;
        cell.dataset.state = result.state;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-colindex', String(column + 1));
        cell.setAttribute('aria-label', `${cellAddress}: ${result.text || 'empty'}, ${result.state}`);
        cell.setAttribute('aria-selected', String(selected?.row === row && selected.column === column));
        cell.textContent = result.text;
        rowNode.append(cell);
      }
      fragments.append(rowNode);
    }
    accessible.replaceChildren(fragments);
    const cellId = `cell-${controller.address()}`;
    if (document.getElementById(cellId)) grid.setAttribute('aria-activedescendant', cellId);
    else grid.removeAttribute('aria-activedescendant');
    for (const tab of tabs.querySelectorAll('button')) tab.setAttribute('aria-selected', String(tab.dataset.sheetId === controller.selection.sheetId));
    address.textContent = `${currentSheet()?.name ?? ''}!${controller.address()}`;
    source.textContent = controller.source() || '(empty)';
    cellStatus.textContent = controller.read(controller.selection).status;
    status.textContent = controller.message;
    if (alternatives) {
      const fragments = document.createDocumentFragment();
      const states = { winner: 'Current', alternative: 'Concurrent alternative', superseded: 'Earlier edit', undone: 'Undone' };
      for (const entry of controller.selectedAlternatives.slice(-12)) {
        const item = document.createElement('li');
        const input = entry.input;
        const source = input.kind === 'formula' ? displayFormula(input.ast, controller.index) : input.kind === 'invalid' ? input.source : input.value === null ? '(empty)' : String(input.value);
        item.dataset.eventId = entry.eventId;
        item.dataset.sessionId = entry.sessionId;
        item.dataset.state = entry.state;
        item.textContent = `${states[entry.state]} · ${entry.sessionId === controller.sessionId ? 'This tab' : `Session ${entry.sessionId.slice(0, 8)}`} · ${source}`;
        fragments.append(item);
      }
      alternatives.replaceChildren(fragments);
    }
    undo.disabled = !controller.canUndo;
    const draft = controller.draft;
    editor.hidden = draft === null;
    if (draft) {
      const position = controller.index.position(draft.key);
      if (position) {
        const rect = cellRect(position.row, position.column, view);
        editor.style.left = `${rect.x}px`;
        editor.style.top = `${rect.y}px`;
        editor.style.width = `${rect.width}px`;
        editor.style.height = `${rect.height}px`;
        editor.style.clipPath = `inset(${Math.max(0, GRID.columnHeader - rect.y)}px ${Math.max(0, rect.x + rect.width - view.width)}px ${Math.max(0, rect.y + rect.height - view.height)}px ${Math.max(0, GRID.rowHeader - rect.x)}px)`;
      }
      editor.setAttribute('aria-label', `Cell input ${controller.address(draft.key)}`);
      if (!draft.composing && editor.value !== draft.text) editor.value = draft.text;
      if (!previousDraft) { editor.focus({ preventScroll: true }); editor.select(); }
    }
    previousDraft = draft !== null;
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  };
  const finishAction = (): void => {
    ensureVisible(); render();
    if (!controller.draft) grid.focus({ preventScroll: true });
    else if (!controller.draft.composing) editor.focus({ preventScroll: true });
  };

  for (const sheet of controller.projection.sheets.filter(item => !item.deleted)) {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.role = 'tab'; tab.textContent = sheet.name;
    tab.dataset.sheetId = sheet.id;
    tab.setAttribute('aria-controls', 'sheet-grid');
    tab.addEventListener('click', () => {
      if (controller.switchSheet(sheet.id)) { scroller.scrollLeft = 0; scroller.scrollTop = 0; }
      finishAction();
    }, options);
    tabs.append(tab);
  }
  grid.addEventListener('pointerdown', event => {
    if (event.target === editor || (event.target instanceof Element && event.target.closest('#sheet-tabs'))) return;
    updateView();
    const box = grid.getBoundingClientRect();
    const { rows, columns } = size();
    const point = hitTest(event.clientX - box.left, event.clientY - box.top, view, rows, columns);
    const key = point && controller.index.keyAt(controller.selection.sheetId, point.row, point.column);
    if (key) { event.preventDefault(); controller.select(key); finishAction(); }
  }, options);
  grid.addEventListener('dblclick', event => {
    if (event.target === editor) return;
    updateView();
    const box = grid.getBoundingClientRect();
    const { rows, columns } = size();
    const point = hitTest(event.clientX - box.left, event.clientY - box.top, view, rows, columns);
    if (point) { controller.startEdit(); finishAction(); }
  }, options);
  grid.addEventListener('keydown', event => {
    if (event.target === editor) return;
    if (gridKey(controller, event)) {
      finishAction();
      if (controller.draft && event.key.length === 1) editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }, options);
  editor.addEventListener('input', () => { controller.setDraft(editor.value); }, options);
  editor.addEventListener('compositionstart', () => { controller.setComposing(true); }, options);
  editor.addEventListener('compositionend', () => { controller.setDraft(editor.value); controller.setComposing(false); render(); }, options);
  editor.addEventListener('keydown', event => { if (editorKey(controller, event)) finishAction(); }, options);
  // A click must not move DOM focus away from a live IME editor.
  for (const control of [tabs, undo, edit]) control.addEventListener('pointerdown', event => {
    if (controller.draft?.composing) event.preventDefault();
  }, options);
  undo.addEventListener('click', () => { controller.undo(); finishAction(); }, options);
  edit.addEventListener('click', () => { controller.startEdit(); finishAction(); }, options);
  scroller.addEventListener('scroll', schedule, options);
  window.addEventListener('resize', schedule, options);
  const observer = new ResizeObserver(schedule);
  observer.observe(grid);
  // DPR changes also occur when a window moves between displays without resizing.
  let density = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const densityChange = (): void => {
    density.removeEventListener('change', densityChange);
    density = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    density.addEventListener('change', densityChange);
    schedule();
  };
  density.addEventListener('change', densityChange);
  window.sheetPreview = Object.freeze({ inspect: () => {
    const key = controller.selection;
    const result = controller.read(key);
    return { selectedKey: key, address: controller.address(), sheetName: currentSheet()?.name,
      generation: controller.projection.context.generation, source: controller.source(),
      readStatus: result.status, value: result.status === 'fresh' ? result.value : null,
      draft: controller.draft, visibleBounds: { ...bounds }, viewport: { ...view },
      nativeEvents: controller.projection.eventIds.length, canUndo: controller.canUndo,
      nativeRevision: controller.projection.revision, sessionId: controller.sessionId,
      context: controller.projection.context, nativeEventIds: controller.projection.eventIds,
      nativeSheets: controller.projection.sheets, nativeCells: controller.projection.cells,
      selectedAlternatives: controller.selectedAlternatives, transportWarning: controller.transportWarning };
  } });
  render();
  return { refresh: () => { controller.synchronize(); render(); }, destroy: () => {
    disposed = true; events.abort(); observer.disconnect(); density.removeEventListener('change', densityChange);
    if (frame) cancelAnimationFrame(frame);
    delete window.sheetPreview;
    controller.destroy();
  } };
}

declare global {
  interface Window {
    sheetPreview?: { readonly inspect: () => unknown };
  }
}
