import type { Box, CssStyle } from './geometry';
import { imageLayout, paintCss, type Paint, type PaintKind } from './paints';
import { trackName, trackNeutral, trackVar } from './motion-tracks';

/**
 * A shape's fills, drawn as **elements** rather than as one `background`.
 *
 * ## Why the list had to stop being a property
 *
 * A stack of paints fits in `background` exactly until a reader wants to do
 * something to *one* of them, and then three separate walls arrive at once —
 * each one measured, none of them a matter of taste:
 *
 * - **`cover` cannot be multiplied.** The Ken Burns *pan* works as a background
 *   (a covered picture overflows its box, so `background-position` has somewhere
 *   to go); the *zoom* does not. `background-size: calc(100% * 1.4)` is a
 *   different **fit**, not a closer view of the same one, and there is no numeric
 *   form of `cover` without knowing the picture's own proportions against the
 *   box's — which the model does not hold and should not.
 * - **`background-image` has no alpha.** A fill's `opacity` on a *picture* was
 *   drawn as a fully transparent wash over it, which is a no-op: measured, a
 *   photograph at `opacity: 0.4` came out
 *   `linear-gradient(rgba(255,255,255,0), rgba(255,255,255,0)), url(…)` and drew
 *   at full strength. The panel had a control that did nothing.
 * - **Two pictures cannot cross-fade**, for the same reason. Which is the one
 *   thing every slide deck in the world does between two photographs.
 *
 * An element has `opacity`, `translate` and `scale`, all three animatable and
 * two of them composited. So the layers become elements and the three walls are
 * gone at once — one change with three results, which is why it was worth
 * waiting to do it properly rather than special-casing the zoom.
 *
 * ## Where they go, and the measurement that decided it
 *
 * Behind the shape's own content, which for a text frame means behind real
 * editable paragraphs. Three arrangements were tried in the browser, sampling
 * pixels of red layer against black text:
 *
 * ```
 * z-index: auto                     red 35502, text  0    the layer covers the text
 * z-index: -1                       red     0, text 5688   invisible — identical to no layer
 * z-index: -1 + isolation: isolate  red 28598, text 5882   the fill behind the text
 * ```
 *
 * The middle row is the trap: a negative `z-index` child of a box that is *not* a
 * stacking context is painted in the nearest ancestor that is — here the slide,
 * whose own opaque background then covers it. So the shape declares
 * `isolation: isolate`, and only then does "behind my content" mean this box.
 *
 * The alternative was a wrapper element around the content with `z-index: 1`,
 * which would have put a `<div>` of this product's between a text frame and the
 * paragraphs Word's renderers draw — a shape change to the editable tree for a
 * painting problem. Not worth it for a property that already exists.
 *
 * ## What is *not* a layer
 *
 * One opaque solid is still the box's own `background`. It is the overwhelmingly
 * common shape on a slide, it reads as what it is in a style attribute, and it
 * has nothing an element would buy: a flat colour cannot zoom, cannot pan, and
 * has nothing under it to fade against. The line is exactly "a stack of one
 * opaque colour is not a stack".
 *
 * ## Order
 *
 * The model lists the topmost paint first, like Figma. `background` agreed by
 * coincidence (CSS paints its first layer on top); **elements do not** — a later
 * sibling paints over an earlier one. So the layers are emitted in reverse, and
 * this is the one place that reversal lives.
 */

/** One fill, as the elements that draw it. */
export interface FillLayer {
  /**
   * The **model's** index — the row a reader clicked, not the position among the
   * elements. Every track is named for it (`--sl-f1-zoom`), so a fill's motion
   * follows the fill and not its neighbour. Kept for the same reason
   * `backgroundLayers` carried it.
   */
  index: number;
  /** The clipping box: absolutely placed over the shape's padding box. */
  style: CssStyle;
  /**
   * The picture inside it, when this fill is one — an `<img>`, because `object-fit`
   * is the only way to say `cover` about an element, and because a `transform` on
   * an image is the zoom that a background could not do.
   */
  image?: { src: string; style: CssStyle };
}

const shownPaints = (paints: Paint[]): Paint[] =>
  paints.filter((paint) => paint.visible !== false && (paint.opacity ?? 1) > 0);

/**
 * Whether this stack is drawn as elements.
 *
 * False for nothing at all and for the one opaque solid — see the header. Asked
 * by the renderer, which has to decide before it builds any children, and by the
 * box's own CSS below, so the two cannot disagree.
 */
