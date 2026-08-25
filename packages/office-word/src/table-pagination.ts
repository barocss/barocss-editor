/**
 * Where a table breaks, worked out from the model alone.
 *
 * Everything here is arithmetic over the document and the pagination's answer —
 * which rows there are, which of them are headers, how many columns a gap has to
 * span, and how tall the gap is once the repeated header has taken its share. It
 * needs no browser, and it is where this feature's mistakes live: a header
 * counted twice, a gap that forgets what is drawn inside it, a row index that
 * means something different to the measurement than to the layout.
 *
 * The one part that does need a browser — how tall each row came out — is
 * measured elsewhere and passed in.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
/*
 * The three questions about a table's **shape** — which rows it has, which of them repeat, how many
 * columns the widest one spans — are `table-format.ts` now.
 *
 * Measured while splitting the text renderers from the page ones: `table-style.ts` imported two of
 * them, so a product that only draws tables pulled this file in, and with it the paginator. They
 * were never pagination; they are what a table *is*, and the name of the file they were in was the
 * only thing saying otherwise.
 */
import { columnsOf, headerRowsOf, tableRowsOf } from '@barocss/office-text';
export { columnsOf, headerRowsOf, tableRowsOf };

/** A page break that falls inside a table, as something to draw. */
export interface TableBreakWidget {
  sid: string;
  /** The row the break is drawn before. */
  rowSid: string;
  /** How many columns the gap has to span. */
  columns: number;
  /** How far the rows after it have to fall to reach the next page. */
  height: number;
  /**
   * The header cells to draw again under the gap, if the table has any.
   *
   * Text only. A repeated header is a drawing of a row that lives elsewhere in
   * the document, the way a header or footer drawn on a sheet is; the row itself
   * cannot be in two places.
   */
  header: { text: string }[];
}




/** The text of a node and everything under it. */
export function textOf(doc: DocumentAccess, node: DocumentNode | undefined, depth = 0): string {
  if (!node || depth > 32) return '';
  if (typeof node.text === 'string') return node.text;
  return childrenOf(doc, node)
    .map((child) => textOf(doc, child, depth + 1))
    .join('');
}

/**
 * Heights that sum to a given total, in the same proportions.
 *
 * The pagination's arithmetic depends on `sum(lines) === height`, and a table is
 * taller than its rows: borders and spacing belong to the table and to no row.
 * Measured at 32px unattributed over 42 rows — enough to put the last row of a
 * page 25px past the bottom margin, drawn over the edge of the paper.
 */
export function scaledTo(heights: number[], total: number): number[] {
  const measured = heights.reduce((sum, each) => sum + each, 0);
  if (heights.length === 0 || measured <= 0 || total <= 0) return heights;

  const scale = total / measured;
  return heights.map((each) => each * scale);
}

/**
 * Turn a table's splits into the gap rows to draw.
 *
 * `splits` are the pagination's, and each `line` is the index of the first row
 * that belongs to the next page. `rowHeights` are those rows as measured.
 */
export function tableBreaksOf(
  doc: DocumentAccess,
  table: DocumentNode,
  splits: { line: number; height: number }[],
  rowHeights: number[]
): TableBreakWidget[] {
  const rows = tableRowsOf(doc, table);
  const columns = columnsOf(doc, rows);
  const headerRows = headerRowsOf(doc, rows);
  const breaks: TableBreakWidget[] = [];

  for (const [index, split] of splits.entries()) {
    // A split at row zero is a table that was moved to the next page, not one
    // that broke; a gap above its first row would push it a page further on
    // every round and the layout would never settle.
    const row = split.line > 0 ? rows[split.line] : undefined;
    if (!row?.sid) continue;

    // Nothing to repeat when the break falls among the header rows themselves:
    // the reader has not passed them yet.
    const header =
      split.line >= headerRows.length
        ? headerRows.flatMap((headerRow) =>
            childrenOf(doc, headerRow).map((cell) => ({ text: textOf(doc, cell) }))
          )
        : [];

    // The gap is what is left after the repeated header.
    //
    // The distance from the last row of one page to the first row of the next is
    // fixed — the layout worked it out — and whatever is drawn in between has to
    // add up to it. Drawing the header *and* the whole gap pushed every row
    // after it down by the height of a header, which put the last row of each
    // page past the bottom margin.
    const headerHeight =
      header.length > 0
        ? headerRows.reduce((total, _row, at) => total + (rowHeights[at] ?? 0), 0)
        : 0;

    breaks.push({
      // By which break of this table it is, for the same reason a paragraph's
      // is: an identity that changes tears the widget down and rebuilds it.
      sid: `table-break-${table.sid}-${index}`,
      rowSid: row.sid,
      columns,
      height: Math.max(0, split.height - headerHeight),
      header
    });
  }

  return breaks;
}
