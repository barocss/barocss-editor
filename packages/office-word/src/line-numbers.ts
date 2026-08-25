/**
 * Numbers down the margin, one per line of text.
 *
 * A contract or a statute is quoted by line — "page 4, line 17" — so the numbers
 * are part of what the document is for, not decoration. Word puts them in the
 * section's page setup because the count is a property of the page: it can
 * restart on every page, once per section, or run to the end of the document.
 *
 * Nothing here touches the DOM. Where each line sits is arithmetic over what the
 * paginator already decided — which lines are on which page, and how tall each
 * of them is — so the counting can be pinned in a test with synthetic heights,
 * which is the only way to be sure that the seventeenth line is the one labelled
 * seventeen.
 *
 * **What is not numbered.** A paragraph with `suppressLineNumbers` is skipped
 * *and not counted*: Word treats it as if it were not there, so a heading in the
 * middle of a numbered contract does not silently shift every number under it.
 */
import type { MeasuredBlock, Page } from './pagination';
import type { SheetMetrics } from './layout';
import type { EffectiveFormat } from '@barocss/office-text';

/** How a section numbers its lines — Word's `lnNumType`. */
export interface LineNumbering {
  /** Show a number every this many lines. Every line is 1. */
  countBy: number;
  /** The number the first counted line gets. */
  start: number;
  restart: 'newPage' | 'newSection' | 'continuous';
  /** Space between the number and the text, in twips. */
  distance: number;
}

/** One number to draw: which page, how far down the section, and what it says. */
export interface LineNumberMark {
  page: number;
  /** Distance from the top of the section, in px — the sheets' own coordinates. */
  top: number;
  number: number;
}

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Word's default distance, which is what `auto` means: a quarter of an inch. */
const DEFAULT_DISTANCE = 360;

/**
 * What a section asks for, or nothing.
 *
 * A document that does not number its lines has no `lnNumType` at all, so a
 * missing count is the switch: there is no "off" to record.
 */
export function lineNumberingOf(format: EffectiveFormat): LineNumbering | undefined {
  const countBy = num(format.lineNumberingCountBy);
  if (countBy === undefined || countBy < 1) return undefined;

  const restart = format.lineNumberingRestart;
  return {
    countBy: Math.floor(countBy),
    start: Math.max(1, Math.floor(num(format.lineNumberingStart) ?? 1)),
    restart:
      restart === 'newPage' || restart === 'continuous' || restart === 'newSection'
        ? restart
        : 'newPage',
    distance: num(format.lineNumberingDistance) ?? DEFAULT_DISTANCE
  };
}

export interface LineNumberOptions {
  pages: Page[];
  blocks: MeasuredBlock[];
  metrics: SheetMetrics;
  numbering: LineNumbering;
  /** Blocks whose lines are neither numbered nor counted. */
  suppressed?: Set<string>;
  /** The number to carry in from the section before, for `continuous`. */
  from?: number;
}

/**
 * The numbers to draw, and the count to carry into the next section.
 *
 * The vertical arithmetic is the paginator's own, done again: a fragment starts
 * where the one above it ended, its lines start after whatever space precedes
 * them, and each line is as tall as it was measured. Doing it here rather than
 * asking the paginator to report it keeps the paginator answering one question —
 * where the pages end — and this is the only caller that needs the rest.
 */
export function lineNumbersOf(options: LineNumberOptions): {
  marks: LineNumberMark[];
  next: number;
} {
  const { pages, blocks, metrics, numbering, suppressed, from } = options;
  const heights = new Map(blocks.map((block) => [block.sid, block]));

  // Columns are left alone. A page of two columns numbers each of them down its
  // own side, and where a column starts is decided elsewhere — see
  // `positionBySid` in layout — so numbering them from these fragments would put
  // every number down the left of the page regardless of which column it was in.
  if (metrics.columnCount > 1) return { marks: [], next: numbering.start };

  const marks: LineNumberMark[] = [];
  let counter = numbering.restart === 'continuous' ? (from ?? numbering.start) : numbering.start;

  for (const page of pages) {
    if (numbering.restart === 'newPage') counter = numbering.start;

    let y = page.index * (metrics.height + metrics.gap) + metrics.marginTop;

    for (const [at, fragment] of page.fragments.entries()) {
      const block = heights.get(fragment.sid);
      const skip = !block || suppressed?.has(fragment.sid);

      if (!skip) {
        // The space above the block belongs to the block and not to its first
        // line — and it is only there at all when the block starts here and the
        // page did not.
        let top = y + (fragment.fromLine === 0 && at > 0 ? (block.spaceBefore ?? 0) : 0);
        for (let line = fragment.fromLine; line < fragment.toLine; line++) {
          // Word puts the number against the line it counts, not against the
          // middle of it: the number and the line share a baseline.
          if (counter % numbering.countBy === 0) {
            marks.push({ page: page.index, top, number: counter });
          }
          top += block.lines[line] ?? 0;
          counter++;
        }
      }

      y += fragment.height;
    }
  }

  return { marks, next: counter };
}
