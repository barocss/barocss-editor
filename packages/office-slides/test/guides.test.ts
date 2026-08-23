import { describe, it, expect } from 'vitest';
import {
  guideIsDropped,
  movedGuide,
  readGuides,
  withGuide,
  withReaderGuides,
  withoutGuide,
  guidePlace
} from '../src/guides';
import { guidesFor, snapBox, type Guide } from '../src/manipulate';

/**
 * The guides a reader places.
 *
 * The deck drew snap lines while dragging and there was nothing to measure
 * against and nothing a reader could place — measured in the chrome audit, and
 * the one thing on that list PowerPoint, Keynote and Figma all have.
 *
 * The snapping needed no change at all: a `Guide` is `{ axis, at }` and `snapBox`
 * takes a list, so this is about the *list* — what may be in it, and the four
 * rules that make one behave.
 */
const SLIDE = { width: 25920, height: 14580 };

describe('reading them out of a document', () => {
  it('takes the ones that are guides', () => {
    expect(readGuides({ guides: [{ axis: 'x', at: 1440 }, { axis: 'y', at: 900 }] })).toEqual([
      { axis: 'x', at: 1440 },
      { axis: 'y', at: 900 }
    ]);
  });

  it('has none when the slide says nothing', () => {
    expect(readGuides(undefined)).toEqual([]);
    expect(readGuides({})).toEqual([]);
    // Not an array is not a list of guides, however tempting it is to coerce.
    expect(readGuides({ guides: 'x:1440' })).toEqual([]);
  });

  /**
   * Dropped rather than repaired, which is the decision worth keeping.
   *
   * This comes out of a document, so it may have been written by another version,
   * a converter, or by hand. A guide at `NaN` draws at `NaN` pixels and snaps
   * every shape to nowhere — much worse than a guide that is simply missing.
   */
  it('drops anything that is not one', () => {
    expect(
      readGuides({
        guides: [
          { axis: 'x', at: 1440 },
          { axis: 'z', at: 10 },
          { axis: 'y', at: 'middle' },
          { axis: 'y', at: Number.NaN },
          { axis: 'x' },
          null,
          42,
          { axis: 'y', at: 900 }
        ]
      })
    ).toEqual([
      { axis: 'x', at: 1440 },
      { axis: 'y', at: 900 }
    ]);
  });

  it('rounds to a whole twip', () => {
    // The model's unit has no fractions, and a guide half a twip off the shape it
    // was placed against would refuse to snap to it.
    expect(readGuides({ guides: [{ axis: 'x', at: 1440.6 }] })).toEqual([{ axis: 'x', at: 1441 }]);
  });
});

describe('placing one', () => {
  it('adds it', () => {
    expect(withGuide([], { axis: 'x', at: 1440 })).toEqual([{ axis: 'x', at: 1440 }]);
  });

  /**
   * Dragging one out of the ruler onto an existing one is the ordinary way to end
   * up with a pair a reader cannot tell apart.
   */
  it('refuses one on top of another, and says so by changing nothing', () => {
    const one: Guide[] = [{ axis: 'x', at: 1440 }];
    expect(withGuide(one, { axis: 'x', at: 1444 })).toBe(one);
    expect(withGuide(one, { axis: 'x', at: 1440 })).toBe(one);
  });

  it('is per axis: a vertical and a horizontal at the same number are two', () => {
    const after = withGuide([{ axis: 'x', at: 1440 }], { axis: 'y', at: 1440 });
    expect(after).toHaveLength(2);
  });

  it('allows one far enough away', () => {
    expect(withGuide([{ axis: 'x', at: 1440 }], { axis: 'x', at: 1460 })).toHaveLength(2);
  });
});

describe('moving and removing one', () => {
  const two: Guide[] = [
    { axis: 'x', at: 1440 },
    { axis: 'y', at: 900 }
  ];

  /**
   * By index, and the list is therefore never sorted.
   *
   * A guide's only name is where it is, and a drag is the one thing that changes
   * that — so a handle that *is* the position cannot survive the gesture it is
   * needed for.
   */
  it('moves the one at that index and leaves the other', () => {
    expect(movedGuide(two, 0, 2880)).toEqual([
      { axis: 'x', at: 2880 },
      { axis: 'y', at: 900 }
    ]);
  });

  it('keeps the axis it was placed on', () => {
    // A vertical guide dragged horizontally is still vertical: the drag changes
    // where it is, never what it is.
    expect(movedGuide(two, 1, 4000)[1]).toEqual({ axis: 'y', at: 4000 });
  });

  it('allows a move onto another, unlike an add', () => {
    // A reader dragging one guide across another is usually passing over it.
    const across = movedGuide(
      [
        { axis: 'x', at: 1000 },
        { axis: 'x', at: 2000 }
      ],
      0,
      2000
    );
    expect(across).toHaveLength(2);
  });

  it('removes the one at that index', () => {
    expect(withoutGuide(two, 0)).toEqual([{ axis: 'y', at: 900 }]);
  });

  it('changes nothing for an index that is not there', () => {
    expect(movedGuide(two, 5, 100)).toBe(two);
    expect(withoutGuide(two, -1)).toBe(two);
  });
});

