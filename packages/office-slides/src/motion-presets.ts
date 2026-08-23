import {
  DEFAULT_AMOUNT,
  DEFAULT_DIRECTION,
  effectDefinition,
  type Direction,
  type EffectCategory
} from './motion-effects';
import { DEFAULT_STAGGER, type TextUnit } from './text-units';

/**
 * A named bundle of every value a motion has: "부드럽게 올라오기" rather than
 * `fly` + 600ms + `easeOut` + `down` + 0.25.
 *
 * ## The list is the missing half of the effect table
 *
 * An effect is *what happens* and its options are *how much and which way*,
 * which is the right way to store a motion and a poor way to choose one. A
 * reader who wants a title to arrive gently sets five things — the effect, the
 * length, the curve, the side it comes from and how far — and four of those five
 * are the same four every time anybody has ever wanted a title to arrive gently.
 *
 * That bundle is what Canva's animation list *is* (Rise, Pan, Pop, Breathe), and
 * Keynote's build styles, and every after-effects template anybody has bought:
 * not a different animation engine, the same one with the numbers already
 * chosen. This file is the numbers.
 *
 * ## Why a preset is not stored
 *
 * The tempting model is an attribute — `preset: 'rise'` — and it is wrong for a
 * reason that shows up on the second edit: the moment a reader drags the bar to
 * make it a little longer, the document says `rise` and means something else.
 * Either the name has to be cleared on every edit (and then it is a name that
 * exists for one gesture) or it lies.
 *
 * So a preset **writes** and disappears. What it leaves behind is the five
 * values, which is what every reader of a step already understands, and the
 * panel answers "which preset is this?" by comparing — `matchingPreset` — rather
 * than by reading a name. A step whose values were nudged matches nothing, which
 * is the truth: it is not that preset any more.
 *
 * This is the same rule the paints follow (a gradient is stops, not "the blue
 * one") and the same rule that made the direction an option rather than part of
 * the effect's name: **one vocabulary, and the document holds values.**
 */

export interface MotionPreset {
  id: string;
  label: string;
  /** Which effect it is, from the effect table — never a name of its own. */
  effect: string;
  /** In milliseconds, the one unit in this model that is not twips. */
  duration: number;
  /** An `EASING_PRESETS` id, or a curve. */
  easing: string;
  direction?: Direction;
  amount?: number;
  /** A colour, for the effects that are about one — a glow's, a bloom's. */
  color?: string;
  /** How many times over; `1` is once and is left unwritten. */
  repeat?: number;
  /**
   * What the effect applies to — the box, or the pieces of its text.
   *
   * A preset that animates letters is the same effect with a different unit,
   * which is exactly the argument for the unit being an option: 글자마다
   * 나타내기 needed a row in this table and nothing else anywhere.
   */
  unit?: TextUnit;
  /** Milliseconds between pieces, for a preset past `box`. */
  stagger?: number;
}

/**
 * What a step holds, for each of these.
 *
 * The durations are the part worth arguing about. 300ms is the threshold below
 * which a motion reads as a jump; 2s is where a reader starts waiting for a
 * build rather than watching one. Everything here is inside that, and the slow
 * ones are slow *because* the effect needs the time — a wipe across a title at
 * 300ms is a flicker, and a spring cut short is a spring that never rings.
 */
