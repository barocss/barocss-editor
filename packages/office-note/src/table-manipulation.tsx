import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@barocss/editor-core';
import { buildTableGrid } from '@barocss/model';
import { dragGesture } from '@barocss/shared';
import { useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
import { Icon, Tip, TipProvider, SelectionReadout } from '@barocss/office-ui';

const MAX_NEW_ROWS = 100;
const MIN_COLUMN = 32;
const MAX_COLUMN = 1600;
type Geometry = {
  left: number; top: number; width: number; height: number; rowHeight: number;
  rows: { cellId: string; bottom: number }[];
  columns: { cellId: string; left: number; width: number }[];
};
type Preview = { kind: 'grow'; count: number } | { kind: 'resize'; column: number; width: number };

/** Geometry belongs to the DOM; all committed table changes still go through editor commands. */
export function TableManipulation({ editor, scope, tableId, active = true }: {
  editor: Editor; scope: RefObject<HTMLElement | null>; tableId?: string; active?: boolean;
}) {
  const revision = useEditorRevision(editor);
  const chrome = useRef<HTMLDivElement>(null);
  const held = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState<string>();
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = tableId && editor.dataStore.getNode(tableId)?.stype === 'bTable' ? tableId : undefined;
  const sid = selected ?? hovered;
  const at = useNodeRect(editor, scope, sid);

  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    const hover = (event: PointerEvent) => {
      if (held.current || chrome.current?.contains(event.target as Node)) return;
      const target = event.target instanceof Element ? event.target : null;
      const table = target?.closest('table[data-bc-sid]');
      const next = table?.getAttribute('data-bc-sid');
      if (next && host.contains(table ?? null) && editor.dataStore.getNode(next)?.stype === 'bTable') {
        setHovered(next); return;
      }
      if (at && event.clientX >= at.left - 24 && event.clientX <= at.right + 24
        && event.clientY >= at.top - 24 && event.clientY <= at.bottom + 32) return;
      setHovered(undefined);
    };
    const leave = () => { if (!held.current) setHovered(undefined); };
    host.addEventListener('pointermove', hover);
    host.addEventListener('pointerleave', leave);
    return () => { host.removeEventListener('pointermove', hover); host.removeEventListener('pointerleave', leave); };
  }, [editor, scope, at]);

  useEffect(() => {
    if (!active || !sid || !at || !scope.current) { setGeometry(null); return; }
    const host = scope.current;
    const elements = new Map([...host.querySelectorAll<HTMLElement>('[data-bc-sid]')]
      .map(element => [element.getAttribute('data-bc-sid')!, element]));
    const grid = buildTableGrid(editor.dataStore, sid);
    const origin = host.getBoundingClientRect();
    const rows = grid.rowIds.map((rowId, index) => ({
      cellId: grid.slots[index].find(slot => slot.sid && slot.isOrigin)?.sid ?? '',
      bottom: (elements.get(rowId)?.getBoundingClientRect().bottom ?? at.bottom) - at.top
    }));
    const columns = Array.from({ length: grid.columnCount }, (_, column) => {
      const originRow = grid.slots.find(slots => slots[column]?.sid && slots[column]?.isOrigin);
      const row = originRow ?? grid.slots.find(slots => slots[column]?.sid);
      const cellId = row?.[column]?.sid ?? '';
      const box = elements.get(cellId)?.getBoundingClientRect();
      const firstColumn = row?.findIndex(slot => slot.sid === cellId) ?? column;
      const span = Number(editor.dataStore.getNode(cellId)?.attributes?.colspan ?? 1);
      const width = (box?.width ?? at.width / grid.columnCount) / span;
      return { cellId: originRow ? cellId : '', width, left: (box?.left ?? at.left) - at.left + (column - firstColumn) * width };
    });
    setGeometry({ left: at.left - origin.left + host.scrollLeft, top: at.top - origin.top + host.scrollTop,
      width: at.width, height: at.height, rowHeight: Math.max(24, at.height / Math.max(rows.length, 1)), rows, columns });
  }, [editor, scope, sid, at, active, revision]);

  useEffect(() => () => {
    const target = held.current;
    if (!target) return;
    target.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    // Without pointer capture, dragGesture listens on the window. A detached handle
    // cannot bubble there during unmount, so cancel that fallback only if still held.
    if (held.current) target.ownerDocument.defaultView?.dispatchEvent(new Event('pointercancel'));
  }, []);

  const execute = async (command: string, payload: Record<string, unknown>) => {
    if (busy || !editor.canExecuteCommand(command, payload)) return;
    setBusy(true);
    try { await editor.executeCommand(command, payload); }
    finally { setBusy(false); }
  };
  const grow = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!geometry || !sid || busy) return;
    const cellId = geometry.rows.at(-1)?.cellId;
    if (!cellId || !editor.canExecuteCommand('growTableRows', { tableId: sid, cellId, count: 1 })) return;
    const countAt = (distance: number) => Math.max(0, Math.min(MAX_NEW_ROWS, Math.round(distance / geometry.rowHeight)));
    dragGesture(event, {
      start: pointer => { pointer.stopPropagation(); held.current = event.currentTarget; return { tableId: sid, cellId }; },
      move: (_state, moved) => setPreview({ kind: 'grow', count: countAt(moved.dy) }),
      done: (state, moved) => {
        held.current = null; setPreview(null);
        const count = moved.dragged ? countAt(moved.dy) : 1;
        if (count > 0) void execute('growTableRows', { ...state, count });
      },
      abort: () => { held.current = null; setPreview(null); }
    });
  };
  const resize = (event: React.PointerEvent<HTMLDivElement>, column: number) => {
    if (!geometry || !sid || busy) return;
    const original = geometry.columns[column].width;
    const widthAt = (distance: number) => Math.max(MIN_COLUMN, Math.min(MAX_COLUMN, Math.round(original + distance)));
    if (!editor.canExecuteCommand('setTableColumnWidth', { tableId: sid, column, width: widthAt(0) })) return;
    dragGesture(event, {
      start: pointer => { pointer.stopPropagation(); held.current = event.currentTarget; return { tableId: sid, column, widths: geometry.columns.map(value => value.width) }; },
      move: (_state, moved) => setPreview({ kind: 'resize', column, width: widthAt(moved.dx) }),
      done: (state, moved) => {
        held.current = null; setPreview(null);
        if (moved.dragged && widthAt(moved.dx) !== Math.round(original)) void execute('setTableColumnWidth', { ...state, width: widthAt(moved.dx) });
      },
      abort: () => { held.current = null; setPreview(null); }
    });
  };

  if (!active || !sid || !geometry || !scope.current) return null;
  const last = geometry.rows.at(-1)?.cellId;
  return createPortal(<TipProvider><div ref={chrome} className="on-table-manipulation" data-note-table-manipulation={sid}
    style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }}>
    {geometry.rows.map((row, index) => <Tip key={`row-${index}`} label={`${index + 1}행 아래에 행 추가`}>
      <button type="button" className="on-table-insert on-table-insert-row" data-note-row-boundary={index}
        aria-label={`${index + 1}행 아래에 행 추가`} style={{ top: row.bottom }} disabled={busy || !row.cellId}
        onMouseDown={event => event.preventDefault()} onClick={() => void execute('insertRowBelow', { cellId: row.cellId })}><Icon name="add" size={12} /></button>
    </Tip>)}
    {geometry.columns.map((column, index) => <Tip key={`column-${index}`} label={`${index + 1}열 오른쪽에 열 추가`}>
      <button type="button" className="on-table-insert on-table-insert-column" data-note-column-boundary={index}
        aria-label={`${index + 1}열 오른쪽에 열 추가`} style={{ left: column.left + column.width }} disabled={busy || !column.cellId}
        onMouseDown={event => event.preventDefault()} onClick={() => void execute('insertColumnRight', { cellId: column.cellId })}><Icon name="add" size={12} /></button>
    </Tip>)}
    {geometry.columns.map((column, index) => <div key={`resize-${index}`} role="separator" tabIndex={busy ? -1 : 0}
      className="on-table-column-resize" data-note-column-resize={index} aria-label={`${index + 1}열 너비 조절`}
      aria-orientation="vertical" aria-valuemin={MIN_COLUMN} aria-valuemax={MAX_COLUMN} aria-valuenow={Math.round(column.width)}
      style={{ left: column.left + column.width }} onPointerDown={event => resize(event, index)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        void execute('setTableColumnWidth', { tableId: sid, column: index, widths: geometry.columns.map(value => value.width),
          width: Math.max(MIN_COLUMN, Math.min(MAX_COLUMN, Math.round(column.width + (event.key === 'ArrowRight' ? 10 : -10)))) });
      }} />)}
    <Tip label="클릭하면 한 행, 아래로 끌면 여러 행을 추가합니다">
      <button type="button" className="on-table-grow" data-note-table-grow aria-label="아래로 끌어 행 추가"
        disabled={busy || !last || !editor.canExecuteCommand('growTableRows', { tableId: sid, cellId: last, count: 1 })}
        onPointerDown={grow} onClick={event => {
          if (event.detail === 0 && last) void execute('growTableRows', { tableId: sid, cellId: last, count: 1 });
        }}>+ <span>{preview?.kind === 'grow' ? `${preview.count}행 추가` : '행 추가'}</span></button>
    </Tip>
    {preview?.kind === 'grow' && preview.count > 0 && <div className="on-table-grow-preview" data-note-table-grow-preview
      style={{ height: preview.count * geometry.rowHeight, backgroundSize: `100% ${geometry.rowHeight}px` }}>

    </div>}
    {preview?.kind === 'resize' && <div className="on-table-resize-preview" data-note-table-resize-preview
      style={{ left: geometry.columns[preview.column].left + preview.width }} /> }
    {preview && at && <SelectionReadout data-note-table-readout at={{
      x: preview.kind === 'resize' ? at.left + geometry.columns[preview.column].left + preview.width : at.left + at.width / 2,
      y: preview.kind === 'resize' ? at.top : at.bottom + preview.count * geometry.rowHeight,
    }}>{preview.kind === 'resize' ? `${preview.width} px` : `${preview.count}행 추가`}</SelectionReadout>}
  </div></TipProvider>, scope.current);
}
