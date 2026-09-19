import { childrenOf, columnsOf, headerRowsOf, tableRowsOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
import { tableBreakLinesOf, scaledTo } from './table-pagination';
import type { LineAnchor } from './line-offsets';
import { staggeredCellCuts } from './table-staggered-pagination';

export interface CellBreakTarget {
  blockSid: string; left: number; right: number; inline?: LineAnchor;
  /** Other cells that must advance at the same page boundary. */
  peers?: CellBreakTarget[];
  /** The first target draws the mask and header across the entire table. */
  spacerOnly?: boolean;
  /** Move the shared mask into the whitespace common to all columns. */
  maskOffset?: number;
  /** Preserve a minimum row height without moving its text or saving chrome. */
  spacerHeight?: number;
  after?: boolean;
}
export interface CellParagraphMeasure {
  cuts: { top: number; anchor: LineAnchor }[];
}
export interface TableSegments {
  lines: number[];
  breakLines: number[];
  rowHeights: number[];
  boundaries: Map<number, { row: number; cell?: CellBreakTarget }>;
}

const sheets = new WeakMap<Document, CSSStyleSheet>();
/** CSSOM changes do not alter editable DOM or generate input mutations. */
export function withoutCellBreaks<T>(table: HTMLElement, read: () => T): T {
  if (!table.querySelector('.w-table-cell-break')) return read();
  const doc = table.ownerDocument;
  let sheet = sheets.get(doc);
  if (!sheet) {
    const style = doc.createElement('style');
    doc.head.append(style);
    sheet = style.sheet!;
    sheets.set(doc, sheet);
  }
  const index = sheet.insertRule('.w-table-cell-break { display: none !important; }', 0);
  try { return read(); } finally { sheet.deleteRule(index); }
}

/** Cell continuation preserves model rows and uses only measured safe boundaries. */
export function measureTableSegments(tableEl: HTMLElement, doc: DocumentAccess, table: DocumentNode,
  rowHeights: number[], contentHeight: number,
  measureParagraph?: (el: HTMLElement, node: DocumentNode, availableHeight: number) => CellParagraphMeasure): TableSegments {
  const rows = tableRowsOf(doc, table), columns = columnsOf(doc, rows);
  const headers = headerRowsOf(doc, rows).length;
  const allowed = tableBreakLinesOf(doc, table);
  const result: TableSegments = { lines: [], breakLines: [], rowHeights, boundaries: new Map() };
  const find = (sid?: string) => sid ? tableEl.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid)}"]`) : null;
  const headerHeight = rowHeights.slice(0, headers).reduce((sum, value) => sum + value, 0);
  for (let start = 0; start < rows.length;) {
    const end = allowed.find(line => line > start) ?? rows.length;
    const group = rows.slice(start, end), cells = childrenOf(doc, rows[start]);
    const height = rowHeights.slice(start, end).reduce((sum, value) => sum + value, 0);
    const cell = cells[0], cellEl = find(cell?.sid);
    const cellStyle = cellEl && cellEl.ownerDocument.defaultView!.getComputedStyle(cellEl);
    const paragraphs = cell ? childrenOf(doc, cell) : [];
    const canSplit = start >= headers && height > contentHeight - headerHeight && cells.length === 1 && cellEl
      && Math.max(1, Number(cell.attributes?.colspan) || 1) === columns
      && Math.max(1, Number(cell.attributes?.rowspan) || 1) >= end - start
      && group.slice(1).every(row => childrenOf(doc, row).length === 0)
      && group.every(row => row.attributes?.cantSplit !== true && row.attributes?.heightRule !== 'exact')
      && !['center', 'middle', 'bottom'].includes(String(cell.attributes?.verticalAlign))
      // Resolved document styles are inline. The browser's default middle
      // alignment alone adds no free space to an intrinsically tall cell.
      && !['middle', 'bottom'].includes(cellEl.style.verticalAlign)
      && paragraphs.length > 0 && paragraphs.every(p => ['paragraph', 'heading'].includes(p.stype ?? '') && !!find(p.sid));
    const firstLine = result.lines.length;
    result.boundaries.set(firstLine, { row: start });
    const eligibleGroup = start >= headers && height > contentHeight - headerHeight
      && group.every(row => row.attributes?.cantSplit !== true && row.attributes?.heightRule !== 'exact');
    const staggered = eligibleGroup && group.length > 1 && group.slice(1).some(row => childrenOf(doc, row).length > 0)
      ? staggeredCellCuts(group, columns, find, doc, contentHeight - headerHeight, measureParagraph) : undefined;
    const parallel = staggered ?? (cells.length > 1 && eligibleGroup
      && cells.reduce((sum, item) => sum + Math.max(1, Number(item.attributes?.colspan) || 1), 0) === columns
      && group.slice(1).every(row => childrenOf(doc, row).length === 0)
      && group.every(row => row.attributes?.cantSplit !== true && row.attributes?.heightRule !== 'exact')
      ? parallelCellCuts(cells, end - start, find, doc, contentHeight - headerHeight, measureParagraph) : undefined);
    if (parallel?.length) {
      const top = find(rows[start].sid)!.getBoundingClientRect().top;
      const bottom = find(rows[end - 1].sid)!.getBoundingClientRect().bottom;
      const edges = [top, ...parallel.map(cut => cut.top), bottom];
      result.lines.push(...scaledTo(edges.slice(1).map((edge, i) => edge - edges[i]), height));
      parallel.forEach((cut, i) => {
        result.boundaries.set(firstLine + i + 1, { row: start, cell: cut.target });
        result.breakLines.push(firstLine + i + 1);
      });
    } else if (canSplit) {
      const rect = cellEl.getBoundingClientRect(), first = find(rows[start].sid)!.getBoundingClientRect();
      const last = find(rows[end - 1].sid)!.getBoundingClientRect();
      const blocks = paragraphs.map(p => find(p.sid)!);
      const cuts: { top: number; block: number; inline?: LineAnchor }[] = [];
      for (let i = 0; i < blocks.length; i++) {
        if (i > 0) cuts.push({ top: blocks[i].getBoundingClientRect().top, block: i });
        for (const cut of measureParagraph?.(blocks[i], paragraphs[i], contentHeight - headerHeight).cuts ?? []) {
          cuts.push({ top: cut.top, block: i, inline: cut.anchor });
        }
      }
      const edges = [first.top, ...cuts.map(cut => cut.top), last.bottom];
      const measured = edges.slice(1).map((edge, i) => Math.max(0, edge - edges[i]));
      const lengths = scaledTo(measured, height);
      const style = cellStyle!;
      const left = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
      const right = (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderRightWidth) || 0);
      if (rect.height > 0 && measured.every(value => value > 0)) {
        result.lines.push(...lengths);
        for (const [i, cut] of cuts.entries()) {
          const previous = paragraphs[cut.block - 1];
          if (!cut.inline && (previous.attributes?.keepNext === true
            || (previous.stype === 'heading' && previous.attributes?.keepNext !== false))) continue;
          result.boundaries.set(firstLine + i + 1, { row: start, cell: {
            blockSid: paragraphs[cut.block].sid!, left, right, ...(cut.inline ? { inline: cut.inline } : {}),
          } });
          result.breakLines.push(firstLine + i + 1);
        }
      } else result.lines.push(height);
    } else result.lines.push(...rowHeights.slice(start, end));
    result.breakLines.push(result.lines.length);
    result.boundaries.set(result.lines.length, { row: end });
    start = end;
  }
  return result;
}