export const MOTION_PRESETS: MotionPreset[] = [
  // ── Entrances ────────────────────────────────────────────────────────────
  {
    // The one everybody reaches for and the one Canva calls Rise: a short lift
    // from below with a slow finish, which reads as the shape settling rather
    // than arriving.
    id: 'rise',
    label: '부드럽게 올라오기',
    effect: 'fly',
    direction: 'down',
    amount: 0.2,
    duration: 600,
    easing: 'easeOut'
  },
  {
    id: 'slideIn',
    label: '옆에서 밀려오기',
    effect: 'fly',
    direction: 'left',
    amount: 0.5,
    duration: 500,
    easing: 'easeOut'
  },
  {
    // The overshoot is the whole preset: `backOut` past 1 and back is what makes
    // a badge feel pressed into place instead of drawn.
    id: 'pop',
    label: '톡 튀어나오기',
    effect: 'grow',
    amount: 0.75,
    duration: 420,
    easing: 'backOut'
  },
  {
    /**
     * The same idea with the timing a bezier cannot say.
     *
     * `backOut` goes past once and settles; a spring rings — past, back under,
     * past again, smaller each time. This is the preset that exists to make that
     * difference feel like something rather than to be read about, and its length
     * is the spring's own settling time (`spring(180, 9)` settles in 1.54s), so
     * every swing has room to happen.
     */
    id: 'springIn',
    label: '스프링처럼 등장',
    effect: 'fly',
    direction: 'down',
    amount: 0.3,
    duration: 1540,
    easing: 'spring(180, 9)'
  },
  {
    /**
     * A focus pull, which is what `filter` bought the entrance list.
     *
     * Slower than a fade, because the eye reads *focus* more slowly than it reads
     * brightness — 800ms of blur resolving is a shape coming into view, and 300ms
     * of it is a flicker.
     */
    id: 'focusIn',
    label: '흐린 데서 나타내기',
    effect: 'blurIn',
    amount: 0.5,
    duration: 800,
    easing: 'easeOut'
  },
  {
    id: 'appearSlowly',
    label: '천천히 나타나기',
    effect: 'fade',
    duration: 1200,
    easing: 'easeInOut'
  },
  {
    id: 'reveal',
    label: '닦아내며 드러내기',
    effect: 'wipe',
    direction: 'left',
    duration: 700,
    easing: 'easeInOut'
  },
  {
    id: 'whirlIn',
    label: '돌면서 등장',
    effect: 'spinIn',
    amount: 0.35,
    duration: 700,
    easing: 'backOut'
  },
  {
    /**
     * A title arriving a letter at a time — the one everybody asks for.
     *
     * Short and gentle *per letter*: 350ms each with 45ms between them, so a
     * ten-letter word is over in 0.8s. The instinct is to make each letter slow,
     * and it is wrong — the motion a reader sees is the *wave* across the line,
     * and a slow letter blurs the wave into a fade.
     */
    id: 'letterByLetter',
    label: '글자마다 나타내기',
    effect: 'fly',
    direction: 'down',
    amount: 0.15,
    duration: 350,
    easing: 'easeOut',
    unit: 'letter',
    stagger: 45
  },
  {
    id: 'wordByWord',
    label: '단어마다 나타내기',
    effect: 'fade',
    duration: 400,
    easing: 'easeOut',
    unit: 'word',
    stagger: 90
  },

  {
    /**
     * Canva's Stomp, CapCut's 쿵: a shape that *lands* rather than arriving.
     *
     * Short and hard — 300ms with a slow finish — because the whole effect is the
     * stop. Longer and it reads as a zoom out.
     */
    id: 'slam',
    label: '쿵 내려앉기',
    effect: 'slamIn',
    amount: 0.55,
    duration: 320,
    easing: 'easeOut'
  },
  {
    /**
     * Canva's Typewriter, CapCut's 타이핑.
     *
     * A letter unit with almost no duration: what a reader sees is the *rhythm*,
     * so the beat between letters is the whole design and each letter merely has
     * to appear. 55ms is a fast typist; 120 is a slow one.
     */
    id: 'typewriter',
    label: '타이핑',
    effect: 'fade',
    duration: 60,
    easing: 'linear',
    unit: 'letter',
    stagger: 55
  },
  {
    /**
     * Canva's Baseline: each word wiped upward, as if rising off the line.
     *
     * No new effect — `wipe` with `direction: down` reveals from the bottom, and a
     * word unit makes it a line of words rising in turn. Which is the argument for
     * units being an option in one sentence.
     */
    id: 'baseline',
    label: '밑줄에서 올라오기',
    effect: 'wipe',
    direction: 'down',
    duration: 420,
    easing: 'easeOut',
    unit: 'word',
    stagger: 70
  },

  // ── Emphasis ─────────────────────────────────────────────────────────────
  {
    // Twice, because one pulse is a glitch and three is a heartbeat monitor.
    id: 'heartbeat',
    label: '두 번 두근거리기',
    effect: 'pulse',
    amount: 0.35,
    duration: 420,
    easing: 'easeInOut',
    repeat: 2
  },
  {
    id: 'shake',
    label: '흔들어 알리기',
    effect: 'nudge',
    direction: 'left',
    amount: 0.5,
    duration: 480,
    easing: 'easeInOut',
    repeat: 2
  },
  {
    id: 'blink',
    label: '반짝이기',
    effect: 'flash',
    duration: 320,
    easing: 'linear',
    repeat: 3
  },
  {
    /**
     * Exactly one turn, and now the plainest number there is.
     *
     * This used to be `0.334`, with a comment explaining that `spin` ran from 180°
     * to 720° so a whole turn was a third of the range — and that `0.33` landed on
     * 358°, two degrees short of straight, invisible on a circle and glaring on
     * anything with a corner.
     *
     * `spin`'s amount is **turns** now, so one turn is the bottom of the range. The
     * awkward fraction was a symptom of a range that could stop a shape anywhere,
     * which is the same fault that let the default leave it turned 90°.
     */
    id: 'turnOnce',
    label: '제자리에서 한 바퀴',
    effect: 'spin',
    amount: 0,
    duration: 800,
    easing: 'easeInOut'
  },

  {
    /**
     * Canva's Breathe, and CapCut's whole *loop* category in one preset.
     *
     * `repeat: 0` is "until the slide moves on", so a breathing shape keeps
     * breathing while it is talked about — which is what a slide pointing at
     * something wants and what no count can say.
     */
    id: 'breathe',
    label: '숨쉬기 (계속)',
    effect: 'pulse',
    amount: 0.12,
    duration: 2200,
    easing: 'easeInOut',
    repeat: 0
  },
  {
    id: 'glowOn',
    label: '빛나기',
    effect: 'glow',
    amount: 0.6,
    duration: 900,
    easing: 'easeInOut',
    repeat: 2
  },
  {
    /**
     * A card lifting off the slide: the shadow grows and the shape rises a little.
     *
     * A `drop-shadow` rather than the shape's own `box-shadow`, which cannot be
     * scaled by an animation at all — see `motion-tracks.ts` for the measurement
     * and for why this is the better answer rather than the cheaper one.
     */
    id: 'liftUp',
    label: '들어올리기',
    effect: 'lift',
    amount: 0.5,
    duration: 700,
    easing: 'easeInOut'
  },
  {
    /**
     * Light crossing the shape, which is its gradient turning.
     *
     * The one preset that animates nothing about the element — and the only one
     * that needs a *track*, because a gradient has no midpoint between two angles.
     * Slow and once: a gradient spinning twice is a novelty rather than a slide.
     */
    id: 'lightAcross',
    label: '빛이 지나가기',
    effect: 'sweep',
    amount: 0.6,
    duration: 1400,
    easing: 'easeInOut'
  },
  {
    /**
     * A photograph drifting inside the shape — the Ken Burns pan.
     *
     * Slow and long, because a drift a reader can *see* moving is not a drift.
     * The *first* fill, which is the top one: a reader who wants the photograph
     * under a tint says so in the 대상 row.
     */
    id: 'bgDrift',
    label: '배경 밀기',
    effect: 'bgPan',
    direction: 'left',
    amount: 0.4,
    duration: 2600,
    easing: 'easeInOut'
  },
  {
    /**
     * A photograph coming closer — the other half of a Ken Burns, and the half
     * that was impossible while a fill was a `background` (`cover` cannot be
     * multiplied). Slower even than the drift, and it *stays* where it got to:
     * a zoom that springs back is a shape breathing, not a camera moving.
     *
     * Paired with 배경 밀기 on the same step, this is the shot every deck opens
     * with — two presets rather than one, because the model is one effect per
     * step and a reader who wants only the zoom should not have to undo a pan.
     */
    id: 'bgCloser',
    label: '배경 확대되기',
    effect: 'bgZoom',
    amount: 0.4,
    duration: 3000,
    easing: 'easeInOut'
  },
  {
    /**
     * The top fill fading away, which is a **cross-fade** when there is another
     * picture under it — the thing `background` could not do at all, since an
     * image in one has no alpha.
     *
     * Named for what a reader sees rather than for the mechanism: they are
     * changing the picture, and the fill that goes is the one on top.
     */
    id: 'fillCross',
    label: '사진 바뀌기',
    effect: 'fillOut',
    duration: 1200,
    easing: 'easeInOut'
  },
  {
    /** The shape's own shadow deepening — one of them, when it has several. */
    id: 'shadowDeepen',
    label: '그림자 깊어지기',
    effect: 'deepen',
    amount: 0.5,
    duration: 900,
    easing: 'easeInOut'
  },
  {
    /** Corners easing open as the shape arrives — the softest entrance there is. */
    id: 'softenIn',
    label: '모서리가 펴지며',
    effect: 'soften',
    amount: 0.45,
    duration: 640,
    easing: 'easeOut'
  },
  {
    /**
     * A bloom: the shape's own light spilling out of it.
     *
     * The first preset whose *look* is an SVG filter — CSS has no function for
     * it, because `drop-shadow` puts a coloured blur outside an opaque shape and
     * nothing inside one. Slow, because a bloom is a swell rather than a flash.
     */
    id: 'bloomOn',
    label: '빛이 번지기',
    effect: 'bloom',
    amount: 0.7,
    duration: 1400,
    easing: 'easeInOut'
  },
  {
    /**
     * A melt, which is the first preset whose animation is *not* a Web Animation
     * at all: `feDisplacementMap`'s scale is an XML attribute, so SMIL drives it.
     *
     * Slow, because a displacement that snaps back reads as a glitch rather than
     * as a liquid — and a liquid is the point.
     */
    id: 'meltOn',
    label: '녹아 흐르기',
    effect: 'melt',
    amount: 0.5,
    duration: 1600,
    easing: 'easeInOut'
  },
  {
    /**
     * A chromatic split: the red channel pulled away from the cyan one and back.
     *
     * Fast and small, because it is an *artefact* — the look of a camera or a bad
     * signal — and an artefact that lasts is a mistake.
     */
    id: 'chromaticOn',
    label: '색이 갈라지기',
    effect: 'chromatic',
    amount: 0.45,
    duration: 420,
    easing: 'easeOut'
  },
  {
    /**
     * Text swelling into place, which no CSS filter can do: an `feMorphology`
     * erode eats a glyph's strokes from both sides and running it backwards puts
     * them back. Slow, because a thickening that is quick reads as a font
     * loading late.
     */
    id: 'thickenOn',
    label: '굵어지며 나타내기',
    effect: 'thickenIn',
    amount: 0.5,
    duration: 900,
    easing: 'easeOut'
  },
  {
    /** And the same primitive forwards, which is text thinning away to nothing. */
    id: 'thinAway',
    label: '얇아지며 사라지기',
    effect: 'thinOut',
    amount: 0.55,
    duration: 800,
    easing: 'easeIn'
  },
  {
    /**
     * A shimmer: the noise field moving while the displacement stays small, so
     * every pixel keeps shifting a little and nothing shifts far. Twice through,
     * because once reads as a glitch and forever reads as broken.
     */
    id: 'shimmerOn',
    label: '아른거리기',
    effect: 'shimmer',
    amount: 0.5,
    duration: 1200,
    easing: 'easeInOut',
    repeat: 2
  },
  {
    id: 'tintOn',
    label: '물들기',
    effect: 'tint',
    amount: 0.6,
    duration: 800,
    easing: 'easeInOut',
    repeat: 2
  },
  {
    /**
     * A full turn of the colour wheel, forever.
     *
     * 360° back to where it started, so the loop does not jump — the same
     * reasoning as 제자리에서 한 바퀴, one property along.
     */
    id: 'rainbow',
    label: '색이 돌기 (계속)',
    effect: 'hueShift',
    amount: 1,
    duration: 4000,
    easing: 'linear',
    repeat: 0
  },
  {
    /**
     * Frosted glass: the one filter that is about the *slide* rather than the
     * shape. A panel that blurs what it covers, which is what every operating
     * system has done to a sidebar for a decade.
     */
    id: 'frostOn',
    label: '뒤가 흐려지기',
    effect: 'frost',
    amount: 0.55,
    duration: 700,
    easing: 'easeOut'
  },
  {
    id: 'neon',
    label: '네온 (계속)',
    effect: 'glow',
    amount: 0.85,
    duration: 1600,
    easing: 'easeInOut',
    repeat: 0
  },
  {
    /**
     * Canva's Pan: a slow one-way drift while the slide is read.
     *
     * Long, because it is the one emphasis a reader is not supposed to *notice* —
     * six seconds of movement across a photograph is what makes a still slide feel
     * alive, and two seconds of it is a shape sliding about.
     */
    id: 'pan',
    label: '천천히 흐르기',
    effect: 'drift',
    direction: 'right',
    amount: 0.35,
    duration: 6000,
    easing: 'linear'
  },
  {
    id: 'wave',
    label: '글자 물결 (계속)',
    effect: 'nudge',
    direction: 'up',
    amount: 0.45,
    duration: 900,
    easing: 'easeInOut',
    repeat: 0,
    unit: 'letter',
    stagger: 60
  },

  // ── Exits ────────────────────────────────────────────────────────────────
  {
    id: 'fadeAway',
    label: '천천히 사라지기',
    effect: 'fadeOut',
    duration: 800,
    easing: 'easeInOut'
  },
  {
    id: 'flyAway',
    label: '옆으로 빠지기',
    effect: 'flyOut',
    direction: 'right',
    amount: 0.5,
    duration: 500,
    easing: 'easeIn'
  },
  {
    id: 'grayAway',
    label: '흑백으로 사라지기',
    effect: 'grayOut',
    amount: 0.4,
    duration: 900,
    easing: 'easeIn'
  },
  {
    id: 'shrinkAway',
    label: '작아지며 사라지기',
    effect: 'shrinkOut',
    amount: 0.7,
    duration: 450,
    easing: 'easeIn'
  }
];

