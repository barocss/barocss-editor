export type SelectionResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const order: SelectionResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Screen-space targets must not overlap. Keep the active gesture, then opposite corners. */
export function selectionResizeHandles(width: number, height: number, active?: SelectionResizeHandle): SelectionResizeHandle[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return [];
  const point = (handle: SelectionResizeHandle) => ({
    x: handle.includes('w') ? 0 : handle.includes('e') ? width : width / 2,
    y: handle.startsWith('n') ? 0 : handle.startsWith('s') ? height : height / 2,
  });
  const kept: SelectionResizeHandle[] = [];
  const priority: SelectionResizeHandle[] = [...(active ? [active] : []), 'se', 'nw', 'ne', 'sw', 'n', 's', 'e', 'w'];
  for (const handle of priority) {
    const at = point(handle);
    if (kept.every(other => { const before = point(other); return Math.abs(at.x - before.x) >= 16 || Math.abs(at.y - before.y) >= 16; })) kept.push(handle);
  }
  return order.filter(handle => kept.includes(handle));
}
