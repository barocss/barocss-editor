/**
 * The properties a keyframe cannot reach, and the **item of the list** each one
 * belongs to.
 *
 * ## The thing this file got wrong first
 *
 * The first version had one variable per property: `--sl-sweep` for "the
 * gradient's angle". Measured the day after: a shape with **two** gradient fills
 * and one 그라디언트 돌기 step turned *both* of them — 0°→50° and 90°→140° from a
 * single animation. Which is not a fault in the mechanism, it is the mechanism
 * being asked the wrong question.
 *
 * A shape's fills are a **list**. So are its effects. So is `filter`. None of
 * these is "the fill" or "the shadow", and a motion that names `background-image`
 * or `box-shadow` is naming a list rather than a thing in it. So a track's
 * identity is **(what kind of thing, which one)** — `--sl-f1-angle` is the second
 * fill's angle and nothing else's.
 *
 * ## What each list can be animated by, measured
 *
 * | list | per item | works |
 * |---|---|---|
 * | fills | a gradient's angle | yes — `calc(90deg + var(--sl-f1-angle, 0deg))` |
 * | fills | an image's position | yes, **including under `cover`** — the picture pans |
 * | fills | an image's *size* | **no** — `cover` cannot be multiplied, and a numeric size is a different fit rather than a zoom of the same one |
 * | effects | a shadow's lengths | yes — `calc(4px * var(--sl-s0-lift, 1))` |
 * | `filter` | one function's argument | yes, and mostly unnecessary — see below |
 *
 * The one that does not work is why the *zoom* half of a Ken Burns still waits
 * for fills to be drawn as layer elements. The pan is here.
 *
 * ## Why `filter` is not in the table
 *
 * It is the list this product animates most, and it needs no track: `composite:
 * 'add'` **concatenates** filter lists (measured), so a motion's functions land
 * beside the shape's own instead of replacing them, and two motions land beside
 * each other. A track per function would buy the ability to animate *one existing
 * function of a static list*, which nothing has asked for, at the price of a
 * `calc()` around every filter argument every shape carries. See `MUST_ADD`.
 *
 * ## Why the renderer writes these and the stage writes `filter`
 *
 * Whoever has the numbers writes the value. A shadow's four lengths, a gradient's
 * angle and a layer's position are the renderer's — it built them from attributes,
 * and it is the only thing that knows which *slot* of a comma list each item is in
 * (an image with an opacity is two CSS layers where the model has one). A `filter`
 * list is appended to, which needs no numbers at all, so the stage does that.
 *
 * ## Three details, all measured
 *
 * 1. **A registered property ignores the `var(--x, fallback)` fallback** — it
 *    always has its initial value. The fallback is written anyway, and it is not
 *    decoration: without the registration `var()` is invalid at computed-value
 *    time and takes the **whole declaration** with it. A host that skipped the
 *    registration would draw shapes with no gradient rather than no animation.
 * 2. **Tracks add** (90deg + 90deg = 180deg), so two motions on one track compose
 *    the way two motions on one property do.
 * 3. **`inherits: false`**, or a track on a group turns every gradient inside it.
 */

/**
 * What kind of thing in the shape a track belongs to.
 *
 * Two, and that is a finding rather than a gap. A track exists for a value the CSS
 * property **cannot express additively**: an angle inside `background-image`, a
 * multiplier across a shadow's four lengths. `filter`, `backdrop-filter` and
 * `border-radius` need none — they are in `MUST_ADD`, so the Web Animations API's
 * own additive composition already means "however much more than the document
 * drew", which is the whole thing a track is for. Tracks for those were written and
 * deleted; see `MUST_ADD` in `motion-effects.ts`.
 */
export type TrackPart = 'fill' | 'shadow';

