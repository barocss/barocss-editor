import { boxOf, type Box, type Placement, type CssStyle } from './geometry';
import { resizeBox, type Delta, type Handle } from './manipulate';

/**
 * Which part of a picture is shown.
 *
 * The most-missed thing in every tool this deck is measured against, and the
 * deck had none of it: `picture` declared `fit` — which nothing could set — and
 * there was no crop at all, so a photograph went onto a slide whole or not at
 * all. Cropping is not an effect a reader goes looking for; it is what putting
 * a photograph on a slide *is*.
 *
 * ## Four fractions of the source, which is what OOXML stores
 *
 * `cropLeft`, `cropTop`, `cropRight`, `cropBottom`, each a fraction of the
 * source picture between 0 and 1 — the same shape as OOXML's `a:srcRect`, so a
 * document that came from PowerPoint and one authored here mean the same thing
 * by the same numbers. Not four pixel offsets, which would be four numbers that
 * stop meaning anything the moment the picture is replaced with one of another
 * size.
 *
 * ## What the numbers say
 *
 * The kept rectangle fills the box. The author sets the box by dragging its
 * handles and the crop chooses which part of the source is inside it, which is
 * the division every tool makes and the only one that keeps a slide's geometry
 * the document's business rather than the picture's.
 *
 * So the picture is drawn larger than the box and offset, and the box hides the
 * rest:
 *
 * ```
 *   source ┌───────────────────────┐      box  ┌────────┐
 *          │      ┌────────┐       │           │ kept   │
 *          │      │ kept   │       │    ->     │        │
 *          │      └────────┘       │           └────────┘
 *          └───────────────────────┘
 *   width 1/(1-l-r) of the box, moved left by l/(1-l-r) of it
 * ```
 *
 * ## Why it is a wrapper and an image, where it used to be an image
 *
 * A single `<img>` can only crop with `clip-path`, which hides part of the
 * picture *without* moving what is left — the kept part stays where it was and
 * the box is half empty, which is not what a reader means by cropping. The
 * element that clips has to be the one the model placed, and the picture inside
 * it has to be free to be bigger than it.
 */

interface CropAttrs {
  cropLeft?: unknown;
  cropTop?: unknown;
  cropRight?: unknown;
  cropBottom?: unknown;
}

/**
 * The crop attributes a picture carries, declared where they are read.
 *
 * Each is a **fraction** of the picture, and the range says so: `fraction()` below
 * clamps anything above 1, which used to be the only place that knowledge lived. A
 * conformance check set all four to a number far outside the range, the picture came
 * back uncropped — four crops of 1 crop it out of existence — and the check reported
 * every one of them as read by nothing. See `AttributeDefinition.min`.
 */
const CROP_FRACTION = { type: 'number' as const, default: 0, min: 0, max: 1 };

export const CROP_ATTRS = {
  cropLeft: CROP_FRACTION,
  cropTop: CROP_FRACTION,
  cropRight: CROP_FRACTION,
  cropBottom: CROP_FRACTION
};

/**
 * A fraction, or nothing.
 *
 * Clamped rather than trusted: a document is a file anyone can write, and a
 * `cropLeft` of 2 would ask for a picture scaled by 1/-1 — a negative width,
 * which draws nothing and looks like a picture that failed to load.
 */
const fraction = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1);
};

/** Two decimals, so a percentage does not arrive as 33.33333333333333%. */
const pct = (value: number): string => `${Math.round(value * 10000) / 100}%`;

export interface CropCss {
  /** The box the model placed, which is what hides the rest. */
  outer: CssStyle;
  /** The picture inside it, bigger than the box and offset. */
  inner: CssStyle;
}

/**
 * What the two elements are styled with.
 *
 * Nothing at all when there is no crop: the picture is the size of its box and
 * `object-fit` decides how it sits in it, exactly as before this existed. That
 * is what keeps every deck already written drawing the way it drew.
 *
 * A crop that would keep nothing — the two sides meeting or crossing — is
 * ignored rather than drawn, because the alternative is a slide with an
 * invisible picture on it that a reader cannot select or undo their way out of.
 */
export function cropCss(attrs: CropAttrs | undefined): CropCss {
  const left = fraction(attrs?.cropLeft);
  const top = fraction(attrs?.cropTop);
  const right = fraction(attrs?.cropRight);
  const bottom = fraction(attrs?.cropBottom);

  const kept = { width: 1 - left - right, height: 1 - top - bottom };
  if (kept.width <= 0 || kept.height <= 0) return { outer: {}, inner: {} };
  if (left === 0 && top === 0 && right === 0 && bottom === 0) return { outer: {}, inner: {} };

  return {
    outer: { overflow: 'hidden' },
    inner: {
      position: 'absolute',
      width: pct(1 / kept.width),
      height: pct(1 / kept.height),
      left: pct(-left / kept.width),
      top: pct(-top / kept.height)
    }
  };
}

/** Whether a picture is cropped at all — what a panel shows a "reset" for. */
export function isCropped(attrs: CropAttrs | undefined): boolean {
  return (
    fraction(attrs?.cropLeft) > 0 ||
    fraction(attrs?.cropTop) > 0 ||
    fraction(attrs?.cropRight) > 0 ||
    fraction(attrs?.cropBottom) > 0
  );
}

/** The four fractions, as a document carries them. */
export interface Crop {
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}

/** What a crop drag ends in: a smaller box, showing less of the source. */
export interface CropDrag {
  box: Box;
  crop: Crop;
}

