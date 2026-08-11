/**
 * The page break that falls inside a table.
 *
 * A table breaks between rows — nothing else in a table is a place a page can
 * end, because a break inside a cell leaves its borders on one page and its
 * words on another. So the break is a row: an empty one, spanning every column,
 * as tall as the gap to the next page, drawn before the row that starts it.
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
import { defineDecorator, element } from '@barocss/dsl';

/** The decorator type a table's page break is registered under. */
export const TABLE_BREAK_STYPE = 'wordTableBreak';

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
