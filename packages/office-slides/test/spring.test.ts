import { describe, it, expect } from 'vitest';
import {
  SPRING_PRESETS,
  parseSpring,
  springCss,
  springLinearCss,
  springProgress,
  springSampleCount,
  springSamples,
  springSettling
} from '../src/spring';
import { easingCss, easingPoints } from '../src/motion-effects';

/**
 * A spring.
 *
 * The value of testing this in milliseconds rather than in a browser is that the
 * three regimes of a damped oscillator have boundaries a naive implementation
 * divides by zero at, and the interesting one — the one that bounces — is the
 * only reason to have a spring at all. None of that is visible on a slide: a
 * spring that never overshoots looks like a slow ease, which is a motion nobody
 * would call broken and nobody asked for.
 */
describe('reading a spring a document holds', () => {
  it('reads stiffness, damping and an optional mass', () => {
    expect(parseSpring('spring(180, 12)')).toEqual({ stiffness: 180, damping: 12, mass: 1 });
    expect(parseSpring('spring(180, 12, 2)')).toEqual({ stiffness: 180, damping: 12, mass: 2 });
    expect(parseSpring(' spring(1, 1) ')).toEqual({ stiffness: 1, damping: 1, mass: 1 });
  });

  /**
   * Refused rather than clamped. A stiffness of zero is a spring that never
   * pulls and a damping of zero is one that never stops — both are documents
   * saying something this cannot draw, and `easingCss` turns a refusal into
   * `ease`, which is a motion rather than a missing one.
   */
  it('refuses what is not a spring anybody could feel', () => {
    for (const value of [
      'spring(0, 12)',
      'spring(180, 0)',
      'spring(-180, 12)',
      'spring(180)',
      'spring(180, 12, 0)',
      'spring(9000, 12)',
      'cubic-bezier(0, 0, 1, 1)',
      'ease',
      '',
      undefined,
      42
    ]) {
      expect(parseSpring(value as never), String(value)).toBeUndefined();
    }
  });

  it('writes what it reads, and leaves out a mass of one', () => {
    expect(springCss({ stiffness: 180, damping: 12, mass: 1 })).toBe('spring(180, 12)');
    expect(springCss({ stiffness: 180, damping: 12, mass: 2 })).toBe('spring(180, 12, 2)');
    expect(parseSpring(springCss({ stiffness: 180, damping: 9, mass: 1 }))).toEqual({
      stiffness: 180,
      damping: 9,
      mass: 1
    });
  });
});