export interface MotionTrack {
  /** Stored in nothing: an effect declares the kind, a step declares the index. */
  id: string;
  label: string;
  part: TrackPart;
  /**
   * The variable's suffix. The whole name is `--sl-{f|s}{index}-{suffix}`, so
   * "which one" is in the name and one animation cannot reach two items.
   */
  suffix: string;
  /** `@property`'s syntax, which is what makes it interpolate. */
  /**
   * `@property`'s syntax, which is what makes it interpolate.
   *
   * `<color>` is the odd one and the reason `own` below exists: a registered
   * property always has its initial value, so there is no "as the document drew it"
   * to fall back to — see there.
   */
  syntax: '<number>' | '<angle>' | '<length>' | '<percentage>' | '<color>';
  /** The value that means "as the document drew it". */
  neutral: string;
  /**
   * Where the item's own value lives, when "as drawn" is not a constant.
   *
   * A length's neutral is 0 and an angle's is 0deg — the same for every shape. A
   * **colour** has no such value: a shape's fill is whatever the document says, and
   * a registered custom property always carries its initial value, so a fallback in
   * the `var()` is never reached. The shape therefore declares *its own colour* as
   * the neutral, and the field says which of the item's fields to read it from.
   *
   * Which is not a new mechanism — a shape already declares its neutrals to stop
   * the tracks inheriting into the shapes inside it (`fillBoxCss`). A colour is the
   * same declaration with a value that is not the same for everyone.
   */
  own?: 'color';
  /**
   * How a reader reads the value: a multiple of what is there, an amount on top
   * of it, or the value itself. The renderer's `calc` has to agree.
   */
  mode: 'mul' | 'add' | 'set';
  unit: string;
  /** Which CSS property it lands in — what the cost table tiers it by. */
  lands: string;
  /** What it costs to draw: 2 is a repaint every frame. See `motion-cost.ts`. */
  tier: 1 | 2;
  /**
   * What the shape must already have for this to show.
   *
   * A sweep turns a gradient; a shape whose second fill is a photograph has
   * nothing to turn, and the motion runs correctly and invisibly. Said here so a
   * panel can say it rather than leaving a reader to wonder.
   */
  needs: string;
}

/**
 * How many items of each list carry tracks.
 *
 * `@property` needs a *static* list of names, so the indexes have to be bounded,
 * and four is the judgement: three fills is a photograph, a tint and a vignette,
 * which is the most this repository has seen on one shape. Past the cap a part is
 * **not offered** rather than offered and silent — which is the failure this whole
 * file exists to avoid.
 *
 * Registration is not the cost: 64 of them measured at under a tenth of a
 * millisecond. The cost is the `calc()` in the style attribute of every item that
 * has one, which is why the cap is small and the table is short.
 */
export const TRACK_SLOTS = 4;

