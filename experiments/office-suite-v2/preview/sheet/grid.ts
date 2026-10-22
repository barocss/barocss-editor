export const GRID = { rowHeight: 30, columnWidth: 120, rowHeader: 48, columnHeader: 30 } as const;

export interface Viewport {
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function axisRange(size: number, header: number, scroll: number, cell: number, count: number) {
  const total = Math.floor(positive(count));
  const start = Math.min(total, Math.floor(positive(scroll) / cell));
  const extent = Math.max(0, positive(size) - header);
  return { start, end: extent === 0 ? start : Math.min(total, Math.ceil((positive(scroll) + extent) / cell)) };
}

export function visibleRange(view: Viewport, rows: number, columns: number): {
  rowStart: number; rowEnd: number; columnStart: number; columnEnd: number;
} {
  const row = axisRange(view.height, GRID.columnHeader, view.scrollTop, GRID.rowHeight, rows);
  const column = axisRange(view.width, GRID.rowHeader, view.scrollLeft, GRID.columnWidth, columns);
  return { rowStart: row.start, rowEnd: row.end, columnStart: column.start, columnEnd: column.end };
}

/** All geometry uses viewport CSS pixels. DPR only affects the canvas backing store. */
export function hitTest(x: number, y: number, view: Viewport, rows: number, columns: number): {
  row: number; column: number;
} | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < GRID.rowHeader || y < GRID.columnHeader || x >= positive(view.width) || y >= positive(view.height)) return null;
  const row = Math.floor((y - GRID.columnHeader + positive(view.scrollTop)) / GRID.rowHeight);
  const column = Math.floor((x - GRID.rowHeader + positive(view.scrollLeft)) / GRID.columnWidth);
  return row < Math.floor(positive(rows)) && column < Math.floor(positive(columns)) ? { row, column } : null;
}

export function cellRect(row: number, column: number, view: Viewport): {
  x: number; y: number; width: number; height: number;
} {
  return {
    x: GRID.rowHeader + column * GRID.columnWidth - positive(view.scrollLeft),
    y: GRID.columnHeader + row * GRID.rowHeight - positive(view.scrollTop),
    width: GRID.columnWidth,
    height: GRID.rowHeight,
  };
}

export function columnLabel(column: number): string {
  if (!Number.isSafeInteger(column) || column < 0) throw new RangeError('Column must be a non-negative safe integer.');
  let value = column + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function drawGrid(
  canvas: HTMLCanvasElement,
  view: Viewport,
  dpr: number,
  rows: number,
  columns: number,
  selected: { row: number; column: number } | undefined,
  read: (row: number, column: number) => { text: string; state: string },
): void {
  const width = positive(view.width);
  const height = positive(view.height);
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.font = '13px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.lineWidth = 1;
  const range = visibleRange(view, rows, columns);
  const contentWidth = Math.max(0, width - GRID.rowHeader);
  const contentHeight = Math.max(0, height - GRID.columnHeader);

  context.save();
  context.beginPath();
  context.rect(GRID.rowHeader, GRID.columnHeader, contentWidth, contentHeight);
  context.clip();
  for (let row = range.rowStart; row < range.rowEnd; row += 1) {
    for (let column = range.columnStart; column < range.columnEnd; column += 1) {
      const rect = cellRect(row, column, view);
      const cell = read(row, column);
      const active = selected?.row === row && selected.column === column;
      context.fillStyle = active ? '#eef2ff' : cell.state === 'fresh' || cell.state === 'empty' ? '#ffffff' : '#fffbeb';
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.strokeStyle = '#e2e6ec';
      context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
      context.save();
      context.beginPath();
      context.rect(rect.x + 6, rect.y + 1, rect.width - 12, rect.height - 2);
      context.clip();
      context.fillStyle = cell.state === 'error' ? '#b42318' : '#263142';
      context.fillText(cell.text, rect.x + 8, rect.y + rect.height / 2);
      context.restore();
    }
  }
  if (selected && selected.row >= range.rowStart && selected.row < range.rowEnd && selected.column >= range.columnStart && selected.column < range.columnEnd) {
    const rect = cellRect(selected.row, selected.column, view);
    context.strokeStyle = '#4f46e5';
    context.lineWidth = 2;
    context.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    context.lineWidth = 1;
  }
  context.restore();

  context.fillStyle = '#f4f6f9';
  context.fillRect(0, 0, width, GRID.columnHeader);
  context.fillRect(0, 0, GRID.rowHeader, height);
  context.fillStyle = '#657083';
  context.strokeStyle = '#d8dee8';
  context.textAlign = 'center';
  context.save();
  context.beginPath();
  context.rect(GRID.rowHeader, 0, contentWidth, GRID.columnHeader);
  context.clip();
  for (let column = range.columnStart; column < range.columnEnd; column += 1) {
    const rect = cellRect(0, column, view);
    context.strokeRect(rect.x + 0.5, 0.5, rect.width, GRID.columnHeader);
    context.fillText(columnLabel(column), rect.x + rect.width / 2, GRID.columnHeader / 2);
  }
  context.restore();
  context.save();
  context.beginPath();
  context.rect(0, GRID.columnHeader, GRID.rowHeader, contentHeight);
  context.clip();
  for (let row = range.rowStart; row < range.rowEnd; row += 1) {
    const rect = cellRect(row, 0, view);
    context.strokeRect(0.5, rect.y + 0.5, GRID.rowHeader, rect.height);
    context.fillText(String(row + 1), GRID.rowHeader / 2, rect.y + rect.height / 2);
  }
  context.restore();
  context.strokeRect(0.5, 0.5, GRID.rowHeader, GRID.columnHeader);
  context.textAlign = 'left';
}
