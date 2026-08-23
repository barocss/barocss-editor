import { describe, it, expect } from 'vitest';
import {
  cellContaining,
  cellRectangle,
  cellsBetween,
  columnsCovered,
  rowsCovered
} from '../src/table-selection';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * Which cells a drag selects.
 *
 * Pure arithmetic over a table's shape, so all of it runs in milliseconds and
 * none of it needs a browser — which matters here because the interesting cases
 * are merges, and building a table with a merge in it by hand in a browser is
 * several minutes per case.
 *
 * The rule being tested is "a rectangle that clips nothing". A selection that
 * takes in half of a merged cell is one `mergeTableCells` refuses, so a drag
 * that produced one would highlight four cells and then fail to merge them —
 * a selection that says one thing and does another.
 */
function docOf(nodes: DocumentNode[], rootId = 'doc'): DocumentAccess {
  const index = new Map(nodes.map((n) => [n.sid!, n]));
  return { getNode: (id) => index.get(id), rootId };
}

/**
 * A table of plain cells, `rows` by `columns`, named `r0c0`, `r0c1`, …
 *
 * `merges` re-shapes named cells afterwards and drops the ones they swallow, the
 * way a merge does in the document: a cell with `colspan: 2` is followed by the
 * next column's cell, not by a hole.
 */
function tableOf(
  rows: number,
  columns: number,
  merges: Record<string, { colspan?: number; rowspan?: number; swallows: string[] }> = {}
): DocumentAccess {
  const swallowed = new Set(Object.values(merges).flatMap((m) => m.swallows));
  const nodes: DocumentNode[] = [
    { sid: 'doc', stype: 'document', content: ['table'] } as DocumentNode,
    { sid: 'table', stype: 'bTable', parentId: 'doc', attributes: {}, content: ['body'] } as DocumentNode
  ];

  const rowIds: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cellIds: string[] = [];
    for (let c = 0; c < columns; c++) {
      const sid = `r${r}c${c}`;
      if (swallowed.has(sid)) continue;
      cellIds.push(sid);
      nodes.push({
        sid,
        stype: 'bTableCell',
        parentId: `r${r}`,
        attributes: { ...(merges[sid] ?? {}) },
        content: []
      } as DocumentNode);
    }
    rowIds.push(`r${r}`);
    nodes.push({
      sid: `r${r}`,
      stype: 'bTableRow',
      parentId: 'body',
      attributes: {},
      content: cellIds
    } as DocumentNode);
  }

  nodes.push({
    sid: 'body',
    stype: 'bTableBody',
    parentId: 'table',
    attributes: {},
    content: rowIds
  } as DocumentNode);

  return docOf(nodes);
}

describe('the block of cells a drag covers', () => {
  it('takes the rectangle between them, not everything in between', () => {
    // From the first cell of one row to the second of the next means four
    // cells. A run — the shape a text selection has — would take in the whole
    // of the first row on the way, which is not what anybody dragging over a
    // table means.
    const doc = tableOf(3, 3);
    expect(cellsBetween(doc, 'r0c0', 'r1c1').sort()).toEqual(['r0c0', 'r0c1', 'r1c0', 'r1c1']);
  });

  it('is the same block whichever corner the drag started from', () => {
    const doc = tableOf(3, 3);
    const forward = cellsBetween(doc, 'r0c0', 'r1c1').sort();
    expect(cellsBetween(doc, 'r1c1', 'r0c0').sort()).toEqual(forward);
    expect(cellsBetween(doc, 'r0c1', 'r1c0').sort()).toEqual(forward);
  });

  it('is one cell when the drag never left it', () => {
    const doc = tableOf(2, 2);
    expect(cellsBetween(doc, 'r0c0', 'r0c0')).toEqual(['r0c0']);
  });

  it('selects nothing across two tables', () => {
    // Not an error: a drag that leaves the table is a drag that selects text,
    // and saying so is the caller's business.
    const doc = docOf([
      { sid: 'doc', stype: 'document', content: [] } as DocumentNode,
      { sid: 'lonely', stype: 'bTableCell', parentId: 'nowhere', attributes: {}, content: [] } as DocumentNode
    ]);
    expect(cellsBetween(doc, 'lonely', 'lonely')).toEqual([]);
  });
});

