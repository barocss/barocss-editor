/**
 * Tab stops.
 *
 * A tab is not a character of a particular width — it is an instruction to move
 * to the next stop. Which is why `tab-size` in CSS cannot express one: that sets
 * how many spaces a tab is worth, and a stop is a *position*. Everything a Word
 * document uses tabs for depends on the position: a header with a name on the
 * left and a title on the right, a contents line with a page number at the
 * margin, a form with aligned columns.
 *
 * So a tab's width has to be measured — where the tab happens to sit decides how
 * far it must stretch — which makes this the same shape of problem as
 * pagination, and it is solved the same way: a pure function here, and a layout
 * pass that measures the page and asks it.
 *
 * Positions are twips in the document, because that is what a .docx stores, and
 * pixels once anything has been measured. Every function here takes pixels and
 * the caller converts, so that no arithmetic in this file has to remember which
 * unit it is in.
 */

/** Where the text after the tab sits relative to the stop. */
export type TabAlign = 'left' | 'center' | 'right' | 'decimal' | 'bar';

/** What fills the space the tab crosses. */
export type TabLeader = 'none' | 'dot' | 'hyphen' | 'underscore';

export interface TabStop {
  /** Distance from the start of the text area. Twips in a document. */
  pos: number;
  align?: TabAlign;
  leader?: TabLeader;
}

/**
 * How far apart the stops are when a paragraph names none of its own.
 *
 * Half an inch, which is Word's default and the same step the indent button
 * moves a paragraph — a tab and an indent agreeing is not a coincidence, it is
 * what makes a tabbed line and an indented one line up.
 */
export const DEFAULT_TAB_INTERVAL = 720;

/** The stops a resolved paragraph format names, in order and without duplicates. */
export function tabStopsOf(format: { tabs?: unknown } | undefined): TabStop[] {
  const raw = format?.tabs;
  if (!Array.isArray(raw)) return [];

  const stops: TabStop[] = [];
  for (const entry of raw) {
    const pos = typeof entry?.pos === 'number' ? entry.pos : Number.NaN;
    if (!Number.isFinite(pos) || pos < 0) continue;
    stops.push({ pos, align: entry.align ?? 'left', leader: entry.leader ?? 'none' });
  }
  return stops.sort((a, b) => a.pos - b.pos);
}

export interface ResolvedTab {
  /** How wide the tab element has to be. Never negative. */
  width: number;
  align: TabAlign;
  leader: TabLeader;
  /** Where the stop it reached is, for a caller that wants to check. */
  stop: number;
}

/**
 * Resolve one tab: how wide it has to be for what follows to meet its stop.
 *
 * `x` is where the tab starts and `followingWidth` is how wide the text between
 * it and the next tab is — which only matters when the stop is not left
 * aligned, because a right stop is a promise about where that text *ends*.
 *
 * A tab never moves backwards. If the text is too wide to fit before the stop,
 * Word goes on to the next one, and so does this: that is why the search is a
 * loop rather than a lookup. Past the last named stop the default interval takes
 * over, and past the end of the line the tab simply stops growing — a tab that
 * pushed the line wider than the page would move text off the paper.
 */
export function resolveTab(
  x: number,
  followingWidth: number,
  stops: TabStop[],
  options: { interval: number; limit: number }
): ResolvedTab {
  const { interval, limit } = options;

  const widthTo = (stop: number, align: TabAlign): number => {
    switch (align) {
      case 'right':
        return stop - x - followingWidth;
      case 'center':
        return stop - x - followingWidth / 2;
      // A bar stop draws a vertical rule and does not advance the text; treated
      // as left so the line still moves on rather than collapsing.
      default:
        return stop - x;
    }
  };

  for (const stop of stops) {
    if (stop.pos <= x) continue;
    const width = widthTo(stop.pos, stop.align ?? 'left');
    if (width < 0) continue;
    return {
      width,
      align: stop.align ?? 'left',
      leader: stop.leader ?? 'none',
      stop: stop.pos
    };
  }

  // The default stops, which run to the end of the line. `interval` of zero
  // would loop forever, and a document is allowed to say zero.
  if (interval > 0) {
    const last = stops.length > 0 ? stops[stops.length - 1].pos : 0;
    const first = Math.max(x, last);
    for (let stop = Math.floor(first / interval) * interval + interval; stop <= limit; stop += interval) {
      if (stop <= x) continue;
      return { width: stop - x, align: 'left', leader: 'none', stop };
    }
  }

  // Nowhere left to go: the tab reaches the end of the line and no further.
  return { width: Math.max(0, limit - x), align: 'left', leader: 'none', stop: limit };
}

/** The CSS a leader is drawn with, or nothing for a tab that crosses blank space. */
export function leaderStyle(leader: TabLeader): Record<string, string> {
  switch (leader) {
    case 'dot':
      return { borderBottom: '1px dotted currentColor' };
    case 'hyphen':
      return { borderBottom: '1px dashed currentColor' };
    case 'underscore':
      return { borderBottom: '1px solid currentColor' };
    default:
      return {};
  }
}
