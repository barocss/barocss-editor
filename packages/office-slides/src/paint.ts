import { twipToPx } from '@barocss/office-word';
import { cornerCss } from './corners';
import { effectsCss, effectsOf, paintsOf } from './paints';
import { fillBoxCss, fillLayers, layered, type FillLayer } from './fill-layers';
import { boxOf, type CssStyle } from './geometry';

/**
 * What a shape on a slide is painted with.
 *
 * A shape's whole style was `fill`, `stroke` and `strokeWidth` — a flat colour
 * and a solid line. That is a diagram's vocabulary, and this product is measured
 * against Keynote and Canva, where a gradient and a shadow are not effects a
 * reader goes looking for but what "designing" *means*. Nothing else on the
 * roadmap is worth much before this: a theme has no colour slots to resolve
 * until a shape has more than one colour, and an animation has nothing worth
 * watching until the thing it moves looks designed.
 *
 * ## Attributes rather than a mini-language
 *
 * A gradient could be one string — `linear 90deg #fff 0%, #000 100%` — and then
 * every reader of it needs a parser, and every parser is a place to disagree
 * about a document. So it is four plain attributes, in the same style as a
 * table's `grid`: the schema stays flat, the panel binds a control per value,
 * and a document that says half of it still draws.
 *
 * Two stops rather than many. PowerPoint's own gradient control opens on two,
 * every real slide this repository has seen uses two, and a list of stops is the
 * mini-language again. When a third is genuinely wanted it is a `gradientStops`
 * beside these, not instead of them, and this stays the common case.
 *
 * ## Why this is Slides' and not the office schema's
 *
 * Word draws its shapes as SVG, where a gradient is a `<defs><linearGradient>`
 * and a shadow is a filter — a different implementation, not a different idea.
 * Declaring these in the shared schema would give Word attributes it does not
 * read, which is the fault this repository keeps finding in itself. They live
 * where they are read, and Word adds the SVG half when Word wants them.
 */

/** The design attributes a deck's shapes carry, on top of the canvas style. */
export const DECK_STYLE_ATTRS = {
  /** A two-stop gradient, which replaces the flat fill while both ends are set. */
  gradientFrom: { type: 'string' as const, required: false },
  gradientTo: { type: 'string' as const, required: false },
  /** Degrees, clockwise from "up" — the direction the gradient runs, as CSS reads it. */
  gradientAngle: { type: 'number' as const, default: 180 },
  /**
   * `linear` or `radial` — declared, not described.
   *
   * The set used to be in this comment only, and a comment is readable by nothing:
   * the harness set this to a made-up string, the renderer drew the default, and the
   * check reported `gradientKind` **unread** on six node types that read it. See
   * `AttributeDefinition.options`.
   *
   * `angular` is missing on purpose: the conic gradient exists, and only a paint in
   * the `fills` stack can ask for it. This flat pair is the older, simpler one.
   */
  gradientKind: { type: 'string' as const, required: false, options: ['linear', 'radial'] },

  /** An outer shadow. Without a colour there is no shadow, whatever else is set. */
  shadowColor: { type: 'string' as const, required: false },
  /** Twips, like every other length. */
  shadowBlur: { type: 'number' as const, default: 120 },
  shadowDistance: { type: 'number' as const, default: 60 },
  /** Degrees, clockwise from "up": where the light throws it. */
  shadowAngle: { type: 'number' as const, default: 180 },

  /** `solid`, `dash`, `dot` or `dashDot` — the values are in `options` so a toolbar
   * and a check can read them rather than each keeping a copy. `dashDot` draws as
   * dashed; see `DASHES` for why CSS gives no third answer. */
  strokeDash: {
    type: 'string' as const,
    required: false,
    options: ['solid', 'dash', 'dot', 'dashDot']
  },

  /**
   * The stacks: every paint a shape is filled with, and every effect on it.
   *
   * A shape had one fill and one shadow, which cannot say "a photograph tinted
   * by a colour over it" or "a soft shadow *and* a hard key line" — the first
   * two things anybody does in a design tool. `type: 'array'` is what the schema
   * already offered; the alternative was `fill2`, which caps the count and
   * cannot reorder.
   *
   * The flat attributes above stay, and stay meaningful: a shape with no list is
   * read *as* a list of one, built from them. See `paints.ts`.
   */
  fills: { type: 'array' as const, required: false },
  effects: { type: 'array' as const, required: false }
};