export const MOTION_TRACKS: MotionTrack[] = [
  {
    id: 'fillAngle',
    label: '그라디언트 각도',
    part: 'fill',
    suffix: 'angle',
    syntax: '<angle>',
    neutral: '0deg',
    mode: 'add',
    unit: '°',
    lands: 'backgroundImage',
    // A gradient is re-rasterised at every angle.
    tier: 2,
    needs: '그라디언트'
  },
  /**
   * The pan, whose neutral is **zero** — and it was `50%` until the fills became
   * elements.
   *
   * A background's position is where the picture sits in the box, so "as drawn"
   * was the centre; an element's `translate` is a move *from* where it is, so "as
   * drawn" is nothing at all. The track kept its name and changed its meaning,
   * which is the one kind of change worth a comment this long: a step written
   * against the old neutral would jump the picture half a box on its first frame.
   *
   * A tiled fill is still a background — `object-fit` has no repeat — and the
   * renderer writes `calc(50% + var(…))` there so zero means the same thing in
   * both forms. See `fill-layers.ts`.
   */
  {
    id: 'fillPanX',
    label: '배경 가로 위치',
    part: 'fill',
    suffix: 'panx',
    syntax: '<percentage>',
    neutral: '0%',
    mode: 'add',
    unit: '%',
    lands: 'translate',
    // A picture that moves is composited, now that it is an element of its own.
    tier: 1,
    needs: '그림 채우기'
  },
  {
    id: 'fillPanY',
    label: '배경 세로 위치',
    part: 'fill',
    suffix: 'pany',
    syntax: '<percentage>',
    neutral: '0%',
    mode: 'add',
    unit: '%',
    lands: 'translate',
    tier: 1,
    needs: '그림 채우기'
  },
  /**
   * The other half of a Ken Burns, and the reason the fills are elements.
   *
   * `cover` cannot be multiplied — measured, `calc(100% * 1.4)` is a different fit
   * rather than a closer view of the same one — so this could not exist while a
   * fill was a `background`. On an `<img>` it is `scale`, which is composited and
   * exact.
   */
  {
    id: 'fillZoom',
    label: '그림 확대',
    part: 'fill',
    suffix: 'zoom',
    syntax: '<number>',
    neutral: '1',
    mode: 'mul',
    unit: '배',
    lands: 'scale',
    tier: 1,
    needs: '그림 채우기'
  },
  /**
   * One fill's own opacity — which is a cross-fade when two fills have one each.
   *
   * `background-image` has no alpha at all: a picture at `opacity: 0.4` was drawn
   * as a transparent wash over it, which is a no-op, and the control did nothing.
   * An element's opacity is real and animatable, so two photographs on one shape
   * can now trade places.
   */
  {
    id: 'fillFade',
    label: '채우기 불투명도',
    part: 'fill',
    suffix: 'fade',
    syntax: '<number>',
    neutral: '1',
    mode: 'mul',
    unit: '배',
    lands: 'opacity',
    tier: 1,
    needs: '채우기'
  },
  /**
   * Where the gradient's colours sit along its axis, moved together.
   *
   * One variable for the whole layer rather than one per stop, which is what makes
   * it useful: shifting every stop by the same amount slides the band of colour
   * along the gradient, and that is the "a shine sweeping across it" a reader means.
   * Per-stop variables would need one name per stop, and a gradient can have five.
   *
   * A percentage on top of each stop's own, so a gradient designed with its stops
   * at 10% and 60% keeps that shape while it moves — the same reason every track
   * here is a change to what the document drew rather than a replacement of it.
   */
  {
    id: 'fillStop',
    label: '그라디언트 정지점',
    part: 'fill',
    suffix: 'stop',
    syntax: '<percentage>',
    neutral: '0%',
    mode: 'add',
    unit: '%',
    lands: 'backgroundImage',
    // Same as the angle: a gradient is re-rasterised at every value.
    tier: 2,
    needs: '그라디언트'
  },
  /**
   * The fill's colour, set rather than added to.
   *
   * A colour has no "however much more": what a reader means is *this* colour, so
   * the mode is `set` and the shape declares its own colour as the neutral — see
   * `own`. Without that the variable would carry its registered initial value and
   * every shape drawing through it would start out transparent.
   */
  {
    id: 'fillColor',
    label: '채우기 색',
    part: 'fill',
    suffix: 'color',
    syntax: '<color>',
    /**
     * `transparent` as the registration's initial value, and never drawn.
     *
     * Something has to be registered or the property does not interpolate, and any
     * colour would be a lie about some shape. `transparent` is the one that is
     * *visibly* wrong if it ever reaches the screen, which is what makes a missing
     * declaration a thing somebody sees rather than a slightly wrong hue.
     */
    neutral: 'transparent',
    own: 'color',
    mode: 'set',
    unit: '',
    lands: 'backgroundColor',
    // A colour change is a repaint of the shape — the spec's own tier 2 list.
    tier: 2,
    needs: '단색 채우기'
  },
  {
    id: 'shadowLift',
    label: '그림자 크기',
    part: 'shadow',
    suffix: 'lift',
    syntax: '<number>',
    neutral: '1',
    mode: 'mul',
    unit: '배',
    lands: 'boxShadow',
    // A shadow is painted outside the shape's own box: every frame is a repaint.
    tier: 2,
    needs: '그림자'
  }
];

