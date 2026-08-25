import { twipToPx } from '@barocss/office-text';
import type { Box, CssStyle } from './geometry';
import { TRACK_SLOTS, trackVar } from './motion-tracks';
import { angleBetween, axisRange, gradientPoints, radialCss, remapStops } from './gradient-axis';

/**
 * What a shape is painted with, as a *list*.
 *
 * A shape had one fill, one stroke and one shadow, each spelled out as flat
 * attributes: `fill`, `gradientFrom`, `gradientTo`, `gradientAngle`,
 * `shadowColor`, `shadowBlur`… That is a diagram's vocabulary again, one level
 * up from where the gradient found it. Every design tool this product is
 * measured against gives a shape a *stack*:
 *
 * - a photograph tinted by a translucent colour over it — two fills;
 * - a card with a soft shadow *and* a hard key line — two effects;
 * - a gradient with five stops, not two ends.
 *
 * None of those can be said with one value per idea, and none of them is exotic:
 * they are the first three things anybody does in Figma.
 *
 * ## Why a list rather than `fill2`
 *
 * The schema takes `type: 'array'`, so a list is expressible without inventing
 * numbered attributes or a mini-language in a string. The alternative — `fill2`,
 * `gradient2From` — is the shape of a schema that has given up: it caps the
 * count, it cannot reorder, and every reader has to know how many to look for.
 *
 * ## The flat attributes still mean what they meant
 *
 * Every deck already written says `fill: '#2563eb'` and `gradientFrom/To`, and a
 * document that changed meaning on being opened would be the worst outcome of
 * this. So a shape with no `fills` is read *as* a list: one paint, built from
 * whatever the flat attributes say. Nothing is rewritten; the conversion happens
 * on every read, in one place, and a shape only gains a `fills` when a reader
 * edits it.
 *
 * ## Order is top-first
 *
 * Figma lists the topmost paint first and so does this — but CSS paints its
 * *first* background layer on top too, so the order goes straight through. That
 * agreement is worth writing down because it is luck rather than design, and the
 * first person to reverse one of them will be reversing both.
 */

/**
 * A point in the box's own proportions: `{0,0}` is its top left and `{1,1}` its
 * bottom right, so a gradient survives a resize the way Figma's does.
 *
 * Declared here rather than in `gradient-axis.ts` because it is part of what a
 * paint *is*; the arithmetic that reads it lives there.
 */
export interface GradientPoint {
  x: number;
  y: number;
}

export interface PaintStop {
  /** 0 to 1, along the gradient. */
  offset: number;
  color: string;
}

export type PaintKind = 'solid' | 'linear' | 'radial' | 'angular' | 'image';

/**
 * How an image fill sits in the shape it fills.
 *
 * The same three words `object-fit` uses and every design tool offers, plus the
 * one CSS spells differently: a tile is a *repeat*, not a fit.
 */
export type PaintFit = 'cover' | 'contain' | 'stretch' | 'tile';

/**
 * How a paint mixes with what is under it.
 *
 * CSS's names, because they are also Figma's and Photoshop's — this is one of
 * the few vocabularies the whole industry already agrees on, and renaming it
 * would be this product inventing a dialect.
 */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export interface Paint {
  kind: PaintKind;
  /** A solid's colour. Ignored by the gradients, which have stops instead. */
  color?: string;
  stops?: PaintStop[];
  /** An image fill's picture, as a URL or a data URI — the same as a `picture`. */
  src?: string;
  fit?: PaintFit;
  /** How this layer mixes with the ones under it. */
  blend?: BlendMode;
  /** Degrees, clockwise from "up" — the direction a linear gradient runs. */
  angle?: number;
  /**
   * Where the gradient begins and ends, in the box's own proportions.
   *
   * The thing an angle cannot say: a gradient that starts a quarter of the way in
   * and ends past the shape's edge. Present *instead of* the angle when a reader
   * has moved either handle — see `gradient-axis.ts` for why they are fractions
   * and how they reach CSS, which has no syntax for them.
   */
  from?: GradientPoint;
  to?: GradientPoint;
  /** 0 to 1. A paint at 0 is invisible but still in the list, which is the point. */
  opacity?: number;
  /** Off keeps it in the list without drawing it — Figma's eye. */
  visible?: boolean;
}

export type EffectKind = 'drop' | 'inner' | 'blur';

