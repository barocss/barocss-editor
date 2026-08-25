/**
 * The ruler, as arithmetic.
 *
 * A ruler is the only place a reader can put a tab stop, and the only place the
 * two indents that are not a single number — a first line, and a hanging one —
 * can be seen at all. Everything it draws is a position along the text area, and
 * everything it sets is a position in the document, so the whole of it is a
 * conversion between two scales plus the rules for what may sit where.
 *
 * Pure, like `tabs.ts` and `pagination.ts`, and for the same reason: the browser
 * is needed to say how wide the text area is on screen and for nothing else.
 * Everything here can be checked in milliseconds against numbers, which is where
 * every rule about a document belongs.
 */
import { DEFAULT_TAB_INTERVAL, type TabAlign, type TabLeader, type TabStop } from '@barocss/office-text';

/** A twip is a twentieth of a point, so an inch is 1440 of them. */
export const TWIPS_PER_INCH = 1440;

/**
 * What a tab stop cycles through when a reader clicks one.
 *
 * Word's own order, and `bar` is left out: it draws a vertical line rather than
 * positioning text, so a reader who clicked past `decimal` expecting to come
 * back to `left` would get a line instead.
 */
export const TAB_ALIGN_CYCLE: TabAlign[] = ['left', 'center', 'right', 'decimal'];

/** The scale a ruler is drawn against: the text area, in twips. */
export interface RulerScale {
  /** Width of the text area — the page less its two margins. */
  contentWidth: number;
  /** Width of one screen pixel's worth, for turning a click into a position. */
  pixelsWide: number;
}

/** Where a position in the document sits along the ruler, in pixels. */
export function toPixels(twips: number, scale: RulerScale): number {
  if (scale.contentWidth <= 0) return 0;
  return (twips / scale.contentWidth) * scale.pixelsWide;
}

/** Where a point on the ruler sits in the document, in twips. */
export function toTwips(pixels: number, scale: RulerScale): number {
  if (scale.pixelsWide <= 0) return 0;
  return (pixels / scale.pixelsWide) * scale.contentWidth;
}

/**
 * The nearest position a stop may take.
 *
 * Word snaps to an eighth of an inch while dragging, which is fine enough that a
 * reader can put a stop where they meant to and coarse enough that two stops
 * meant to line up actually do. A document may hold any position — this is what
 * a *reader* can produce, not what is legal.
 */
export const SNAP = TWIPS_PER_INCH / 8;

export function snap(twips: number): number {
  return Math.max(0, Math.round(twips / SNAP) * SNAP);
}

/** Every mark to draw along the ruler, and what each one is. */
export interface RulerTicks {
  /** Inch boundaries, which carry a number. */
  major: { at: number; inch: number }[];
  /** Eighths between them, which do not. */
  minor: number[];
}

/**
 * The ticks for a text area of a given width.
 *
 * Numbered by the inch and divided into eighths, which is what a Word ruler
 * shows — an inch is the unit every default in a Word document is a fraction of.
 */
export function ticksFor(contentWidth: number): RulerTicks {
  const major: { at: number; inch: number }[] = [];
  const minor: number[] = [];
  for (let at = 0; at <= contentWidth; at += SNAP) {
    if (at % TWIPS_PER_INCH === 0) major.push({ at, inch: at / TWIPS_PER_INCH });
    else minor.push(at);
  }
  return { major, minor };
}

/**
 * The stops a paragraph shows, its own and the defaults behind them.
 *
 * A paragraph that names no stops still tabs to every half inch, and a reader
 * looking at the ruler has to be able to tell the two apart: one is theirs to
 * move and the other is what happens in its absence. Word draws the defaults as
 * faint ticks below the line and its own as marks on it.
 *
 * A default is only shown past the last stop the paragraph names. Word drops the
 * ones before it, because naming a stop is saying where the tabs go from the
 * left margin up to it.
 */
export function stopsToDraw(
  own: TabStop[],
  contentWidth: number,
  interval = DEFAULT_TAB_INTERVAL
): { own: TabStop[]; defaults: number[] } {
  const sorted = [...own].sort((a, b) => a.pos - b.pos);
  const last = sorted.length > 0 ? sorted[sorted.length - 1].pos : 0;
  const defaults: number[] = [];
  if (interval > 0) {
    for (let at = interval; at <= contentWidth; at += interval) {
      if (at > last) defaults.push(at);
    }
  }
  return { own: sorted, defaults };
}