/** The letter each part's variables carry, kept short — this is in every style. */
const LETTER: Record<TrackPart, string> = { fill: 'f', shadow: 's' };

const BY_ID = new Map(MOTION_TRACKS.map((track) => [track.id, track]));

/** Every track that belongs to one kind of thing, for a panel that lists them. */
export function tracksFor(part: TrackPart): MotionTrack[] {
  return MOTION_TRACKS.filter((track) => track.part === part);
}

/**
 * One item's variable name: `--sl-f1-angle`.
 *
 * The index is clamped rather than refused, because a step can outlive the fill it
 * named — a reader deletes a layer and the step still says `2`. Clamping animates
 * the last item there is instead of animating nothing at all, which is the reading
 * a reader can see and correct.
 */
export function trackName(id: string, index = 0): string {
  const track = BY_ID.get(id);
  if (!track) return '--sl-unknown';
  const at = Math.min(Math.max(0, Math.round(index)), TRACK_SLOTS - 1);
  return `--sl-${LETTER[track.part]}${at}-${track.suffix}`;
}

/**
 * The value that means "as the document drew it", for one track.
 *
 * `item` is the thing the track belongs to — a fill, a shadow — and is only read
 * for a track whose neutral is not a constant. A colour's is the item's own colour;
 * see `own`.
 */
export function trackNeutral(id: string, item?: Record<string, unknown>): string {
  const track = BY_ID.get(id);
  if (!track) return '0';
  if (track.own) {
    const value = item?.[track.own];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return track.neutral;
}

/**
 * The variable as the renderer writes it, with its fallback — see the note above
 * for why the fallback is the correctness rather than the decoration.
 */
export function trackVar(id: string, index = 0): string {
  const track = BY_ID.get(id);
  if (!track) return '0';
  return `var(${trackName(id, index)}, ${track.neutral})`;
}

const NAME = /^--sl-([a-z])(\d+)-([a-z]+)$/;

/**
 * The track a keyframe key names, read back from the name.
 *
 * Parsing — of a string this file generated three lines up, which is a different
 * thing from parsing a document. The alternative is a second table mapping names
 * to kinds, and that is the fault this file's own comment complains about.
 * `undefined` for anything else, so a caller can ask about every key in a frame.
 */
export function trackOf(cssVar: string): { track: MotionTrack; index: number } | undefined {
  const found = NAME.exec(cssVar);
  if (!found) return undefined;
  const [, letter, index, suffix] = found;
  const track = MOTION_TRACKS.find(
    (entry) => LETTER[entry.part] === letter && entry.suffix === suffix
  );
  return track ? { track, index: Number(index) } : undefined;
}

/**
 * The registrations: every track, for every slot.
 *
 * Generated, so that adding a row — or raising the cap — is the whole of adding a
 * track. A hand-written `@property` block beside this list is exactly the
 * one-fact-in-two-places fault this repository keeps finding in itself.
 *
 * ## `inherits: true`, which was `false` until a fill became an element
 *
 * A track is animated on the **shape** and read wherever the value is used, and
 * those were the same element while a fill was a `background`. They are not any
 * more: a picture's zoom is `scale` on an `<img>` inside the shape, and with
 * `inherits: false` that image's own computed value is the *initial* one — so the
 * variable animated correctly on the shape (measured at 1.32 mid-run) and the
 * picture stayed at 1. Nothing was wrong except the one word.
 *
 * Inheriting costs nothing here: every name is `--sl-`-prefixed and read only by
 * the shape and the elements this product draws inside it.
 */
export function trackPropertyCss(): string {
  const blocks: string[] = [];
  for (const track of MOTION_TRACKS) {
    for (let index = 0; index < TRACK_SLOTS; index += 1) {
      blocks.push(
        `@property ${trackName(track.id, index)} {\n` +
          `  syntax: '${track.syntax}';\n` +
          `  inherits: true;\n` +
          `  initial-value: ${track.neutral};\n` +
          `}`
      );
    }
  }
  return blocks.join('\n\n');
}
