import { describe, it, expect } from 'vitest';
import { fillBoxCss, fillLayers, layered } from '../src/fill-layers';
import type { Paint } from '../src/paints';

/**
 * A shape's fills, drawn as elements.
 *
 * The three things a `background` could not do, each measured before this module
 * existed: zoom a covered picture (`cover` cannot be multiplied), give a picture
 * an opacity (`background-image` has no alpha — the wash that stood in for it was
 * a no-op), and cross-fade two of them. See `src/fill-layers.ts`.
 */

const photo: Paint = { kind: 'image', src: 'https://example.test/a.png' };
const gradient: Paint = {
  kind: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' }
  ]
};

describe('what is a layer and what is not', () => {
  /**
   * The line is exactly "a stack of one opaque colour is not a stack": it is the
   * commonest shape on a slide, it reads as what it is in a style attribute, and
   * a flat colour has nothing an element would buy — it cannot zoom, cannot pan,
   * and has nothing under it to fade against.
   */
  it('draws one opaque colour on the box itself', () => {
    expect(layered([{ kind: 'solid', color: '#2563eb' }])).toBe(false);
    /**
     * Through its colour track, and the shape declaring the same colour.
     *
     * Two declarations rather than one on the commonest shape on a slide, which is
     * the cost of a fill-colour motion working *here* — a motion that only worked on
     * shapes with a stack of two would be one nobody could find. What is drawn is
     * identical: the shape's own declaration is what the variable resolves to.
     */
    expect(fillBoxCss([{ kind: 'solid', color: '#2563eb' }])).toEqual({
      '--sl-f0-color': '#2563eb',
      background: 'var(--sl-f0-color, transparent)'
    });
    expect(fillLayers([{ kind: 'solid', color: '#2563eb' }])).toEqual([]);
  });

  it('draws nothing for nothing', () => {
    expect(fillBoxCss([])).toEqual({});
    expect(fillBoxCss([{ kind: 'solid', color: '#fff', visible: false }])).toEqual({});
    expect(fillLayers([{ kind: 'solid', color: '#fff', opacity: 0 }])).toEqual([]);
  });

  it('is a layer as soon as there is anything to do to it', () => {
    expect(layered([{ kind: 'solid', color: '#fff', opacity: 0.5 }])).toBe(true);
    expect(layered([photo])).toBe(true);
    expect(layered([gradient])).toBe(true);
    expect(layered([{ kind: 'solid', color: '#fff' }, gradient])).toBe(true);
  });

  /**
   * The measurement that decided where the layers go: a `z-index: -1` child of a
   * box that is **not** a stacking context is painted in the nearest one that is
   * — the slide — whose own opaque background then covers it. Sampled in the
   * browser, red layer against black text:
   *
   * ```
   * z-index: auto                     red 35502, text    0
   * z-index: -1                       red     0, text 5688   invisible
   * z-index: -1 + isolation: isolate  red 28598, text 5882   correct
   * ```
   */
  it('isolates the box, and paints nothing on it', () => {
    const css = fillBoxCss([photo, { kind: 'solid', color: '#000' }]);
    expect(css.isolation).toBe('isolate');
    expect(css.background).toBeUndefined();
  });

  /**
   * And declares this shape's own neutrals, which is what keeps an inheriting
   * track from reaching the shapes *inside* a frame — see `fill-layers.ts` for
   * the measured cascade.
   */
  it('stops an inherited track at the shape that draws the fills', () => {
    const css = fillBoxCss([photo, { kind: 'solid', color: '#000' }]);
    expect(css['--sl-f0-zoom']).toBe('1');
    expect(css['--sl-f0-panx']).toBe('0%');
    expect(css['--sl-f0-fade']).toBe('1');
    // A solid has nothing to pan and no angle to turn: only what it can read.
    expect(css['--sl-f1-fade']).toBe('1');
    expect(css['--sl-f1-zoom']).toBeUndefined();
    expect(css['--sl-f1-angle']).toBeUndefined();
  });
});

describe('the frame each layer is drawn in', () => {
  it('sits over the padding box, behind the content, out of the way of the pointer', () => {
    const [layer] = fillLayers([gradient]);
    expect(layer.style).toMatchObject({
      position: 'absolute',
      inset: '0',
      zIndex: '-1',
      pointerEvents: 'none',
      // An ellipse says `50%` and a rounded card says four lengths; inheriting is
      // the one form that is right for both without reading the attributes again.
      borderRadius: 'inherit',
      overflow: 'hidden'
    });
  });

  /**
   * Topmost first in the model, like Figma — and `background` agreed by
   * coincidence, because CSS paints its *first* layer on top. Elements do not: a
   * later sibling paints over an earlier one, so the list is reversed exactly
   * here and nowhere else.
   */
  it('reverses the model order, because siblings paint the other way round', () => {
    const layers = fillLayers([photo, gradient, { kind: 'solid', color: '#000' }]);
    expect(layers.map((layer) => layer.index)).toEqual([2, 1, 0]);
  });

  /**
   * A hidden fill is still *in* the list — that is what the eye is for — so the
   * indexes of the others must not shift. A track is named for the row a reader
   * clicked, and a renumbering would animate the wrong fill.
   */
  it('keeps the model index when a fill in the middle is hidden', () => {
    const layers = fillLayers([photo, { ...gradient, visible: false }, gradient]);
    expect(layers.map((layer) => layer.index)).toEqual([2, 0]);
  });
});