/**
 * Named motions made of *two* motions at once.
 *
 * Only possible since `composite: 'add'` — before it, a second motion on one
 * shape silently lost (two animations of one property are `replace` by default,
 * newest wins). So these are the presets the model could not express last week,
 * and they are the ones that read as *designed* rather than as applied: a title
 * that rises while it grows, a badge that pops while it turns.
 *
 * Each part is an ordinary preset. A combination is a list of their ids, and what
 * it writes is what picking each of them by hand would write — the first starting
 * the press, the rest running with it. Nothing new in the document, which is the
 * same rule the single presets follow: **the document holds values, and a name is
 * the panel's.**
 *
 * `rotate` is the one thing a combination must not double up on: two additive
 * rotations end at zero in Chromium (see `NOT_ADDITIVE`), so no combination here
 * pairs two turning effects, and the timeline says so if a reader builds one by
 * hand.
 */
export interface MotionCombo {
  id: string;
  label: string;
  /** The presets it is made of, in the order they are written. */
  parts: string[];
}

export const MOTION_COMBOS: MotionCombo[] = [
  { id: 'riseAndGrow', label: '올라오며 커지기', parts: ['rise', 'pop'] },
  { id: 'slideAndTurn', label: '밀려오며 돌기', parts: ['slideIn', 'whirlIn'] },
  { id: 'popAndFlash', label: '튀어나오며 반짝', parts: ['pop', 'blink'] },
  { id: 'revealAndRise', label: '드러나며 올라오기', parts: ['reveal', 'rise'] },
  { id: 'springAndFade', label: '스프링으로 스며들기', parts: ['springIn', 'appearSlowly'] },
  { id: 'shrinkAndSpin', label: '작아지며 돌아 사라지기', parts: ['shrinkAway', 'turnOnce'] },
  // The two the new effects made possible: a landing that flashes, and a title
  // typed while it rises.
  { id: 'slamAndFlash', label: '쿵 내려앉으며 반짝', parts: ['slam', 'blink'] },
  { id: 'typeAndRise', label: '타이핑하며 올라오기', parts: ['typewriter', 'rise'] }
];

