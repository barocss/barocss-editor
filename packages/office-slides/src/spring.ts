/**
 * A spring: the one timing a cubic-bezier cannot say.
 *
 * ## What was missing
 *
 * The curve editor offers four control points, which is every easing CSS has —
 * and a bezier can overshoot **once**. A spring does not: it passes its
 * destination, comes back past it, and settles over several diminishing swings.
 * That is what makes a physical motion read as physical, and it is why every
 * tool this product is measured against has a spring tab beside its curve one:
 * Figma's Spring, Framer's `type: 'spring'`, iOS's `UISpringTimingParameters`,
 * Keynote's "bounce".
 *
 * The first sketch of this resampled the effect's keyframes — interpolate every
 * property at sixty points along the spring and emit sixty frames — which needs
 * an interpolator for `translate`, `scale`, `rotate`, `clip-path` and colour, in
 * this file, forever, alongside the browser's own.
 *
 * ## What it is instead: `linear()`
 *
 * CSS's `linear()` easing takes a list of progress values, and it is *exactly*
 * this: a curve given as samples rather than as a formula. So a spring is
 * sampled into an easing string and nothing else in the product changes — the
 * frames are the effect's, the duration is the bar's, and the easing is a string
 * a document already holds.
 *
 * Measured in this product's own browser before any of it was written:
 *
 * ```
 * easing: 'linear(0, 0.5 25%, 1.4 50%, 0.9 75%, 1)'
 * at 25%: translate 50px      ← honoured
 * at 50%: translate 140px     ← the overshoot is real, not clamped
 * scale 0.5 → 1 at a 1.2 point: 1.1
 * 120 stops: accepted
 * ```
 *
 * Chrome 113, Safari 17.2, Firefox 112. Where it is missing the whole string is
 * rejected and the animation runs `ease`, which is the right failure: a motion
 * that is not springy rather than no motion at all.
 *
 * ## Why the step's duration still wins
 *
 * A spring has a *natural* length — stiffness and damping say how long it takes
 * to settle — and the tempting thing is to let it set the duration. It cannot:
 * the timeline's whole gesture is that a bar's width is how long a motion takes,
 * and a step whose length was decided by two other numbers would be a bar a
 * reader cannot drag.
 *
 * So the spring is *fitted into* the duration: sampled from rest to settled and
 * normalised. `springSettling` is offered separately, so a panel can say "this
 * spring settles in 0.8초" and let the reader ask for that length — which is the
 * honest version of the same idea, and one they can refuse.
 */

export interface Spring {
  /** How hard it pulls back. Higher is faster and tighter. */
  stiffness: number;
  /** How much it resists. Lower bounces more; high enough, and it never does. */
  damping: number;
  /** How heavy the thing is. 1 unless a reader says otherwise. */
  mass: number;
}

/**
 * The three anybody actually wants, named for what they feel like.
 *
 * A reader does not think in newtons per metre. They think "gently", "with a
 * bounce", "sharply" — the same three Figma, Framer and iOS all ship, because
 * the useful part of the parameter space is small and the rest is a physics
 * homework problem.
 */
export const SPRING_PRESETS = [
  { id: 'springGentle', label: '부드러운 스프링', easing: 'spring(120, 16)' },
  { id: 'springBouncy', label: '탄력 있는 스프링', easing: 'spring(180, 9)' },
  { id: 'springStiff', label: '단단한 스프링', easing: 'spring(420, 26)' }
] as const;

/** What the document writes, so nothing builds the string by hand. */
export function springCss(spring: Spring): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return spring.mass === 1
    ? `spring(${round(spring.stiffness)}, ${round(spring.damping)})`
    : `spring(${round(spring.stiffness)}, ${round(spring.damping)}, ${round(spring.mass)})`;
}

/**
 * A `spring(stiffness, damping)` or `spring(stiffness, damping, mass)`, parsed.
 *
 * Refused rather than clamped for anything unphysical: a stiffness of zero is a
 * spring that never pulls, a damping of zero is one that never stops, and a
 * document saying either means something this cannot draw. `easingCss` answers
 * `ease` for a value it cannot read, which is what a refusal here becomes.
 */
