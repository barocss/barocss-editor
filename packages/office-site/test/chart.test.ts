import { describe, it, expect } from 'vitest';
import {
  CHART_AGGS,
  CHART_AGG_NAMES,
  CHART_KINDS,
  CHART_KIND_NAMES,
  COUNT_FIELD,
  baselineOf,
  boundsOf,
  chartRows,
  chartShape,
  groupRows,
  numberOf,
  ticksOf
} from '../src/chart';

/**
 * **A chart, checked as arithmetic** — which is the only place it can be checked.
 *
 * Everything that can be wrong with a chart is wrong in the numbers: a bar that starts above zero, a
 * line whose points are evenly spaced when its dates are not, an axis reading `0, 0, 0` because every
 * value arrived as a string. None of it is visible in a screenshot until somebody already knows what
 * the answer should have been, and all of it is a function call away if the geometry is a function.
 */
describe('a chart’s numbers', () => {
  const rows = [
    { 이름: '문서', 가격: 9900 },
    { 이름: '덱', 가격: 12900 },
    { 이름: '사이트', 가격: 7900 }
  ];

  it('reads a cell as a number, or leaves the row out', () => {
    expect(numberOf({ 가격: 9900 }, '가격')).toBe(9900);
    /* Stored as text — a pasted column, or a document written before the kind existed. */
    expect(numberOf({ 가격: '9900' }, '가격')).toBe(9900);
    expect(numberOf({ 가격: '월 9,900원' }, '가격')).toBeUndefined();
    expect(numberOf({}, '가격')).toBeUndefined();
  });

  it('leaves a row out rather than drawing it as zero', () => {
    /*
     * Zero is a **value**. A chart that invents one says something false about a row nobody has
     * filled in — and it is the row a reader would most want to notice is missing.
     */
    const shape = chartShape([...rows, { 이름: '스위트' }], { kind: 'bar', labelBy: '이름', valueBy: '가격' });
    expect(shape.points.map((one) => one.label)).toEqual(['문서', '덱', '사이트']);
  });

  it('always keeps zero in range', () => {
    /**
     * The one decision in the axis, and the reason it is not a setting.
     *
     * An axis starting at 9,000 draws 12,900 as four times 9,900 — the oldest way there is to
     * mislead with true numbers. A reader of a page builder is not choosing an axis, they are
     * choosing a picture, and the picture has to be the honest one.
     */
    expect(boundsOf([9900, 12900, 7900])).toEqual({ low: 0, high: 12900 });
    /* Negative numbers put zero in the middle, which is what makes a loss read as one. */
    expect(boundsOf([-40, 60])).toEqual({ low: -40, high: 60 });
    /* And all-equal values still get a range, or every point lands on one line and says nothing. */
    expect(boundsOf([5, 5, 5])).toEqual({ low: 0, high: 5 });
    expect(boundsOf([0, 0])).toEqual({ low: 0, high: 1 });
    expect(boundsOf([])).toEqual({ low: 0, high: 1 });
  });

  it('numbers the axis the way a person would have written it', () => {
    /* 1, 2, 5 × a power of ten — the steps a reader recognises as *an axis* rather than as division. */
    expect(ticksOf(0, 12900)).toEqual([0, 5000, 10000]);
    expect(ticksOf(0, 10)).toEqual([0, 5, 10]);
    expect(ticksOf(0, 1)).toEqual([0, 0.5, 1]);
    expect(ticksOf(0, 40)).toEqual([0, 10, 20, 30, 40]);
    /*
     * **Fewer than asked for is the right answer**, which is the thing about this that reads as a
     * bug and is not: `want` is a *target*, and 0 · 5 · 10 is what a person writes for a range of
     * ten. Four evenly spaced numbers would be 0 · 2.5 · 5 · 7.5, which nobody writes.
     */
    expect(ticksOf(5, 5)).toEqual([5]);
  });

  it('puts a bar in the middle of its share and a line’s point on the edge', () => {
    /*
     * Two arrangements because they are two pictures: a line drawn between the middles of bars
     * starts half a bar inside its own chart, and ends half a bar short of the other side.
     */
    const bar = chartShape(rows, { kind: 'bar', labelBy: '이름', valueBy: '가격' });
    const line = chartShape(rows, { kind: 'line', labelBy: '이름', valueBy: '가격' });

    const width = bar.plot.width;
    expect(bar.points[0].x).toBeCloseTo(bar.plot.x + width / 6, 5);
    expect(line.points[0].x).toBeCloseTo(line.plot.x, 5);
    expect(line.points[2].x).toBeCloseTo(line.plot.x + width, 5);
  });

  it('draws a bigger value higher, and zero on the baseline', () => {
    const shape = chartShape(rows, { kind: 'bar', labelBy: '이름', valueBy: '가격' });
    const [문서, 덱, 사이트] = shape.points;
    /* Higher on the page is a *smaller* y — the one place a chart's arithmetic is upside down. */
    expect(덱.y).toBeLessThan(문서.y);
    expect(문서.y).toBeLessThan(사이트.y);
    /* And the largest touches the top of the plot, because the axis ends at it. */
    expect(덱.y).toBeCloseTo(shape.plot.y, 5);
    /* Zero is where a bar starts and an area closes. */
    expect(baselineOf(shape)).toBeCloseTo(shape.plot.y + shape.plot.height, 5);
  });

  it('says which row each point is, so a live page can find it again', () => {
    /*
     * The same thing a live list writes on its rows: the published page ships the drawing it already
     * made, marked, and a script rewrites the marked parts — see `live.ts`. A point that did not know
     * its row could not be rewritten.
     */
    const shape = chartShape([{ 이름: '문서' }, ...rows], { kind: 'line', labelBy: '이름', valueBy: '가격' });
    expect(shape.points.map((one) => one.row)).toEqual([1, 2, 3]);
  });

  it('names every kind it draws', () => {
    for (const one of CHART_KINDS) expect(CHART_KIND_NAMES[one], one).toBeTruthy();
    expect(Object.keys(CHART_KIND_NAMES).sort()).toEqual([...CHART_KINDS].sort());
    /* A kind this product does not draw falls back to a bar rather than to nothing at all. */
    expect(chartShape(rows, { kind: '삼차원', labelBy: '이름', valueBy: '가격' }).kind).toBe('bar');
  });
});