export function comboById(id: string | undefined): MotionCombo | undefined {
  return id ? MOTION_COMBOS.find((combo) => combo.id === id) : undefined;
}

/**
 * What a combination writes: one bundle of attributes per part.
 *
 * The first as the caller gave it (a press of its own, normally) and the rest
 * `withPrevious` with no delay, which is what "at the same time" is. A caller
 * that wants them staggered sets the delays afterwards, one bar at a time — which
 * is what the bars are for.
 */
export function comboAttrs(combo: MotionCombo): Array<Record<string, unknown>> {
  return combo.parts
    .map((id) => presetById(id))
    .filter((preset): preset is MotionPreset => !!preset)
    .map((preset, index) => ({
      ...presetAttrs(preset),
      ...(index === 0 ? {} : { startsWith: 'withPrevious', delay: 0 })
    }));
}

/**
 * The values that *are* a motion, taken off a step so they can be given to
 * another shape.
 *
 * A deck with a house style is built by giving six shapes the same motion, and
 * without this a reader does it by remembering numbers. What travels is exactly
 * what a preset writes — the effect, the length, the curve, the direction, the
 * amount, the unit, the stagger, the repeat — and *not* the two things that are
 * facts about a step's place rather than about the motion: which shape it names,
 * and when it starts. Copying those would paste one shape's animation onto
 * another shape's press.
 */