describe('the opacity a background could not have', () => {
  it('is the element opacity, through this fill own fade track', () => {
    const [layer] = fillLayers([{ ...photo, opacity: 0.4 }]);
    expect(layer.style.opacity).toBe('calc(0.4 * var(--sl-f0-fade, 1))');
  });

  /**
   * And it is applied **once**. `paintCss` bakes an alpha into every stop, which
   * is how a gradient in a `background` list gets one — doing that as well as
   * setting the element's opacity would draw a 0.5 fill at 0.25.
   */
  it('does not also bake the alpha into the gradient stops', () => {
    const [layer] = fillLayers([{ ...gradient, opacity: 0.5 }]);
    expect(layer.style.background).toContain('#ff0000');
    expect(layer.style.background).not.toContain('rgba');
    expect(layer.style.opacity).toBe('calc(0.5 * var(--sl-f0-fade, 1))');
  });

  /** A full-strength fill still says it, so one step can fade it. */
  it('writes the track even at full strength', () => {
    expect(fillLayers([gradient])[0].style.opacity).toBe('calc(1 * var(--sl-f0-fade, 1))');
  });
});

describe('a picture, which is why any of this happened', () => {
  it('is an image element, so it can be scaled and moved', () => {
    const [layer] = fillLayers([photo]);
    expect(layer.image?.src).toBe('https://example.test/a.png');
    expect(layer.image?.style).toMatchObject({
      objectFit: 'cover',
      // The individual properties, so a pan and a zoom are two tracks that
      // compose rather than one that erases the other.
      translate: 'var(--sl-f0-panx, 0%) var(--sl-f0-pany, 0%)',
      scale: 'var(--sl-f0-zoom, 1)',
      // A zoomed picture is *meant* to be bigger than the box that shows it —
      // the same lesson the crop learned about the preflight's `max-width`.
      maxWidth: 'none',
      maxHeight: 'none'
    });
  });

  it('names each fill own tracks, so a motion reaches one of two pictures', () => {
    const layers = fillLayers([photo, { ...photo, src: 'b.png' }]);
    expect(layers[0].image?.style.scale).toBe('var(--sl-f1-zoom, 1)');
    expect(layers[1].image?.style.scale).toBe('var(--sl-f0-zoom, 1)');
  });

  it('is nothing without a picture', () => {
    expect(fillLayers([{ kind: 'image' }])).toEqual([]);
  });
});

describe('a solid, once it is a layer', () => {
  /**
   * `background` takes images and a colour is not one, which is why a stacked
   * solid had to be written `linear-gradient(#fff, #fff)`. An element has its own
   * background, so the workaround goes with the thing that needed it.
   */
  it('is a colour again rather than a gradient of itself', () => {
    // A tint over a photograph: the solid is the model's first paint, so it is
    // the *last* element and paints on top.
    const layers = fillLayers([{ kind: 'solid', color: '#ff0000', opacity: 0.4 }, photo]);
    // Its own colour track, so a motion can recolour this tint and not the photo.
    expect(layers[1].style.background).toBe('var(--sl-f0-color, transparent)');
    expect(fillBoxCss([{ kind: 'solid', color: '#ff0000', opacity: 0.4 }, photo])['--sl-f0-color'])
      .toBe('#ff0000');
    expect(layers[1].style.opacity).toBe('calc(0.4 * var(--sl-f0-fade, 1))');
  });
});

describe('a gradient in a layer still knows its shape', () => {
  /**
   * The box travels, because a gradient may hold two *points* and turning them
   * into the angle CSS understands needs the shape's proportions — the same
   * segment across a wide box and a tall one are different angles.
   */
  it('projects two points onto the box it is given', () => {
    const corner: Paint = {
      ...gradient,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 }
    };
    const angle = (paint: Paint, width: number, height: number) =>
      /calc\((-?[\d.]+)deg/.exec(
        fillLayers([paint], { x: 0, y: 0, width, height })[0].style.background ?? ''
      )?.[1];
    // The same corner-to-corner segment: a shallow diagonal in a wide box and a
    // steep one in a tall box.
    expect(angle(corner, 4000, 1000)).toBe('104');
    expect(angle(corner, 1000, 4000)).toBe('166');
  });

  /** The angle goes through this fill's own track, so one sweep turns one fill. */
  it('turns through its own track', () => {
    const layers = fillLayers([gradient, gradient]);
    expect(layers[0].style.background).toContain('var(--sl-f1-angle, 0deg)');
    expect(layers[1].style.background).toContain('var(--sl-f0-angle, 0deg)');
  });
});
