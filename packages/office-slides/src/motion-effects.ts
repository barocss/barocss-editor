/**
 * What an effect *is*: a category, the options it takes, and the frames those
 * options produce.
 *
 * ## Why a table of keyframes rather than a switch of CSS transitions
 *
 * The first version wrote a starting style onto the element, waited two frames
 * and released it — a CSS transition, driven by hand. It draws an entrance and
 * it cannot do anything else:
 *
 * - **An emphasis has to come back.** A pulse goes out and returns, which is
 *   three frames; a transition has two, so "make it bigger and then not" cannot
 *   be said at all.
 * - **Easing was a word in a template string.** Every step in the product ran
 *   `ease`, because there was nowhere for a document to say otherwise.
 * - **Nothing could be scrubbed.** A transition plays when the browser decides;
 *   an animation has a `currentTime` you can set, which is the difference
 *   between a preview that plays and a timeline you can drag a playhead along.
 *
 * ## Why the direction is an option and not part of the name
 *
 * It *was* part of the name: `flyInLeft`, `flyInRight`, `flyInUp` were three
 * effects. That is a list that grows by multiplication — eight directions and
 * six entrances is forty-eight names for six ideas — and a reader who has set a
 * duration, a curve and an order and then wants the shape to come from the other
 * side would be changing which effect they chose rather than one of its
 * settings.
 *
 * So an effect is *what happens* and its options are *how much and which way*:
 * `fly` with `direction: 'left'`, `grow` with `amount: 0.6`. PowerPoint stores
 * exactly this shape — a preset and a subtype — and it is what lets a panel show
 * six effects and a compass rather than forty-eight lines.
 *
 * Each effect declares which options it takes, so a panel draws a direction
 * control for the effects that turn and nothing for the ones that do not. An
 * option nobody declared is not offered, which is the same rule the properties
 * panel follows for a shape's attributes.
 */

import { parseSpring, springLinearCss } from './spring';
import { trackName, type TrackPart } from './motion-tracks';

export type EffectCategory = 'entrance' | 'emphasis' | 'exit';

/** The eight a compass has, which is what every drawing tool offers. */
export const DIRECTIONS = [
  'left',
  'right',
  'up',
  'down',
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight'
] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** Where a direction points, as a unit vector in screen coordinates. */
const VECTORS: Record<Direction, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  topLeft: { x: -0.7, y: -0.7 },
  topRight: { x: 0.7, y: -0.7 },
  bottomLeft: { x: -0.7, y: 0.7 },
  bottomRight: { x: 0.7, y: 0.7 }
};

export interface EffectOptions {
  /**
   * Which way, for the effects that have a way.
   *
   * An *entrance* comes **from** the direction it names and an *exit* goes **to**
   * it — "왼쪽에서 날아오기" and "왼쪽으로 날아가기" are the same word meaning
   * opposite journeys, which is what a reader expects and the classic place to
   * get a sign wrong.
   */
  direction?: Direction;
  /**
   * How much, from 0 to 1, of whatever the effect measures.
   *
   * A fly's distance, a grow's starting size, a pulse's swell. One number rather
   * than one per effect, because a panel showing "정도" beside every effect that
   * has one is a control a reader learns once.
   */
  amount?: number;
  /**
   * A colour, for the effects that are *about* a colour.
   *
   * A glow's, a bloom's, a tint's. The first option here that is not a number or
   * a direction, and it exists because `filter` does: `drop-shadow` and `feFlood`
   * both take one, and `currentColor` is only the right answer for text.
   */
  color?: string;
  /**
   * **Which one** of the shape's fills or shadows, for the effects that animate a
   * list's item rather than the shape.
   *
   * The index a reader sees in the panel — the model's, not the CSS list's, which
   * differ whenever a translucent image makes one fill into two layers. `0` is
   * the topmost, which is the order the panel draws and Figma lists.
   */
  partAt?: number;
}

/**
 * A frame, in the *individual* transform properties rather than `transform`.
 *
 * This is the one measured fact that changed the whole table. A shape's own
 * rotation is written by the renderer as `transform: rotate(30deg)`, and an
 * animation of the `transform` shorthand **replaces** it: measured, a rotated
 * rectangle given a fly-in animated as `matrix(1, 0, 0, 1, -208, 0)` — no
 * rotation at all — and was left at `none` when the animation ended, losing the
 * reader's rotation on screen entirely.
 *
 * `translate`, `rotate` and `scale` are separate properties that *compose* with
 * `transform` rather than replacing it, and they compose in front of it — so the
 * translate is in screen space (a shape flies in from the left of the screen,
 * not from the left of its own rotated frame) and the shape keeps the turn the
 * document gave it. Chrome 104, Safari 14.1, Firefox 72.
 *
 * `clipPath` and `filter` have no shorthand to collide with; they stay as they
 * are.
 */
export interface Keyframe {
  offset?: number;
  opacity?: string | number;
  translate?: string;
  rotate?: string;
  scale?: string;
  clipPath?: string;
  filter?: string;
  /**
   * `backdrop-filter`: what is *behind* the shape, blurred.
   *
   * The one animatable filter that is not about the element at all — measured to
   * interpolate like any other — and the reason a frosted panel is a motion this
   * product can have.
   */
  backdropFilter?: string;
  /**
   * The two properties on an SVG filter primitive that CSS can animate.
   *
   * `flood-color` and `flood-opacity` are presentation attributes, so they are
   * CSS properties, so the Web Animations API interpolates them — measured. Every
   * other filter attribute (`baseFrequency`, `scale`, `radius`) is not, and needs
   * SMIL.
   */
  floodOpacity?: number;
  floodColor?: string;
  /**
   * The corners, rounding as the shape arrives.
   *
   * A plain length, animated *additively* like every other property here — so a
   * shape that already has 8px corners softens to 8+n rather than losing what
   * the document gave it. Which is the whole reason `border-radius` needs no
   * machinery: it is one length, so the browser interpolates it, and `add` means
   * what a reader means. Measured: a static 8px with an additive 0 → 16px ends
   * at 24px.
   */
  borderRadius?: string;
  /**
   * A **track**: a registered custom property the shape's own CSS reads.
   *
   * For the properties a keyframe cannot say anything useful about — a gradient
   * that turns, because `background-image` has no midpoint between two angles.
   * The renderer writes the variable into the value it builds and the frame moves
   * only the variable. See `motion-tracks.ts`.
   */
  [track: `--${string}`]: string | number | undefined;
}

