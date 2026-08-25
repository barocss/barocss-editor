import { describe, it, expect } from 'vitest';
import {
  bandSizesOf,
  blockStyleLayers,
  cellPlacementOf,
  cellStyleLayers,
  formatTableLook,
  parseTableLook,
  regionsAt,
  rowFormat,
  rowPlacementOf,
  rowRegionsAt,
  rowStyleLayer,
  tableOf,
  tableStyleLayer,
  tableStylesOf,
  DEFAULT_TABLE_LOOK
} from '../src/table-style';
import { cellBorders } from '../src/table-format';
import { createStyleResolver } from '../src/style-resolver';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/** Build a DocumentAccess over a flat map of nodes. */
function docOf(nodes: DocumentNode[], rootId = 'doc'): DocumentAccess {
  const index = new Map(nodes.map((n) => [n.sid!, n]));
  return { getNode: (id) => index.get(id), rootId };
}

const at = (row: number, column: number, over: Partial<Record<string, number>> = {}) => ({
  row,
  column,
  rows: 4,
  columns: 4,
  ...over
});

describe('the look a table asks its style for', () => {
  it('defaults to what Word gives an inserted table', () => {
    // A table that records no look was never asked the question; this is the
    // answer Word would have written down.
    expect(parseTableLook(undefined)).toEqual(DEFAULT_TABLE_LOOK);
    expect(parseTableLook('')).toEqual(DEFAULT_TABLE_LOOK);
    expect(parseTableLook('   ')).toEqual(DEFAULT_TABLE_LOOK);
  });

  it('reads the bitmask a .docx carries', () => {
    // 04A0 is Word's own default: firstRow + firstColumn + noVBand
    expect(parseTableLook('04A0')).toEqual({
      firstRow: true,
      lastRow: false,
      firstColumn: true,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false
    });
    expect(parseTableLook('0x04a0')).toEqual(parseTableLook('04A0'));
  });

  it('treats the banding bits as the switches-off they are', () => {
    // A zero mask means banded in both directions: noHBand and noVBand are unset
    const zero = parseTableLook('0000');
    expect(zero.bandedRows).toBe(true);
    expect(zero.bandedColumns).toBe(true);
    expect(zero.firstRow).toBe(false);

    const off = parseTableLook('0600');
    expect(off.bandedRows).toBe(false);
    expect(off.bandedColumns).toBe(false);
  });

  it('reads a list of names, and takes anything unnamed as off', () => {
    expect(parseTableLook('firstRow,bandedRows')).toEqual({
      firstRow: true,
      lastRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false
    });
    // Word's own attribute spellings, and whitespace for a separator
    expect(parseTableLook('firstCol lastCol vBand')).toEqual({
      firstRow: false,
      lastRow: false,
      firstColumn: true,
      lastColumn: true,
      bandedRows: false,
      bandedColumns: true
    });
  });

  it('has a spelling for "the whole table and none of its regions"', () => {
    expect(parseTableLook('none')).toEqual({
      firstRow: false,
      lastRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: false,
      bandedColumns: false
    });
  });

  it('ignores names it does not know rather than guessing', () => {
    expect(parseTableLook('shaded,firstRow').firstRow).toBe(true);
    expect(parseTableLook('shaded,firstRow').bandedRows).toBe(false);
  });

  it('writes a look back out as the names it asks for', () => {
    // Round trip, in the spelling whoever opens the document can read
    expect(formatTableLook(parseTableLook('04A0'))).toBe('firstRow,firstColumn,bandedRows');
    expect(parseTableLook(formatTableLook(parseTableLook('04A0')))).toEqual(parseTableLook('04A0'));

    // A look that asks for nothing still has to say so: an empty string reads
    // back as the default, which is the opposite of what it meant.
    expect(formatTableLook(parseTableLook('none'))).toBe('none');
    expect(parseTableLook(formatTableLook(parseTableLook('none')))).toEqual(parseTableLook('none'));
  });

  it('never bands in less than one row', () => {
    expect(bandSizesOf({})).toEqual({ row: 1, column: 1 });
    expect(bandSizesOf({ rowBandSize: 2, columnBandSize: 3 })).toEqual({ row: 2, column: 3 });
    expect(bandSizesOf({ rowBandSize: 0, columnBandSize: -4 })).toEqual({ row: 1, column: 1 });
  });
});