export interface ShapeEffect {
  kind: EffectKind;
  /** Twips, like every other length in this model. */
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  color?: string;
  visible?: boolean;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Two decimals: a colour stop is a percentage, not a measurement. */
const round = (value: number): number => Math.round(value * 100) / 100;

interface PaintAttrs {
  fills?: unknown;
  effects?: unknown;
  fill?: unknown;
  gradientFrom?: unknown;
  gradientTo?: unknown;
  gradientAngle?: unknown;
  gradientKind?: unknown;
  shadowColor?: unknown;
  shadowBlur?: unknown;
  shadowDistance?: unknown;
  shadowAngle?: unknown;
}

/** One paint, as read from a document that may have written anything. */
function readPaint(value: unknown): Paint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;

  const kind = text(entry.kind);
  if (kind === 'linear' || kind === 'radial' || kind === 'angular') {
    const stops = Array.isArray(entry.stops)
      ? entry.stops
          .map((stop) => {
            if (!stop || typeof stop !== 'object') return undefined;
            const colour = text((stop as Record<string, unknown>).color);
            if (!colour) return undefined;
            return {
              offset: clamp01(num((stop as Record<string, unknown>).offset, 0)),
              color: colour
            };
          })
          .filter((stop): stop is PaintStop => !!stop)
      : [];

    // A gradient of fewer than two stops is not a gradient; it is a colour
    // somebody is halfway through choosing, and drawing it would be a guess.
    if (stops.length < 2) return undefined;

    const points = corner(entry.from) && corner(entry.to)
      ? { from: corner(entry.from)!, to: corner(entry.to)! }
      : undefined;

    return {
      kind,
      stops: [...stops].sort((a, b) => a.offset - b.offset),
      angle: num(entry.angle, 180),
      ...(points ?? {}),
      opacity: clamp01(num(entry.opacity, 1)),
      blend: blendOf(entry.blend),
      visible: entry.visible !== false
    };
  }

  if (kind === 'image') {
    const src = text(entry.src);
    // A picture fill with no picture is not one; drawing it would be a grey box
    // where a reader put a photograph.
    if (!src) return undefined;
    const fit = text(entry.fit);
    return {
      kind,
      src,
      fit: (['cover', 'contain', 'stretch', 'tile'] as const).includes(fit as never)
        ? (fit as PaintFit)
        : 'cover',
      opacity: clamp01(num(entry.opacity, 1)),
      blend: blendOf(entry.blend),
      visible: entry.visible !== false
    };
  }

  const colour = text(entry.color);
  if (!colour) return undefined;
  return {
    kind: 'solid',
    color: colour,
    opacity: clamp01(num(entry.opacity, 1)),
    blend: blendOf(entry.blend),
    visible: entry.visible !== false
  };
}

/**
 * One end of a gradient's axis, if the document holds one.
 *
 * Both numbers or neither: half a point is a document mid-write, and drawing it
 * would put the gradient somewhere nobody asked for. A paint with no points falls
 * back to its angle, which is every gradient written before this existed.
 */
function corner(value: unknown): GradientPoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const point = value as Record<string, unknown>;
  const x = point.x;
  const y = point.y;
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
  if (typeof y !== 'number' || !Number.isFinite(y)) return undefined;
  return { x, y };
}

/** A blend mode this product knows, or none — an unknown one is not invented. */
function blendOf(value: unknown): BlendMode | undefined {
  const name = text(value);
  return name && (BLEND_MODES as readonly string[]).includes(name)
    ? (name as BlendMode)
    : undefined;
}

/**
 * The paints a shape carries: its list, or the one its flat attributes describe.
 *
 * The legacy half is exactly the gradient rule that was already there — a
 * gradient needs *both* ends, and one end set is a reader mid-edit rather than a
 * request for black.
 */
export function paintsOf(attrs: PaintAttrs | undefined): Paint[] {
  if (!attrs) return [];

  if (Array.isArray(attrs.fills)) {
    return attrs.fills.map(readPaint).filter((paint): paint is Paint => !!paint);
  }

  const from = text(attrs.gradientFrom);
  const to = text(attrs.gradientTo);
  if (from && to) {
    const kind = text(attrs.gradientKind) === 'radial' ? 'radial' : 'linear';
    return [
      {
        kind,
        stops: [
          { offset: 0, color: from },
          { offset: 1, color: to }
        ],
        angle: num(attrs.gradientAngle, 180),
        opacity: 1,
        visible: true
      }
    ];
  }

  const flat = text(attrs.fill);
  return flat ? [{ kind: 'solid', color: flat, opacity: 1, visible: true }] : [];
}