const read = (attrs: CropAttrs | undefined): Crop => ({
  cropLeft: fraction(attrs?.cropLeft),
  cropTop: fraction(attrs?.cropTop),
  cropRight: fraction(attrs?.cropRight),
  cropBottom: fraction(attrs?.cropBottom)
});

/** Six decimals: a fraction of a source, not a length anyone reads. */
const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * A crop handle, dragged.
 *
 * **The picture does not move.** Dragging the left handle inward cuts the left
 * of the picture away and leaves everything else exactly where it was on the
 * slide — which is what PowerPoint and Canva do, and the only behaviour a reader
 * can predict. The alternative, holding the box still and rescaling what is left
 * to fill it, makes the whole picture jump and zoom while one edge is dragged.
 *
 * So a crop drag is two changes at once: the box shrinks with the handle, and
 * the same amount of source is taken off that side. The two are one gesture and
 * one command — `cropPicture` — because a box that shrank without its crop
 * changing is a squashed picture, and the reader who pressed undo once would be
 * looking at it.
 *
 * The conversion is the whole of it: the box shows the *kept* part of the
 * source, so a handle moved by a tenth of the box's width takes a tenth of the
 * kept width off, which is a tenth of `1 - left - right` of the source.
 *
 * The box is resized by `resizeBox`, so a crop obeys the same minimum size as
 * every other drag and there is one place that knows what a handle means.
 */
export function cropByHandle(
  placement: Placement | undefined,
  attrs: CropAttrs | undefined,
  handle: Handle,
  delta: Delta
): CropDrag {
  const before = boxOf(placement);
  const crop = read(attrs);
  const box = resizeBox(placement, handle, delta);

  const kept = {
    width: 1 - crop.cropLeft - crop.cropRight,
    height: 1 - crop.cropTop - crop.cropBottom
  };
  // A box with no width to speak of has no fraction to compute against; the
  // resize already refused to go below the minimum, so this is only reachable
  // for a box the document itself declared as nothing.
  if (before.width <= 0 || before.height <= 0) return { box: before, crop };

  /**
   * How much of the source came off each side, from how far each edge moved.
   *
   * Measured from the *edges* rather than from the delta, because the delta is
   * the pointer's and the edges are what the resize allowed: a handle dragged
   * past the far side stops, and a crop computed from the raw pointer would go
   * on cutting after the box had stopped shrinking.
   */
  const off = (moved: number, extent: number, span: number): number => (moved / extent) * span;

  const next: Crop = {
    cropLeft: crop.cropLeft + off(box.x - before.x, before.width, kept.width),
    cropTop: crop.cropTop + off(box.y - before.y, before.height, kept.height),
    cropRight:
      crop.cropRight +
      off(before.x + before.width - (box.x + box.width), before.width, kept.width),
    cropBottom:
      crop.cropBottom +
      off(before.y + before.height - (box.y + box.height), before.height, kept.height)
  };

  /**
   * Never past the far side, and never negative.
   *
   * Dragging *outward* is how a reader takes a crop back, which is why these are
   * not clamped at the crop they started from — but a fraction below zero would
   * ask to show more of a picture than there is, and a picture cannot grow.
   */
  const clamp = (value: number, opposite: number): number =>
    Math.max(0, Math.min(value, Math.max(0, 1 - opposite - MINIMUM_KEPT)));

  const kept_crop: Crop = {
    cropLeft: clamp(next.cropLeft, crop.cropRight),
    cropTop: clamp(next.cropTop, crop.cropBottom),
    cropRight: clamp(next.cropRight, crop.cropLeft),
    cropBottom: clamp(next.cropBottom, crop.cropTop)
  };

  /**
   * The box, recomputed from the crop that was actually kept.
   *
   * Not the one `resizeBox` returned. A resize dragged past the opposite edge
   * *flips* the box — which is right for a shape, where dragging the left edge
   * past the right one turns it inside out, and impossible for a picture: there
   * is no negative amount of source to show. Measured, dragging one handle far
   * enough left a box 99000 twips wide claiming to show all of a picture.
   *
   * Deriving the box from the clamped crop is also what keeps the two in step
   * for good: the box always shows exactly the part of the source the crop kept,
   * because it is computed from it.
   */
  const back = (value: number, was: number, extent: number, span: number): number =>
    ((value - was) / span) * extent;

  const offLeft = back(kept_crop.cropLeft, crop.cropLeft, before.width, kept.width);
  const offRight = back(kept_crop.cropRight, crop.cropRight, before.width, kept.width);
  const offTop = back(kept_crop.cropTop, crop.cropTop, before.height, kept.height);
  const offBottom = back(kept_crop.cropBottom, crop.cropBottom, before.height, kept.height);

  return {
    box: {
      x: Math.round(before.x + offLeft),
      y: Math.round(before.y + offTop),
      width: Math.round(before.width - offLeft - offRight),
      height: Math.round(before.height - offTop - offBottom)
    },
    crop: {
      cropLeft: round(kept_crop.cropLeft),
      cropTop: round(kept_crop.cropTop),
      cropRight: round(kept_crop.cropRight),
      cropBottom: round(kept_crop.cropBottom)
    }
  };
}

/**
 * The least of the source a crop may keep, as a fraction.
 *
 * A hundredth. Small enough never to stop a real crop and large enough that the
 * picture never becomes a line the reader cannot grab a handle on.
 */
const MINIMUM_KEPT = 0.01;

/** No crop at all — what "reset" writes, and what a fresh picture carries. */
export const NO_CROP: Crop = { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 };