/**
 * The properties an animation must **add** to rather than replace, because the
 * shape's own value has to survive the motion.
 *
 * Measured on 2026-08-20, and it was a live fault: a shape with a 흐림 effect
 * carries `filter: blur(3px)` from `effectsCss`, and one glow step over it —
 * `replace`, because it is the first step of its press and nothing overlaps it —
 * computed to `drop-shadow(…)` alone. **The blur was gone for the length of the
 * motion.** With `composite: 'add'` the same step computes to
 * `blur(3px) drop-shadow(…)`: the list concatenates and the static value stays.
 *
 * Two reasons, one rule. `filter` and `backdrop-filter` hold a **list**, and
 * addition concatenates it. `border-radius` is a length, and addition is
 * arithmetic — measured, a static 8px with an additive 0 → 16px ends at 24px,
 * which is "16 rounder than the document drew it" and is what a reader means.
 *
 * `opacity` is deliberately *not* here, and it is the reason this is a list
 * rather than a rule. An additive fade starts at the shape's own 1 instead of at
 * 0, so it would not fade at all. What a reader means there is a *multiple* of
 * the shape's opacity, which the Web Animations API cannot express — written down
 * in the backlog rather than half-done here.
 *
 * Which is why the composite decision cannot be per *step*: adding is right for
 * these and wrong for the rest, so a step that touches both is two animations.
 * See `splitAdditive`.
 */
export const MUST_ADD = ['filter', 'backdropFilter', 'borderRadius'] as const;

/**
 * An effect that is an **SVG filter**, and what that costs.
 *
 * The measurement that shaped this: `filter: url(#f) blur(0px)` → `blur(10px)`
 * is **discrete**. A `url()` anywhere in the list stops the whole list
 * interpolating, so an SVG filter and an animated CSS filter cannot share the
 * `filter` property — which rules out the obvious design (the shape carries the
 * SVG look and the motion animates a blur on top of it).
 *
 * What *does* work is animating the filter's own primitives, and one of them is
 * reachable by the very API this product already uses: `flood-color` and
 * `flood-opacity` are presentation attributes, so they are CSS properties, so the
 * Web Animations API interpolates them. Measured: 0.1 → 0.9 gave 0.5 at the
 * midpoint, on the `<feFlood>` element itself, with the *attribute* untouched.
 *
 * So an SVG effect declares two things: the filter to put on the shape, and the
 * frames to run **on one primitive inside it**. The stage makes a copy of the
 * filter per step (a rendered thing no node describes, like the echo copies and
 * the per-letter spans), animates the primitive, and takes it away again.
 *
 * Everything SVG filters can do that this does *not* reach — turbulence,
 * displacement, morphology — needs SMIL, which is measured to work
 * (`beginElement()`, `animVal` 36.6 against a `baseVal` of 0) and is the next
 * step rather than this one.
 */
/**
 * What a filter needs to know about *when* — for the effects that animate
 * themselves.
 *
 * `flood-opacity` is a CSS property, so the Web Animations API can drive it and
 * the timing is the step's, handled where every other step's is. Everything else
 * a filter can do — turbulence, displacement, morphology, channel offsets — is
 * not a CSS property at all, and the only thing that can animate it is **SMIL**,
 * whose `<animate>` elements carry their own `begin` and `dur`.
 *
 * Measured before either was built:
 *
 * ```
 * svg.pauseAnimations(); svg.setCurrentTime(t)
 *   values="0;60;0" at 0 / .25 / .5 / .75 / 1  →  0 / 30 / 60 / 30 / 0
 *   the same t twice gives the same value        ← which is what scrubbing needs
 * begin="0.3s" measures from the element being *inserted*
 * two filters keep two independent clocks
 * ```
 *
 * So an SMIL filter is scrubbable, delayable and per-step — because each step
 * already gets its own `<svg>`, and each `<svg>` is its own clock.
 */
export interface FilterTiming {
  duration: number;
  delay: number;
  /** Passes; `0` is the document's "until the slide moves on". */
  repeat: number;
}

export interface SvgFilter {
  /**
   * The primitives, as markup.
   *
   * `%TARGET%` marks the one primitive `frames` animates. An SMIL filter has no
   * `frames` and writes its own `<animate>` elements instead, which is what the
   * timing is for.
   */
  markup: (options: EffectOptions, timing: FilterTiming) => string;
  /**
   * What runs on the marked primitive — ordinary keyframes of CSS properties.
   *
   * Absent for a filter that animates *itself* with SMIL. Which mechanism an
   * effect uses is said by whether this is here, rather than by a flag: a flag
   * could disagree with the markup, and this cannot.
   */
  frames?: (options: EffectOptions) => Keyframe[];
}

/**
 * How SMIL says "for this long, starting then, this many times".
 *
 * `indefinite` for a repeat of zero, which is the document's word for "until the
 * slide moves on" — the same value the Web Animations API spells `Infinity`.
 */
export function smilTiming(timing: FilterTiming): string {
  const repeat = timing.repeat === 0 ? 'indefinite' : Math.max(1, timing.repeat);
  return `begin="${Math.max(0, Math.round(timing.delay))}ms" dur="${Math.max(
    1,
    Math.round(timing.duration)
  )}ms" repeatCount="${repeat}" fill="freeze"`;
}

export interface EffectDefinition {
  id: string;
  category: EffectCategory;
  label: string;
  /** Which options this effect takes; a panel offers exactly these. */
  takes: { direction?: boolean; amount?: boolean; color?: boolean };
  /** What it animates through, for the options it was given. */
  frames: (options: EffectOptions) => Keyframe[];
  /**
   * An SVG filter this effect *is*, for the looks CSS has no function for.
   *
   * When it is here, `frames` is empty and the animation runs on the filter
   * instead — see `SvgFilter`.
   */
  svg?: SvgFilter;
  /**
   * That this emphasis **does not come back**, on purpose.
   *
   * An emphasis is out and back — that is what the category means here, and what
   * makes it something a transition could not express. One of them is deliberately
   * not: a drift that returned would be a shake.
   *
   * Declared rather than left to a note, because the claim is checked *both ways*:
   * a one-way emphasis that starts returning fails on the flag, the same rule the
   * conformance harness applies to its own exemptions. It is also worth a reader
   * knowing — a shape left somewhere new is a thing to be told about before it is
   * chosen, not after.
   */
  oneWay?: boolean;
  /**
   * Which **kind of thing inside the shape** this effect animates.
   *
   * Absent for almost everything: an entrance moves the shape. A sweep turns one
   * of its *fills* and a deepen grows one of its *shadows*, and those are lists —
   * so the effect says which list and the step says which item (`partAt`). The
   * effect declaring it is what lets a panel offer the row at all, and is the
   * same rule as `takes`: an option nobody declared is not drawn.
   */
  part?: TrackPart;
}

/** The middle of each option's range, used when a document says nothing. */
export const DEFAULT_DIRECTION: Direction = 'left';
export const DEFAULT_AMOUNT = 0.5;

