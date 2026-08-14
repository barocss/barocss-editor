import { describe, it, expect } from 'vitest';
import {
  TWIPS_PER_INCH,
  SNAP,
  toPixels,
  toTwips,
  snap,
  ticksFor,
  stopsToDraw,
  stopAt,
  withStop,
  nextAlign,
  markersOf,
  draggedTo
} from '../src/ruler';

/**
 * The ruler, checked against numbers.
 *
 * A ruler is the only place a reader can put a tab stop, and the only place the
 * two indents that are not one number — a first line, and a hanging one — can be
 * seen at all. All of it is a conversion between two scales plus rules about
 * what may sit where, so all of it can be checked here in milliseconds; the
 * browser is needed to say how wide the text area is on screen and for nothing
 * else.
 */

/** A 6.5in text area — US Letter less its two one-inch margins — 650px wide. */
const scale = { contentWidth: 6.5 * TWIPS_PER_INCH, pixelsWide: 650 };

describe('the two scales a ruler sits between', () => {
  it('puts an inch a hundred pixels along', () => {
    expect(toPixels(TWIPS_PER_INCH, scale)).toBe(100);
    expect(toPixels(0, scale)).toBe(0);
    expect(toPixels(scale.contentWidth, scale)).toBe(650);
  });

  it('reads a click back as a position in the document', () => {
    expect(toTwips(100, scale)).toBe(TWIPS_PER_INCH);
    expect(toTwips(325, scale)).toBe(scale.contentWidth / 2);
  });

  it('answers zero rather than dividing by it', () => {
    expect(toPixels(720, { contentWidth: 0, pixelsWide: 650 })).toBe(0);
    expect(toTwips(100, { contentWidth: 9360, pixelsWide: 0 })).toBe(0);
  });
});

describe('where a reader may put something', () => {
  it('snaps to an eighth of an inch', () => {
    expect(snap(180)).toBe(180);
    expect(snap(200)).toBe(180);
    expect(snap(0)).toBe(0);
    expect(snap(TWIPS_PER_INCH - 10)).toBe(TWIPS_PER_INCH);
  });

  it('never goes past the left margin', () => {
    // A stop at a negative position is one the reader cannot see or get back
    expect(snap(-500)).toBe(0);
  });
});

describe('the marks along it', () => {
  it('numbers the inches and divides them into eighths', () => {
    const ticks = ticksFor(2 * TWIPS_PER_INCH);
    expect(ticks.major.map((tick) => tick.inch)).toEqual([0, 1, 2]);
    // Seven eighths between each pair of inches
    expect(ticks.minor).toHaveLength(14);
    expect(ticks.minor[0]).toBe(SNAP);
  });
});

describe('the stops it shows', () => {
  it('draws the defaults only past the last stop the paragraph names', () => {
    // Naming a stop says where the tabs go up to it, which is Word's rule
    const drawn = stopsToDraw([{ pos: 1440 }], 4 * TWIPS_PER_INCH, 720);
    expect(drawn.own.map((stop) => stop.pos)).toEqual([1440]);
    expect(drawn.defaults).toEqual([2160, 2880, 3600, 4320, 5040, 5760]);
  });

  it('draws every default when the paragraph names none', () => {
    const drawn = stopsToDraw([], 2 * TWIPS_PER_INCH, 720);
    expect(drawn.defaults).toEqual([720, 1440, 2160, 2880]);
  });

  it('puts them in order however they arrived', () => {
    const drawn = stopsToDraw([{ pos: 2880 }, { pos: 720 }], 4 * TWIPS_PER_INCH);
    expect(drawn.own.map((stop) => stop.pos)).toEqual([720, 2880]);
  });
});

describe('aiming at a stop', () => {
  const stops = [{ pos: 1440 }, { pos: 2880 }];

  it('finds one a few pixels away, because a mark is a few pixels wide', () => {
    expect(stopAt(stops, 1440 + 20, scale)?.pos).toBe(1440);
  });

  it('finds nothing where there is nothing', () => {
    expect(stopAt(stops, 2160, scale)).toBeUndefined();
  });

  it('takes the nearer of two', () => {
    const close = [{ pos: 1440 }, { pos: 1480 }];
    expect(stopAt(close, 1470, scale)?.pos).toBe(1480);
  });
});