export function layered(paints: Paint[]): boolean {
  const shown = shownPaints(paints);
  if (shown.length === 0) return false;
  return !(shown.length === 1 && shown[0].kind === 'solid' && (shown[0].opacity ?? 1) === 1);
}

/**
 * Which tracks each kind of fill actually reads.
 *
 * Used to write the shape's own neutrals — see `fillBoxCss` — so only the ones a
 * fill can use are written. A radial has no angle to turn and a solid has nothing
 * to pan.
 */
const TRACKS_OF: Record<PaintKind, string[]> = {
  solid: ['fillColor', 'fillFade'],
  linear: ['fillAngle', 'fillStop', 'fillFade'],
  angular: ['fillAngle', 'fillStop', 'fillFade'],
  // A radial has no angle to turn; its stops are its radius, which does move.
  radial: ['fillStop', 'fillFade'],
  image: ['fillPanX', 'fillPanY', 'fillZoom', 'fillFade']
};

/**
 * What the stack puts on the **box** — as opposed to in it.
 *
 * Either the single colour, or the isolation the layers need *and* this shape's
 * own neutral for every track its fills read. Never a `background` beside layers:
 * a fill drawn twice is a fill that can disagree with itself, which is the failure
 * this whole file is a fix for.
 *
 * ## Why a shape declares the neutrals it already has
 *
 * A track is animated on the shape and read on a layer inside it, so the
 * registrations had to become `inherits: true` — and an inheriting variable
 * reaches every descendant, not only this shape's own layers. A build on a
 * *frame* would otherwise turn the gradients of every shape inside it, which is
 * the exact fault `motion-tracks.ts` chose `inherits: false` to avoid in the first
 * place.
 *
 * Declaring the neutral here stops the inheritance at each shape, and — measured,
 * because the cascade had to be checked rather than assumed — an element's own
 * animation still beats its own inline declaration:
 *
 * ```
 * ancestor animating                       child 2, picture 2
 * child declares the neutral               child 1, picture 1   ← the bleed stops
 * child declares it and animates its own   child 3, picture 3   ← its own still wins
 * ```
 *
 * Only the tracks the fills can read, and only for the fills that draw, so a
 * two-fill shape carries a handful of short declarations rather than the whole
 * table.
 */
export function fillBoxCss(paints: Paint[]): CssStyle {
  const shown = shownPaints(paints);
  if (shown.length === 0) return {};
  /**
   * The one opaque solid: still the box's own `background`, and now through its
   * colour track.
   *
   * Two declarations rather than one on every plainly-filled shape in the deck,
   * which is a real cost and worth the one it buys: a rectangle with a single fill
   * is the *common* case, and a fill-colour motion that only worked on shapes with
   * a stack of two would be a motion nobody could find. The shape declares its own
   * colour as the variable's value, so what is drawn is identical.
   */
  if (!layered(paints)) {
    const colour = shown[0].color;
    if (!colour) return {};
    return {
      [trackName('fillColor', 0)]: colour,
      background: trackVar('fillColor', 0)
    };
  }

  // See the header: without this the layers are painted behind the slide itself.
  const css: CssStyle = { isolation: 'isolate' };
  paints.forEach((paint, index) => {
    if (paint.visible === false || (paint.opacity ?? 1) <= 0) return;
    for (const id of TRACKS_OF[paint.kind] ?? []) {
      // The item travels, because a colour's neutral is the item's own colour.
      css[trackName(id, index)] = trackNeutral(id, paint as never);
    }
  });
  return css;
}

/** How a fill's fit reaches an `<img>`. CSS spells one of the three differently. */
const OBJECT_FIT: Record<string, string> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill'
};

/**
 * Every fill as the elements that draw it, bottom-most **first** — which is the
 * reverse of the model's order, because that is how siblings paint.
 *
 * The box travels for the same reason it travels into `paintCss`: a gradient may
 * hold two points, and turning them into the angle CSS understands needs the
 * shape's proportions.
 */