const amountOf = (options: EffectOptions, low: number, high: number): number => {
  const value =
    typeof options.amount === 'number' && Number.isFinite(options.amount)
      ? Math.min(1, Math.max(0, options.amount))
      : DEFAULT_AMOUNT;
  return low + (high - low) * value;
};

const vectorOf = (options: EffectOptions): { x: number; y: number } =>
  VECTORS[options.direction ?? DEFAULT_DIRECTION];

/**
 * A translation of a given size in a direction, as a percentage of the shape.
 *
 * The `translate` property's own syntax — two lengths, no function — because it
 * is a property and not a `transform` value.
 */
const shift = (options: EffectOptions, distance: number): string => {
  const vector = vectorOf(options);
  const x = Math.round(vector.x * distance);
  const y = Math.round(vector.y * distance);
  return `${x}% ${y}%`;
};

/**
 * A wipe's `inset`, which reveals *from* the direction it is given.
 *
 * The inset names the side that is *hidden*, so revealing from the left means
 * insetting from the right — the sign that reads backwards in every
 * implementation of this, including the first one here.
 */
const wipeFrom = (options: EffectOptions): string => {
  switch (options.direction ?? DEFAULT_DIRECTION) {
    case 'right':
      return 'inset(0 0 0 100%)';
    case 'up':
      return 'inset(0 0 100% 0)';
    case 'down':
      return 'inset(100% 0 0 0)';
    default:
      return 'inset(0 100% 0 0)';
  }
};

const effect = (
  id: string,
  category: EffectCategory,
  label: string,
  takes: EffectDefinition['takes'],
  frames: EffectDefinition['frames'],
  svg?: SvgFilter,
  part?: TrackPart,
  oneWay?: boolean
): EffectDefinition => ({
  id,
  category,
  label,
  takes,
  frames,
  ...(svg ? { svg } : {}),
  ...(part ? { part } : {}),
  ...(oneWay ? { oneWay } : {})
});