interface PaintAttrs {
  cornerRadius?: unknown;
  cornerTopLeft?: unknown;
  cornerTopRight?: unknown;
  cornerBottomRight?: unknown;
  cornerBottomLeft?: unknown;
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: unknown;
  gradientFrom?: unknown;
  gradientTo?: unknown;
  gradientAngle?: unknown;
  gradientKind?: unknown;
  shadowColor?: unknown;
  shadowBlur?: unknown;
  shadowDistance?: unknown;
  shadowAngle?: unknown;
  strokeDash?: unknown;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** CSS border styles, by the name the document stores. */
const DASHES: Record<string, string> = {
  solid: 'solid',
  dash: 'dashed',
  dot: 'dotted',
  // CSS has no dash-dot border; a dashed line is the nearer of the two it has,
  // and inventing one with a background image would not survive a corner radius.
  dashDot: 'dashed'
};

/**
 * The same dash, in the spelling SVG uses.
 *
 * `DASHES` above answers in `border-style`, and an SVG path has no border — so vector
 * ink read none of it and was the one shape in the deck that could not be dashed. The
 * lengths are multiples of the stroke width, which is what keeps a dash looking like a
 * dash at any weight; `dashDot` is the one pattern CSS cannot express and SVG can, so
 * here it is drawn as what it says it is.
 *
 * `undefined` for a solid line, so the attribute is simply absent rather than a
 * `stroke-dasharray: none` on every path in the deck.
 */
export function svgDash(attrs: PaintAttrs | undefined): string | undefined {
  const kind = text(attrs?.strokeDash);
  if (!kind || kind === 'solid') return undefined;

  const width = Math.max(1, number(attrs?.strokeWidth, 1));
  const at = (multiple: number) => Math.round(width * multiple * 100) / 100;

  if (kind === 'dot') return `${at(1)} ${at(2)}`;
  if (kind === 'dashDot') return `${at(4)} ${at(2)} ${at(1)} ${at(2)}`;
  if (kind === 'dash') return `${at(4)} ${at(3)}`;
  // A name the schema does not declare. Solid is what every other reader here does
  // with one, and `options` is what stops one being written in the first place.
  return undefined;
}

/**
 * The pattern a **flowing** line uses, and its period.
 *
 * A flow is dashes travelling along the line, and a solid line has nothing to travel —
 * so a solid one is drawn dashed while it flows. An arrowhead says *where to*; a flow
 * says it while moving, which is stronger: with six lines on a slide, the one that flows
 * is the one the eye follows, and that is what a presenter wants when they are talking
 * about one path through a diagram.
 *
 * The **period** is the sum of the pattern, and it is returned because the animation
 * needs it: shifting the dash offset by exactly one period loops with no visible seam,
 * and the period depends on the stroke width. A fixed distance would judder on every
 * line whose weight is not the one it was chosen for.
 */
export function svgFlow(attrs: PaintAttrs | undefined): { dash: string; period: number } | undefined {
  const kind = text(attrs?.strokeDash);
  const pattern = svgDash(kind && kind !== 'solid' ? attrs : { ...attrs, strokeDash: 'dash' });
  if (!pattern) return undefined;

  const period = pattern
    .split(/\s+/)
    .map((piece) => Number(piece))
    .filter((piece) => Number.isFinite(piece))
    .reduce((sum, piece) => sum + piece, 0);
  return period > 0 ? { dash: pattern, period: Math.round(period) } : undefined;
}

/**
 * The stroke's dash, which is the one thing here a list did not replace.
 *
 * Everything else in this file — the fill, the gradient, the shadow — moved to
 * `paints.ts`, where a shape has a *stack* of them. What is left is the border
 * and the vocabulary the schema declares, because a stroke is still one line:
 * Figma allows several and this product's shapes are HTML boxes with one border,
 * which is a real limit rather than a shape of the model.
 */
export function deckPaintCss(attrs: PaintAttrs | undefined): CssStyle {
  const css: CssStyle = {};
  if (!attrs) return css;

  /**
   * What the fills put on the **box**: one opaque colour, or the isolation the
   * layer elements need. The paints themselves are elements now — see
   * `fill-layers.ts` for the three walls that made them elements and for the
   * measurement that put them behind the shape's own content.
   */
  Object.assign(css, fillBoxCss(paintsOf(attrs as never)));

  const stroke = text(attrs.stroke);
  if (stroke) {
    const width = number(attrs.strokeWidth, 1);
    const dash = DASHES[text(attrs.strokeDash) ?? 'solid'] ?? 'solid';
    css.border = `${twipToPx(width)}px ${dash} ${stroke}`;
    /**
     * `boxSizing` goes with the border for the reason it always has: a stroked
     * box would otherwise be wider than the model says, and two boxes the
     * document places edge to edge would overlap by their stroke widths.
     */
    css.boxSizing = 'border-box';
  }

  Object.assign(css, effectsCss(effectsOf(attrs as never)));

  /**
   * The corners, here rather than in the one renderer that used to know about
   * them.
   *
   * `cornerRadius` was read by the rectangle and by nothing else, so a text
   * frame, a frame, a sticky and a picture — every other box a reader rounds —
   * could not be rounded at all. Painting is where "what this box looks like"
   * belongs, and it is the same one line for all of them.
   */
  Object.assign(css, cornerCss(attrs as never));

  return css;
}

/**
 * The elements a shape's fills are drawn as, for the renderer that builds them.
 *
 * Beside `deckPaintCss` rather than inside it, because one returns CSS for a box
 * and the other returns children to put in it — and a renderer needs both, from
 * one read of the attributes.
 *
 * The box goes through for the same reason it always did: a gradient may hold two
 * *points*, and turning them into the angle CSS understands needs the shape's
 * proportions. See `gradient-axis.ts`.
 */
export function deckFillLayers(attrs: PaintAttrs | undefined): FillLayer[] {
  if (!attrs) return [];
  return fillLayers(paintsOf(attrs as never), boxOf(attrs as never));
}

/** Whether this shape's fills are drawn as elements at all — see `layered`. */
export function deckHasFillLayers(attrs: PaintAttrs | undefined): boolean {
  return !!attrs && layered(paintsOf(attrs as never));
}
