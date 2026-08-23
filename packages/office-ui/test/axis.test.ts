import { describe, it, expect } from 'vitest';
import { axisTicks, timeStep, rulerStep, type AxisStep } from '../src/index';

/**
 * An axis's ticks.
 *
 * Moved here from `office-slides`, where they were `slideTicks` and could only be
 * reached by the one product that wrote them — while a timeline in the same app
 * stepped `ceil(span / 500)` inline and Word's ruler looped in twips. Three
 * answers to one question, and this is the one with the two hard parts worked out.
 *
 * The unit tests came with it unchanged, plus the clock's step, which had none.
 */

/** The three steps a slide's rulers use, as literals — see `rulerStep`. */
const STEP: Record<string, AxisStep> = {
  cm: { per: 566.9, major: 1, minor: 0.5 },
  mm: { per: 56.69, major: 10, minor: 5 },
  in: { per: 1440, major: 1, minor: 0.25 }
};

/** A 16:9 slide, in twips. */
const SLIDE = 25920;

describe('the ticks along a length', () => {
  it('starts at the beginning and ends at the end', () => {
    const ticks = axisTicks(SLIDE, STEP.cm);
    expect(ticks[0].at).toBe(0);
    // 45.7cm, so the last tick a whole half-centimetre inside it is 45.5.
    expect(ticks[ticks.length - 1].at).toBeLessThanOrEqual(SLIDE + 1);
    expect(ticks[ticks.length - 1].at).toBeGreaterThan(SLIDE - 300);
  });

  /**
   * Counted in the unit, which is the whole reason this exists.
   *
   * One centimetre is 566.9 twips. A loop over twips draws ticks at 566, 1133,
   * 1700 and labels the third one 2.99cm.
   */
  it('lands on whole units rather than on round twips', () => {
    const ticks = axisTicks(SLIDE, STEP.cm);
    const labelled = ticks.filter((tick) => tick.value !== undefined);
    expect(labelled[3].value).toBe(3);
    expect(labelled[3].at).toBe(Math.round(3 * 566.9));
  });

  /**
   * A tolerance, not `%`.
   *
   * `0.5 × 6` is 2.9999999999999996 in binary, so a `%` test skips the 3cm label
   * on a third of the ticks — and a ruler that drops labels is a ruler nobody
   * trusts.
   */
  it('labels every whole unit, floating point included', () => {
    const values = axisTicks(SLIDE, STEP.cm)
      .filter((tick) => tick.value !== undefined)
      .map((tick) => tick.value);
    expect(values.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(values).toHaveLength(46);
  });

  it('keeps the label count readable in every unit', () => {
    // The judgement behind the steps: past about fifty labels a ruler is a grey
    // band. Millimetres every ten and inches every one.
    const labels = (step: AxisStep) =>
      axisTicks(SLIDE, step).filter((tick) => tick.value !== undefined).length;
    expect(labels(STEP.mm)).toBeLessThan(50);
    expect(labels(STEP.in)).toBe(19);
  });

  it('answers with nothing for a span or a step that is not one', () => {
    expect(axisTicks(0, STEP.cm)).toEqual([]);
    expect(axisTicks(-5, STEP.cm)).toEqual([]);
    expect(axisTicks(SLIDE, { per: 0, major: 1, minor: 1 })).toEqual([]);
    // A major of zero would divide by it and label every tick `Infinity`.
    expect(axisTicks(SLIDE, { per: 1440, major: 0, minor: 1 })).toEqual([]);
  });

  it('is the same answer `rulerStep` asks for', () => {
    // The step table and the counting are two halves of one thing, and this is
    // the seam between them.
    expect(axisTicks(SLIDE, rulerStep('cm')).filter((t) => t.value !== undefined)).toHaveLength(46);
  });
});

describe('the step a clock takes', () => {
  /**
   * The fault this replaces: 500ms, fixed, with a label on every other tick.
   *
   * Right for a two-second press and absurd for anything long: sixty seconds got
   * 120 ticks and 60 labels.
   */
  it('is finer for a short press and coarser for a long one', () => {
    expect(timeStep(2000).major).toBe(500);
    expect(timeStep(60000).major).toBe(10000);
    // A short press gets the finest rung: tenths of a second across 600ms, which
    // is what a reader placing a 120ms delay needs to see.
    expect(timeStep(600).major).toBe(100);
  });

  it('keeps the labels countable at every length', () => {
    for (const span of [400, 800, 1500, 3000, 8000, 20000, 60000, 180000]) {
      const labels = axisTicks(span, timeStep(span)).filter((tick) => tick.value !== undefined);
      // Six is the judgement; the `+ 1` is the label at zero.
      expect(labels.length, `${span}ms 축의 라벨 ${labels.length}개`).toBeLessThanOrEqual(7);
      expect(labels.length).toBeGreaterThan(1);
    }
  });

  it('marks a tick between every pair of numbers', () => {
    // So a reader placing something at 1.25s has something to place it against.
    const step = timeStep(4000);
    expect(step.minor).toBe(step.major / 2);
  });

  it('steps in round lengths of time, not in arithmetic', () => {
    // 250 and 500 and 2s are round; 300 and 750 and 3s are not — the same way a
    // clock face is quarters and not thirds.
    const rungs = [300, 900, 2500, 7000, 25000, 90000].map((span) => timeStep(span).major);
    for (const major of rungs) {
      expect([100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000]).toContain(major);
    }
  });

  it('counts in milliseconds, so the model needs no conversion', () => {
    // `per: 1` — a clock's unit and the model's are the same thing, unlike a
    // length, where the model is twips and the reader is centimetres.
    expect(timeStep(2000).per).toBe(1);
    expect(axisTicks(2000, timeStep(2000))[1].at).toBe(250);
  });
});