describe('throwing one away by dragging it off', () => {
  /**
   * Every tool with guides deletes them this way, because there is nowhere else
   * for the gesture to mean anything and the reader is already holding it.
   */
  it('is dropped past the edge, by a margin', () => {
    expect(guideIsDropped({ axis: 'x', at: -400 }, SLIDE)).toBe(true);
    expect(guideIsDropped({ axis: 'x', at: SLIDE.width + 400 }, SLIDE)).toBe(true);
    expect(guideIsDropped({ axis: 'y', at: SLIDE.height + 400 }, SLIDE)).toBe(true);
  });

  it('is kept on the edge itself', () => {
    // A guide at zero is a guide on the slide's left edge, which is an ordinary
    // place to want one — so the margin is outside the edge, not at it.
    expect(guideIsDropped({ axis: 'x', at: 0 }, SLIDE)).toBe(false);
    expect(guideIsDropped({ axis: 'x', at: SLIDE.width }, SLIDE)).toBe(false);
    expect(guideIsDropped({ axis: 'y', at: -100 }, SLIDE)).toBe(false);
  });

  it('measures the axis it is on, not the longer side', () => {
    // A horizontal guide 20,000 twips down is off a 14,580-twip slide even though
    // it would be well inside its width.
    expect(guideIsDropped({ axis: 'y', at: 20000 }, SLIDE)).toBe(true);
    expect(guideIsDropped({ axis: 'x', at: 20000 }, SLIDE)).toBe(false);
  });
});

describe('snapping to one', () => {
  const box = { x: 1500, y: 900, width: 1000, height: 500 };

  it('pulls a box onto a placed guide, through the machinery that already existed', () => {
    const placed: Guide[] = [{ axis: 'x', at: 1440 }];
    const { box: snapped, hit } = snapBox(box, withReaderGuides([], placed), 200);
    expect(snapped.x).toBe(1440);
    expect(hit).toEqual([{ axis: 'x', at: 1440 }]);
  });

  /**
   * A tie goes to the reader.
   *
   * `snapBox` keeps the first of two equally close candidates, so putting the
   * placed guides first is what decides a draw. A tie is exactly the case where
   * the reader's intent is the only tiebreaker there is — and where a rule
   * preferring the *found* guide would be a rule they cannot see.
   */
  it('prefers a placed guide to a found one at the same distance', () => {
    // A shape with no size, so every line it offers is at 1400 and there is no
    // *closer* found guide to win on distance instead. Constructed that way after
    // a first attempt where the shape's right edge sat exactly on the box and won
    // outright — which is correct behaviour and not a tie at all.
    const other = { x: 1400, y: 5000, width: 0, height: 0 };
    const found = guidesFor([other]);
    const placed: Guide[] = [{ axis: 'x', at: 1400 }];

    const { box: snapped, hit } = snapBox(box, withReaderGuides(found, placed), 200);
    expect(snapped.x).toBe(1400);

    // Checked by *identity*: the two are structurally identical, so comparing
    // values could not tell which one the drag reported — and which one it
    // reports is the whole question, because that is the line drawn on screen.
    expect(hit[0]).toBe(placed[0]);
  });

  it('leaves a box alone when the guide is out of reach', () => {
    const far: Guide[] = [{ axis: 'x', at: 9000 }];
    expect(snapBox(box, withReaderGuides([], far), 200).box.x).toBe(1500);
  });
});

/**
 * Where a guide placed **from the keyboard** goes.
 *
 * A key has no position, so the position has to be decided — and the useful answer is not
 * the middle of the slide: a reader placing a guide is nearly always lining something up
 * with what they have already selected.
 */
describe('where a keyboard-placed guide goes', () => {
  const slide = { width: 18288, height: 10287 };

  it('takes the middle of the slide when nothing is selected', () => {
    // Which is also the right answer for the first guide on an empty slide.
    expect(guidePlace('x', slide)).toBe(9144);
    expect(guidePlace('y', slide)).toBe(5144);
  });

  it('takes the middle of one selected shape', () => {
    const box = { x: 1000, y: 2000, width: 3000, height: 1000 };
    expect(guidePlace('x', slide, [box])).toBe(2500);
    expect(guidePlace('y', slide, [box])).toBe(2500);
  });

  it('takes the middle of everything selected, from the union', () => {
    /*
     * Not an average of the boxes: two shapes of different sizes have a middle that is
     * neither of theirs, and a guide down the average of two centres is a guide down
     * nothing.
     */
    const boxes = [
      { x: 0, y: 0, width: 1000, height: 1000 },
      { x: 9000, y: 0, width: 1000, height: 1000 }
    ];
    expect(guidePlace('x', slide, boxes)).toBe(5000);
  });

  it('rounds, because a guide is stored rounded', () => {
    // A half-twip guide is a guide that never equals itself — `readGuides` rounds, and
    // `withGuide` compares.
    const box = { x: 0, y: 0, width: 1001, height: 1001 };
    expect(Number.isInteger(guidePlace('x', slide, [box]))).toBe(true);
  });
});