export const MOTION_VALUES = [
  'effect',
  'duration',
  'easing',
  'direction',
  'amount',
  'repeat',
  'unit',
  'stagger',
  'path',
  'facing'
] as const;

export function motionValues(step: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!step) return {};
  const out: Record<string, unknown> = {};
  for (const key of MOTION_VALUES) {
    if (step[key] !== undefined) out[key] = step[key];
  }
  return out;
}

const BY_ID = new Map(MOTION_PRESETS.map((preset) => [preset.id, preset]));

export const PRESET_IDS = MOTION_PRESETS.map((preset) => preset.id);

export function presetById(id: string | undefined): MotionPreset | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** A preset's category, which is its *effect's* — a preset invents nothing. */
export function presetCategory(preset: MotionPreset): EffectCategory | undefined {
  return effectDefinition(preset.effect)?.category;
}

export function presetsIn(category: EffectCategory): MotionPreset[] {
  return MOTION_PRESETS.filter((preset) => presetCategory(preset) === category);
}

/**
 * What applying a preset writes onto a step.
 *
 * Only the options the effect *takes*: a direction on a flash is a value nothing
 * will ever read, and writing one would leave the document carrying a setting no
 * panel shows and no frame uses. The effect table already declares which options
 * it has, so this asks it rather than repeating the answer.
 *
 * `repeat` is written even when it is 1, which the other defaults are not, and
 * for a reason that only shows up on the *second* preset: a step already
 * repeating three times, given a preset that does not repeat, has to stop
 * repeating. A value left out is a value left alone, so a preset that promises
 * once has to say once.
 */