/** One paint as a CSS background layer. */
export function paintCss(paint: Paint, index = 0, box?: Box): string | undefined {
  if (paint.visible === false) return undefined;

  const alpha = clamp01(paint.opacity ?? 1);
  if (alpha === 0) return undefined;

  if (paint.kind === 'image') {
    const src = text(paint.src);
    if (!src) return undefined;
    /**
     * An image's opacity is not the layer's.
     *
     * `background-image` has no alpha, so a translucent photograph is drawn as
     * the picture with a wash of transparent-to-transparent gradient over it —
     * which is the trick every CSS answer to this uses, and the reason the
     * gradient comes *first* in the pair: the first layer is on top.
     */
    return alpha === 1
      ? `url("${src}")`
      : `linear-gradient(rgba(255, 255, 255, 0), rgba(255, 255, 255, 0)), url("${src}")`;
  }

  if (paint.kind === 'solid') {
    const colour = text(paint.color);
    if (!colour) return undefined;
    /**
     * A solid *layered* is a gradient of itself.
     *
     * `background` takes a list of images and a colour is not one, so a solid
     * that has to sit above another paint — a tint over a photograph — is
     * written as a two-stop gradient of one colour. That is the price of
     * stacking, and it is only paid when there is something to stack: see
     * `backgroundCss`, which writes the colour plainly when it is the only one.
     */
    const shown = alpha === 1 ? colour : withAlpha(colour, alpha);
    return `linear-gradient(${shown}, ${shown})`;
  }

  /**
   * Two points, when the reader has moved a handle — and the *stops* are what
   * carries them.
   *
   * CSS has no syntax for "from here to there": its axis is centred on the box
   * and its length is derived from the angle. So the reader's segment is projected
   * onto that axis and the stops are squeezed into the part it covers, which draws
   * the same picture and holds the end colours outside it the way CSS and Figma
   * both do. See `gradient-axis.ts`.
   *
   * Without a box there is nothing to project onto, so a caller that does not know
   * the shape gets the angle — which is what every gradient written before this
   * meant anyway.
   */
  const points = box ? gradientPoints(paint) : undefined;
  const placed = points
    ? {
        angle: angleBetween(points.from, points.to, box!),
        stops: remapStops(paint.stops ?? [], axisRange(points.from, points.to, box!))
      }
    : undefined;

  /**
   * Each stop's position through **this layer's** track, so a motion can slide this
   * gradient's colours and not the one under it.
   *
   * Every stop gets the same variable, which is the whole point: adding the same
   * amount to all of them moves the band of colour along the axis and keeps the
   * shape the designer gave it. A per-stop variable would need a name per stop, and
   * a gradient here can have five.
   */
  const at = (offset: number) =>
    `calc(${round(offset * 100)}% + ${trackVar('fillStop', index)})`;

  const stops = (placed?.stops ?? paint.stops ?? [])
    .map((stop) => `${withAlpha(stop.color, alpha)} ${at(stop.offset)}`)
    .join(', ');
  if (!stops) return undefined;

  /**
   * A radial's own shape: its centre and its two radii — see `radialCss`, which
   * also records the one thing CSS refuses (a rotated ellipse).
   *
   * Its stops are *not* remapped: a linear's segment is a sub-range of a longer
   * axis, and a radial's radius **is** the axis — the reader's `to` sets how far
   * it reaches rather than where a longer line is cut.
   */
  if (paint.kind === 'radial') {
    return `radial-gradient(${radialCss(paint, box)}, ${
      (paint.stops ?? [])
        .map((stop) => `${withAlpha(stop.color, alpha)} ${at(stop.offset)}`)
        .join(', ')
    })`;
  }

  /**
   * The angle through **this layer's** track, so a motion can turn this gradient
   * and not the one under it.
   *
   * `background-image` is **discrete** in Chromium — measured, a gradient from
   * 0deg to 180deg has no midpoint — so a gradient that turns cannot be a keyframe
   * at all. `calc(180deg + var(--sl-f1-angle, 0deg))` draws exactly as `180deg`
   * did and can be animated by the variable.
   *
   * The index is the **model's**, not the CSS list's: a translucent image is two
   * CSS layers where the reader sees one fill, and a variable numbered by the CSS
   * slot would be numbered differently from the row a reader clicked. Not the
   * radial either — it has no angle to turn.
   */
  const turned = `calc(${placed?.angle ?? num(paint.angle, 180)}deg + ${trackVar('fillAngle', index)})`;
  if (paint.kind === 'angular') return `conic-gradient(from ${turned} at 50% 50%, ${stops})`;
  return `linear-gradient(${turned}, ${stops})`;
}

