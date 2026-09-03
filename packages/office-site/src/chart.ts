/**
 * **A chart, as arithmetic** — the shape a browser is handed, worked out before anything draws it.
 *
 * ## Why this is a file of numbers and not a renderer
 *
 * Everything that can be wrong with a chart is wrong in the numbers: a bar that starts above zero, a
 * line whose points are evenly spaced when its dates are not, an axis that says `0, 0, 0` because
 * every value was a string. None of that is visible in a screenshot until somebody knows what the
 * answer should have been, and all of it is checkable in milliseconds if the geometry is a function.
 *
 * So this returns **points in a box**, and the renderer turns them into an `<svg>`. The same split
 * `sizing.ts` and `page-css.ts` already make, and for the same reason.
 *
 * ## And why the published page carries no library
 *
 * `live.ts` settled this once, for lists: the export **does not ship a renderer**. It ships the
 * drawing it already made, marked, and a script that rewrites the marked parts. A chart is the same
 * shape — an `<svg>` drawn at export time, with each point saying which row and column it is — so a
 * live dashboard is the geometry re-run over new numbers, not a charting library booted in a
 * visitor's browser.
 *
 * Which is also why the geometry is **here** rather than in the renderer: the script needs the same
 * arithmetic the export ran, exactly as it needs the same filter-sort-limit.
 */
import { cellValue, rowsOf } from './data';

