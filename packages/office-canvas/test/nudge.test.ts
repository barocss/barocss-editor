import { describe, expect, it } from 'vitest';
import { NUDGE_FINE, isNudge, nudgeDelta } from '../src/canvas-manipulate';

/**
 * Three products, three command names, two payload shapes — and one gesture.
 *
 * The names stay in the products (`docs/specs/shared-layer.md`, table 2). The **shape** is what a
 * menu, a key map and the harness have to be able to say in one sentence, and it was two.
 */
describe('a nudge payload, whichever way a product spells it', () => {
  it('reads the deck’s and Word’s `{ dx, dy }` unchanged', () => {
    expect(nudgeDelta({ dx: -15, dy: 0 })).toEqual({ dx: -15, dy: 0 });
    expect(nudgeDelta({ dx: 0, dy: 144 })).toEqual({ dx: 0, dy: 144 });
  });

  it('reads the page’s `{ axis, by }` as the same thing', () => {
    expect(nudgeDelta({ axis: 'x', by: -15 })).toEqual({ dx: -15, dy: 0 });
    expect(nudgeDelta({ axis: 'y', by: 150 })).toEqual({ dx: 0, dy: 150 });
  });

  it('answers the four arrow keys the same in both spellings', () => {
    const arrows = [
      { pair: { dx: -NUDGE_FINE, dy: 0 }, axis: { axis: 'x' as const, by: -NUDGE_FINE } },
      { pair: { dx: NUDGE_FINE, dy: 0 }, axis: { axis: 'x' as const, by: NUDGE_FINE } },
      { pair: { dx: 0, dy: -NUDGE_FINE }, axis: { axis: 'y' as const, by: -NUDGE_FINE } },
      { pair: { dx: 0, dy: NUDGE_FINE }, axis: { axis: 'y' as const, by: NUDGE_FINE } }
    ];
    for (const arrow of arrows) expect(nudgeDelta(arrow.axis)).toEqual(nudgeDelta(arrow.pair));
  });

  it('says a diagonal, which `{ axis, by }` cannot', () => {
    // Not a hypothetical: it is what a second modifier on a page would mean, and the narrower
    // payload has no spelling for it at all.
    expect(nudgeDelta({ dx: 15, dy: 15 })).toEqual({ dx: 15, dy: 15 });
  });

  it('reads a missing or unusable number as no movement, which is what all three already do', () => {
    expect(nudgeDelta(undefined)).toEqual({ dx: 0, dy: 0 });
    expect(nudgeDelta({})).toEqual({ dx: 0, dy: 0 });
    expect(nudgeDelta({ dx: Number.NaN, dy: 5 })).toEqual({ dx: 0, dy: 5 });
    expect(nudgeDelta({ dx: '15' as unknown as number })).toEqual({ dx: 0, dy: 0 });
    expect(nudgeDelta({ axis: 'x', by: Number.POSITIVE_INFINITY })).toEqual({ dx: 0, dy: 0 });
  });

  it('does not read an axis it does not recognise as an axis', () => {
    expect(nudgeDelta({ axis: 'z' as unknown as 'x', by: 15 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('a nudge of nothing is not a nudge', () => {
  it('is the guard the deck grew after the harness offered the command with no payload', () => {
    expect(isNudge(undefined)).toBe(false);
    expect(isNudge({})).toBe(false);
    expect(isNudge({ dx: 0, dy: 0 })).toBe(false);
    expect(isNudge({ axis: 'x', by: 0 })).toBe(false);
  });

  it('is true for anything that would move something', () => {
    expect(isNudge({ dx: -15, dy: 0 })).toBe(true);
    expect(isNudge({ axis: 'y', by: 1 })).toBe(true);
  });
});

describe('the one step size all three agree on', () => {
  it('is 15 twips, which is a pixel', () => {
    // 1440 twips to the inch over 96 pixels to the inch. Word, the deck and the page all bind their
    // plain arrow keys to this; the coarse step is where they part company (144 against 150) and
    // that is deliberately not decided here.
    expect(NUDGE_FINE).toBe(15);
    expect(1440 / 96).toBe(NUDGE_FINE);
  });
});