export const MOTION_EFFECTS: EffectDefinition[] = [
  // ── Entrances ────────────────────────────────────────────────────────────
  effect('fade', 'entrance', '흐리게 나타내기', {}, () => [{ opacity: 0 }, { opacity: 1 }]),

  effect('fly', 'entrance', '날아오기', { direction: true, amount: true }, (options) => [
    // From the direction it names: 40% of the shape at the middle setting, and
    // a whole shape's width at the top of the range.
    { translate: shift(options, amountOf(options, 20, 110)), opacity: 0 },
    { translate: '0 0', opacity: 1 }
  ]),

  effect('grow', 'entrance', '확대하며 나타내기', { amount: true }, (options) => [
    { scale: amountOf(options, 0.9, 0.2).toFixed(2), opacity: 0 },
    { scale: '1', opacity: 1 }
  ]),

  effect('wipe', 'entrance', '닦아내며 나타내기', { direction: true }, (options) => [
    { clipPath: wipeFrom(options) },
    { clipPath: 'inset(0 0 0 0)' }
  ]),

  effect('spinIn', 'entrance', '돌면서 나타내기', { amount: true }, (options) => [
    { rotate: `${Math.round(amountOf(options, 45, 360))}deg`, scale: '0.6', opacity: 0 },
    { rotate: '0deg', scale: '1', opacity: 1 }
  ]),

  // ── Emphasis: out and back, which a transition could not express at all ──
  effect('pulse', 'emphasis', '커졌다 작아지기', { amount: true }, (options) => [
    { scale: '1', offset: 0 },
    { scale: amountOf(options, 1.04, 1.4).toFixed(2), offset: 0.5 },
    { scale: '1', offset: 1 }
  ]),

  /**
   * A whole number of turns, which it was not.
   *
   * Composed *with* the shape's own rotation rather than instead of it: a rectangle
   * turned 30° spins from 30° to 390°, which is what a reader who turned it expects
   * to see.
   *
   * The amount used to be `180…720` degrees, so the default landed on **450** — an
   * emphasis that leaves the shape turned 90° and then snaps back when the
   * animation ends. Found by asking every emphasis in the table whether its last
   * frame equals its first; nothing had asked, and the label already said 한 바퀴.
   * The amount is turns now, so every value of it returns.
   */
  effect('spin', 'emphasis', '한 바퀴 돌기', { amount: true }, (options) => [
    { rotate: '0deg' },
    { rotate: `${Math.round(amountOf(options, 1, 3)) * 360}deg` }
  ]),

  effect('flash', 'emphasis', '깜박이기', {}, () => [
    { opacity: 1, offset: 0 },
    { opacity: 0.15, offset: 0.5 },
    { opacity: 1, offset: 1 }
  ]),

  effect('nudge', 'emphasis', '흔들기', { direction: true, amount: true }, (options) => [
    { translate: '0 0', offset: 0 },
    { translate: shift(options, -amountOf(options, 2, 10)), offset: 0.25 },
    { translate: shift(options, amountOf(options, 2, 10)), offset: 0.75 },
    { translate: '0 0', offset: 1 }
  ]),

  /**
   * Three effects the reference tools have and this table did not, and every one
   * of them exists because a *preset* wanted it.
   *
   * Measured against Canva's element and text animations, Figma's prototyping
   * transitions and CapCut's in/out/loop lists — the three between them offer
   * about thirty names for a dozen ideas, and these were the ideas this table
   * could not express at all:
   *
   * - **From bigger, not smaller.** Canva's Stomp and CapCut's 쿵 land a shape by
   *   shrinking *onto* the slide. `grow` only ever comes from smaller, so a slam
   *   was not a matter of options.
   * - **A one-way drift.** Canva's Pan and Drift move a shape slowly while it is
   *   read, and do not come back. `nudge` returns to where it started, which is
   *   what makes it a shake rather than a drift.
   * - **Glow.** Canva's Neon and CapCut's 네온 are a *filter*, which §7b of the
   *   spec calls tier two and nothing in this product had used. This is the first
   *   reader of it — and the answer to a backlog entry that said so.
   */
  effect('slamIn', 'entrance', '쿵 내려앉기', { amount: true }, (options) => [
    // From *larger*: a shape that lands rather than one that arrives.
    { scale: amountOf(options, 1.15, 2.2).toFixed(2), opacity: 0 },
    { scale: '1', opacity: 1 }
  ]),

  effect('glow', 'emphasis', '빛나기', { amount: true, color: true }, (options) => {
    const spread = Math.round(amountOf(options, 4, 22));
    // `currentColor` unless a reader chose one: a glow in the shape's own colour
    // is right for text and wrong for a photograph, so it is the default rather
    // than the rule.
    const colour = options.color ?? 'currentColor';
    return [
      { filter: `brightness(1) drop-shadow(0 0 0 ${colour})`, offset: 0 },
      {
        filter: `brightness(${amountOf(options, 1.1, 1.8).toFixed(2)}) drop-shadow(0 0 ${spread}px ${colour})`,
        offset: 0.5
      },
      { filter: `brightness(1) drop-shadow(0 0 0 ${colour})`, offset: 1 }
    ];
  }),

  /**
   * The filters `filter` bought once it had a colour and a measurement.
   *
   * Measured (`docs/specs/motion-model.md` §2, §7d): a list of CSS filter
   * functions interpolates function by function — `blur(3px) saturate(2)
   * hue-rotate(60deg)` at the midpoint of three — and `backdrop-filter`
   * interpolates too, which is a shape that blurs *what is behind it* rather
   * than itself.
   */
  /**
   * A whole number of turns of the wheel, which the range did not guarantee.
   *
   * The comment here said "a full turn and back to where it started, so a loop of
   * it does not jump: 360° is the same colour as 0°" — and the range was `90…360`,
   * so only the very top of it returned. The default landed on 225°, leaving every
   * colour on the shape shifted for as long as the animation held.
   *
   * The comment was the evidence: it described what was meant, the arithmetic did
   * something else, and nothing asked. Found the same way `spin` was — by asking
   * every emphasis in the table whether it comes back.
   */
  effect('hueShift', 'emphasis', '색이 돌기', { amount: true }, (options) => [
    { filter: 'hue-rotate(0deg)' },
    { filter: `hue-rotate(${Math.round(amountOf(options, 1, 3)) * 360}deg)` }
  ]),

  effect('tint', 'emphasis', '물들기', { amount: true, color: true }, (options) => {
    const colour = options.color ?? 'currentColor';
    const spread = Math.round(amountOf(options, 2, 12));
    return [
      { filter: `saturate(1) drop-shadow(0 0 0 ${colour})`, offset: 0 },
      {
        filter: `saturate(${amountOf(options, 1.4, 3).toFixed(2)}) drop-shadow(0 0 ${spread}px ${colour})`,
        offset: 0.5
      },
      { filter: `saturate(1) drop-shadow(0 0 0 ${colour})`, offset: 1 }
    ];
  }),

  /**
   * A bloom: light spilling out of the shape, which CSS has no function for.
   *
   * `drop-shadow` puts a coloured blur *outside* an opaque shape and nothing
   * inside it; a bloom is the shape's own light, blurred and laid back over
   * itself. Four primitives, and the one that animates is the flood's opacity —
   * measured to interpolate through the Web Animations API, which is why this
   * effect needs no second animation system.
   *
   * The first reader of the SVG seam. What it proves is that the *look* can come
   * from SVG while the *motion* stays ours.
   */
  effect(
    'bloom',
    'emphasis',
    '빛이 번지기',
    { amount: true, color: true },
    () => [],
    {
      markup: (options) => {
        const spread = Math.round(amountOf(options, 3, 18));
        const colour = options.color ?? '#ffffff';
        return `
          <feFlood %TARGET% flood-color="${colour}" flood-opacity="0" result="lit"/>
          <feComposite in="lit" in2="SourceGraphic" operator="in" result="inside"/>
          <feGaussianBlur in="inside" stdDeviation="${spread}" result="spill"/>
          <feMerge><feMergeNode in="spill"/><feMergeNode in="SourceGraphic"/></feMerge>
        `;
      },
      frames: (options) => [
        { floodOpacity: 0, offset: 0 },
        { floodOpacity: amountOf(options, 0.5, 1), offset: 0.5 },
        { floodOpacity: 0, offset: 1 }
      ]
    }
  ),

  /**
   * The two effects that need **SMIL**, because what they animate is not a CSS
   * property and never will be.
   *
   * A melt displaces the shape through a noise field; a chromatic split pulls its
   * red channel away from its cyan one. `feDisplacementMap`'s `scale` and
   * `feOffset`'s `dx` are XML attributes, so the Web Animations API cannot touch
   * them — and SMIL can, is scrubbable through `setCurrentTime`, and keeps one
   * clock per `<svg>`, which is one per step. All measured.
   *
   * Out and back, both of them: a melt that stayed melted is a shape somebody
   * would try to click on.
   */
  effect(
    'melt',
    'emphasis',
    '녹아 흐르기',
    { amount: true },
    () => [],
    {
      markup: (options, timing) => {
        const scale = Math.round(amountOf(options, 8, 60));
        return `
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" seed="7" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0"
            xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" values="0;${scale};0" ${smilTiming(timing)}/>
          </feDisplacementMap>
        `;
      }
    }
  ),

  effect(
    'chromatic',
    'emphasis',
    '색이 갈라지기',
    { amount: true },
    () => [],
    {
      markup: (options, timing) => {
        const split = Math.round(amountOf(options, 2, 14));
        return `
          <feColorMatrix in="SourceGraphic" type="matrix" result="red"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
          <feColorMatrix in="SourceGraphic" type="matrix" result="cyan"
            values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>
          <feOffset in="red" dx="0" dy="0" result="redOut">
            <animate attributeName="dx" values="0;${split};0" ${smilTiming(timing)}/>
          </feOffset>
          <feOffset in="cyan" dx="0" dy="0" result="cyanOut">
            <animate attributeName="dx" values="0;${-split};0" ${smilTiming(timing)}/>
          </feOffset>
          <feBlend in="redOut" in2="cyanOut" mode="screen"/>
        `;
      }
    }
  ),

  /**
   * The other two `attributeName`s worth animating, now the SMIL seam exists.
   *
   * `feMorphology`'s **radius** thickens or thins the shape itself — an *erode*
   * eats a glyph's strokes from both sides, so running one backwards is text
   * swelling into place and running it forwards is text thinning away to nothing.
   * Neither is expressible in CSS at all: there is no filter function for it, and
   * the radius is an XML attribute, which is why this is SMIL like the melt.
   *
   * Two effects rather than one with a direction, because they are two different
   * things a reader asks for — an entrance and an exit — and the table is where
   * that distinction lives (`categoryOf` is what decides whether a shape stays
   * gone afterwards, see §7h).
   *
   * The static `radius` is the animation's *first* value in both, so the frame
   * before the SMIL clock starts is the frame the SMIL starts from. Getting that
   * wrong is a flash of the untouched shape, which is the kind of thing that only
   * shows up on a projector.
   */
  effect(
    'thickenIn',
    'entrance',
    '굵어지며 나타내기',
    { amount: true },
    () => [],
    {
      markup: (options, timing) => {
        const eaten = amountOf(options, 1, 4).toFixed(2);
        return `
          <feMorphology in="SourceGraphic" operator="erode" radius="${eaten}">
            <animate attributeName="radius" values="${eaten};0" ${smilTiming(timing)}/>
          </feMorphology>
        `;
      }
    }
  ),

  effect(
    'thinOut',
    'exit',
    '얇아지며 사라지기',
    { amount: true },
    () => [],
    {
      markup: (options, timing) => {
        const eaten = amountOf(options, 1, 4).toFixed(2);
        return `
          <feMorphology in="SourceGraphic" operator="erode" radius="0">
            <animate attributeName="radius" values="0;${eaten}" ${smilTiming(timing)}/>
          </feMorphology>
        `;
      }
    }
  ),

  /**
   * A shimmer: the *noise* moving while the displacement stays still.
   *
   * The melt animates `feDisplacementMap`'s scale — how far the shape is pushed —
   * and this animates `feTurbulence`'s `baseFrequency`, which is what the noise
   * field *is*. Same two primitives, opposite halves, and they read completely
   * differently: a melt flows, and a shimmer sits still and glitters, because
   * every pixel keeps moving a little while nothing moves far.
   *
   * One octave rather than the melt's two: a shimmer wants fine grain, and a
   * second octave at this scale reads as dirt on the projector.
   */
  effect(
    'shimmer',
    'emphasis',
    '아른거리기',
    { amount: true },
    () => [],
    {
      markup: (options, timing) => {
        const from = 0.02;
        const to = (from + amountOf(options, 0.01, 0.06)).toFixed(3);
        const push = Math.round(amountOf(options, 2, 8));
        return `
          <feTurbulence type="fractalNoise" baseFrequency="${from}" numOctaves="1" seed="3"
            result="grain">
            <animate attributeName="baseFrequency" values="${from};${to};${from}"
              ${smilTiming(timing)}/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="${push}"
            xChannelSelector="R" yChannelSelector="G"/>
        `;
      }
    }
  ),

  /**
   * `backdrop-filter`, which is the one filter about the *slide* rather than about
   * the shape: a panel that frosts what it covers.
   *
   * Out **and back**, which it was not. It went from clear to frosted and stopped
   * there — leaving the panel frosted for as long as the animation held, which is a
   * change to the slide rather than an emphasis of it. The section this sits in is
   * titled "out and back, which a transition could not express at all", and every
   * other effect under it returns; this one did not, and nothing asked.
   */
  effect('frost', 'emphasis', '뒤가 흐려지기', { amount: true }, (options) => [
    { backdropFilter: 'blur(0px) saturate(1)', offset: 0 },
    {
      backdropFilter: `blur(${Math.round(amountOf(options, 3, 20))}px) saturate(${amountOf(
        options,
        1,
        1.6
      ).toFixed(2)})`,
      offset: 0.5
    },
    { backdropFilter: 'blur(0px) saturate(1)', offset: 1 }
  ]),

  effect('blurIn', 'entrance', '흐린 데서 나타내기', { amount: true }, (options) => [
    // A focus pull: the shape arrives *from* out of focus, which reads as depth
    // rather than as movement. The second thing `filter` made possible.
    { filter: `blur(${Math.round(amountOf(options, 4, 24))}px)`, opacity: 0 },
    { filter: 'blur(0px)', opacity: 1 }
  ]),

  /**
   * One way, and it stays there: a drift that returned would be a shake.
   *
   * The one emphasis that does not come back, and it says so — `oneWay`. It was a
   * comment, which is a note, and a note cannot be told apart from an oversight by
   * anything that checks. The flag is checked in both directions.
   */
  effect(
    'drift',
    'emphasis',
    '천천히 흐르기',
    { direction: true, amount: true },
    (options) => [{ translate: '0 0' }, { translate: shift(options, amountOf(options, 3, 18)) }],
    undefined,
    undefined,
    true
  ),

  // ── Exits ────────────────────────────────────────────────────────────────
  effect('fadeOut', 'exit', '흐리게 사라지기', {}, () => [{ opacity: 1 }, { opacity: 0 }]),

  effect('flyOut', 'exit', '날아가기', { direction: true, amount: true }, (options) => [
    { translate: '0 0', opacity: 1 },
    // *To* the direction it names, where an entrance comes *from* it.
    { translate: shift(options, amountOf(options, 20, 110)), opacity: 0 }
  ]),

  effect('grayOut', 'exit', '흑백으로 사라지기', { amount: true }, (options) => [
    // Colour first, then the shape: a slide that has moved on, rather than one
    // that has lost something. Both in one animation because a grayscale that
    // stayed would be a shape still on the slide.
    { filter: 'grayscale(0) blur(0px)', opacity: 1 },
    {
      filter: `grayscale(1) blur(${Math.round(amountOf(options, 0, 6))}px)`,
      opacity: 0
    }
  ]),

  effect('shrinkOut', 'exit', '작아지며 사라지기', { amount: true }, (options) => [
    { scale: '1', opacity: 1 },
    { scale: amountOf(options, 0.9, 0.2).toFixed(2), opacity: 0 }
  ]),

  /**
   * A card lifting off the slide, which is a shadow and a rise together.
   *
   * The shadow is a `drop-shadow()` on the filter list rather than a `box-shadow`
   * — the one property this product measured and decided *not* to give a track
   * (see `motion-tracks.ts`). Which turns out better than the shadow it could not
   * scale: a `drop-shadow` follows the shape's **silhouette**, so a title and a
   * star lift as themselves rather than as their boxes.
   *
   * Additive, like every filter here, so a shape that already has a blur or a
   * shadow of its own keeps it and gains this one.
   */
  effect('lift', 'emphasis', '들어올리기', { amount: true, color: true }, (options) => {
    const depth = Math.round(amountOf(options, 6, 30));
    const shade = options.color ?? 'rgba(15, 23, 42, 0.45)';
    return [
      { filter: `drop-shadow(0 0 0 ${shade})`, translate: '0 0', offset: 0 },
      { filter: `drop-shadow(0 ${Math.round(depth / 2)}px ${depth}px ${shade})`,
        translate: `0 ${-Math.max(1, Math.round(depth / 8))}%`, offset: 0.5 },
      { filter: `drop-shadow(0 0 0 ${shade})`, translate: '0 0', offset: 1 }
    ];
  }),

  /**
   * The corners rounding as the shape arrives — the softest entrance there is.
   *
   * `border-radius` needs none of the machinery beside it: it is one length, the
   * browser interpolates it, and it is in `MUST_ADD`, so a shape with 8px corners
   * arrives from 8+n rather than losing what the document gave it. The one
   * property this file animates whose *end* value is nothing at all.
   */
  effect('soften', 'entrance', '모서리가 펴지며 나타내기', { amount: true }, (options) => [
    { borderRadius: `${Math.round(amountOf(options, 12, 64))}px`, opacity: 0 },
    { borderRadius: '0px', opacity: 1 }
  ]),

  /**
   * A gradient turning inside the shape — the light moving across it.
   *
   * The one effect in this table that animates **nothing about the element**: the
   * shape does not move, the fill does. Which is only possible through a track,
   * because `background-image` has no midpoint between two angles (measured), and
   * it is the reason `motion-tracks.ts` exists.
   *
   * A shape with no gradient runs this correctly and invisibly — the track says
   * so in `needs`, which is what a panel has to read to warn a reader.
   */
  effect(
    'sweep',
    'emphasis',
    '그라디언트 돌기',
    { amount: true },
    (options) => {
      const at = options.partAt ?? 0;
      return [
        { [trackName('fillAngle', at)]: '0deg', offset: 0 },
        {
          /**
           * Whole turns, which the range did not guarantee.
           *
           * 360° of a gradient is the same gradient, and the amount ran `90…360` — so
           * the default left it turned 225° for as long as the animation held. The
           * fourth effect in this table with the same fault, all four found by asking
           * every emphasis whether it comes back rather than by looking at any of
           * them: `spin`, `hueShift`, `frost` and this.
           */
          [trackName('fillAngle', at)]: `${Math.round(amountOf(options, 1, 3)) * 360}deg`,
          offset: 1
        }
      ];
    },
    undefined,
    'fill'
  ),

  /**
   * A photograph drifting inside the shape it fills — the Ken Burns pan.
   *
   * The half of a Ken Burns that is possible today. Measured: `background-position`
   * animates **even under `cover`**, because a covered picture overflows its box, so
   * there is somewhere for it to go. The *zoom* is not possible — `cover` cannot be
   * multiplied, and a numeric size is a different fit rather than a closer view of
   * the same one — and waits for fills to be drawn as layer elements.
   *
   * Two tracks, one per axis, because a drift is a direction: the effect's own
   * compass decides how much of each.
   */
  effect(
    'bgPan',
    'emphasis',
    '배경 밀기',
    { direction: true, amount: true },
    (options) => {
      const at = options.partAt ?? 0;
      const vector = vectorOf(options);
      const reach = amountOf(options, 6, 40);
      /**
       * From where the picture is towards the direction named — **from zero**,
       * which changed the day the fills became elements: a background's position
       * is where the picture *sits* (the centre being 50%), and an element's
       * `translate` is a move from where it already is. See `motion-tracks.ts`,
       * where the neutral says the same thing.
       */
      const to = (axis: number) => `${Math.round(axis * reach)}%`;
      return [
        { [trackName('fillPanX', at)]: '0%', [trackName('fillPanY', at)]: '0%', offset: 0 },
        {
          [trackName('fillPanX', at)]: to(vector.x),
          [trackName('fillPanY', at)]: to(vector.y),
          offset: 1
        }
      ];
    },
    undefined,
    'fill',
    /**
     * One way, like `drift` and for the same reason turned inside out: a Ken Burns
     * *is* a slow drift across a picture, and one that came back would be a wobble.
     * Declared rather than left to be noticed — see `oneWay`.
     */
    true
  ),

  /**
   * A photograph coming closer — the other half of a Ken Burns, and the reason
   * the fills are elements at all.
   *
   * `cover` cannot be multiplied: `background-size: calc(100% * 1.4)` is a
   * different **fit** rather than a nearer view of the same one, and there is no
   * numeric `cover` without the picture's proportions against the box's. On an
   * `<img>` inside a clipping layer it is `scale`, which is composited — so the
   * zoom is not only possible but *cheaper* than the pan used to be.
   *
   * Held at the end rather than returned, because a Ken Burns is a slow drift that
   * stays where it got to: paired with `배경 밀기` on the same step, this is the
   * shot every deck opens with.
   */
  effect(
    'bgZoom',
    'emphasis',
    '배경 확대',
    { amount: true },
    (options) => {
      const at = options.partAt ?? 0;
      return [
        { [trackName('fillZoom', at)]: '1', offset: 0 },
        { [trackName('fillZoom', at)]: amountOf(options, 1.08, 1.6).toFixed(2), offset: 1 }
      ];
    },
    undefined,
    'fill',
    /** One way, like `bgPan`: the other half of the same Ken Burns. */
    true
  ),

  /**
   * One fill fading out, which is a **cross-fade** when there is another under it.
   *
   * The thing a `background` could not do at all: it has no alpha, so a fill's
   * opacity was drawn as a transparent wash over the picture — a no-op, measured.
   * Now the layer is an element and its opacity is its own, so fading the top
   * photograph reveals the one beneath and the shape itself never moves.
   *
   * Two effects rather than one with a direction, because they are two different
   * things a reader wants: the top fill going away, and a fill arriving. A
   * cross-fade is both, on one step, aimed at two fills.
   */
  effect(
    'fillOut',
    'emphasis',
    '채우기 사라지기',
    {},
    (options) => {
      const at = options.partAt ?? 0;
      return [
        { [trackName('fillFade', at)]: '1', offset: 0 },
        { [trackName('fillFade', at)]: '0', offset: 1 }
      ];
    },
    undefined,
    'fill',
    /**
     * One way, and that is what a cross-fade is: the top fill goes away and stays
     * away, revealing the one beneath. A fade that came back would undo the reveal.
     */
    true
  ),

  effect(
    'fillIn',
    'emphasis',
    '채우기 나타나기',
    {},
    (options) => {
      const at = options.partAt ?? 0;
      return [
        { [trackName('fillFade', at)]: '0', offset: 0 },
        { [trackName('fillFade', at)]: '1', offset: 1 }
      ];
    },
    undefined,
    'fill',
    /**
     * One way, and that is what a cross-fade is: the top fill goes away and stays
     * away, revealing the one beneath. A fade that came back would undo the reveal.
     */
    true
  ),

  /**
   * The shape's **own** shadow growing — one of them, when it has several.
   *
   * Which is what a track is for and `drop-shadow` is not: `들어올리기` adds a
   * shadow to whatever the shape has, and this one scales the shadow the reader
   * designed. A card with a soft shadow *and* a hard key line can now deepen the
   * soft one and leave the line alone.
   */
  effect(
    'deepen',
    'emphasis',
    '그림자 깊어지기',
    { amount: true },
    (options) => {
      const at = options.partAt ?? 0;
      const grown = amountOf(options, 1.4, 3).toFixed(2);
      return [
        { [trackName('shadowLift', at)]: '1', offset: 0 },
        { [trackName('shadowLift', at)]: grown, offset: 0.5 },
        { [trackName('shadowLift', at)]: '1', offset: 1 }
      ];
    },
    undefined,
    'shadow'
  ),

  /**
   * The fill turning a colour and coming back.
   *
   * ## One keyframe, in the middle
   *
   * The only effect here with a single frame, and it is the whole trick: an
   * animation whose list has no start and no end takes **the underlying value** for
   * both — which is the shape's own declaration of its colour track. So it goes from
   * the colour the document holds, through the colour the reader asked for, and back
   * to the document's, and this function never learns what that colour is.
   *
   * Measured, because the obvious version was wrong. Returning to `inherit` at
   * offsets 0 and 1 reads the *parent's* value, not this element's declaration — and
   * a shape whose parent declares nothing inherits the registration's
   * `initial-value`, so the emphasis started from `rgba(255, 0, 0, 0.004)`: an
   * interpolation out of transparent. With one keyframe: `rgb(37, 99, 235)` at the
   * start, red in the middle, and `rgb(37, 99, 235)` again after it is cancelled.
   *
   * `color: true`, so the panel offers a swatch. Without one it turns the fill the
   * accent, which is the colour a reader means nine times out of ten.
   */
  effect(
    'recolor',
    'emphasis',
    '채우기 색 바뀌기',
    { color: true },
    (options) => [
      { [trackName('fillColor', options.partAt ?? 0)]: options.color ?? '#2563eb', offset: 0.5 }
    ],
    undefined,
    'fill'
  ),

  /**
   * The gradient's colours sliding along it — a shine crossing the shape.
   *
   * The other thing that can be done to a gradient without redrawing it, beside
   * turning it: every stop moves by the same amount, so the band of colour travels
   * and the shape the designer gave it is kept. A gradient with its stops at 10%
   * and 60% stays 50% wide the whole way across.
   *
   * Out and back, because it is an emphasis: a gradient left shifted 40% is a
   * gradient the reader did not design, and a motion that quietly redesigns the
   * shape is one that cannot be undone by removing it.
   */
  effect(
    'shine',
    'emphasis',
    '그라디언트 훑기',
    { amount: true },
    (options) => {
      const at = options.partAt ?? 0;
      const across = `${Math.round(amountOf(options, 20, 60))}%`;
      return [
        { [trackName('fillStop', at)]: '0%', offset: 0 },
        { [trackName('fillStop', at)]: across, offset: 0.5 },
        { [trackName('fillStop', at)]: '0%', offset: 1 }
      ];
    },
    undefined,
    'fill'
  )
];

