import { describe, it, expect } from 'vitest';
import { layoutSurface, sheetMetrics } from '../src/layout';
import type { MeasuredBlock } from '../src/pagination';

/**
 * Where the blocks go, once the breaks are known.
 *
 * Single-column sections stack in normal flow and only the block opening each
 * page is moved, with a top margin. A column break is a move to the right and
 * *up*, which no margin can express, so a section running in columns positions
 * every block instead — the one case that pays for it.
 */
const block = (sid: string, lines: number): MeasuredBlock => ({
  sid,
  lines: Array(lines).fill(20)
});

describe('a single column', () => {
  const metrics = sheetMetrics({ pageHeight: 15840, marginTop: 1440, marginBottom: 1440 });

  it('moves only the block that opens each page', () => {
    const layout = layoutSurface([block('a', 60), block('b', 5)], metrics);

    expect(layout.positionBySid.size).toBe(0);
    expect(layout.pushBySid.size).toBeGreaterThan(0);
  });
});

describe('two columns', () => {
  const metrics = sheetMetrics({
    pageWidth: 12240,
    pageHeight: 15840,
    marginTop: 1440,
    marginBottom: 1440,
    marginLeft: 1440,
    marginRight: 1440,
    columnCount: 2,
    columnSpacing: 720
  });

  it('divides the text width between the columns, minus the gap', () => {
    // 8.5in less two 1in margins is 6.5in of text; a half-inch gap leaves 3in
    // per column, which is what the lines break at.
    expect(metrics.columnWidth).toBeCloseTo((624 - 48) / 2, 5);
    expect(metrics.columnCount).toBe(2);
  });

  it('positions every block rather than pushing one', () => {
    const layout = layoutSurface([block('a', 10), block('b', 10)], metrics);

    expect(layout.pushBySid.size).toBe(0);
    expect(layout.positionBySid.size).toBe(2);
  });

  it('puts the second column to the right of the first, and back at the top', () => {
    // Enough to fill one column and spill into the next
    const blocks = Array.from({ length: 12 }, (_, index) => block(`b${index}`, 5));
    const layout = layoutSurface(blocks, metrics);

    const positions = blocks
      .map((b) => layout.positionBySid.get(b.sid)!)
      .filter(Boolean);

    const lefts = [...new Set(positions.map((p) => Math.round(p.left)))];
    expect(lefts).toHaveLength(2);

    const first = positions.filter((p) => Math.round(p.left) === lefts[0]);
    const second = positions.filter((p) => Math.round(p.left) === lefts[1]);
    expect(Math.min(...second.map((p) => p.top))).toBeLessThan(
      Math.max(...first.map((p) => p.top))
    );
  });

  it('counts a page as one sheet however many columns it holds', () => {
    // Two columns of one page are two boxes to the paginator and one sheet to
    // the reader; a document that drew a sheet per column would be wrong.
    const blocks = Array.from({ length: 12 }, (_, index) => block(`b${index}`, 5));
    const layout = layoutSurface(blocks, metrics);

    expect(layout.pages.length).toBeGreaterThan(1);
    expect(layout.totalHeight).toBeLessThan(layout.pages.length * metrics.height);
  });
});

describe('the margin a binding takes', () => {
  it('is added to the edge it is on, not used instead of it', () => {
    // Word's gutter is extra room *on top of* the margin already there, which is
    // why a document with a one-inch margin and a half-inch gutter has its text
    // an inch and a half from the bound edge.
    const plain = sheetMetrics({ marginLeft: 1440, marginTop: 1440 });
    const bound = sheetMetrics({ marginLeft: 1440, marginTop: 1440, marginGutter: 720 });

    expect(bound.marginLeft - plain.marginLeft).toBe(48);
    expect(bound.marginTop).toBe(plain.marginTop);
    // Lines break at the narrower column that leaves
    expect(bound.columnWidth).toBe(plain.columnWidth - 48);
  });

  it('goes to the top for a document bound along its head', () => {
    const bound = sheetMetrics({ marginLeft: 1440, marginTop: 1440, marginGutter: 720, gutterAtTop: true });
    const plain = sheetMetrics({ marginLeft: 1440, marginTop: 1440 });

    expect(bound.marginTop - plain.marginTop).toBe(48);
    expect(bound.marginLeft).toBe(plain.marginLeft);
    // A page bound at the top holds that much less text
    expect(bound.contentHeight).toBe(plain.contentHeight - 48);
  });
});

/**
 * What has to differ for a layout to count as changed.
 *
 * The pass compares its result against the previous one to decide whether the
 * page moved. Anything a render looks different for has to be part of that
 * comparison, and a block's *position* is the half that is easiest to forget:
 * a paragraph that grows or shrinks without moving a line to another page
 * leaves every fragment exactly where it was and every page starting somewhere
 * new.
 */
describe('a layout that changed only where the blocks sit', () => {
  const metrics = sheetMetrics({ pageHeight: 15840, marginTop: 1440, marginBottom: 1440 });
  const block = (sid: string, lines: number, spaceAfter: number) => ({
    sid,
    lines: Array(lines).fill(20),
    spaceAfter
  });

  it('breaks in the same places and pushes by a different amount', () => {
    // A page that ends at a forced break rather than by filling up: changing a
    // height inside it moves no line to another page, and moves the next page's
    // first block all the same.
    const of = (spaceAfter: number) =>
      layoutSurface([block('a', 4, spaceAfter), { ...block('b', 4, 0), breakBefore: true }], metrics);

    const loose = of(40);
    const tight = of(0);
    const fragments = (layout: ReturnType<typeof layoutSurface>) =>
      layout.pages.map((page) =>
        page.fragments.map((f) => `${f.sid}:${f.fromLine}-${f.toLine}`).join(',')
      );

    // Identical by the measure the comparison used to use...
    expect(fragments(loose)).toEqual(fragments(tight));
    expect(fragments(loose)).toEqual(['a:0-4', 'b:0-4']);
    // ...and different by where the blocks were put, which is what is drawn. A
    // pass that compared only the fragments kept the old pushes against the new
    // text and drew the rest of the document above its sheet.
    expect(loose.pushBySid.get('b')).toBe(tight.pushBySid.get('b')! - 40);
  });
});