/**
 * **묶어서 세기**, checked as arithmetic — which is the only honest place, because every way a
 * grouped chart lies is a way it counted wrong.
 */
describe('grouping', () => {
  const rows = [
    { 분류: '제품', 가격: 9900, 이름: '문서' },
    { 분류: '제품', 가격: 12900, 이름: '덱' },
    { 분류: '제품', 가격: 7900, 이름: '사이트' },
    { 분류: '묶음', 가격: 19900, 이름: '스위트' }
  ];

  it('makes one row per group, in the order the groups were first seen', () => {
    /*
     * Not alphabetical. A dataset a person curates is already in an order they chose, and re-sorting
     * it would answer a question nobody asked — sorting is `sortBy`'s job, on what comes out of here.
     */
    const { rows: made, valueBy } = groupRows(rows, { groupBy: '분류', agg: 'sum', valueBy: '가격' });
    expect(made).toEqual([
      { 분류: '제품', 가격: 30700 },
      { 분류: '묶음', 가격: 19900 }
    ]);
    expect(valueBy).toBe('가격');
  });

  it('does the five a spreadsheet does', () => {
    const of = (agg: string) => groupRows(rows, { groupBy: '분류', agg, valueBy: '가격' }).rows[0]['가격'];
    expect(of('sum')).toBe(30700);
    expect(of('avg')).toBeCloseTo(30700 / 3, 6);
    expect(of('min')).toBe(7900);
    expect(of('max')).toBe(12900);
  });

  it('counts rows, and gives the count a column of its own', () => {
    /*
     * 개수 is the one aggregate that asks nothing of the value column — which is what makes 월별 글
     * 수 possible at all. Its own column rather than overwriting the value's, so counting and summing
     * are the same shape with a different name in `valueBy`, and the drawing says which.
     */
    const { rows: made, valueBy } = groupRows(rows, { groupBy: '분류', agg: 'count', valueBy: '가격' });
    expect(valueBy).toBe(COUNT_FIELD);
    expect(made).toEqual([
      { 분류: '제품', 개수: 3 },
      { 분류: '묶음', 개수: 1 }
    ]);
  });

  it('counts a blank row and leaves it out of the arithmetic', () => {
    /*
     * A row that did not say what it was worth is still a row. Treating the blank as a zero would
     * move an average — which is the way this kind of chart most often lies, and the reason the two
     * are counted separately.
     */
    const withBlank = [...rows, { 분류: '제품', 이름: '미정' }];
    expect(groupRows(withBlank, { groupBy: '분류', agg: 'count', valueBy: '가격' }).rows[0]['개수']).toBe(4);
    expect(groupRows(withBlank, { groupBy: '분류', agg: 'avg', valueBy: '가격' }).rows[0]['가격']).toBeCloseTo(
      30700 / 3,
      6
    );
  });

  it('says zero for a group whose column is empty, rather than dropping it', () => {
    /* Dropping it would hide that the rows exist, which is usually the thing worth seeing. */
    const none = [{ 분류: '미정', 이름: '가' }];
    expect(groupRows(none, { groupBy: '분류', agg: 'sum', valueBy: '가격' }).rows).toEqual([{ 분류: '미정', 가격: 0 }]);
  });

  it('draws the rows themselves when nothing says to group', () => {
    // Not an error — it is what a chart did before this existed, and what most charts want.
    expect(groupRows(rows, { agg: 'sum', valueBy: '가격' }).rows).toBe(rows);
  });

  it('filters, then groups, then sorts and limits', () => {
    /**
     * The order, and it is the reason `chartRows` exists rather than a call to `rowsOf`.
     *
     * *상위 한 분류* means group first and take one of the **groups**. `rowsOf`'s own order — filter,
     * sort, limit — would take one row and then group that, which is a different question said with
     * the same words.
     */
    const asked = chartRows({ records: rows } as never, {
      groupBy: '분류',
      agg: 'sum',
      valueBy: '가격',
      sortBy: '가격',
      sortDir: 'desc',
      limit: 1
    });
    expect(asked.rows).toEqual([{ 분류: '제품', 가격: 30700 }]);

    /* And the filter runs on the **raw** rows, which is the only place 이름 still exists. */
    const one = chartRows({ records: rows } as never, {
      groupBy: '분류',
      agg: 'count',
      where: '이름',
      equals: '덱'
    });
    expect(one.rows).toEqual([{ 분류: '제품', 개수: 1 }]);
  });

  it('names every aggregate it offers', () => {
    for (const one of CHART_AGGS) expect(CHART_AGG_NAMES[one], one).toBeTruthy();
    expect(Object.keys(CHART_AGG_NAMES).sort()).toEqual([...CHART_AGGS].sort());
    /* One this product does not do falls back to a sum rather than to nothing. */
    expect(groupRows(rows, { groupBy: '분류', agg: '중앙값', valueBy: '가격' }).rows[0]['가격']).toBe(30700);
  });
});