const BY_ID = new Map(MOTION_EFFECTS.map((entry) => [entry.id, entry]));

export const EFFECT_IDS = MOTION_EFFECTS.map((entry) => entry.id);

/**
 * The names this product used to have, and what each one is now.
 *
 * A document written last week says `flyInLeft`, and it has to go on meaning
 * what it meant — so a legacy name resolves to the effect it became *and* the
 * option it was carrying. Nothing rewrites the document: it is read this way
 * every time, and a step only changes when a reader changes it.
 *
 * This is the cost of having put the direction in the name, paid once, in one
 * table, rather than by every reader of every deck.
 */
const LEGACY: Record<string, { id: string; direction?: Direction }> = {
  fadeIn: { id: 'fade' },
  flyInLeft: { id: 'fly', direction: 'left' },
  flyInRight: { id: 'fly', direction: 'right' },
  flyInUp: { id: 'fly', direction: 'down' },
  growIn: { id: 'grow' },
  wipeIn: { id: 'wipe', direction: 'left' },
  flyOutLeft: { id: 'flyOut', direction: 'left' }
};

/** Every name a document may hold: the effects, and the ones they replaced. */
export const KNOWN_EFFECT_IDS = [...EFFECT_IDS, ...Object.keys(LEGACY)];

/**
 * What a stored effect name means: its definition, and any option the name was
 * carrying.
 *
 * One function for both, because a caller that resolved the definition and
 * forgot the direction would draw `flyInLeft` flying in from the default side —
 * a deck that silently changed on being opened, which is the worst kind of
 * change.
 */