/**
 * The stop a click at this position lands on, if any.
 *
 * Within a few pixels, because a mark is a few pixels wide and a reader aiming
 * at one should not have to hit its centre.
 */
export function stopAt(
  stops: TabStop[],
  twips: number,
  scale: RulerScale,
  tolerancePx = 6
): TabStop | undefined {
  let nearest: TabStop | undefined;
  let best = Infinity;
  for (const stop of stops) {
    const away = Math.abs(toPixels(stop.pos, scale) - toPixels(twips, scale));
    if (away <= tolerancePx && away < best) {
      best = away;
      nearest = stop;
    }
  }
  return nearest;
}

/**
 * Adding a stop, moving one, or taking one off — the list a paragraph should
 * carry afterwards.
 *
 * Kept sorted and free of duplicates, because two stops at the same position are
 * one stop the reader cannot tell apart or get rid of. `to: null` removes.
 */
export function withStop(
  stops: TabStop[],
  from: number | null,
  to: number | null,
  attributes?: { align?: TabAlign; leader?: TabLeader }
): TabStop[] {
  const kept = stops.filter((stop) => stop.pos !== from);
  if (to === null) return kept.sort((a, b) => a.pos - b.pos);

  const previous = stops.find((stop) => stop.pos === from);
  const placed: TabStop = {
    pos: snap(to),
    align: attributes?.align ?? previous?.align ?? 'left',
    leader: attributes?.leader ?? previous?.leader ?? 'none'
  };
  return [...kept.filter((stop) => stop.pos !== placed.pos), placed].sort((a, b) => a.pos - b.pos);
}

/** The alignment after this one, for a reader clicking a stop to change it. */
export function nextAlign(align: TabAlign | undefined): TabAlign {
  const at = TAB_ALIGN_CYCLE.indexOf(align ?? 'left');
  return TAB_ALIGN_CYCLE[(at + 1) % TAB_ALIGN_CYCLE.length];
}

/** Where a paragraph's four indent markers sit, in twips from the text area. */
export interface IndentMarkers {
  /** Where the first line begins. */
  firstLine: number;
  /** Where every line after it begins. */
  left: number;
  /** How far the right edge is pulled in, measured from the right. */
  right: number;
}

/**
 * The three positions a ruler shows, from the four numbers a document keeps.
 *
 * `indentFirstLine` and `indentHanging` are one measurement with two names and
 * opposite signs — Word keeps them exclusive — and both are relative to
 * `indentLeft` rather than to the margin. A ruler shows absolute positions,
 * because that is what a reader drags.
 */
export function markersOf(format: Record<string, unknown> | undefined): IndentMarkers {
  const number = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

  const left = number(format?.indentLeft);
  const hanging = number(format?.indentHanging);
  const first = number(format?.indentFirstLine);

  return {
    left,
    firstLine: hanging > 0 ? left - hanging : left + first,
    right: number(format?.indentRight)
  };
}

/**
 * The attributes to write when a marker is dragged to a position.
 *
 * Dragging the left marker moves the whole paragraph, which is what Word does:
 * the first line keeps its distance from the rest rather than staying put and
 * having the relationship change under it. Dragging the first-line marker moves
 * only that, and which of the two names it takes depends on which side of the
 * left indent it lands.
 */
export function draggedTo(
  marker: 'firstLine' | 'left' | 'right',
  twips: number,
  markers: IndentMarkers
): Record<string, number | null> {
  const at = snap(twips);

  if (marker === 'right') return { indentRight: at || null };

  if (marker === 'left') {
    const offset = markers.firstLine - markers.left;
    const first = Math.max(0, at + offset);
    return {
      indentLeft: at || null,
      indentFirstLine: first > at ? first - at : null,
      indentHanging: first < at ? at - first : null
    };
  }

  return {
    indentFirstLine: at > markers.left ? at - markers.left : null,
    indentHanging: at < markers.left ? markers.left - at : null
  };
}
