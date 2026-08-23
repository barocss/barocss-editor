import { effectsOf, paintsOf, type Paint, type ShapeEffect } from './paints';

/**
 * A deck's paint, in the language an SVG element speaks.
 *
 * ## Why this file exists
 *
 * Every shape on a slide is an HTML box, so `paintCss` answers in `background`,
 * `border-style` and `box-shadow` — and vector ink is not a box. A `path` is an SVG
 * element, where a gradient is a `<defs><linearGradient>` referenced by `fill` and a
 * shadow is a filter. So the path renderer read `d`, `fill`, `stroke` and
 * `strokeWidth`, and **nothing else in the deck's design vocabulary reached it**: a
 * reader could set a gradient on a path from the same panel that sets it on a
 * rectangle and see nothing happen.
 *
 * Found by `every-attribute-is-read`, which reported nine of a path's attributes as
 * changing no drawing at all. Nothing was wrong in any one file — the panel writes the
 * attributes, the schema declares them, the shapes that are boxes read them — which is
 * the exact shape of fault that harness is for.
 *
 * ## Through `paintsOf` and `effectsOf`, not the flat attributes
 *
 * The two readers already answer "what is this shape painted with" for the whole
 * model: a `fills` stack, an `effects` stack, and the flat attributes as the one-item
 * case. Reading `gradientFrom` here would have been a second answer to a question that
 * already has one, and the two would disagree the first time a stack was involved.
 *
 * ## What SVG cannot do, said out loud
 *
 * A `<path>` has one `fill`, so a stack paints with its **bottom** layer — the same
 * one an HTML box shows through everything above it — and the rest are dropped. A
 * conic gradient has no SVG equivalent at all, an image fill would need a `<pattern>`
 * with a `<image>` sized to the shape, and an inner shadow needs a composited filter
 * chain. Those are named in `docs/BACKLOG.md` rather than half-drawn: a gradient that
 * silently becomes a flat colour is worse than one that is not offered.
 */

/** An element descriptor, kept structural so this file does not import the DSL. */
export interface SvgNode {
  tag: string;
  attributes: Record<string, string | number>;
  children?: SvgNode[];
}

export interface SvgPaint {
  /** What the shape is filled with: a colour, a `url(#…)`, or `none`. */
  fill: string;
  /** The filter the shape is drawn through, when it has a shadow. */
  filter?: string;
  /** What has to be in `<defs>` for the two above to resolve. */
  defs: SvgNode[];
}

/**
 * An id SVG and the DOM will both accept, out of a sid.
 *
 * A sid is `session:counter`, and a colon is legal in an HTML id but not in a CSS
 * selector — so a stylesheet or a `querySelector` written later would break on ink
 * that works. Cheaper to spend the replace here than to find that out.
 */
