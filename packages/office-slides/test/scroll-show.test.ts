import { describe, it, expect } from 'vitest';
import {
  scrollAt,
  scrollHeight,
  scrollStretches,
  scrollTopOf,
  scrollStops,
  scrollToStop,
  PER_PRESS
} from '../src/scroll-show';

/**
 * Showing a deck by scrolling it.
 *
 * The whole design is one sentence: **a scroll is a playhead.** `showing()` already had four
 * ways to watch one slide — presenting, going back, previewing, scrubbing — and a scroll is a
 * fifth that is scrubbing with a different input device. So what is tested here is only the
 * arithmetic that turns an offset into "which slide, which press, how far in".
 */
describe('a deck laid out for scrolling', () => {
  const VIEW = 800;
  const STEP = Math.round(VIEW * PER_PRESS);

  const deck = [
    { sid: 'a', presses: 0 },
    { sid: 'b', presses: 2 },
    { sid: 'c', presses: 0 }
  ];

  it('gives every slide a view of its own, and each build its own scrolling', () => {
    const stretches = scrollStretches(deck, VIEW);
    expect(stretches[0]).toEqual({ sid: 'a', from: 0, to: VIEW, presses: 0 });
    // Two builds: two steps of scrolling, *plus* the view at the end — the room to read the
    // finished slide before the next one arrives.
    expect(stretches[1]).toEqual({
      sid: 'b',
      from: VIEW,
      to: VIEW + VIEW + 2 * STEP,
      presses: 2
    });
    expect(scrollHeight(stretches)).toBe(stretches[2].to);
  });

  it('shows the first slide as it was drawn', () => {
    const stretches = scrollStretches(deck, VIEW);
    // Press 0 with a fraction of 1 is the honest way to say "nothing has started".
    expect(scrollAt(0, stretches, VIEW)).toEqual({ sid: 'a', press: 0, fraction: 1 });
    expect(scrollAt(VIEW - 1, stretches, VIEW)).toEqual({ sid: 'a', press: 0, fraction: 1 });
  });

  it('plays a build as the scroll moves through it', () => {
    const stretches = scrollStretches(deck, VIEW);
    const start = VIEW;

    // The first build begins at once, and is half way half way through its step.
    expect(scrollAt(start, stretches, VIEW)).toEqual({ sid: 'b', press: 1, fraction: 0 });
    const half = scrollAt(start + STEP / 2, stretches, VIEW)!;
    expect(half.press).toBe(1);
    expect(half.fraction).toBeCloseTo(0.5, 1);

    // And the second is the next step along.
    expect(scrollAt(start + STEP, stretches, VIEW)?.press).toBe(2);
  });

  it('holds the slide finished for the room at the end', () => {
    const stretches = scrollStretches(deck, VIEW);
    const done = VIEW + 2 * STEP;
    expect(scrollAt(done, stretches, VIEW)).toEqual({ sid: 'b', press: 2, fraction: 1 });
    expect(scrollAt(done + VIEW - 1, stretches, VIEW)).toEqual({
      sid: 'b',
      press: 2,
      fraction: 1
    });
  });

  it('un-plays a build when the scroll comes back', () => {
    /*
     * The reason a scroll is a *playhead* and not a trigger: the same offset answers the
     * same thing whichever way the reader arrived at it, so scrolling back holds the build
     * half done rather than replaying it from the start.
     */
    const stretches = scrollStretches(deck, VIEW);
    const there = VIEW + Math.round(STEP * 0.3);
    const forwards = scrollAt(there, stretches, VIEW);
    expect(scrollAt(there, stretches, VIEW)).toEqual(forwards);
    expect(forwards!.fraction).toBeLessThan(0.5);
  });

  it('stays on the last slide past the end, rather than wrapping', () => {
    const stretches = scrollStretches(deck, VIEW);
    expect(scrollAt(scrollHeight(stretches) + 5000, stretches, VIEW)?.sid).toBe('c');
    // And nothing before the beginning.
    expect(scrollAt(-500, stretches, VIEW)?.sid).toBe('a');
  });

  it('answers where a slide begins, so a view can open where the reader was', () => {
    const stretches = scrollStretches(deck, VIEW);
    expect(scrollTopOf('b', stretches)).toBe(VIEW);
    // A slide that is not in the list — hidden, or from another deck — is the top.
    expect(scrollTopOf('gone', stretches)).toBe(0);
    expect(scrollTopOf(undefined, stretches)).toBe(0);
  });

  it('answers nothing for a deck with no slides in it', () => {
    expect(scrollAt(0, [], VIEW)).toBeUndefined();
    expect(scrollHeight([])).toBe(0);
  });

  it('takes a step of its own, for a caller that has measured a reader', () => {
    // The default is a fraction of the view; a caller may say otherwise, and the whole
    // layout follows from the one number.
    const tight = scrollStretches([{ sid: 'b', presses: 2 }], VIEW, 100);
    expect(tight[0].to).toBe(VIEW + 200);
    expect(scrollAt(150, tight, VIEW, 100)?.press).toBe(2);
  });
});

/**
 * What one press of a key means in a scrolling show.
 *
 * Measured before it existed: a key moved the offset by one build's worth, and on a slide
 * with *no* builds that is less than the reading room — so the first press changed nothing
 * on screen and the second moved a slide. A key that appears to do nothing is the worst
 * control there is.
 */
describe('the stops a key lands on', () => {
  const VIEW = 800;
  const STEP = Math.round(VIEW * PER_PRESS);
  const stretches = scrollStretches(
    [
      { sid: 'a', presses: 0 },
      { sid: 'b', presses: 2 }
    ],
    VIEW
  );
  const stops = scrollStops(stretches, VIEW);

  it('has one for each slide and one for each build finishing', () => {
    // `a` as drawn; `b` as drawn; `b` with its first build done; with its second done.
    expect(stops).toEqual([0, VIEW, VIEW + STEP - 1, VIEW + 2 * STEP - 1]);
  });

  it('lands on the build **finished**, which is what a press gives in a clicked show', () => {
    const at = scrollAt(stops[2], stretches, VIEW)!;
    expect(at.press).toBe(1);
    expect(at.fraction).toBeGreaterThan(0.9);
  });

  it('goes to the next one, and never nowhere', () => {
    expect(scrollToStop(0, 1, stops)).toBe(VIEW);
    expect(scrollToStop(VIEW, 1, stops)).toBe(VIEW + STEP - 1);
  });

  it('finishes the build a wheel stopped half way through', () => {
    // Strictly past the offset: a reader who scrolled into a build gets the rest of it from
    // a press, rather than being sent back to its start.
    const half = VIEW + Math.round(STEP / 2);
    expect(scrollToStop(half, 1, stops)).toBe(VIEW + STEP - 1);
    expect(scrollToStop(half, -1, stops)).toBe(VIEW);
  });

  it('stays where it is at the end, and at the top', () => {
    const last = stops[stops.length - 1];
    expect(scrollToStop(last, 1, stops)).toBe(last);
    expect(scrollToStop(0, -1, stops)).toBe(0);
  });
});
