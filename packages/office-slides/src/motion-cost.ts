import { effectDefinition, propertiesOf } from './motion-effects';
import { MOTION_TRACKS, TRACK_SLOTS, trackName } from './motion-tracks';
import type { TimedStep } from './timeline';

/**
 * What a motion costs to draw, and how much of it is running at once.
 *
 * ## Why this exists at all
 *
 * `docs/specs/motion-model.md` §7b sorts every animatable property into tiers,
 * and the panel said nothing about them — so a reader could put a `filter`
 * emphasis on twenty shapes and find out what that costs *in front of an
 * audience*. A tool that knows something the reader needs and does not say it is
 * worse than one that never knew.
 *
 * ## What is actually expensive
 *
 * Not the number of animations: `opacity` and `translate` are composited, and a
 * slide can run dozens without a repaint. What costs is a property whose change
 * makes the browser **paint the shape again**, every frame — `filter`,
 * `box-shadow`, a background position — and the cost is per *element*, which is
 * where the real cliff is: a `filter` emphasis on a title split into twenty-four
 * letters is twenty-four repainting elements, from one step.
 *
 * ## Why there is no promised frame rate
 *
 * Because it cannot be known here. It depends on the shape's size, the reader's
 * machine, and what else is on the slide. So this counts *what is expensive* and
 * says so; it does not predict milliseconds it cannot measure. The thresholds
 * below are the honest kind of judgement: a handful is fine, a dozen is a warning,
 * and the number in between is where a reader should be told rather than
 * surprised.
 */

/**
 * The tier each animatable property is in — §7b, in code.
 *
 * Anything not named here is tier 1: the table lists what is *expensive*, so a
 * property nobody has thought about is treated as cheap and the spec is the place
 * that argument happens.
 */
export const PROPERTY_TIER: Record<string, 2 | 3> = {
  filter: 2,
  backdropFilter: 2,
  boxShadow: 2,
  backgroundPosition: 2,
  backgroundSize: 2,
  backgroundColor: 2,
  borderColor: 2,
  /*
    `borderRadius` was added here and taken back out.

    The argument was "a rounded corner is a clip, so the shape repaints" — and the
    spec's own tier 1 list has `clip-path` in it, which is the same argument for the
    opposite answer. This table's rule is that a property nobody has thought about
    is treated as cheap **and the spec is where that argument happens**
    (`docs/specs/motion-model.md` §7b), so adding a row here on the strength of a
    comment was making the decision in the wrong file.
  */
  color: 2,
  // An SVG filter's own values: the same repaint, reached a different way.
  floodOpacity: 2,
  floodColor: 2,
  /**
   * And the tracks, by the variable a frame actually names — every slot of every
   * expensive one, because `--sl-f0-angle` and `--sl-f1-angle` are two different
   * keys and a frame names exactly one of them.
   *
   * From the track table rather than repeated here, so a new track is tiered by
   * the row that declares it — the fault this repository keeps finding in itself
   * is one fact written in two places, and a cost list beside a track list is
   * exactly that.
   *
   * Only the expensive ones: this table *is* the list of what costs, and a row
   * of `1` in it would be read as truthy by the tier check below — a cheap track
   * marked expensive.
   */
  ...Object.fromEntries(
    MOTION_TRACKS.filter((track) => track.tier > 1).flatMap((track) =>
      Array.from({ length: TRACK_SLOTS }, (_, index) => [trackName(track.id, index), track.tier])
    )
  )
};

/** How expensive one step is to draw: 1 cheap, 2 a repaint per frame. */
export function stepTier(
  step: Pick<TimedStep, 'kind' | 'effect' | 'direction' | 'amount' | 'partAt'>
): 1 | 2 {
  // A path is `offset-distance`, which is a transform: cheap, however far it goes.
  if (step.kind === 'path') return 1;

  // An SVG filter is a repaint by construction — that is what a filter is.
  if (effectDefinition(step.effect)?.svg) return 2;

  const properties = propertiesOf(step.effect, {
    direction: step.direction as never,
    amount: step.amount,
    partAt: step.partAt
  });
  return properties.some((property) => PROPERTY_TIER[property]) ? 2 : 1;
}

/**
 * How many repainting *elements* a step animates.
 *
 * The multiplier is the text unit: a filter on a box is one repaint per frame, and
 * the same filter on its letters is one per letter. Which is the cliff worth
 * naming, because it is invisible in the panel — the reader chose "글자마다" for a
 * fade and then changed the effect.
 *
 * A trail multiplies too: every copy is drawn with the same filter.
 */
export function stepElements(step: TimedStep): number {
  const pieces = Math.max(1, step.units ?? 1);
  const copies = 1 + Math.max(0, step.echo ?? 0);
  return pieces * copies;
}

export interface MotionCost {
  /** Repainting elements running at the busiest moment of this press. */
  repaints: number;
  /** The steps that contribute them, for a panel that wants to say which. */
  steps: string[];
  verdict: 'cheap' | 'busy' | 'heavy';
}

/**
 * The busiest moment of a press, in repainting elements.
 *
 * *Overlapping* steps, not all of them: three filters one after another is three
 * repaints in turn, which no machine minds, and three at once is three times the
 * work every frame. So this is the largest number of them alive at the same
 * instant — which is the same question the timeline's lanes answer, one number
 * along.
 *
 * Measured against the moments the steps themselves start and end rather than by
 * sampling: an animation's cost is constant while it runs, so the busiest instant
 * is always *at* an edge.
 */
export function pressCost(steps: TimedStep[], press: number): MotionCost {
  const expensive = steps.filter((step) => step.group === press && stepTier(step) === 2);
  if (expensive.length === 0) return { repaints: 0, steps: [], verdict: 'cheap' };

  const edges = [...new Set(expensive.map((step) => step.startAt))].sort((a, b) => a - b);

  let worst = { repaints: 0, steps: [] as string[] };
  for (const edge of edges) {
    const alive = expensive.filter((step) => step.startAt <= edge && edge < step.endAt);
    const repaints = alive.reduce((total, step) => total + stepElements(step), 0);
    if (repaints > worst.repaints) {
      worst = { repaints, steps: alive.map((step) => step.sid) };
    }
  }

  /**
   * Four is a warning and twelve is a problem.
   *
   * Judgement rather than measurement, and deliberately: the real number depends
   * on the shapes' size and the reader's machine, neither of which is knowable
   * here. What *is* knowable is that one repainting shape is what this is for,
   * a handful is what it tolerates, and a dozen is a reader about to be surprised
   * in front of an audience.
   */
  return {
    ...worst,
    verdict: worst.repaints >= 12 ? 'heavy' : worst.repaints >= 4 ? 'busy' : 'cheap'
  };
}

/** What to say about it, in the reader's words. */
export function costLabel(cost: MotionCost): string | undefined {
  if (cost.verdict === 'cheap') return undefined;
  return cost.verdict === 'heavy'
    ? `무거운 모션 ${cost.repaints}개가 동시에 — 발표 중 끊길 수 있습니다`
    : `무거운 모션 ${cost.repaints}개가 동시에`;
}