describe('which regions reach a cell', () => {
  const all = parseTableLook('firstRow,lastRow,firstColumn,lastColumn,bandedRows,bandedColumns');

  it('always includes the whole table', () => {
    expect(regionsAt(parseTableLook('none'), at(1, 1))).toEqual(['wholeTable']);
  });

  it('names the row and column regions of the cell it is given', () => {
    expect(regionsAt(all, at(0, 1))).toContain('firstRow');
    expect(regionsAt(all, at(3, 1))).toContain('lastRow');
    expect(regionsAt(all, at(1, 0))).toContain('firstCol');
    expect(regionsAt(all, at(1, 3))).toContain('lastCol');
  });

  it('orders them so the later region wins', () => {
    // The spec's order, and the reason a shaded band under a bold header row
    // keeps the shading and the bold: banding first, then column, then row.
    expect(regionsAt(all, at(0, 0))).toEqual(['wholeTable', 'firstCol', 'firstRow', 'nwCell']);

    // A table of one cell is in every region at once, which is the only place
    // the whole order is visible.
    expect(regionsAt(all, { row: 0, column: 0, rows: 1, columns: 1 })).toEqual([
      'wholeTable',
      'lastCol',
      'firstCol',
      'lastRow',
      'firstRow',
      'seCell',
      'swCell',
      'neCell',
      'nwCell'
    ]);
  });

  it('gives a corner its own region, but only where both sides were asked for', () => {
    expect(regionsAt(all, at(3, 3))).toContain('seCell');
    expect(regionsAt(all, at(3, 0))).toContain('swCell');
    expect(regionsAt(all, at(0, 3))).toContain('neCell');

    // A first row the table did not ask for has no corner
    const rowsOnly = parseTableLook('firstRow');
    expect(regionsAt(rowsOnly, at(0, 0))).toEqual(['wholeTable', 'firstRow']);
  });

  it('bands from the row after the header, so the first row of data is band 1', () => {
    const banded = parseTableLook('firstRow,bandedRows');
    expect(regionsAt(banded, at(1, 0))).toContain('band1Horz');
    expect(regionsAt(banded, at(2, 0))).toContain('band2Horz');
    expect(regionsAt(banded, at(3, 0))).toContain('band1Horz');

    // Without a header row the first row is the one that bands
    const headerless = parseTableLook('bandedRows');
    expect(regionsAt(headerless, at(0, 0))).toContain('band1Horz');
    expect(regionsAt(headerless, at(1, 0))).toContain('band2Horz');
  });

  it('keeps a row with a region of its own out of the banding', () => {
    const banded = parseTableLook('firstRow,lastRow,bandedRows');
    const first = regionsAt(banded, at(0, 0));
    const last = regionsAt(banded, at(3, 0));
    expect(first.some((region) => region.startsWith('band'))).toBe(false);
    expect(last.some((region) => region.startsWith('band'))).toBe(false);
  });

  it('bands in pairs when the style says a band is two rows', () => {
    const banded = parseTableLook('bandedRows');
    const bands = [0, 1, 2, 3, 4, 5].map(
      (row) =>
        regionsAt(banded, { row, column: 0, rows: 6, columns: 2 }, { row: 2, column: 1 }).find(
          (region) => region.startsWith('band')
        )
    );
    expect(bands).toEqual([
      'band1Horz',
      'band1Horz',
      'band2Horz',
      'band2Horz',
      'band1Horz',
      'band1Horz'
    ]);
  });

  it('bands columns independently of where the row is', () => {
    const banded = parseTableLook('firstRow,bandedColumns');
    // The header row's cells still take their column band; firstRow then
    // overrides whatever the two disagree about.
    expect(regionsAt(banded, at(0, 1))).toEqual(['wholeTable', 'band2Vert', 'firstRow']);
  });

  it('measures a merged cell from its far side', () => {
    const all2 = parseTableLook('lastRow,lastColumn');
    // A cell at row 2 that spans two rows reaches the last row of four
    expect(regionsAt(all2, at(2, 2, { rowspan: 2, colspan: 2 }))).toContain('lastRow');
    expect(regionsAt(all2, at(2, 2, { rowspan: 2, colspan: 2 }))).toContain('lastCol');
  });
});

