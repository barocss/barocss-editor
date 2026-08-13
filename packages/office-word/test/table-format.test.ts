import { describe, it, expect } from 'vitest';
import { borderCss, borderOf, cellBorders, cellMargins, gridOf, tableCss } from '../src/table-format';

/**
 * A table's own formatting.
 *
 * Two parts of Word's model have no shape in CSS, and they are what this covers:
 * the column grid, which CSS keeps nowhere, and the inside rules, which CSS has
 * no selector for.
 */
describe('borders', () => {
  it('reads Word’s eighths of a point as a width', () => {
    expect(borderCss({ style: 'single', width: 8, color: 'FF0000' })).toBe('1pt solid #FF0000');
    expect(borderCss({ style: 'single', width: 4 })).toBe('0.5pt solid currentColor');
  });

  it('treats none and nil as no line, because Word writes both', () => {
    expect(borderCss({ style: 'none' })).toBe('none');
    expect(borderCss({ style: 'nil' })).toBe('none');
  });

  it('says nothing about a border the document does not mention', () => {
    expect(borderOf({}, 'borderTop')).toBeUndefined();
    expect(borderCss(undefined)).toBeUndefined();
  });
});

describe('the column grid', () => {
  it('reads the widths a table declares', () => {
    expect(gridOf({ grid: '2880, 1440,1440' })).toEqual([2880, 1440, 1440]);
  });

  it('is empty when it declares none, which is a table sized by its contents', () => {
    expect(gridOf({})).toEqual([]);
    expect(gridOf({ grid: '' })).toEqual([]);
    expect(gridOf({ grid: 'x,-5,0' })).toEqual([]);
  });

  it('makes the layout fixed, or the declared widths mean nothing', () => {
    // Left to itself a browser sizes columns from their text, and a document
    // saying its first column is two inches wide silently gets something else.
    expect(tableCss({ grid: '2880,1440' }).tableLayout).toBe('fixed');
    expect(tableCss({ layout: 'fixed' }).tableLayout).toBe('fixed');
    expect(tableCss({}).tableLayout).toBeUndefined();
  });
});

describe('the table box', () => {
  it('centres and indents the way Word does', () => {
    expect(tableCss({ alignment: 'center' }).margin).toBe('0 auto');
    expect(tableCss({ alignment: 'right' }).marginLeft).toBe('auto');
    expect(tableCss({ indent: 720 }).marginLeft).toBe('36pt');
  });

  it('separates the borders only when the cells are spaced apart', () => {
    // Cells cannot be spaced while their borders are collapsed together.
    expect(tableCss({ cellSpacing: 40 }).borderCollapse).toBe('separate');
    expect(tableCss({ cellSpacing: 40 }).borderSpacing).toBe('2pt');
    expect(tableCss({}).borderCollapse).toBe('collapse');
  });
});

describe('the rules between cells', () => {
  const table = {
    borderTopStyle: 'single', borderTopWidth: 16,
    borderBottomStyle: 'single', borderBottomWidth: 16,
    borderLeftStyle: 'single', borderLeftWidth: 16,
    borderRightStyle: 'single', borderRightWidth: 16,
    borderInsideHStyle: 'single', borderInsideHWidth: 4,
    borderInsideVStyle: 'single', borderInsideVWidth: 4
  };

  it('gives an outside edge the table’s outer rule', () => {
    const corner = cellBorders(table, {}, { row: 0, column: 0, rows: 3, columns: 3 });
    expect(corner.borderTop).toBe('2pt solid currentColor');
    expect(corner.borderLeft).toBe('2pt solid currentColor');
    // The sides facing other cells take the thin inside rule.
    expect(corner.borderBottom).toBe('0.5pt solid currentColor');
    expect(corner.borderRight).toBe('0.5pt solid currentColor');
  });

  it('gives a middle cell the inside rule on every side', () => {
    const middle = cellBorders(table, {}, { row: 1, column: 1, rows: 3, columns: 3 });
    expect(Object.values(middle)).toEqual(Array(4).fill('0.5pt solid currentColor'));
  });

  it('counts a merged cell as reaching where it ends', () => {
    // A cell spanning to the last column has an outside right edge, wherever it
    // started.
    const merged = cellBorders(table, {}, { row: 0, column: 1, rows: 3, columns: 3, colspan: 2 });
    expect(merged.borderRight).toBe('2pt solid currentColor');
  });

  it('lets a cell’s own border win over both', () => {
    // A cell asking for a thick left edge should get one wherever it sits.
    const own = cellBorders(table, { borderLeftStyle: 'double', borderLeftWidth: 24 },
      { row: 1, column: 1, rows: 3, columns: 3 });
    expect(own.borderLeft).toBe('3pt double currentColor');
  });
});

describe('the margins a table gives its cells', () => {
  it('translates the table’s names into the cell’s', () => {
    // `cellMarginLeft` is what a table states; `marginLeft` is what a cell has
    expect(cellMargins({ cellMarginLeft: 108, cellMarginRight: 108 })).toEqual({
      marginLeft: 108,
      marginRight: 108
    });
  });

  it('says nothing about a side the table says nothing about', () => {
    // Silence is what lets the cell — or the stylesheet — answer instead
    expect(cellMargins({})).toEqual({});
    expect(cellMargins({ cellMarginTop: 0 })).toEqual({ marginTop: 0 });
  });
});