export function resolveEffect(
  id: string | undefined
): { definition: EffectDefinition; options: EffectOptions } | undefined {
  if (!id) return undefined;

  const direct = BY_ID.get(id);
  if (direct) return { definition: direct, options: {} };

  const legacy = LEGACY[id];
  if (!legacy) return undefined;

  const definition = BY_ID.get(legacy.id);
  return definition
    ? { definition, options: legacy.direction ? { direction: legacy.direction } : {} }
    : undefined;
}

export function effectDefinition(id: string | undefined): EffectDefinition | undefined {
  return resolveEffect(id)?.definition;
}

/** Which category an effect belongs to, or nothing for a name we do not have. */
export function categoryOf(id: string | undefined): EffectCategory | undefined {
  return effectDefinition(id)?.category;
}

/**
 * The frames a step animates through: its effect, with its options applied.
 *
 * The options a *step* carries win over the ones its name carried, so a deck
 * that said `flyInLeft` and has since been given a direction of its own follows
 * the newer answer — and a step that says nothing keeps what its name meant.
 */
export function framesFor(id: string | undefined, options: EffectOptions): Keyframe[] {
  const resolved = resolveEffect(id);
  if (!resolved) return [];

  return resolved.definition.frames({
    direction: options.direction ?? resolved.options.direction,
    amount: options.amount,
    color: options.color,
    /**
     * Which item of the target's list, for the effects that animate one.
     *
     * Named here rather than spread, so that adding an option means adding it in
     * this one place — and left out once already, which cost a test: a sweep on
     * the second fill turned the first, because the index never arrived.
     */
    partAt: options.partAt
  });
}

