import { describe, it, expect } from 'vitest';
import {
  columnsOf,
  headerRowsOf,
  scaledTo,
  tableBreaksOf,
  tableRowsOf
} from '../src/table-pagination';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';

/**
 * Where a table breaks.
 *
 * All of this is arithmetic over the document, and it is where the mistakes in
 * this feature live — a header counted twice, a gap that forgets what is drawn
 * inside it, a row index that means one thing to the measurement and another to
 * the layout. None of it needs a browser, and finding these in a browser is how
 * an afternoon goes missing.
 */
const docOf = (nodes: DocumentNode[]): { doc: DocumentAccess; table: DocumentNode } => {
  const byId: Record<string, DocumentNode> = {};
  const index = (node: DocumentNode, parentId?: string) => {
    node.parentId = parentId;
    byId[node.sid!] = node;
    for (const child of node.content ?? []) {
      if (typeof child !== 'string') index(child as DocumentNode, node.sid);
    }
  };
  const table: DocumentNode = { sid: 'tbl', stype: 'bTable', content: nodes };
  index(table);
  return { doc: { getNode: (id) => byId[id], rootId: 'tbl' }, table };
};

const cell = (sid: string, text: string, colspan?: number): DocumentNode => ({
  sid,
  stype: 'bTableCell',
  attributes: colspan ? { colspan } : {},
  content: [{ sid: `${sid}-t`, stype: 'inline-text', text }]
});

const row = (sid: string, texts: string[], attributes: Record<string, unknown> = {}): DocumentNode => ({
  sid,
  stype: 'bTableRow',
  attributes,
  content: texts.map((text, at) => cell(`${sid}-c${at}`, text))
});

/** A header group, which the schema has holding cells with no row between. */
const header = (sid: string, texts: string[]): DocumentNode => ({
  sid,
  stype: 'bTableHeader',
  content: texts.map((text, at) => ({
    sid: `${sid}-c${at}`,
    stype: 'bTableHeaderCell',
    content: [{ sid: `${sid}-c${at}-t`, stype: 'inline-text', text }]
  }))
});

const body = (sid: string, rows: DocumentNode[]): DocumentNode => ({
  sid,
  stype: 'bTableBody',
  content: rows
});

describe('the rows a table breaks between', () => {
  it('counts a header group as one row, since it holds its cells directly', () => {
    const { doc, table } = docOf([
      header('h', ['One', 'Two']),
      body('b', [row('r1', ['a', 'b']), row('r2', ['c', 'd'])])
    ]);

    // Not two rows, and not none: the schema says bTableHeaderCell+, so the
    // browser wraps them in an anonymous row and the group is that row. The
    // measurement counts it the same way, and both have to agree or a split at
    // "row 3" means different rows to each of them.
    expect(tableRowsOf(doc, table).map((each) => each.sid)).toEqual(['h', 'r1', 'r2']);
  });

  it('takes the rows of a body group individually', () => {
    const { doc, table } = docOf([body('b', [row('r1', ['a']), row('r2', ['b']), row('r3', ['c'])])]);
    expect(tableRowsOf(doc, table)).toHaveLength(3);
  });
});

describe('which rows repeat on the next page', () => {
  it('repeats the header group', () => {
    const { doc, table } = docOf([header('h', ['One']), body('b', [row('r1', ['a'])])]);
    const rows = tableRowsOf(doc, table);
    expect(headerRowsOf(doc, rows).map((each) => each.sid)).toEqual(['h']);
  });

  it('repeats the run of rows marked isHeader at the top', () => {
    const { doc, table } = docOf([
      body('b', [
        row('r1', ['a'], { isHeader: true }),
        row('r2', ['b'], { isHeader: true }),
        row('r3', ['c'])
      ])
    ]);

    const rows = tableRowsOf(doc, table);
    expect(headerRowsOf(doc, rows).map((each) => each.sid)).toEqual(['r1', 'r2']);
  });

  it('stops at the first row that is not one', () => {
    const { doc, table } = docOf([
      body('b', [
        row('r1', ['a'], { isHeader: true }),
        row('r2', ['b']),
        // Marked in the middle: a document fault. Repeating it would put a band
        // of unrelated text under every break.
        row('r3', ['c'], { isHeader: true })
      ])
    ]);

    const rows = tableRowsOf(doc, table);
    expect(headerRowsOf(doc, rows).map((each) => each.sid)).toEqual(['r1']);
  });

  it('finds none when there are none', () => {
    const { doc, table } = docOf([body('b', [row('r1', ['a'])])]);
    expect(headerRowsOf(doc, tableRowsOf(doc, table))).toEqual([]);
  });
});