const idFor = (sid: string, what: string): string =>
  `sl-${what}-${sid.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/** Two decimals: these are proportions of a box, not measurements. */
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A gradient's axis as SVG states it: two points in the box's own proportions.
 *
 * The model's angle is CSS's — degrees clockwise from "up" — and the two systems
 * disagree about which way y runs, which is why this is `-cos` and the CSS side is
 * not. A gradient at 180° runs down the shape in both, and that is the test.
 */
const axisOf = (angle: number): { x1: number; y1: number; x2: number; y2: number } => {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  return {
    x1: round(0.5 - dx / 2),
    y1: round(0.5 - dy / 2),
    x2: round(0.5 + dx / 2),
    y2: round(0.5 + dy / 2)
  };
};

/** A stop, with the opacity SVG keeps separate from the colour. */
const stopsOf = (paint: Paint): SvgNode[] =>
  (paint.stops ?? []).map((stop) => ({
    tag: 'stop',
    attributes: {
      offset: `${round(stop.offset * 100)}%`,
      'stop-color': stop.color,
      // A paint's own opacity multiplies its stops, the way a layer's does in CSS.
      ...(paint.opacity !== undefined ? { 'stop-opacity': round(paint.opacity) } : {})
    }
  }));

/**
 * The bottom paint of the stack, as a `fill` and whatever `<defs>` it needs.
 *
 * `undefined` when there is nothing to fill with — which is not the same as black.
 * A path with no fill is a stroke, and this product's shapes say what they mean by
 * silence: no fill.
 */
function fillOf(sid: string, paints: Paint[]): { fill?: string; defs: SvgNode[] } {
  const paint = paints.find((candidate) => candidate.visible !== false);
  if (!paint) return { defs: [] };

  if (paint.kind === 'solid') return { fill: paint.color, defs: [] };

  if (paint.kind === 'linear' || paint.kind === 'radial') {
    const id = idFor(sid, 'grad');
    const stops = stopsOf(paint);
    // No stops is no gradient — and falling back to a flat colour here would be the
    // silent half-drawing this file refuses to do.
    if (stops.length === 0) return { defs: [] };

    return {
      fill: `url(#${id})`,
      defs: [
        paint.kind === 'linear'
          ? {
              tag: 'linearGradient',
              attributes: { id, ...axisOf(paint.angle ?? 180) },
              children: stops
            }
          : /**
             * A radial fills the box, which is what `radialCss` does on the CSS side:
             * `objectBoundingBox` units make the circle an ellipse in a non-square
             * shape, and a shape's gradient should follow the shape.
             */
            {
              tag: 'radialGradient',
              attributes: { id, cx: '50%', cy: '50%', r: '50%' },
              children: stops
            }
      ]
    };
  }

  // Conic and image: see the file's note. Not drawn, rather than drawn as something
  // else that a reader would have to discover was a lie.
  return { defs: [] };
}

/** The drop shadow, as the one filter primitive that says exactly this. */
function filterOf(sid: string, effects: ShapeEffect[]): { filter?: string; defs: SvgNode[] } {
  const drops = effects.filter((effect) => effect.kind === 'drop' && effect.visible !== false);
  if (drops.length === 0) return { defs: [] };

  const id = idFor(sid, 'shadow');
  return {
    filter: `url(#${id})`,
    defs: [
      {
        tag: 'filter',
        attributes: {
          id,
          /**
           * Room for the shadow to fall into.
           *
           * A filter's default region is the shape plus 10%, and a shadow thrown 60
           * twips with a 120-twip blur is cut off by it — a soft shadow with a hard
           * straight edge, which looks like a rendering bug rather than a setting.
           */
          x: '-50%',
          y: '-50%',
          width: '200%',
          height: '200%'
        },
        children: drops.map((drop) => ({
          tag: 'feDropShadow',
          attributes: {
            dx: drop.x ?? 0,
            dy: drop.y ?? 0,
            /**
             * Half the blur.
             *
             * CSS's blur radius is the width of the whole gradient; a Gaussian's
             * deviation is half of it. This is the conversion every browser applies to
             * `box-shadow`, and getting it wrong makes an SVG shadow twice as soft as
             * the same numbers on the box beside it.
             */
            stdDeviation: Math.max(0, (drop.blur ?? 0) / 2),
            'flood-color': drop.color ?? 'rgba(15, 23, 42, 0.35)'
          }
        }))
      }
    ]
  };
}

/**
 * Everything an SVG shape needs to be painted the way the model says.
 *
 * Lengths stay in twips, which is right rather than lucky: a path's `viewBox` is its
 * own size in twips, so a shadow's offset and blur are already in the units the
 * element measures in. The CSS side is the one that has to convert.
 */
export function svgPaintOf(sid: string, attrs: unknown): SvgPaint {
  const paints = paintsOf(attrs as never);
  const effects = effectsOf(attrs as never);

  const filled = fillOf(sid, paints);
  const filtered = filterOf(sid, effects);

  return {
    fill: filled.fill ?? 'none',
    filter: filtered.filter,
    defs: [...filled.defs, ...filtered.defs]
  };
}
