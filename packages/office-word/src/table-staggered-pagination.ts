import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
import type { CellBreakTarget, CellParagraphMeasure } from './table-cell-pagination';

/** Split a continuous vertical merge beside ordinary rows. The ordinary cells
 * must determine each row's height, so adding their spacers advances subsequent
 * rows by exactly the same distance as the spanning cells. */
export function staggeredCellCuts(rows: DocumentNode[], columns: number,
  find: (sid?: string) => HTMLElement | null, doc: DocumentAccess, availableHeight: number,
  measureParagraph?: (el: HTMLElement, node: DocumentNode, availableHeight: number) => CellParagraphMeasure) {
  const spanOf = (cell: DocumentNode) => Math.max(1, Number(cell.attributes?.rowspan) || 1);
  const widthOf = (cell: DocumentNode) => Math.max(1, Number(cell.attributes?.colspan) || 1);
  const first = childrenOf(doc, rows[0]);
  const merged = first.filter(cell => spanOf(cell) === rows.length);
  const occupied = merged.reduce((sum, cell) => sum + widthOf(cell), 0);
  if (!merged.length || occupied >= columns) return undefined;
  const mergedIds = new Set(merged.map(cell => cell.sid));
  const ordinary = rows.map(row => childrenOf(doc, row).filter(cell => !mergedIds.has(cell.sid)));
  if (ordinary.some(cells => cells.some(cell => spanOf(cell) !== 1)
    || cells.reduce((sum, cell) => sum + widthOf(cell), 0) + occupied !== columns)) return undefined;

  const read = (cell: DocumentNode) => {
    const el = find(cell.sid), blocks = childrenOf(doc, cell);
    if (!el || !blocks.length || blocks.some(block => !['paragraph', 'heading'].includes(block.stype ?? '') || !find(block.sid))) return undefined;
    const style = el.ownerDocument.defaultView!.getComputedStyle(el);
    if (style.verticalAlign !== 'top') return undefined;
    const rect = el.getBoundingClientRect();
    const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    const last = find(blocks[blocks.length - 1].sid)!;
    const bottom = last.getBoundingClientRect().bottom;
    const bottomSpace = (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0)
      + (parseFloat(el.ownerDocument.defaultView!.getComputedStyle(last).marginBottom) || 0);
    const slack = Math.max(0, (rect.bottom - bottom) / scale - bottomSpace);
    return { el, blocks, rect, scale, bottom, slack, fillsRow: slack <= 2 };
  };
  const spanning = merged.map(read), rowCells = ordinary.map(cells => cells.map(read));
  if (spanning.some(cell => !cell) || rowCells.some((cells, index) => cells.some(cell => !cell)
    || (!cells.some(cell => cell?.fillsRow) && !cells.some(cell => cell
      && Number(rows[index].attributes?.height) / 15 >= cell.rect.height / cell.scale - 2)))) return undefined;
  const spans = spanning.filter(cell => !!cell);
  const regular = rowCells.map(cells => cells.filter(cell => !!cell));
  const bounds = [...spans, ...regular[0]].map(cell => cell.rect);
  const left = Math.min(...bounds.map(rect => rect.left)), right = Math.max(...bounds.map(rect => rect.right));
  const plans = spans.map(cell => ({ ...cell, cuts: cell.blocks.flatMap((block, index) => {
    const previous = cell.blocks[index - 1];
    const cuts: { low: number; top: number; target: CellBreakTarget }[] = [];
    if (previous && previous.attributes?.keepNext !== true
      && !(previous.stype === 'heading' && previous.attributes?.keepNext !== false)) {
      cuts.push({ low: find(previous.sid)!.getBoundingClientRect().bottom, top: find(block.sid)!.getBoundingClientRect().top,
        target: { blockSid: block.sid!, left: 0, right: 0 } });
    }
    for (const cut of measureParagraph?.(find(block.sid)!, block, availableHeight).cuts ?? []) {
      cuts.push({ low: cut.top, top: cut.top, target: { blockSid: block.sid!, left: 0, right: 0, inline: cut.anchor } });
    }
    return cuts;
  }) }));
  return rows.slice(1).flatMap((row, index) => {
    const next = regular[index + 1];
    let low = find(row.sid)!.getBoundingClientRect().top;
    let top = Math.min(...next.map(cell => find(cell.blocks[0].sid)!.getBoundingClientRect().top));
    const targets: { el: HTMLElement; scale: number; top: number; target: CellBreakTarget }[] = [];
    for (const cell of plans) {
      const cut = cell.cuts.find(cut => cut.low <= top && cut.top >= low);
      if (cut) {
        low = Math.max(low, cut.low); top = Math.min(top, cut.top);
        targets.push({ el: cell.el, scale: cell.scale, top: cut.top, target: { ...cut.target } });
      } else if (cell.bottom > top) return [];
      else low = Math.max(low, cell.bottom);
      if (low > top) return [];
    }
    targets.push(...next.map(cell => ({ el: cell.el, scale: cell.scale,
      top: find(cell.blocks[0].sid)!.getBoundingClientRect().top,
      target: { blockSid: cell.blocks[0].sid!, left: 0, right: 0 } })));
    const primary = targets[0], style = primary.el.ownerDocument.defaultView!.getComputedStyle(primary.el);
    const rect = primary.el.getBoundingClientRect();
    primary.target.left = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0) + (rect.left - left) / primary.scale;
    primary.target.right = (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderRightWidth) || 0) + (right - rect.right) / primary.scale;
    primary.target.maskOffset = (top - primary.top) / primary.scale;
    primary.target.peers = targets.slice(1).map(({ target }) => ({ ...target, spacerOnly: true }));
    // The normal cells must grow by the entire page gap. A row's existing
    // minimum-height slack would otherwise absorb part of that gap. Keep that
    // slack after the text, separate from the spacer before the new page.
    for (const cell of next) if (cell.slack > 2) primary.target.peers.push({
      blockSid: cell.blocks[cell.blocks.length - 1].sid!, left: 0, right: 0,
      spacerOnly: true, after: true, spacerHeight: cell.slack,
    });
    return [{ top, target: primary.target }];
  });
}