/**
 * A table style shaped like a built-in one: a grid, a bold shaded header, and
 * every second row shaded — plus a variation of it based on the first, which is
 * how Word's gallery is written.
 */
function styledTable(tableAttrs: Record<string, unknown>) {
  return docOf([
    { sid: 'doc', stype: 'document', content: ['surface', 'resources'] },
    { sid: 'surface', stype: 'surface', content: ['table'] },
    {
      sid: 'table',
      stype: 'bTable',
      parentId: 'surface',
      attributes: tableAttrs,
      content: ['head', 'body']
    },
    { sid: 'head', stype: 'bTableHeader', parentId: 'table', attributes: {}, content: ['h1', 'h2'] },
    { sid: 'h1', stype: 'bTableHeaderCell', parentId: 'head', attributes: {}, content: ['h1p'] },
    { sid: 'h2', stype: 'bTableHeaderCell', parentId: 'head', attributes: {}, content: [] },
    { sid: 'h1p', stype: 'paragraph', parentId: 'h1', attributes: {}, content: [] },
    { sid: 'body', stype: 'bTableBody', parentId: 'table', attributes: {}, content: ['r1', 'r2'] },
    { sid: 'r1', stype: 'bTableRow', parentId: 'body', attributes: {}, content: ['a1', 'b1'] },
    { sid: 'a1', stype: 'bTableCell', parentId: 'r1', attributes: {}, content: [] },
    {
      sid: 'b1',
      stype: 'bTableCell',
      parentId: 'r1',
      attributes: { shadingFill: 'FF0000' },
      content: []
    },
    { sid: 'r2', stype: 'bTableRow', parentId: 'body', attributes: {}, content: ['a2', 'b2'] },
    { sid: 'a2', stype: 'bTableCell', parentId: 'r2', attributes: {}, content: [] },
    { sid: 'b2', stype: 'bTableCell', parentId: 'r2', attributes: {}, content: [] },
    { sid: 'resources', stype: 'resources', content: ['grid', 'shaded'] },
    {
      sid: 'grid',
      stype: 'styleDef',
      attributes: { id: 'GridTable', name: 'Grid Table', type: 'table' },
      content: ['grid-whole', 'grid-first', 'grid-band']
    },
    {
      sid: 'grid-whole',
      stype: 'styleConditional',
      parentId: 'grid',
      attributes: {
        type: 'wholeTable',
        borderInsideHStyle: 'single',
        borderInsideHWidth: 4,
        borderTopStyle: 'single',
        borderTopWidth: 12,
        fontFamily: 'Calibri'
      }
    },
    {
      sid: 'grid-first',
      stype: 'styleConditional',
      parentId: 'grid',
      attributes: { type: 'firstRow', bold: true, shadingFill: '1A365D', color: 'FFFFFF' }
    },
    {
      sid: 'grid-band',
      stype: 'styleConditional',
      parentId: 'grid',
      attributes: { type: 'band1Horz', shadingFill: 'EEEEEE' }
    },
    // A style based on another refines its regions rather than replacing them
    {
      sid: 'shaded',
      stype: 'styleDef',
      attributes: { id: 'GridTableBlue', name: 'Grid Table Blue', type: 'table', basedOn: 'GridTable' },
      content: ['blue-first']
    },
    {
      sid: 'blue-first',
      stype: 'styleConditional',
      parentId: 'shaded',
      attributes: { type: 'firstRow', shadingFill: '2C5282' }
    }
  ]);
}