/**
 * Which CSS properties an effect actually writes.
 *
 * Read off the frames rather than declared beside them, because a declaration
 * beside a table is a second copy of the table: an effect that grew a `filter`
 * would animate one and this would still say it did not. The frames are the
 * truth and this asks them.
 *
 * What needs it is *two motions at once*. Two animations of the same property
 * are `replace` by default — newest wins — so a fly and a nudge on one shape at
 * one moment produced only the nudge. Knowing which properties a step writes is
 * what makes it possible to say "these two overlap, so the second one adds".
 */
export function propertiesOf(id: string | undefined, options: EffectOptions = {}): string[] {
  const found = new Set<string>();
  // An SVG effect writes the shape's `filter` — the whole property, as a `url()`
  // — so two of them on one shape at one moment is the second one winning, and
  // the timeline has to know that.
  if (effectDefinition(id)?.svg) found.add('filter');
  for (const frame of framesFor(id, options)) {
    for (const key of Object.keys(frame)) {
      // `offset` is *when*, not *what*.
      if (key !== 'offset') found.add(key);
    }
  }
  return [...found];
}

/**
 * The properties that cannot be added, whatever the reader asks for.
 *
 * `rotate` is the whole list, and it is a browser fault rather than a rule: two
 * additive `rotate` animations in Chromium interpolate as 90·t·(1−t) — they rise,
 * fall, and **end at zero**, so a shape turns and then untwists itself. Measured
 * at four points against a single animation's 22.5°/45°/90°.
 *
 * Additive rotation over a *static* rotate is correct, so this is specifically
 * about compositing two animations. A step that turns therefore stays `replace`
 * and the later one wins — which is what this product already did, and at least
 * ends where it says it will.
 */