describe('adding, moving and removing a stop', () => {
  it('adds one, snapped and in order', () => {
    expect(withStop([{ pos: 2880 }], null, 1450).map((stop) => stop.pos)).toEqual([1440, 2880]);
  });

  it('gives a new one the left alignment Word gives it', () => {
    expect(withStop([], null, 1440)[0]).toMatchObject({ align: 'left', leader: 'none' });
  });

  it('moves one, keeping what it said about itself', () => {
    const stops = [{ pos: 1440, align: 'decimal' as const, leader: 'dot' as const }];
    expect(withStop(stops, 1440, 2880)[0]).toMatchObject({
      pos: 2880,
      align: 'decimal',
      leader: 'dot'
    });
  });

  it('removes one when it is dragged off', () => {
    expect(withStop([{ pos: 1440 }, { pos: 2880 }], 1440, null).map((s) => s.pos)).toEqual([2880]);
  });

  it('leaves one stop where two land on the same place', () => {
    // Two stops at one position is one stop the reader can neither tell apart
    // nor get rid of
    const stops = [{ pos: 1440 }, { pos: 2880 }];
    expect(withStop(stops, 2880, 1445).map((stop) => stop.pos)).toEqual([1440]);
  });

  it('cycles the alignment the way Word does, and skips the bar', () => {
    expect(nextAlign('left')).toBe('center');
    expect(nextAlign('center')).toBe('right');
    expect(nextAlign('right')).toBe('decimal');
    expect(nextAlign('decimal')).toBe('left');
    expect(nextAlign(undefined)).toBe('center');
  });
});

/**
 * The three markers, from the four numbers a document keeps.
 *
 * `indentFirstLine` and `indentHanging` are one measurement with two names and
 * opposite signs, both relative to `indentLeft` — and a ruler shows absolute
 * positions, because that is what a reader drags.
 */
describe('the indent markers', () => {
  it('puts a first-line indent to the right of the rest', () => {
    expect(markersOf({ indentLeft: 720, indentFirstLine: 360 })).toEqual({
      left: 720,
      firstLine: 1080,
      right: 0
    });
  });

  it('puts a hanging indent to the left of the rest', () => {
    expect(markersOf({ indentLeft: 720, indentHanging: 360 })).toEqual({
      left: 720,
      firstLine: 360,
      right: 0
    });
  });

  it('stacks them where a paragraph says nothing', () => {
    expect(markersOf({})).toEqual({ left: 0, firstLine: 0, right: 0 });
    expect(markersOf(undefined)).toEqual({ left: 0, firstLine: 0, right: 0 });
  });
});

describe('dragging a marker', () => {
  it('carries the first line along when the left one moves', () => {
    // Word moves the paragraph; the first line keeps its distance from the rest
    // rather than staying put and having the relationship change under it
    const markers = { left: 720, firstLine: 1080, right: 0 };
    expect(draggedTo('left', 1440, markers)).toEqual({
      indentLeft: 1440,
      indentFirstLine: 360,
      indentHanging: null
    });
  });

  it('keeps a hanging indent hanging when the left one moves', () => {
    const markers = { left: 720, firstLine: 360, right: 0 };
    expect(draggedTo('left', 1440, markers)).toEqual({
      indentLeft: 1440,
      indentFirstLine: null,
      indentHanging: 360
    });
  });

  it('turns a first-line indent into a hanging one by crossing over', () => {
    const markers = { left: 720, firstLine: 1080, right: 0 };
    expect(draggedTo('firstLine', 360, markers)).toEqual({
      indentFirstLine: null,
      indentHanging: 360
    });
  });

  it('clears both when the first line lands on the left indent', () => {
    const markers = { left: 720, firstLine: 1080, right: 0 };
    expect(draggedTo('firstLine', 720, markers)).toEqual({
      indentFirstLine: null,
      indentHanging: null
    });
  });

  it('writes null rather than zero, so the attribute goes away', () => {
    // `updateNode` suppresses a write whose fields compare equal, which makes
    // setting something to undefined a silent no-op; clearing has to be a value
    expect(draggedTo('right', 0, { left: 0, firstLine: 0, right: 720 })).toEqual({
      indentRight: null
    });
  });

  it('never drags a marker past the left margin', () => {
    const markers = { left: 720, firstLine: 720, right: 0 };
    expect(draggedTo('left', -400, markers).indentLeft).toBe(null);
  });
});
