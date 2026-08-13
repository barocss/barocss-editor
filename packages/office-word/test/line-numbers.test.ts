import { describe, it, expect } from 'vitest';
import { lineNumberingOf, lineNumbersOf, type LineNumbering } from '../src/line-numbers';
import { paginate, type MeasuredBlock } from '../src/pagination';
import { sheetMetrics, type SheetMetrics } from '../src/layout';

/**
 * A statute is quoted by line, so the seventeenth line has to be the one
 * labelled seventeen. Heights are synthetic, as everywhere else in the layout
 * tests: what is being pinned is the counting and the arithmetic, and neither
 * needs a browser.
 */
const LINE = 20;

function block(sid: string, lines: number, rules: Partial<MeasuredBlock> = {}): MeasuredBlock {
  return { sid, lines: Array(lines).fill(LINE), ...rules };
}

/** A sheet with no margins and room for exactly five lines, for round numbers. */
const metrics: SheetMetrics = {
  ...sheetMetrics({ pageWidth: 12240, pageHeight: 15840, marginTop: 0, marginBottom: 0 }),
  height: 100,
  contentHeight: 100,
  marginTop: 0,
  marginBottom: 0,
  gap: 10
};

const numbering = (over: Partial<LineNumbering> = {}): LineNumbering => ({
  countBy: 1,
  start: 1,
  restart: 'newPage',
  distance: 360,
  ...over
});

function numbersFor(blocks: MeasuredBlock[], over: Partial<LineNumbering> = {}, extra = {}) {
  const pages = paginate(blocks, { contentHeight: metrics.contentHeight });
  return lineNumbersOf({ pages, blocks, metrics, numbering: numbering(over), ...extra });
}

describe('what a section asks for', () => {
  it('is off unless it says how often to count', () => {
    // A document that does not number its lines has no `lnNumType` at all, so a
    // missing count is the switch — there is no "off" to record.
    expect(lineNumberingOf({})).toBeUndefined();
    expect(lineNumberingOf({ lineNumberingStart: 5 })).toBeUndefined();
    expect(lineNumberingOf({ lineNumberingCountBy: 0 })).toBeUndefined();
  });

  it('reads the rest, and falls back the way Word does', () => {
    expect(lineNumberingOf({ lineNumberingCountBy: 5 })).toEqual({
      countBy: 5,
      start: 1,
      restart: 'newPage',
      // `auto` is a quarter of an inch, which is what Word writes when asked
      distance: 360
    });
    expect(
      lineNumberingOf({
        lineNumberingCountBy: 1,
        lineNumberingStart: 100,
        lineNumberingRestart: 'continuous',
        lineNumberingDistance: 720
      })
    ).toEqual({ countBy: 1, start: 100, restart: 'continuous', distance: 720 });
  });
});

describe('counting the lines of a section', () => {
  it('numbers every line, against the line it counts', () => {
    const { marks } = numbersFor([block('a', 3)]);

    expect(marks.map((mark) => mark.number)).toEqual([1, 2, 3]);
    // Each number sits at the top of its own line, not the middle of the block
    expect(marks.map((mark) => mark.top)).toEqual([0, 20, 40]);
  });

  it('shows only every Nth, and counts the ones it does not show', () => {
    const { marks } = numbersFor([block('a', 12, { widowControl: false })], {
      countBy: 5,
      restart: 'newSection'
    });

    expect(marks.map((mark) => mark.number)).toEqual([5, 10]);
    // The fifth line is the last of the first page; the tenth the last of the
    // second, measured from its own sheet.
    expect(marks.map((mark) => mark.top)).toEqual([80, 190]);
  });

  it('counts per page when it restarts per page, so the same number recurs', () => {
    const { marks } = numbersFor([block('a', 12, { widowControl: false })], { countBy: 5 });
    // Five lines to a page: each page reaches five and starts again
    expect(marks.map((mark) => mark.number)).toEqual([5, 5]);
    expect(marks.map((mark) => mark.page)).toEqual([0, 1]);
  });

  it('starts where the section says', () => {
    const { marks } = numbersFor([block('a', 3)], { start: 100 });
    expect(marks.map((mark) => mark.number)).toEqual([100, 101, 102]);
  });

  it('restarts on every page, which is the default', () => {
    // Ten lines over two pages of five
    const { marks } = numbersFor([block('a', 10, { widowControl: false })]);

    expect(marks.filter((mark) => mark.page === 0).map((mark) => mark.number)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(marks.filter((mark) => mark.page === 1).map((mark) => mark.number)).toEqual([
      1, 2, 3, 4, 5
    ]);
    // The second page's numbers are measured from its own sheet
    expect(marks.find((mark) => mark.page === 1)?.top).toBe(110);
  });

  it('runs through the section when told to restart per section', () => {
    const { marks } = numbersFor([block('a', 10, { widowControl: false })], {
      restart: 'newSection'
    });
    expect(marks.map((mark) => mark.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('carries the count into the next section when it is continuous', () => {
    const { marks, next } = numbersFor([block('a', 3)], { restart: 'continuous' }, { from: 8 });
    expect(marks.map((mark) => mark.number)).toEqual([8, 9, 10]);
    expect(next).toBe(11);
  });

  it('leaves a suppressed block out of the count as if it were not there', () => {
    // Word's rule, and the reason it is a rule: a heading in the middle of a
    // numbered contract must not shift every number under it.
    const blocks = [block('a', 2), block('heading', 1), block('b', 2)];
    const { marks } = numbersFor(blocks, {}, { suppressed: new Set(['heading']) });

    expect(marks.map((mark) => mark.number)).toEqual([1, 2, 3, 4]);
    // ...and the lines under it are still where they were drawn
    expect(marks.map((mark) => mark.top)).toEqual([0, 20, 60, 80]);
  });

  it('counts the space above a block as the block’s, not its first line’s', () => {
    const blocks = [block('a', 1), block('b', 2, { spaceBefore: 10 })];
    const { marks } = numbersFor(blocks);

    // The first line of `b` starts below its own space before
    expect(marks.map((mark) => mark.top)).toEqual([0, 30, 50]);
  });

  it('drops the space above a block that opens a page, as the paginator does', () => {
    const blocks = [block('a', 5), block('b', 2, { spaceBefore: 10 })];
    const { marks } = numbersFor(blocks);

    // `b` opens page two, so its space before is not drawn and its first line
    // sits at the top of the page's content area.
    expect(marks.find((mark) => mark.page === 1)?.top).toBe(110);
  });

  it('says nothing for a section in columns rather than guessing', () => {
    // Two columns number each of them down its own side, and which column a
    // fragment is in is decided elsewhere — numbering from these fragments would
    // put every number down the left of the page.
    const columned = { ...metrics, columnCount: 2 };
    const pages = paginate([block('a', 6)], { contentHeight: columned.contentHeight });
    const { marks } = lineNumbersOf({
      pages,
      blocks: [block('a', 6)],
      metrics: columned,
      numbering: numbering()
    });
    expect(marks).toEqual([]);
  });
});