export const NOT_ADDITIVE = ['rotate'] as const;

/**
 * One step's frames, split into what must be added and what must not.
 *
 * `composite` is a property of an *animation*, not of a property, so a step that
 * animates `opacity` and `filter` together cannot be one animation: adding is
 * the only reading that keeps the shape's static filter (see `MUST_ADD`), and
 * it is the wrong reading for opacity, which would then start at the shape's own
 * 1 instead of at 0. So it is two animations on the same timing — which is what
 * the stage already does for a trail and for letters, and costs nothing.
 *
 * Returned as a pair rather than mutated in place, and `offset` is copied into
 * both halves: the two animations have to agree about *when* as exactly as they
 * agree about what.
 *
 * A frame whose half is empty is dropped from that half. If every frame's half
 * is empty the half is empty, and the stage makes one animation as before.
 */
export function splitAdditive(frames: Keyframe[]): { additive: Keyframe[]; plain: Keyframe[] } {
  const additive: Keyframe[] = [];
  const plain: Keyframe[] = [];

  for (const frame of frames) {
    const listed: Keyframe = {};
    const rest: Keyframe = {};
    for (const [key, value] of Object.entries(frame)) {
      if (key === 'offset') continue;
      const into = (MUST_ADD as readonly string[]).includes(key) ? listed : rest;
      (into as Record<string, unknown>)[key] = value;
    }

    const at = frame.offset;
    if (Object.keys(listed).length > 0) {
      additive.push(at === undefined ? listed : { ...listed, offset: at });
    }
    if (Object.keys(rest).length > 0) {
      plain.push(at === undefined ? rest : { ...rest, offset: at });
    }
  }

  /**
   * A half of one frame is not an animation, and not a split either.
   *
   * Frames with no offsets are spread evenly across the duration, so a half that
   * kept one frame out of three would run from the shape's own value to that
   * frame's — a different motion from the one the effect described. No effect in
   * the table does this today; if one ever does, the honest answer is the old
   * behaviour rather than a motion nobody asked for, so the split is refused and
   * the caller animates the frames whole.
   */
  const unsound = (half: Keyframe[]) => half.length === 1;
  if (unsound(additive) || unsound(plain)) return { additive: [], plain: frames };

  return { additive, plain };
}

/**
 * The easings a reader can choose, and the CSS each one is.
 *
 * Presets *and* a curve, which is what Figma offers and what anybody who has
 * animated anything expects: the presets are the answer nine times out of ten,
 * and the tenth needs a curve nobody's preset list contains. A document may hold
 * either — a name, or a `cubic-bezier(...)` it wrote itself.
 */
export const EASING_PRESETS = [
  { id: 'linear', label: '일정하게', css: 'linear', points: [0, 0, 1, 1] },
  { id: 'ease', label: '기본', css: 'ease', points: [0.25, 0.1, 0.25, 1] },
  { id: 'easeIn', label: '천천히 시작', css: 'cubic-bezier(0.42, 0, 1, 1)', points: [0.42, 0, 1, 1] },
  { id: 'easeOut', label: '천천히 끝', css: 'cubic-bezier(0, 0, 0.58, 1)', points: [0, 0, 0.58, 1] },
  {
    id: 'easeInOut',
    label: '천천히 시작하고 끝',
    css: 'cubic-bezier(0.42, 0, 0.58, 1)',
    points: [0.42, 0, 0.58, 1]
  },
  {
    // The overshoot every design tool has and no CSS keyword does: it goes past
    // its destination and settles back, which is what makes a build feel made
    // rather than computed.
    id: 'backOut',
    label: '살짝 지나쳤다 돌아오기',
    css: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    points: [0.34, 1.56, 0.64, 1]
  }
] as const;

export type EasingPreset = (typeof EASING_PRESETS)[number]['id'];

const PRESET_BY_ID = new Map(EASING_PRESETS.map((preset) => [preset.id, preset]));

/** A `cubic-bezier(a, b, c, d)` a document wrote, as four numbers. */
export function bezierPoints(value: string): [number, number, number, number] | undefined {
  const match = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(
    value.trim()
  );
  if (!match) return undefined;

  const numbers = match.slice(1, 5).map(Number) as [number, number, number, number];
  if (numbers.some((number) => !Number.isFinite(number))) return undefined;
  /**
   * The two x values are the only ones that are bounded.
   *
   * CSS allows y outside 0–1 and that is exactly what an overshoot is; x outside
   * 0–1 would mean time running backwards, which the browser refuses — and a
   * document that says it should draw as the default rather than as nothing.
   */
  if (numbers[0] < 0 || numbers[0] > 1 || numbers[2] < 0 || numbers[2] > 1) return undefined;
  return numbers;
}

/**
 * The CSS easing for what a step says, or the default.
 *
 * A name this product has, a curve the document wrote, or `ease` — in that
 * order, and nothing in between: a name we do not have is a deck from another
 * tool, and drawing it as *some other* preset would be inventing a document's
 * meaning.
 */
export function easingCss(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'ease';
  const preset = PRESET_BY_ID.get(value as EasingPreset);
  if (preset) return preset.css;

  /**
   * A spring, which is a `linear()` of sampled progress values.
   *
   * Here rather than in the stage, because *everything* that plays a step reads
   * its easing through this one function — the editor's preview, the show, the
   * playhead, and whatever plays a step next. A spring handled in the stage
   * would be a spring the presenter did not have.
   */
  const spring = parseSpring(value);
  if (spring) return springLinearCss(spring);

  return bezierPoints(value) ? value.trim() : 'ease';
}

/**
 * The four control points a curve editor draws, for whatever the step says.
 *
 * A spring has none — it is not a cubic — so it comes back as the default, and a
 * caller drawing a curve has to ask `parseSpring` first. That is a caller's job
 * rather than this function's: answering "the nearest bezier to this spring"
 * would be a curve the reader could drag and the document would ignore.
 */
export function easingPoints(value: unknown): [number, number, number, number] {
  if (typeof value === 'string') {
    const preset = PRESET_BY_ID.get(value as EasingPreset);
    if (preset) return [...preset.points] as [number, number, number, number];
    const written = bezierPoints(value);
    if (written) return written;
  }
  return [...PRESET_BY_ID.get('ease')!.points] as [number, number, number, number];
}

/** How a document writes a curve, so nothing builds the string by hand. */
export function bezierCss(points: [number, number, number, number]): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `cubic-bezier(${points.map(round).join(', ')})`;
}