/** The kinds this product draws. Four, and each is a different question a dashboard asks. */
export const CHART_KINDS = ['line', 'bar', 'area', 'donut'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/** What a reader calls them. */
export const CHART_KIND_NAMES: Record<ChartKind, string> = {
  line: '꺾은선',
  bar: '막대',
  area: '영역',
  donut: '도넛'
};

/** The box a chart is drawn in, in the SVG's own units. */
export const CHART_BOX = { width: 320, height: 180 } as const;

/** Room for the labels, which is the one thing a chart cannot be drawn without knowing. */
const PAD = { top: 8, right: 8, bottom: 20, left: 34 } as const;

export interface ChartPoint {
  /** Which row this came from, so a live update can find it again. */
  row: number;
  /** What the reader reads under it. */
  label: string;
  /** What it is worth. */
  value: number;
  /** Where it is drawn, in the box. */
  x: number;
  y: number;
}

export interface ChartShape {
  kind: ChartKind;
  points: ChartPoint[];
  /** The plot area — the box less the room the labels take. */
  plot: { x: number; y: number; width: number; height: number };
  /** The value axis, always **including zero** — see `boundsOf`. */
  low: number;
  high: number;
  /** The ticks the value axis draws, low to high. */
  ticks: number[];
}

/** A cell as a number, or nothing — which is what a chart can do with `아니오`. */
export function numberOf(record: Record<string, unknown> | undefined, field: string): number | undefined {
  const value = record?.[field];
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const said = cellValue(record, field).trim();
  if (!said) return undefined;
  const asNumber = Number(said);
  return Number.isFinite(asNumber) ? asNumber : undefined;
}

/**
 * The value axis, and the one decision in it: **zero is always in range**.
 *
 * A bar chart whose axis starts at 900 draws a 910 as ten times a 901, which is the oldest way there
 * is to mislead with a true number — and the reason every guide on the subject says the same thing.
 * A line chart is the case where zooming in is legitimate, and it is *still* refused here: a page
 * builder's reader is not choosing an axis, they are choosing a picture, and the picture has to be
 * the honest one by default.
 *
 * All-equal values get a range anyway, or every point lands on one line and the chart says nothing.
 */
export function boundsOf(values: number[]): { low: number; high: number } {
  const real = values.filter((one) => Number.isFinite(one));
  if (real.length === 0) return { low: 0, high: 1 };

  let low = Math.min(0, ...real);
  let high = Math.max(0, ...real);
  if (low === high) high = low + 1;
  return { low, high };
}

/** Four ticks and the ends, rounded to something a person would have written. */
export function ticksOf(low: number, high: number, want = 4): number[] {
  const span = high - low;
  if (!Number.isFinite(span) || span <= 0) return [low];

  /* 1, 2, 5 × a power of ten — the steps a reader recognises as *the axis*, not as arithmetic. */
  const rough = span / want;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((one) => one * power).find((one) => one >= rough) ?? power * 10;

  const out: number[] = [];
  for (let at = Math.ceil(low / step) * step; at <= high + step / 1000; at += step) {
    out.push(Number(at.toPrecision(12)));
  }
  return out;
}

/**
 * **묶어서 세기** — the other half of what a dashboard asks, and it is a **declaration**.
 *
 * A dashboard's question is almost never *show me every row*. It is 분류별 합계, 월별 개수, 팀별
 * 평균 — group by one column, and do one arithmetic to another.
 *
 * ## Why two attributes and not an expression
 *
 * This schema has refused a language once already, in the same place: a list's filter is `where` and
 * `equals`, two attributes, and the recorded reason is that an expression is a grammar with an error
 * message and a thing to learn, and every builder that started with one arrived at a row of pickers
 * anyway. The argument applies with more force here — a reader choosing 분류별 합계 is making two
 * choices, and a formula box would ask them to spell it.
 *
 * Five, and they are the five every spreadsheet has. 개수 is the one that needs no value column at
 * all, and it is the one that makes 월별 글 수 possible.
 */
export const CHART_AGGS = ['sum', 'avg', 'count', 'min', 'max'] as const;
export type ChartAgg = (typeof CHART_AGGS)[number];

export const CHART_AGG_NAMES: Record<ChartAgg, string> = {
  sum: '합계',
  avg: '평균',
  count: '개수',
  min: '최소',
  max: '최대'
};

/** What a counted column is called when there is no value column to name. */
export const COUNT_FIELD = '개수';

/**
 * Rows **grouped**, each group one row.
 *
 * Order is the order the groups were **first seen**, which is the honest default: a dataset a person
 * curates is already in an order they chose, and re-sorting it alphabetically would answer a
 * question nobody asked. Sorting is `sortBy`'s job and it works on what comes out of here — the
 * grouped rows have exactly two columns, so *by name* and *by size* are the two things it can mean,
 * which is the whole vocabulary a grouped chart needs.
 *
 * A row whose value is not a number is **left out of the arithmetic** and still **counted**: it did
 * not say what it was worth, and pretending it said zero would move an average. 개수 is the one
 * aggregate that asks nothing of the value column, which is why it is the one that always answers.
 */
export function groupRows(
  rows: Record<string, unknown>[],
  said: { groupBy?: unknown; agg?: unknown; valueBy?: unknown }
): { rows: Record<string, unknown>[]; valueBy: string } {
  const groupBy = typeof said.groupBy === 'string' ? said.groupBy : '';
  const agg = CHART_AGGS.includes(said.agg as ChartAgg) ? (said.agg as ChartAgg) : 'sum';
  const valueBy = typeof said.valueBy === 'string' ? said.valueBy : '';

  /* Nothing to group by is not an error: the chart draws the rows themselves, which is what it did. */
  if (!groupBy) return { rows, valueBy };

  const into = new Map<string, { rows: number; said: number[] }>();
  for (const row of rows) {
    const key = cellValue(row, groupBy);
    const held = into.get(key) ?? { rows: 0, said: [] };
    /* Counted whatever it holds — a row is a row even when its value column is blank. */
    held.rows += 1;
    const value = numberOf(row, valueBy);
    if (value !== undefined) held.said.push(value);
    into.set(key, held);
  }

  /*
   * **개수 gets a column of its own** rather than overwriting the value column, so a chart counting
   * rows and a chart summing them are the same shape with a different name in `valueBy` — and the
   * drawing says which, in `data-value-by`, which is what a live page reads.
   */
  const out = agg === 'count' ? COUNT_FIELD : valueBy || COUNT_FIELD;

  const made = [...into.entries()].map(([key, held]) => ({
    [groupBy]: key,
    [out]: aggregate(agg, held.rows, held.said)
  }));

  return { rows: made, valueBy: out };
}

/** One group's answer. Separated because it is the part a reader of this file will want to check. */
function aggregate(agg: ChartAgg, rows: number, said: number[]): number {
  if (agg === 'count') return rows;
  /*
   * **Zero when nothing said a number**, and that is a choice rather than an accident: a group whose
   * value column is empty has no sum, no average and no smallest — and a chart that omitted the
   * group entirely would hide that the rows exist, which is usually the thing worth seeing.
   */
  if (said.length === 0) return 0;
  if (agg === 'sum') return said.reduce((total, one) => total + one, 0);
  /* Over the rows that **said** a value, not over every row — a blank is not a zero. */
  if (agg === 'avg') return said.reduce((total, one) => total + one, 0) / said.length;
  return agg === 'min' ? Math.min(...said) : Math.max(...said);
}

/**
 * The rows a chart draws, and **in what order the query runs**.
 *
 * Filter, then **group**, then sort and limit — and the middle step is why this exists rather than
 * the chart simply calling `rowsOf`. *상위 세 분류* means group first and take three of the groups;
 * `rowsOf`'s own order (filter, sort, limit) would take three rows and then group those, which is a
 * different question with the same words.
 *
 * Both halves are `rowsOf`, called twice, and that is deliberate: the sort that compares numbers as
 * numbers and strings by locale is one implementation, and a chart quietly growing a second one is
 * how a bar chart ends up ordering 12,900 before 9,900. What is asked of it differs — the filter
 * belongs to the raw rows, the sort and the limit to the groups.
 */
export function chartRows(
  dataset: { records: Record<string, unknown>[] } | undefined,
  said: Record<string, unknown>
): { rows: Record<string, unknown>[]; valueBy: string } {
  const raw = dataset?.records ?? [];
  const grouped = groupRows(rowsOf({ records: raw } as never, { where: said.where, equals: said.equals }), said);

  return {
    rows: rowsOf({ records: grouped.rows } as never, {
      sortBy: said.sortBy,
      sortDir: said.sortDir,
      limit: said.limit
    }),
    valueBy: grouped.valueBy
  };
}

/**
 * The whole shape, from rows.
 *
 * `rows` rather than a dataset, because **what to draw is already decided by then**: `rowsOf` has
 * filtered, sorted and limited, and a chart drawing a different set from the list beside it would be
 * two answers to one question.
 *
 * A row whose value is not a number is **left out** rather than drawn as zero. Zero is a value, and a
 * chart that invents it says something false about a row that simply has not been filled in.
 */
export function chartShape(
  rows: Record<string, unknown>[],
  said: { kind?: unknown; labelBy?: unknown; valueBy?: unknown }
): ChartShape {
  const kind = CHART_KINDS.includes(said.kind as ChartKind) ? (said.kind as ChartKind) : 'bar';
  const labelBy = typeof said.labelBy === 'string' ? said.labelBy : '';
  const valueBy = typeof said.valueBy === 'string' ? said.valueBy : '';

  const found = rows
    .map((row, index) => ({ row: index, label: cellValue(row, labelBy), value: numberOf(row, valueBy) }))
    .filter((one): one is { row: number; label: string; value: number } => one.value !== undefined);

  const { low, high } = boundsOf(found.map((one) => one.value));
  const plot = {
    x: PAD.left,
    y: PAD.top,
    width: Math.max(1, CHART_BOX.width - PAD.left - PAD.right),
    height: Math.max(1, CHART_BOX.height - PAD.top - PAD.bottom)
  };

  /*
   * **A donut has no axis**, so its points carry the value and the renderer turns them into angles:
   * the arithmetic that is about *this drawing* stays with the drawing, and what belongs here is
   * what every kind shares — which row, what it says, what it is worth.
   */
  const span = high - low || 1;
  const step = found.length > 1 ? plot.width / (found.length - 1) : 0;

  const points: ChartPoint[] = found.map((one, index) => ({
    ...one,
    /*
     * A **bar** sits in the middle of its share of the width; a line's point sits on the edge, so the
     * first and last touch the axis ends. Two arrangements because they are two pictures — a line
     * between the middles of bars is a line that starts a bar's width inside its own chart.
     */
    x:
      kind === 'bar'
        ? plot.x + (plot.width / found.length) * (index + 0.5)
        : plot.x + (found.length > 1 ? step * index : plot.width / 2),
    y: plot.y + plot.height - ((one.value - low) / span) * plot.height
  }));

  return { kind, points, plot, low, high, ticks: ticksOf(low, high) };
}

/** Where zero sits, which is where a bar starts and an area's fill closes. */
export function baselineOf(shape: ChartShape): number {
  const span = shape.high - shape.low || 1;
  return shape.plot.y + shape.plot.height - ((0 - shape.low) / span) * shape.plot.height;
}
