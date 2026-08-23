import type { Guide } from './manipulate';

/**
 * The guides a reader places, as opposed to the ones a drag finds.
 *
 * ## Two kinds of guide, one kind of snapping
 *
 * `guidesFor` in `manipulate.ts` already builds a list on every drag: each other
 * shape's edges and middle, and the slide's. Those are *found* — they exist while
 * the drag lasts and describe what happens to be nearby. A reader's guide is
 * placed, kept in the document, and means "line things up **here**, on purpose".
 *
 * Nothing about the snapping needed to change for them. A `Guide` is `{ axis, at }`
 * and `snapBox` takes a list; a reader's guides are more items in that list. Which
 * is the reason this file is small: the machinery was general before there was
 * anything general to put through it.
 *
 * ## Why a reader wants them at all
 *
 * Measured against the tools this product is aimed at, and written down in the
 * audit: the deck drew snap lines while dragging and there was **nothing to
 * measure against and nothing a reader could place**. PowerPoint, Keynote and
 * Figma all have both. Found guides answer "is this aligned with that"; a placed
 * guide answers "is this where I decided things go", which is the question a
 * reader asks across a whole deck and cannot ask a found guide at all.
 *
 * ## What this file is for
 *
 * Reading them back out of a document safely, and the four small rules that make
 * a list of them behave: rounded, inside the slide, de-duplicated, and ordered so
 * that a drag can hold onto one.
 */

/** How far apart two guides have to be to be two guides: one screen pixel-ish. */
const APART = 8;

/**
 * The guides on a slide, as the snapping machinery wants them.
 *
 * Defensive about what it finds, because this comes out of a document: a deck may
 * have been written by another version, by a converter, or by hand. Anything that
 * is not a guide is dropped rather than repaired — a guide at `NaN` would draw at
 * `NaN` pixels and snap every shape to nowhere, which is much worse than a guide
 * that is missing.
 */
export function readGuides(attributes: Record<string, unknown> | undefined): Guide[] {
  const raw = attributes?.guides;
  if (!Array.isArray(raw)) return [];

  const found: Guide[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { axis, at } = entry as { axis?: unknown; at?: unknown };
    if (axis !== 'x' && axis !== 'y') continue;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    found.push({ axis, at: Math.round(at) });
  }
  return found;
}

/**
 * Where a guide put down **from the keyboard** goes.
 *
 * ## Why this is a function and not a constant
 *
 * The rulers became controls when they became something to pull a guide out of, and they
 * say so (`role="separator"` with a label) — but nothing placed one without a pointer, so
 * the reader who most needs to be told the ruler is there still could not use it.
 *
 * A key has no position, so the position has to be *decided*, and the useful answer is not
 * the middle of the slide: a reader placing a guide is almost always lining something up
 * with something they have already selected. So it is the **selection's** middle on that
 * axis, and the slide's middle when nothing is selected — which is also the answer for the
 * very first guide on an empty slide.
 *
 * Rounded, because a guide is stored rounded (`readGuides`) and a half-twip guide would be
 * a guide that never equals itself.
 */
export function guidePlace(
  axis: 'x' | 'y',
  slide: { width: number; height: number },
  selection: { x: number; y: number; width: number; height: number }[] = []
): number {
  if (selection.length === 0) {
    return Math.round((axis === 'x' ? slide.width : slide.height) / 2);
  }

  // The middle of everything selected, taken from the union rather than from an average of
  // the boxes: two shapes of different sizes have a middle that is neither of theirs.
  const from = Math.min(...selection.map((box) => (axis === 'x' ? box.x : box.y)));
  const to = Math.max(
    ...selection.map((box) => (axis === 'x' ? box.x + box.width : box.y + box.height))
  );
  return Math.round((from + to) / 2);
}

/**
 * A guide added, unless there is already one there.
 *
 * Two guides eight twips apart are one guide a reader cannot tell from the other,
 * and dragging one out of the ruler onto an existing one is the ordinary way to
 * end up with a pair — so the second is refused rather than stacked. Refused by
 * returning the list unchanged, which lets the caller say "nothing happened"
 * without comparing lengths.
 */
export function withGuide(guides: Guide[], guide: Guide): Guide[] {
  const at = Math.round(guide.at);
  const already = guides.some(
    (one) => one.axis === guide.axis && Math.abs(one.at - at) < APART
  );
  return already ? guides : [...guides, { axis: guide.axis, at }];
}

/**
 * One guide moved to a new place.
 *
 * By **index**, not by where it is now. A guide is identified by its position and
 * a drag is the one thing that changes it, so a handle that *is* the position
 * cannot survive the gesture it is needed for. The list is therefore never
 * sorted: its order is the order guides were placed, and that order is the only
 * name they have.
 *
 * A move onto another guide is allowed and left as two, unlike adding: a reader
 * dragging one guide onto another is usually passing over it.
 */
export function movedGuide(guides: Guide[], index: number, at: number): Guide[] {
  if (index < 0 || index >= guides.length) return guides;
  return guides.map((one, position) =>
    position === index ? { axis: one.axis, at: Math.round(at) } : one
  );
}

/** One guide taken away, by the same index a move uses. */
export function withoutGuide(guides: Guide[], index: number): Guide[] {
  if (index < 0 || index >= guides.length) return guides;
  return guides.filter((_, position) => position !== index);
}

/**
 * Whether a guide dragged to here should be thrown away instead.
 *
 * Every tool with guides deletes them the same way — drag it off the slide and
 * let go — because there is nowhere else for the gesture to mean anything, and a
 * reader who wants it gone is already holding it. A margin outside the edge
 * rather than the edge itself: a guide *at* zero is a guide on the slide's left
 * edge, which is a perfectly ordinary place to want one.
 */
export function guideIsDropped(
  guide: Guide,
  slide: { width: number; height: number },
  margin = 240
): boolean {
  const length = guide.axis === 'x' ? slide.width : slide.height;
  return guide.at < -margin || guide.at > length + margin;
}

/**
 * Every guide a drag on this slide should snap to: the reader's and the found
 * ones together.
 *
 * One list because `snapBox` takes one and picks the closest per axis, so the two
 * kinds compete on equal terms — which is right. A reader who placed a guide two
 * twips from a shape's edge did not mean one of them more than the other, and a
 * rule preferring either would be a rule they cannot see.
 *
 * The reader's come first, and that is not decoration: `snapBox` keeps the first
 * of two equally close candidates, so a placed guide wins a tie against a found
 * one. A tie is exactly the case where the reader's intent is the tiebreaker.
 */
export function withReaderGuides(found: Guide[], placed: Guide[]): Guide[] {
  return [...placed, ...found];
}