export function fillLayers(paints: Paint[], box?: Box): FillLayer[] {
  if (!layered(paints)) return [];

  const layers = paints.flatMap((paint, index): FillLayer[] => {
    if (paint.visible === false) return [];
    const alpha = paint.opacity ?? 1;
    if (alpha <= 0) return [];

    /**
     * The layer's own frame: over the shape's padding box, behind its content,
     * clipping whatever moves inside it, and invisible to the pointer.
     *
     * `inset: 0` is the **padding** box because the element is absolutely placed,
     * which is also why a stroke is no longer painted over: a negative-`z` child
     * is painted *after* its stacking context's border, so a layer grown to the
     * border box would cover the stroke a reader asked for.
     *
     * `borderRadius: inherit` rather than a copy of the corners: an ellipse says
     * `50%` and a rounded card says four lengths, and inheriting is the one form
     * that is right for both without reading the attributes again.
     */
    const style: CssStyle = {
      position: 'absolute',
      inset: '0',
      zIndex: '-1',
      pointerEvents: 'none',
      borderRadius: 'inherit',
      overflow: 'hidden'
    };

    /**
     * The opacity is the **element's** now, and it goes through this fill's own
     * fade track — so one step can fade this photograph out while the one under it
     * stays put, which is a cross-fade and was not expressible at all.
     *
     * `calc()` rather than the plain number, always: a track with nothing animating
     * it resolves to 1 and multiplies to exactly what the document says.
     */
    style.opacity = `calc(${alpha} * ${trackVar('fillFade', index)})`;
    if (paint.blend && paint.blend !== 'normal') style.mixBlendMode = paint.blend;

    if (paint.kind === 'image') {
      if (!paint.src) return [];
      /**
       * A tile is the one fit an `<img>` cannot express — `object-fit` has no
       * repeat — so it stays a background, and its pan lands in
       * `background-position` where it always did. Every other fit is a picture
       * inside a clipping box, which is what makes the zoom possible.
       *
       * The `50% +` is there so the *track* means the same thing in both forms:
       * zero is "as the document drew it", and a positive value moves right.
       * The distance differs (a percentage of a background's position is a
       * percentage of the room it has to move, not of the box), and that is
       * accepted rather than papered over: a tiled fill has no edges to run out
       * of, so there is no distance that would be the same.
       */
      if (paint.fit === 'tile') {
        const layout = imageLayout(paint);
        return [
          {
            index,
            style: {
              ...style,
              backgroundImage: `url("${paint.src}")`,
              backgroundRepeat: layout.repeat,
              backgroundSize: layout.size,
              backgroundPosition: `calc(50% + ${trackVar('fillPanX', index)}) calc(50% + ${trackVar('fillPanY', index)})`
            }
          }
        ];
      }

      return [
        {
          index,
          style,
          image: {
            src: paint.src,
            style: {
              width: '100%',
              height: '100%',
              /**
               * The preflight clamps every image to its box — and a zoomed one is
               * *meant* to be bigger than the box that shows it, which is the same
               * lesson the crop learned in `renderers.ts`.
               */
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: OBJECT_FIT[paint.fit ?? 'cover'] ?? 'cover',
              /**
               * The individual properties rather than one `transform`, for the
               * reason `docs/specs/motion-model.md` §1 gives: they compose, so a
               * pan and a zoom are two tracks a reader can set separately, and a
               * motion that writes one does not erase the other.
               */
              translate: `${trackVar('fillPanX', index)} ${trackVar('fillPanY', index)}`,
              scale: trackVar('fillZoom', index)
            }
          }
        }
      ];
    }

    /**
     * A solid is a colour again.
     *
     * `background` takes images and a colour is not one, which is why a stacked
     * solid had to be written as `linear-gradient(#fff, #fff)` — a real cost of
     * the list being one property. An element has its own background, so the
     * workaround goes away with the thing that needed it.
     */
    if (paint.kind === 'solid') {
      /**
       * Through this layer's colour track, so a motion can recolour *this* fill and
       * not the one under it.
       *
       * The shape declares the variable with this same colour (`fillBoxCss`), so the
       * drawn result is identical — and the declaration is what makes the fallback
       * unnecessary and the containment work. See `own` in `motion-tracks.ts`.
       */
      return paint.color
        ? [{ index, style: { ...style, background: trackVar('fillColor', index) } }]
        : [];
    }

    /**
     * A gradient, through the same `paintCss` the background list used — with the
     * opacity taken out of it, because the element carries that now. Baking alpha
     * into every stop *and* setting it on the element would apply it twice.
     */
    const painted = paintCss({ ...paint, opacity: 1 }, index, box);
    if (!painted) return [];
    return [{ index, style: { ...style, background: painted } }];
  });

  // Topmost first in the model; a later sibling paints on top. See the header.
  return layers.reverse();
}