describe('how wide the gap has to be', () => {
  it('spans the widest row, counting merged cells for what they cover', () => {
    const { doc, table } = docOf([
      body('b', [
        { sid: 'r1', stype: 'bTableRow', content: [cell('r1-c0', 'wide', 2), cell('r1-c1', 'x')] },
        row('r2', ['a', 'b'])
      ])
    ]);

    expect(columnsOf(doc, tableRowsOf(doc, table))).toBe(3);
  });
});

describe('heights scaled to the table', () => {
  it('keeps the proportions and hits the total', () => {
    const scaled = scaledTo([10, 20, 30], 120);
    expect(scaled).toEqual([20, 40, 60]);
    expect(scaled.reduce((a, b) => a + b, 0)).toBe(120);
  });

  it('leaves nonsense alone rather than dividing by it', () => {
    expect(scaledTo([], 100)).toEqual([]);
    expect(scaledTo([0, 0], 100)).toEqual([0, 0]);
    expect(scaledTo([10], 0)).toEqual([10]);
  });
});

describe('the breaks to draw', () => {
  const sample = () =>
    docOf([
      header('h', ['One', 'Two']),
      body('b', [row('r1', ['a', 'b']), row('r2', ['c', 'd']), row('r3', ['e', 'f'])])
    ]);

  /** Rows measured at 20px each: the header and three body rows. */
  const heights = [20, 20, 20, 20];

  it('draws the break before the row that starts the next page', () => {
    const { doc, table } = sample();
    const [drawn] = tableBreaksOf(doc, table, [{ line: 2, height: 100 }], heights);

    expect(drawn.rowSid).toBe('r2');
    expect(drawn.columns).toBe(2);
  });

  it('takes the repeated header out of the gap', () => {
    const { doc, table } = sample();
    const [drawn] = tableBreaksOf(doc, table, [{ line: 2, height: 100 }], heights);

    // The distance to the next page is 100; the header takes 20 of it. Drawing
    // both in full pushed every row after it down by the height of a header.
    expect(drawn.height).toBe(80);
    expect(drawn.header.map((each) => each.text)).toEqual(['One', 'Two']);
  });

  it('never asks for a negative gap', () => {
    const { doc, table } = sample();
    const [drawn] = tableBreaksOf(doc, table, [{ line: 2, height: 5 }], heights);
    expect(drawn.height).toBe(0);
  });

  it('repeats nothing when the break falls among the headers themselves', () => {
    const { doc, table } = docOf([
      body('b', [
        row('r1', ['a'], { isHeader: true }),
        row('r2', ['b'], { isHeader: true }),
        row('r3', ['c'])
      ])
    ]);

    // The reader has not passed the headers yet, so there is nothing to remind
    // them of — and the gap keeps its whole height.
    const [drawn] = tableBreaksOf(doc, table, [{ line: 1, height: 100 }], [20, 20, 20]);
    expect(drawn.header).toEqual([]);
    expect(drawn.height).toBe(100);
  });

  it('ignores a break at the first row, which is a table that moved', () => {
    const { doc, table } = sample();
    expect(tableBreaksOf(doc, table, [{ line: 0, height: 100 }], heights)).toEqual([]);
  });

  it('ignores a break past the last row', () => {
    const { doc, table } = sample();
    expect(tableBreaksOf(doc, table, [{ line: 99, height: 100 }], heights)).toEqual([]);
  });

  it('names each break by which one it is, not by where it landed', () => {
    const { doc, table } = sample();
    const drawn = tableBreaksOf(
      doc,
      table,
      [
        { line: 1, height: 100 },
        { line: 3, height: 100 }
      ],
      heights
    );

    // A line number changes with every row added above it, and an identity that
    // changes tears the widget down and rebuilds it on every keystroke.
    expect(drawn.map((each) => each.sid)).toEqual(['table-break-tbl-0', 'table-break-tbl-1']);
  });
});