describe('what a spring does over time', () => {
  const bouncy = { stiffness: 180, damping: 9, mass: 1 };
  const critical = { stiffness: 100, damping: 20, mass: 1 }; // ζ = 1 exactly
  const slow = { stiffness: 100, damping: 40, mass: 1 }; // overdamped

  it('starts at rest and arrives', () => {
    for (const spring of [bouncy, critical, slow]) {
      expect(springProgress(spring, 0)).toBe(0);
      // Far enough out, every regime has settled.
      expect(springProgress(spring, 10)).toBeCloseTo(1, 5);
    }
  });

  /**
   * The whole point: an underdamped spring goes **past** its destination. A
   * bezier can do that once; this one does it several times, which is the thing
   * no easing in CSS can say.
   */
  it('overshoots, and more than once', () => {
    const samples = springSamples(bouncy, 200);
    const above = samples.filter((value) => value > 1);
    expect(above.length).toBeGreaterThan(0);
    expect(Math.max(...samples)).toBeGreaterThan(1.05);

    // Two turning points at least: past, back under, and past again.
    let crossings = 0;
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index - 1] < 1 && samples[index] >= 1) crossings += 1;
    }
    expect(crossings).toBeGreaterThanOrEqual(2);
  });

  it('never overshoots when it is critically damped or slower', () => {
    for (const spring of [critical, slow]) {
      expect(Math.max(...springSamples(spring, 200))).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The boundary case, which is where the formula divides by zero if it is
   * written in one piece: at ζ = 1 the damped frequency is 0.
   */
  it('is continuous across the critical boundary', () => {
    const at = 0.15;
    const just = springProgress({ stiffness: 100, damping: 19.99, mass: 1 }, at);
    const exact = springProgress(critical, at);
    const past = springProgress({ stiffness: 100, damping: 20.01, mass: 1 }, at);

    expect(Number.isFinite(exact)).toBe(true);
    expect(Math.abs(just - exact)).toBeLessThan(0.001);
    expect(Math.abs(past - exact)).toBeLessThan(0.001);
  });

  it('settles sooner the stiffer and the more damped it is', () => {
    expect(springSettling({ stiffness: 400, damping: 26, mass: 1 })).toBeLessThan(
      springSettling({ stiffness: 120, damping: 16, mass: 1 })
    );
    // And a heavier thing takes longer with the same spring.
    expect(springSettling({ stiffness: 180, damping: 12, mass: 3 })).toBeGreaterThan(
      springSettling({ stiffness: 180, damping: 12, mass: 1 })
    );
  });

  it('gives a settling time a reader could be offered', () => {
    for (const preset of SPRING_PRESETS) {
      const settling = springSettling(parseSpring(preset.easing)!);
      // Whole tens of milliseconds, and within the range a build can be.
      expect(settling % 10, preset.id).toBe(0);
      expect(settling, preset.id).toBeGreaterThanOrEqual(120);
      expect(settling, preset.id).toBeLessThanOrEqual(6000);
    }
  });
});

describe('the spring as an easing a browser can run', () => {
  it('samples more finely the more the spring rings', () => {
    const bouncy = springSampleCount({ stiffness: 180, damping: 6, mass: 1 });
    const damped = springSampleCount({ stiffness: 180, damping: 30, mass: 1 });
    expect(bouncy).toBeGreaterThan(damped);
    expect(bouncy).toBeLessThanOrEqual(96);
    expect(damped).toBeGreaterThanOrEqual(24);
  });

  /**
   * It has to *arrive*. The spring approaches its destination and never reaches
   * it, so the last sample is made 1 — otherwise a build ends a thousandth short
   * and the shape sits a hairline off where the document puts it, permanently,
   * because `fill: both` holds the last frame.
   */
  it('ends at exactly 1', () => {
    for (const preset of SPRING_PRESETS) {
      const samples = springSamples(parseSpring(preset.easing)!);
      expect(samples[0], preset.id).toBe(0);
      expect(samples[samples.length - 1], preset.id).toBe(1);
    }
  });

  it('writes a linear() a browser will accept', () => {
    const css = springLinearCss({ stiffness: 180, damping: 9, mass: 1 });
    expect(css.startsWith('linear(0,')).toBe(true);
    expect(css.endsWith(', 1)')).toBe(true);
    // No positions: the stops are evenly spaced by definition.
    expect(css).not.toContain('%');
    // Four decimal places at most — a thousandth of a spring is not a thing.
    expect(css).not.toMatch(/\d\.\d{5}/);
  });

  /**
   * And it arrives through `easingCss`, which is the only reader of a step's
   * easing in the product — so a spring works in the editor's preview, the show,
   * and under the playhead without any of them knowing what a spring is.
   */
  it('is what easingCss answers for a spring', () => {
    expect(easingCss('spring(180, 9)')).toBe(
      springLinearCss({ stiffness: 180, damping: 9, mass: 1 })
    );
    // And an unphysical one is `ease`, not a broken string the browser refuses.
    expect(easingCss('spring(0, 0)')).toBe('ease');
  });

  /** A spring is not a cubic, so the curve editor's four points are the default. */
  it('has no control points to drag', () => {
    expect(easingPoints('spring(180, 9)')).toEqual(easingPoints('ease'));
  });
});