/**
 * A colour with an opacity applied, whatever notation it arrived in.
 *
 * `#rgb`, `#rrggbb` and `#rrggbbaa` are turned into `rgba(...)`; anything else —
 * a named colour, an `rgb()`, a `color-mix()` — is handed to
 * `color-mix(in srgb, …)`, which is the only way to add alpha to a colour whose
 * notation is unknown without parsing every notation CSS has.
 */
function withAlpha(colour: string, alpha: number): string {
  if (alpha >= 1) return colour;

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(colour.trim());
  if (hex) {
    const digits = hex[1];
    const expand = (value: string) => parseInt(value.length === 1 ? value + value : value, 16);
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b] = [digits[0], digits[1], digits[2]].map(expand);
      return `rgba(${r}, ${g}, ${b}, ${round(alpha)})`;
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = expand(digits.slice(0, 2));
      const g = expand(digits.slice(2, 4));
      const b = expand(digits.slice(4, 6));
      return `rgba(${r}, ${g}, ${b}, ${round(alpha)})`;
    }
  }

  return `color-mix(in srgb, ${colour} ${round(alpha * 100)}%, transparent)`;
}

/** An image layer's size and repeat, which `background-image` cannot say alone. */
export function imageLayout(paint: Paint): { size: string; repeat: string } {
  switch (paint.fit ?? 'cover') {
    case 'contain':
      return { size: 'contain', repeat: 'no-repeat' };
    case 'stretch':
      return { size: '100% 100%', repeat: 'no-repeat' };
    case 'tile':
      return { size: 'auto', repeat: 'repeat' };
    default:
      return { size: 'cover', repeat: 'no-repeat' };
  }
}

/**
 * A single paint as one `background`, for the places that draw one.
 *
 * The *stack* is not this any more: a shape's fills are elements, because a
 * property cannot zoom a covered picture, give a picture an opacity or cross-fade
 * two of them — see `fill-layers.ts`. What is left here is the swatch in the
 * panel and the preview in the gallery, which are one paint in a small square and
 * genuinely are a background.
 */
export function backgroundCss(paints: Paint[], box?: Box): string | undefined {
  const shown = paints.filter((paint) => paint.visible !== false && (paint.opacity ?? 1) > 0);

  /**
   * One opaque solid is written as the colour, not as a gradient of itself.
   *
   * The stacking form is correct and unreadable: `linear-gradient(#2563eb,
   * #2563eb)` in a style attribute is a thing a reader inspecting their own
   * slide has to decode, and the overwhelmingly common case — a shape with one
   * flat fill — deserves to say what it means. A test caught it as
   * `linear-gradient(#2563eb, #2563eb)` where the deck had always drawn
   * `rgb(37, 99, 235)`.
   */
  if (shown.length === 1 && shown[0].kind === 'solid' && (shown[0].opacity ?? 1) === 1) {
    return text(shown[0].color);
  }

  // The index goes through, because a layer's tracks are numbered by where it is
  // in the *model* — see `paintCss`.
  const layers = paints
    .map((paint, index) => paintCss(paint, index, box))
    .filter((layer): layer is string => !!layer);
  return layers.length > 0 ? layers.join(', ') : undefined;
}

/** One effect, read from whatever a document holds. */
function readEffect(value: unknown): ShapeEffect | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;

  const kind = text(entry.kind);
  if (kind !== 'drop' && kind !== 'inner' && kind !== 'blur') return undefined;

  return {
    kind,
    x: num(entry.x, 0),
    y: num(entry.y, kind === 'blur' ? 0 : 60),
    blur: Math.max(0, num(entry.blur, 120)),
    spread: num(entry.spread, 0),
    color: text(entry.color) ?? 'rgba(0, 0, 0, 0.25)',
    visible: entry.visible !== false
  };
}

/**
 * The effects a shape carries: its list, or the one its flat shadow describes.
 *
 * The old shadow was an angle and a distance, which is how a drawing tool asks
 * for one — "down and to the right, this far" — and a list needs x and y,
 * because two shadows at different angles cannot share a compass. The conversion
 * is here, once, so the flat form goes on meaning what it meant.
 */
