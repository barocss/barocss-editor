import { dragGesture } from '@barocss/shared';

export type TableBoundary = { table: HTMLTableElement; cell: HTMLTableCellElement; axis: 'column' | 'row' };
export type TableResizeSession = { size: number; commit(size: number): void; valid(): boolean };

/** Pointer geometry stays outside the editable DOM. Hosts own units and commands. */
export function installTableBoundaryResize(container: HTMLElement, begin: (boundary: TableBoundary) => TableResizeSession | undefined, enabled = () => true): () => void {
  const doc = container.ownerDocument;
  const view = doc.defaultView!;
  const guide = doc.createElement('div');
  guide.className = 'ot-table-resize-guide';
  guide.hidden = true;
  guide.setAttribute('aria-hidden', 'true');
  const label = doc.createElement('output');
  label.className = 'office-selection-readout';
  guide.append(label);
  doc.body.append(guide);
  let candidate: TableBoundary | undefined;
  let held = false;
  const previousCursor = container.style.cursor;
  const hide = () => { guide.hidden = true; candidate = undefined; container.style.cursor = previousCursor; };
  const locate = (event: PointerEvent): TableBoundary | undefined => {
    if (!enabled()) return;
    // Probe both sides of a boundary, including borders whose target is the table.
    const elements = [event.target instanceof Element ? event.target : null,
      doc.elementFromPoint(event.clientX - 6, event.clientY), doc.elementFromPoint(event.clientX, event.clientY - 6)];
    let nearest: TableBoundary | undefined;
    let distance = 7;
    for (const element of elements) {
      const cell = element?.closest<HTMLTableCellElement>('td[data-bc-sid],th[data-bc-sid]');
      const table = cell?.closest<HTMLTableElement>('table[data-bc-sid]');
      if (!cell || !table || !container.contains(table)) continue;
      const rect = cell.getBoundingClientRect();
      const columnDistance = Math.abs(event.clientX - rect.right);
      const rowDistance = Math.abs(event.clientY - rect.bottom);
      if (columnDistance < distance && columnDistance <= 6 && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        nearest = { cell, table, axis: 'column' }; distance = columnDistance;
      }
      if (rowDistance < distance && rowDistance <= 6 && event.clientX >= rect.left && event.clientX <= rect.right) {
        nearest = { cell, table, axis: 'row' }; distance = rowDistance;
      }
    }
    return nearest;
  };
  const paint = (boundary: TableBoundary, delta = 0, size?: number) => {
    const rect = boundary.table.getBoundingClientRect();
    const cell = boundary.cell.getBoundingClientRect();
    const vertical = boundary.axis === 'column';
    Object.assign(guide.style, { left: `${vertical ? cell.right + delta : rect.left}px`, top: `${vertical ? rect.top : cell.bottom + delta}px`,
      width: `${vertical ? 2 : rect.width}px`, height: `${vertical ? rect.height : 2}px` });
    label.textContent = size === undefined ? '' : `${(size * 2.54 / 96).toFixed(2)} cm`;
    label.hidden = size === undefined;
    guide.hidden = false;
    guide.dataset.axis = boundary.axis;
    if (size !== undefined) {
      // The label stays in viewport pixels and clears either edge during a drag.
      const x = vertical ? cell.right + delta + 6 : rect.left + 6;
      const y = vertical ? rect.top + 6 : cell.bottom + delta + 6;
      const { width, height } = label.getBoundingClientRect();
      label.style.left = `${Math.max(8, Math.min(x, view.innerWidth - width - 8))}px`;
      label.style.top = `${Math.max(8, Math.min(y, view.innerHeight - height - 8))}px`;
    }
    container.style.cursor = vertical ? 'col-resize' : 'row-resize';
  };
  const hover = (event: PointerEvent) => {
    if (held) return;
    if (event.buttons) { hide(); return; }
    candidate = locate(event);
    if (candidate) paint(candidate); else hide();
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Node) || !container.contains(event.target)) return;
    const boundary = locate(event);
    if (!boundary) return;
    const session = begin(boundary);
    if (!session) { hide(); return; }
    event.stopImmediatePropagation();
    const scale = boundary.table.getBoundingClientRect().width / boundary.table.offsetWidth || 1;
    const sizeAt = (dx: number, dy: number) => Math.max(8, Math.min(2000, session.size + (boundary.axis === 'column' ? dx : dy) / scale));
    dragGesture(event, {
      start: () => { held = true; return session; },
      move: (_, moved) => {
        if (!session.valid()) { hide(); return; }
        const size = sizeAt(moved.dx, moved.dy);
        paint(boundary, (size - session.size) * scale, size);
      },
      done: (_, moved) => {
        held = false; hide();
        if (moved.dragged && session.valid()) session.commit(sizeAt(moved.dx, moved.dy));
      },
      abort: () => { held = false; hide(); }
    });
  };
  const leave = () => { if (!held) hide(); };
  // Claim boundary gestures before the container's cell-selection listener,
  // regardless of the order in which the two adapters were installed.
  container.addEventListener('pointermove', hover, true);
  doc.addEventListener('pointerdown', down, true);
  container.addEventListener('pointerleave', leave);
  view.addEventListener('scroll', leave, true);
  view.addEventListener('resize', leave);
  return () => {
    if (held) container.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    container.removeEventListener('pointermove', hover, true);
    doc.removeEventListener('pointerdown', down, true);
    container.removeEventListener('pointerleave', leave);
    view.removeEventListener('scroll', leave, true);
    view.removeEventListener('resize', leave);
    container.style.cursor = previousCursor;
    guide.remove();
  };
}
