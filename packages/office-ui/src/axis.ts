/**
 * An axis: a span, and where to put the ticks along it.
 *
 * ## Why this is one thing and not three
 *
 * This repository draws three axes, and had three answers:
 *
 * | | where | how it stepped |
 * |---|---|---|
 * | Word's ruler | `office-word/ruler.ts` | inches and eighths, looping in twips |
 * | A slide's ruler | `office-slides/ruler.ts` | the reader's unit, counted in the unit |
 * | A timeline | `apps/slide/src/timeline.tsx` | `ceil(span / 500)`, inline, untested |
 *
 * All three are the same widget: a span mapped to a length on screen, ticks at a
 * step a reader can count, labels on some of them, and a marker that can be
 * dragged. The newest of the three — the slide ruler — is the only one that had
 * worked out the two things that make a tick list right, and neither of the others
 * could reach it. The timeline's was the worst: at a sixty-second sequence it drew
 * 120 ticks and 60 labels, which the slide ruler's own notes call "a grey band
 * rather than a scale".
 *
 * A timeline shaped like this is wanted in more than one place — a design tool's
 * prototype panel, a Gantt chart, Word the day it has one — so the axis is here,
 * in the package whose components know nothing but their props.
 *
 * ## The two things that make a tick list right
 *
 * **Count in the axis's unit, not in the model's.** One centimetre is 566.9 twips,
 * so a ruler stepping in twips draws ticks at 566, 1133, 1700 and labels the third
 * one 2.99cm. The step is held in the unit and converted per tick, and the
 * conversion is where the rounding lives.
 *
 * **Compare the major step with a tolerance.** `0.5 × 6` is 2.9999999999999996 in
 * binary, so testing "is this a whole multiple" with `%` skips the 3cm label on a
 * third of the ticks — and a ruler that drops labels is a ruler nobody trusts.
 */

/** How an axis steps. */
export interface AxisStep {
  /**
   * How much of the *model's* unit is in one of the axis's — twips per
   * centimetre, say. `1` when they are the same thing, which is the case for a
   * clock: the model counts milliseconds and so does the axis.
   */
  per: number;
  /** How many of the axis's units apart the **labelled** ticks are. */
  major: number;
  /** And the unlabelled ones. */
  minor: number;
}

export interface AxisTick {
  /** Where it goes, in the model's unit — so a caller only scales. */
  at: number;
  /**
   * What this tick is, in the axis's unit. Absent for an unlabelled one.
   *
   * A number rather than a string, because how it is written is the drawing's
   * business: a length wants `3`, a clock wants `1.5s`, and a formatter passed in
   * here would be this file guessing at which.
   */
  value?: number;
}

/**
 * Every tick along a span, marked where a reader would count.
 *
 * One list rather than two, because the caller draws them in one pass and the only
 * difference is a label and a height — and two lists would need the caller to
 * interleave them to get the drawing order right.
 */
export function axisTicks(span: number, step: AxisStep): AxisTick[] {
  const { per, major, minor } = step;
  if (!(per > 0) || !(minor > 0) || !(major > 0) || !(span > 0)) return [];

  const ticks: AxisTick[] = [];
  // Counted in the *axis's* unit, so the round numbers are the reader's and not
  // the model's. A loop over twips lands at 2.99cm, which is the whole point.
  for (let index = 0; index * minor * per <= span + 1; index += 1) {
    const value = index * minor;
    const at = Math.round(value * per);

    // A tolerance rather than `%`: see the note at the top of the file.
    const times = value / major;
    const labelled = Math.abs(times - Math.round(times)) < 1e-9;
    ticks.push(labelled ? { at, value } : { at });
  }
  return ticks;
}

/**
 * The round millisecond steps a clock is worth labelling in.
 *
 * A ladder rather than arithmetic, because a "round" length of time is a
 * convention and not a calculation: 250ms and 500ms and 2s are round, 300ms and
 * 750ms and 3s are not — the same way a clock face is quarters and not thirds.
 */
const TIME_STEPS = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];

/**
 * How a clock of this length should step.
 *
 * Chosen from the span rather than fixed, which is the whole fault this replaces:
 * a step of 500ms is right for a two-second press and absurd for a minute.
 *
 * The span to pass is the one that fits the *visible* room. An axis magnified to
 * four times the width of its pane has four times as many pixels for the same
 * time, so its caller divides — the budget is labels per pixel, not per press.
 *
 * `labels` is the most a reader should have to count past, and six is the
 * judgement — it is what a video editor shows across a visible track, and it
 * leaves a two-second axis labelled every half second rather than every quarter.
 * The smallest step on the ladder that stays under it wins, so the axis is as
 * finely divided as it can be while still being readable.
 *
 * Minor ticks at half the major, so there is a mark between every pair of numbers
 * — a reader placing something at 1.25s has something to place it against.
 */
export function timeStep(span: number, labels = 6): AxisStep {
  const major =
    TIME_STEPS.find((step) => span / step <= labels) ??
    // Longer than the ladder goes: the coarsest step, and the ticks are dense.
    // A press lasting six minutes is not a case worth a rung of its own.
    TIME_STEPS[TIME_STEPS.length - 1];

  return { per: 1, major, minor: major / 2 };
}