export function presetAttrs(preset: MotionPreset): Record<string, unknown> {
  const takes = effectDefinition(preset.effect)?.takes ?? {};
  const attrs: Record<string, unknown> = {
    effect: preset.effect,
    duration: preset.duration,
    easing: preset.easing,
    repeat: preset.repeat ?? 1,
    /**
     * Always written, for the same reason as `repeat`: a step animating letters,
     * given a preset that animates the box, has to *stop* animating letters —
     * and a value left out of a patch is a value left alone.
     */
    unit: preset.unit ?? 'box',
    stagger: preset.stagger ?? DEFAULT_STAGGER
  };

  if (takes.direction) attrs.direction = preset.direction ?? DEFAULT_DIRECTION;
  if (takes.amount) attrs.amount = preset.amount ?? DEFAULT_AMOUNT;
  // Only when the preset names one: a colour left out means the effect's own
  // default, which for a glow is the shape's own colour.
  if (takes.color && preset.color) attrs.color = preset.color;

  return attrs;
}

/** What a step is, for the fields a preset names, with the same defaults. */
interface StepValues {
  effect?: string;
  duration?: number;
  easing?: string;
  direction?: string;
  amount?: number;
  repeat?: number;
  unit?: string;
  stagger?: number;
}

/**
 * Which preset a step's values *are*, if they are any preset's.
 *
 * The panel's answer to "which one is this on" without the document having to
 * say — and it says nothing for a step a reader has nudged, which is honest: a
 * 620ms rise is not 부드럽게 올라오기, it is what somebody made out of it.
 *
 * Compared against `presetAttrs`, not against the preset, so the comparison and
 * the write agree by construction: exactly the keys that would be written are
 * the keys that have to match, and an option the effect does not take is
 * ignored on both sides.
 */
export function matchingPreset(step: StepValues | undefined): MotionPreset | undefined {
  if (!step?.effect) return undefined;

  return MOTION_PRESETS.find((preset) => {
    if (preset.effect !== step.effect) return false;
    const attrs = presetAttrs(preset);

    for (const [key, value] of Object.entries(attrs)) {
      const held = (step as Record<string, unknown>)[key];
      if (key === 'amount') {
        // Two amounts a reader cannot tell apart are the same amount: the slider
        // writes hundredths, and `turnOnce` needs thousandths to land on 360°.
        if (typeof held !== 'number' || Math.abs(held - (value as number)) > 0.005) return false;
        continue;
      }
      if (key === 'repeat') {
        // A step that says nothing repeats once, which is what most presets say.
        if ((held ?? 1) !== value) return false;
        continue;
      }
      if (key === 'unit') {
        if ((held ?? 'box') !== value) return false;
        continue;
      }
      if (key === 'stagger') {
        // Only a difference where it is read: two box animations are the same
        // preset however far apart their pieces would have been.
        if (attrs.unit === 'box') continue;
        if ((held ?? DEFAULT_STAGGER) !== value) return false;
        continue;
      }
      if (held !== value) return false;
    }

    return true;
  });
}
