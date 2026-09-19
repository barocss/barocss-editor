/**
 * The page break that falls inside a table.
 *
 * Ordinary breaks use an empty row spanning every column. An oversized,
 * full-width merged cell instead uses an internal paragraph decorator with a
 * border/background mask. Adding a row inside that cell would alter rowspan.
 *
 * A row, rather than the margin every other block break uses, because a `tr` has
 * nowhere to put a margin and a positioned element inside a table is outside the
 * table's own layout. Padding on the cells would work arithmetically and look
 * wrong: with collapsed borders the cell's own border would be drawn down the
 * whole gap and across the edge of the paper.
 *
 * Chrome on every count — not copied, not typed into, not selected, and
 * subtracted from the table's height when it is measured, so a table does not
 * grow every time it breaks.
 */
import { defineDecorator, each, element } from '@barocss/dsl';

/** The decorator type a table's page break is registered under. */
export const TABLE_BREAK_STYPE = 'wordTableBreak';
export const TABLE_CELL_BREAK_STYPE = 'wordTableCellBreak';

/**
 * The one cell of the gap row.
 *
 * How tall the gap is and how many columns it spans come from the decorator's
 * own data: both are facts about *this* break, not about breaks.
 */
const gapCell = {
  // Every column, so the gap is the width of the table and no column rule is
  // drawn down the middle of it.
  colspan: (data: Record<string, any>) => Number(data?.columns) || 1,
  style: (data: Record<string, any>) => ({
    height: `${Number(data?.height) || 0}px`,
    padding: '0',
    border: 'none',
    background: 'none'
  })
};

/**
 * Register the renderer for a page break between two table rows.
 *
 * Idempotent, so a second editor on the page does not double register.
 */
export function registerTableBreakWidget(): void {
  defineDecorator(TABLE_CELL_BREAK_STYPE, element('span', {
    className: 'w-table-cell-break', 'data-bc-chrome': 'true', contenteditable: 'false', 'aria-hidden': 'true',
    style: (data: Record<string, any>) => ({
      display: data.cell?.inline ? 'inline-block' : 'block', width: '100%', verticalAlign: 'top',
      position: 'relative', height: `${data.cell?.spacerHeight ?? (Number(data.height) + (data.headerRowHeights ?? []).reduce((sum: number, h: number) => sum + h, 0))}px`,
      margin: '0', padding: '0', border: 'none', userSelect: 'none', pointerEvents: 'none',
    })
  }, [element('div', {
    className: 'w-table-cell-gap-mask', 'data-bc-chrome': 'true',
    style: (data: Record<string, any>) => ({
      display: data.cell?.spacerOnly ? 'none' : 'block',
      transform: data.cell?.maskOffset ? `translateY(${data.cell.maskOffset}px)` : undefined,
      position: 'absolute', inset: `0 -${data.cell?.right ?? 0}px 0 -${data.cell?.left ?? 0}px`,
      zIndex: 1,
      background: `linear-gradient(to bottom, white ${data.pageGapStart ?? 0}px, var(--ou-ground, #f5f5f5) ${data.pageGapStart ?? 0}px, var(--ou-ground, #f5f5f5) ${(data.pageGapStart ?? 0) + (data.pageGapHeight ?? 0)}px, white ${(data.pageGapStart ?? 0) + (data.pageGapHeight ?? 0)}px)`,
    })
  }, [element('table', {
    className: 'w-cell-header-copy', style: { position: 'absolute', bottom: '0', width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', margin: '0' }
  }, [element('tbody', {}, [each('headerRows', (cells: any[]) => element('tr', {}, cells.map(cell => element('th', {
    className: 'w-cell w-repeat-cell', colSpan: cell.colspan, rowSpan: cell.rowspan, style: cell.style ?? {},
    // Inline gaps must contain no text nodes: the model's text offsets exclude
    // repeated headers. Generated content displays the copy without adding text.
    'data-word-header-text': String(cell.text ?? ''),
  })) ))])])]) ]));
  defineDecorator(
    TABLE_BREAK_STYPE,
    element(
      'tr',
      {
        className: 'w-table-break',
        'data-bc-chrome': 'true',
        contenteditable: 'false',
        'aria-hidden': 'true',
        style: { border: 'none', background: 'none' }
      },
      [element('td', gapCell)]
    )
  );
}

/** The decorator type a repeated header row is registered under. */
export const TABLE_HEADER_REPEAT_STYPE = 'wordTableHeaderRepeat';

/**
 * A copy of a header row, drawn at the top of a page the table continues onto.
 *
 * Word's `isHeader` on a row, which the schema has always carried and nothing
 * has honoured. Without it a reader who turns the page is looking at a grid of
 * numbers with no idea what the columns are.
 *
 * A copy, not the row itself: the row is somewhere else in the document, and one
 * node cannot be in two places. So it is drawn from the header's text the way a
 * header or footer is drawn onto each sheet — chrome, carrying no id of its own,
 * not copied and not typed into.
 */
export function registerTableHeaderRepeat(): void {
  defineDecorator(
    TABLE_HEADER_REPEAT_STYPE,
    element(
      'tr',
      {
        className: 'w-table-header-repeat',
        style: (data: Record<string, any>) => ({ height: `${Number(data?.height) || 0}px` }),
        'data-bc-chrome': 'true',
        contenteditable: 'false',
        'aria-hidden': 'true'
      },
      [each('cells', (cell: any) => element('th', {
        ...repeatedCell,
        colSpan: Number(cell?.colspan) || 1,
        rowSpan: Number(cell?.rowspan) || 1,
        style: cell?.style ?? {},
      }, String(cell?.text ?? '')))]
    )
  );
}

/**
 * One cell of a repeated header.
 *
 * `th`, like the row it copies, so it inherits the same styling without this
 * having to know what that styling is.
 */
const repeatedCell = {
  className: 'w-cell w-repeat-cell'
};