export function effectsOf(attrs: PaintAttrs | undefined): ShapeEffect[] {
  if (!attrs) return [];

  if (Array.isArray(attrs.effects)) {
    return attrs.effects.map(readEffect).filter((effect): effect is ShapeEffect => !!effect);
  }

  const colour = text(attrs.shadowColor);
  if (!colour) return [];

  const distance = num(attrs.shadowDistance, 60);
  const radians = (num(attrs.shadowAngle, 180) * Math.PI) / 180;
  /**
   * Never `-0`, which is the same trap the flat shadow documented one level
   * down: `cos(90°)` is not zero but 6.1e-17, so a shadow thrown straight
   * sideways rounds to a negative zero. It was caught there as `-0px` in a style
   * attribute; here it would be a `-0` written into the document itself, which
   * is worse — it survives saving, and every diff of the file forever.
   */
  const whole = (value: number): number => {
    const rounded = Math.round(value);
    return rounded === 0 ? 0 : rounded;
  };

  return [
    {
      kind: 'drop',
      x: whole(distance * Math.sin(radians)),
      y: whole(-distance * Math.cos(radians)),
      blur: Math.max(0, num(attrs.shadowBlur, 120)),
      spread: 0,
      color: colour,
      visible: true
    }
  ];
}

/** Twips → px, to two decimals and never `-0`. */
const px = (twips: number): number => {
  const value = Math.round(twipToPx(twips) * 100) / 100;
  return value === 0 ? 0 : value;
};

/**
 * The effects as CSS: the shadows in one `box-shadow`, the blurs in a `filter`.
 *
 * Two properties because they are two different things to a browser — a shadow
 * is drawn *around* the box and a blur is applied *to* it — and a reader who
 * asks for both should get both rather than whichever the implementation
 * preferred.
 */
export function effectsCss(effects: ShapeEffect[]): CssStyle {
  /**
   * Each shadow's lengths through **its own** track, so a motion can grow one of
   * them.
   *
   * `box-shadow` is a list, and neither composite reaches an item in it: an
   * additive animation *concatenates* (base `0 4px 8px` plus `0 10px 20px`
   * computes to two shadows, not one bigger one) and a replacing one erases the
   * shape's own. Measured both ways before this was written.
   *
   * So the multiplier is a variable per shadow, written here because the renderer
   * is the one with the numbers — the alternative is a motion parsing a shadow
   * string, which is the thing this file exists to avoid. It draws identically at
   * the neutral 1, and the cost is four `calc()`s on the shapes that have a
   * shadow, which is the price of a shadow being animatable at all.
   *
   * Past `TRACK_SLOTS` the lengths are written plainly: a fifth shadow is not
   * offered as a motion target, so a variable for it would be a variable nothing
   * can animate.
   */
  const shadows = effects
    .filter((effect) => effect.visible !== false && effect.kind !== 'blur')
    .map((effect, index) => {
      const inner = effect.kind === 'inner' ? 'inset ' : '';
      const lift = index < TRACK_SLOTS ? trackVar('shadowLift', index) : undefined;
      const length = (value: number) =>
        lift ? `calc(${px(value)}px * ${lift})` : `${px(value)}px`;
      return (
        `${inner}${length(effect.x ?? 0)} ${length(effect.y ?? 0)} ` +
        `${length(Math.max(0, effect.blur ?? 0))} ${length(effect.spread ?? 0)} ${effect.color}`
      );
    });

  /*
    Plainly, with no variable: `filter` is in `MUST_ADD`, so an additive keyframe
    concatenates onto whatever the shape already carries. A track was written here
    and deleted — see `TrackPart`.
  */
  const blurs = effects
    .filter((effect) => effect.visible !== false && effect.kind === 'blur')
    .map((effect) => `blur(${px(Math.max(0, effect.blur ?? 0))}px)`);

  const css: CssStyle = {};
  if (shadows.length > 0) css.boxShadow = shadows.join(', ');
  if (blurs.length > 0) css.filter = blurs.join(' ');
  return css;
}

/** A paint a reader has just added, which has to look like something. */
export function newPaint(kind: PaintKind, colour = '#93c5fd'): Paint {
  if (kind === 'solid') return { kind, color: colour, opacity: 1, visible: true };
  return {
    kind,
    stops: [
      { offset: 0, color: colour },
      { offset: 1, color: '#1e3a8a' }
    ],
    angle: 180,
    opacity: 1,
    visible: true
  };
}

/** An effect a reader has just added: a soft shadow, which is what "add" means. */
export function newEffect(kind: EffectKind): ShapeEffect {
  if (kind === 'blur') return { kind, blur: 60, visible: true };
  return {
    kind,
    x: 0,
    y: 60,
    blur: 180,
    spread: 0,
    color: 'rgba(15, 23, 42, 0.25)',
    visible: true
  };
}