describe('a rectangle that clips no merge', () => {
  /** `r0c0` covers both columns of the first row; `r0c1` is gone. */
  const wide = () => tableOf(2, 2, { r0c0: { colspan: 2, swallows: ['r0c1'] } });

  it('takes the whole of a merged cell the drag only touched', () => {
    // Dragging down the left column reaches `r0c0`, which is two columns wide,
    // so the block is two columns wide as well — and `r1c1` comes in with it.
    const doc = wide();
    expect(cellsBetween(doc, 'r0c0', 'r1c0').sort()).toEqual(['r0c0', 'r1c0', 'r1c1']);
  });

  it('grows the rectangle rather than reporting a smaller one', () => {
    const doc = wide();
    expect(cellRectangle(doc, 'r0c0', 'r1c0')).toMatchObject({ top: 0, left: 0, bottom: 1, right: 1 });
  });

  /**
   * Growing cascades: taking in one merge widens the block, and the wider block
   * can clip a different merge. It settles because each pass only grows.
   */
  it('settles when taking one merge in reaches another', () => {
    const doc = tableOf(3, 3, {
      r0c0: { colspan: 2, swallows: ['r0c1'] },
      r2c1: { colspan: 2, swallows: ['r2c2'] }
    });

    // Starting inside the first row's merge, dragging to the bottom-left.
    const selected = cellsBetween(doc, 'r0c0', 'r2c0').sort();
    expect(selected).toContain('r2c1');
    // …which is two columns wide, so the third column comes in for every row.
    expect(selected).toContain('r0c2');
    expect(selected).toContain('r1c2');
  });

  it('takes a tall merge down with it', () => {
    const doc = tableOf(3, 2, { r0c0: { rowspan: 2, swallows: ['r1c0'] } });
    expect(cellsBetween(doc, 'r0c0', 'r0c1').sort()).toEqual(['r0c0', 'r0c1', 'r1c1']);
  });
});

describe('what the selection covers, for the commands that need rows', () => {
  it('reports each row once, however many cells are in it', () => {
    const doc = tableOf(3, 3);
    expect(rowsCovered(doc, cellsBetween(doc, 'r0c0', 'r1c2'))).toEqual([0, 1]);
    expect(columnsCovered(doc, cellsBetween(doc, 'r0c0', 'r1c2'))).toEqual([0, 1, 2]);
  });

  it('counts every row a merged cell reaches', () => {
    const doc = tableOf(3, 2, { r0c0: { rowspan: 2, swallows: ['r1c0'] } });
    expect(rowsCovered(doc, ['r0c0'])).toEqual([0, 1]);
  });

  it('ignores an id that is not a cell', () => {
    const doc = tableOf(2, 2);
    expect(rowsCovered(doc, ['table', 'nope'])).toEqual([]);
  });
});

describe('finding the cell a caret is in', () => {
  it('walks up from a paragraph inside it', () => {
    const doc = docOf([
      { sid: 'doc', stype: 'document', content: ['cell'] } as DocumentNode,
      { sid: 'cell', stype: 'bTableCell', parentId: 'doc', attributes: {}, content: ['p'] } as DocumentNode,
      { sid: 'p', stype: 'paragraph', parentId: 'cell', attributes: {}, content: ['t'] } as DocumentNode,
      { sid: 't', stype: 'inline-text', parentId: 'p', text: 'x' } as DocumentNode
    ]);
    expect(cellContaining(doc, 't')?.sid).toBe('cell');
    expect(cellContaining(doc, 'cell')?.sid).toBe('cell');
    expect(cellContaining(doc, 'doc')).toBeUndefined();
    expect(cellContaining(doc, undefined)).toBeUndefined();
  });
});