describe('a table style, resolved onto its cells', () => {
  const doc = styledTable({ styleId: 'GridTable' });
  const styles = createStyleResolver(doc);

  const layersFor = (sid: string) => {
    const placement = cellPlacementOf(doc, doc.getNode(sid)!)!;
    return { placement, ...cellStyleLayers(styles, placement.table, placement.at) };
  };

  it('finds where a cell sits, header group and merges and all', () => {
    expect(cellPlacementOf(doc, doc.getNode('h2')!)!.at).toMatchObject({
      row: 0,
      column: 1,
      rows: 3,
      columns: 2
    });
    expect(cellPlacementOf(doc, doc.getNode('b2')!)!.at).toMatchObject({ row: 2, column: 1 });
  });

  it('reaches the header row with the first-row region', () => {
    const { regions } = layersFor('h1');
    expect(regions).toEqual(['wholeTable', 'firstRow']);
  });

  it('shades every second row and leaves the header out of the banding', () => {
    // Default look: firstRow + firstColumn + banded rows. Row 1 is the first
    // row of data, so it is band 1.
    expect(layersFor('a1').regions).toEqual(['wholeTable', 'band1Horz']);
    expect(layersFor('a2').regions).toEqual(['wholeTable']);
  });

  it('lets the cell’s own formatting beat the style', () => {
    const { placement, cell } = layersFor('b1');
    const format = styles.resolveNodeWith(doc.getNode('b1')!, 'table', [cell]);
    expect(placement.at.row).toBe(1);
    // The band would have shaded it grey; the cell says red
    expect(format.shadingFill).toBe('FF0000');
    expect(styles.resolveNodeWith(doc.getNode('a1')!, 'table', [layersFor('a1').cell]).shadingFill)
      .toBe('EEEEEE');
  });

  it('keeps the whole table’s borders off the cells that are not on its edge', () => {
    const table = doc.getNode('table')!;
    const tableFormat = styles.resolveNodeWith(table, 'table', [tableStyleLayer(styles, table)]);

    const middle = layersFor('a2');
    const cellFormat = styles.resolveNodeWith(doc.getNode('a2')!, 'table', [middle.cell]);
    const borders = cellBorders(tableFormat, cellFormat, middle.placement.at);

    // The style's thick top rule belongs to the table's top edge, not to every
    // cell that inherits the whole-table region.
    expect(borders.borderTop).toBe('0.5pt solid currentColor'); // the inside rule
    expect(borders.borderBottom).toBe('0.5pt solid currentColor');

    const header = layersFor('h1');
    const headerBorders = cellBorders(
      tableFormat,
      styles.resolveNodeWith(doc.getNode('h1')!, 'table', [header.cell]),
      header.placement.at
    );
    expect(headerBorders.borderTop).toBe('1.5pt solid currentColor');
  });

  it('formats the text in a cell, and not the box, through the blocks inside it', () => {
    const layers = blockStyleLayers(doc, styles, doc.getNode('h1p')!);
    const format = styles.resolveNodeWith(doc.getNode('h1p')!, 'character', layers);

    expect(format.bold).toBe(true); // the header row is bold
    expect(format.color).toBe('FFFFFF');
    // Shading is the cell's, and a paragraph that painted it too would paint it
    // inside the cell's padding only.
    expect(styles.resolveNodeWith(doc.getNode('h1p')!, 'paragraph', layers).shadingFill)
      .toBeUndefined();
  });

  it('leaves a block that is not in a table alone', () => {
    expect(blockStyleLayers(doc, styles, doc.getNode('table')!)).toEqual([]);
    expect(blockStyleLayers(undefined, styles, doc.getNode('h1p')!)).toEqual([]);
  });

  it('merges the regions of a style with those it is based on', () => {
    const based = createStyleResolver(styledTable({ styleId: 'GridTableBlue' }));
    const regions = based.conditionalFormatsFor('GridTableBlue');

    expect(regions.get('firstRow')).toMatchObject({
      bold: true, // from GridTable
      shadingFill: '2C5282' // refined by GridTableBlue
    });
    expect(regions.get('band1Horz')?.shadingFill).toBe('EEEEEE');
  });

  it('gives a table that asks for no regions only the whole-table one', () => {
    const plain = styledTable({ styleId: 'GridTable', look: 'none' });
    const resolver = createStyleResolver(plain);
    const placement = cellPlacementOf(plain, plain.getNode('h1')!)!;

    expect(cellStyleLayers(resolver, placement.table, placement.at).regions).toEqual(['wholeTable']);
  });

  it('reaches a whole row with the regions a row can be in', () => {
    const table = doc.getNode('table')!;
    const placement = rowPlacementOf(doc, doc.getNode('r1')!)!;
    expect(placement.at).toEqual({ row: 1, rows: 3 });

    // The header group is a row when it holds cells directly, which it does here
    expect(rowPlacementOf(doc, doc.getNode('head')!)?.at).toEqual({ row: 0, rows: 3 });
    // ...and the body group is never one
    expect(rowPlacementOf(doc, doc.getNode('body')!)).toBeUndefined();

    // A row is in no vertical region: the first column is a fact about a cell
    const look = parseTableLook('firstRow,firstColumn,bandedRows,bandedColumns');
    expect(rowRegionsAt(look, 0, 3)).toEqual(['wholeTable', 'firstRow']);
    expect(rowRegionsAt(look, 1, 3)).toEqual(['wholeTable', 'band1Horz']);

    // The style says the header row is bold; the row takes the height and the
    // rules a region carries, and leaves its shading to the cells.
    expect(rowStyleLayer(styles, table, 0, 3)).toMatchObject({ bold: true });
    expect(rowStyleLayer(styles, table, 0, 3).shadingFill).toBeUndefined();
    expect(rowStyleLayer(styles, table, 1, 3).shadingFill).toBeUndefined();
  });

  it('resolves a row against its own formatting, the style’s, and the document', () => {
    const heightened = styledTable({ styleId: 'GridTable' });
    const row = heightened.getNode('r1')!;
    row.attributes = { height: 720, heightRule: 'exact' };

    const format = rowFormat(createStyleResolver(heightened), heightened, row);
    expect(format.height).toBe(720);
    expect(format.heightRule).toBe('exact');
  });

  it('offers the styles the document defines for tables, and no others', () => {
    // Paragraph and character styles are in the same list of resources, and a
    // gallery that offered "Heading 1" for a table would apply nothing at all.
    expect(tableStylesOf(doc)).toEqual([
      { id: 'GridTable', name: 'Grid Table' },
      { id: 'GridTableBlue', name: 'Grid Table Blue' }
    ]);
  });

  it('finds the table an edit is in from anywhere inside it', () => {
    expect(tableOf(doc, doc.getNode('h1p'))?.sid).toBe('table');
    expect(tableOf(doc, doc.getNode('b2'))?.sid).toBe('table');
    expect(tableOf(doc, doc.getNode('surface'))).toBeUndefined();
    expect(tableOf(doc, undefined)).toBeUndefined();
  });

  it('gives a table with no style nothing at all', () => {
    const plain = styledTable({});
    const resolver = createStyleResolver(plain);
    const placement = cellPlacementOf(plain, plain.getNode('h1')!)!;

    expect(cellStyleLayers(resolver, placement.table, placement.at).regions).toEqual([]);
    expect(tableStyleLayer(resolver, plain.getNode('table')!)).toBeUndefined();
  });

  it('treats an empty style id as no style, which is how one is taken off', () => {
    // Removing the attribute is not available: the store skips an update that
    // only unsets, so a style is taken off by naming none.
    const cleared = styledTable({ styleId: '' });
    const resolver = createStyleResolver(cleared);
    const placement = cellPlacementOf(cleared, cleared.getNode('h1')!)!;

    expect(cellStyleLayers(resolver, placement.table, placement.at).regions).toEqual([]);
    expect(tableStyleLayer(resolver, cleared.getNode('table')!)).toBeUndefined();
    expect(resolver.resolveNode(cleared.getNode('table')!, 'table').shadingFill).toBeUndefined();
  });
});