export function parseSpring(value: unknown): Spring | undefined {
  if (typeof value !== 'string') return undefined;

  const match = /^spring\(\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value.trim());
  if (!match) return undefined;

  const stiffness = Number(match[1]);
  const damping = Number(match[2]);
  const mass = match[3] === undefined ? 1 : Number(match[3]);

  if (![stiffness, damping, mass].every((number) => Number.isFinite(number) && number > 0)) {
    return undefined;
  }
  // A spring nobody could feel, and one nobody could compute with: the bounds
  // are the panel's sliders, so a document outside them is a document from
  // somewhere else.
  if (stiffness > 2000 || damping > 200 || mass > 100) return undefined;

  return { stiffness, damping, mass };
}

/**
 * How far along a spring is at a moment, where 1 is *at* the destination.
 *
 * The damped harmonic oscillator, in the three regimes it has. Written out
 * rather than approximated because the interesting one — underdamped, the case
 * that bounces — is the only reason to have a spring at all, and the boundary
 * cases are where a naive implementation divides by zero.
 *
 * `at` is seconds.
 */
export function springProgress(spring: Spring, at: number): number {
  if (at <= 0) return 0;

  const { stiffness, damping, mass } = spring;
  // Undamped angular frequency, and the damping *ratio* — the number that says
  // which of the three regimes this spring is in.
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    // Underdamped: it overshoots and rings. The one anybody wants.
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * w0 * at);
    return 1 - envelope * (Math.cos(wd * at) + ((zeta * w0) / wd) * Math.sin(wd * at));
  }

  if (zeta === 1) {
    // Critically damped: the fastest approach that does not overshoot at all.
    return 1 - Math.exp(-w0 * at) * (1 + w0 * at);
  }

  // Overdamped: two decaying exponentials, and it crawls in.
  const root = w0 * Math.sqrt(zeta * zeta - 1);
  const a = -zeta * w0 + root;
  const b = -zeta * w0 - root;
  return 1 - (b * Math.exp(a * at) - a * Math.exp(b * at)) / (b - a);
}

/**
 * When the spring has stopped moving, in milliseconds.
 *
 * "Stopped" is a decision, not a fact: a damped spring approaches its
 * destination forever. The envelope drops below a thousandth of the distance
 * here, which is a twentieth of a pixel on a slide — under the size of the
 * thinnest thing this product can draw, so any tighter is time a reader waits
 * for nothing.
 *
 * Rounded up to a whole 10ms, because this is offered to a reader as a length
 * they might choose, and 783 is not a number anybody types.
 */
export function springSettling(spring: Spring): number {
  const { stiffness, damping, mass } = spring;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  // The slow root governs the overdamped case; the envelope governs the others.
  const rate =
    zeta > 1 ? zeta * w0 - w0 * Math.sqrt(zeta * zeta - 1) : zeta * w0;

  const seconds = Math.log(1000) / rate;
  return Math.min(6000, Math.max(120, Math.ceil((seconds * 1000) / 10) * 10));
}

/**
 * How many samples a spring is worth, and why not simply sixty.
 *
 * `linear()` interpolates *straight lines* between its stops, so the sampling
 * has to be fine enough that a straight line across one interval is invisible.
 * What makes that hard is not the length of the animation — the curve is
 * normalised into it — but how much *ringing* there is: a bouncy spring turns
 * around several times and every turn needs points either side of it.
 *
 * So the count comes from the number of swings the spring makes before it
 * settles, at sixteen points per swing, bounded by what is worth writing.
 */
export function springSampleCount(spring: Spring): number {
  const { stiffness, damping, mass } = spring;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta >= 1) return 24; // No turns at all: a plain decelerating curve.

  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const swings = (springSettling(spring) / 1000) * (wd / (2 * Math.PI));
  return Math.min(96, Math.max(24, Math.round(swings * 16)));
}

/** The progress values, evenly spaced across the spring's settling time. */
export function springSamples(spring: Spring, count = springSampleCount(spring)): number[] {
  const settling = springSettling(spring) / 1000;
  const samples: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    samples.push(springProgress(spring, (index / count) * settling));
  }
  // The last sample is *made* to be 1: the spring approaches its destination and
  // an animation has to arrive at it, or a build ends a thousandth of the way
  // short and a shape sits one hairline off where the document puts it.
  samples[samples.length - 1] = 1;
  return samples;
}

/**
 * The spring as a CSS easing.
 *
 * `linear()` with no positions: the stops are evenly spaced by definition, which
 * is what the samples are, so writing `0.42 37%` on each of ninety-six of them
 * would be ninety-six numbers that say what the reader already knows.
 */
export function springLinearCss(spring: Spring): string {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return `linear(${springSamples(spring).map(round).join(', ')})`;
}