/** Sibling cells with the same vertical span can continue together where their
 * paragraph/line boundaries coincide. A finished column needs no spacer: the
 * still-active cells determine the row height. Staggered spans and boundaries
 * that would cut through another column's text stay indivisible. */
function parallelCellCuts(cells: DocumentNode[], span: number,
  find: (sid?: string) => HTMLElement | null, doc: DocumentAccess, availableHeight: number,
  measureParagraph?: (el: HTMLElement, node: DocumentNode, availableHeight: number) => CellParagraphMeasure) {
  const plans = cells.map(cell => {
    const el = find(cell.sid), blocks = childrenOf(doc, cell);
    if (!el || Math.max(1, Number(cell.attributes?.rowspan) || 1) !== span
      || !blocks.length || blocks.some(block => !['paragraph', 'heading'].includes(block.stype ?? '') || !find(block.sid))
      || el.ownerDocument.defaultView!.getComputedStyle(el).verticalAlign !== 'top') return undefined;
    const rect = el.getBoundingClientRect();
    const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    const cuts: { top: number; low: number; target: CellBreakTarget }[] = [];
    blocks.forEach((block, index) => {
      const previous = blocks[index - 1];
      if (previous && previous.attributes?.keepNext !== true
        && !(previous.stype === 'heading' && previous.attributes?.keepNext !== false)) {
        cuts.push({ top: find(block.sid)!.getBoundingClientRect().top,
          low: find(previous.sid)!.getBoundingClientRect().bottom,
          target: { blockSid: block.sid!, left: 0, right: 0 } });
      }
      for (const cut of measureParagraph?.(find(block.sid)!, block, availableHeight).cuts ?? []) {
        cuts.push({ top: cut.top, low: cut.top, target: { blockSid: block.sid!, left: 0, right: 0, inline: cut.anchor } });
      }
    });
    return { el, rect, scale, cuts, bottom: find(blocks[blocks.length - 1].sid)!.getBoundingClientRect().bottom };
  });
  if (plans.some(plan => !plan)) return undefined;
  const columns = plans.filter(plan => !!plan);
  const longest = columns.reduce((a, b) => a.bottom >= b.bottom ? a : b);
  return longest.cuts.flatMap(cut => {
    const targets: { plan: typeof longest; top: number; target: CellBreakTarget }[] = [];
    let low = cut.low, top = cut.top;
    for (const plan of columns) {
      const match = plan.cuts.find(other => other.low <= top && other.top >= low);
      if (match) {
        low = Math.max(low, match.low); top = Math.min(top, match.top);
        targets.push({ plan, top: match.top, target: { ...match.target } });
      } else if (plan.bottom > top) return [];
      else low = Math.max(low, plan.bottom);
      if (low > top) return [];
    }
    const first = targets[0];
    if (!first) return [];
    const style = first.plan.el.ownerDocument.defaultView!.getComputedStyle(first.plan.el);
    const paddingLeft = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
    const paddingRight = (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderRightWidth) || 0);
    // One mask covers every column, including columns whose content has ended.
    first.target.left = paddingLeft + (first.plan.rect.left - columns[0].rect.left) / first.plan.scale;
    first.target.right = paddingRight + (columns[columns.length - 1].rect.right - first.plan.rect.right) / first.plan.scale;
    if (top !== first.top) first.target.maskOffset = (top - first.top) / first.plan.scale;
    first.target.peers = targets.slice(1).map(({ target }) => ({ ...target, spacerOnly: true }));
    return [{ top, target: first.target }];
  });
}
