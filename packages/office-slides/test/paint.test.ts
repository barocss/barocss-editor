import { describe, it, expect } from 'vitest';
import { deckPaintCss, svgDash, svgFlow } from '../src/paint';
import { fillLayers } from '../src/fill-layers';
import {
  backgroundCss,
  effectsCss,
  effectsOf,
  newEffect,
  newPaint,
  paintsOf
} from '../src/paints';

/**
 * What a shape on a slide is painted with — a *list* of paints and a list of
 * effects.
 *
 * It was one fill, one gradient and one shadow, each spelled out as flat
 * attributes. That cannot say "a photograph tinted by a colour over it" or "a
 * soft shadow *and* a hard key line", which are the first two things anybody
 * does in a design tool.
 *
 * The half of this that matters most is the *legacy* half: every deck already
 * written says `fill` and `gradientFrom`, and a document that changed meaning on
 * being opened would be the worst outcome of the change. So the old attributes
 * are read as a list of one, on every read, and the cases below are the ones the
 * flat helpers used to assert — deliberately, so that "it still means what it
 * meant" is a test rather than a claim.
 */
describe('a shape written before there were lists', () => {
  it('reads a flat colour as one solid paint', () => {
    expect(paintsOf({ fill: '#2563eb' })).toEqual([
      { kind: 'solid', color: '#2563eb', opacity: 1, visible: true }
    ]);
    expect(paintsOf({})).toEqual([]);
  });

  /**
   * Both ends, because a gradient with one colour is a flat fill written the
   * long way — and a reader who has set only the first end is mid-edit, not
   * asking for black.
   */
  it('needs both ends before it is a gradient', () => {
    expect(paintsOf({ fill: '#eee', gradientFrom: '#fff' })[0].kind).toBe('solid');
    expect(paintsOf({ fill: '#eee', gradientTo: '#000' })[0].kind).toBe('solid');

    const gradient = paintsOf({ fill: '#eee', gradientFrom: '#fff', gradientTo: '#000' })[0];
    expect(gradient.kind).toBe('linear');
    expect(gradient.stops).toEqual([
      { offset: 0, color: '#fff' },
      { offset: 1, color: '#000' }
    ]);
  });

  it('keeps the angle and the kind the document stated', () => {
    expect(paintsOf({ gradientFrom: '#fff', gradientTo: '#000', gradientAngle: 90 })[0].angle).toBe(
      90
    );
    expect(
      paintsOf({ gradientFrom: '#fff', gradientTo: '#000', gradientKind: 'radial' })[0].kind
    ).toBe('radial');
    // Anything it does not know is linear, which is what it drew before.
    expect(
      paintsOf({ gradientFrom: '#fff', gradientTo: '#000', gradientKind: 'honeycomb' })[0].kind
    ).toBe('linear');
  });

  /**
   * The old shadow was an angle and a distance — how a drawing tool asks for one
   * — and a list needs x and y, because two shadows at different angles cannot
   * share a compass.
   */
  it('turns the old angle and distance into an offset', () => {
    const [shadow] = effectsOf({ shadowColor: '#000', shadowDistance: 100, shadowAngle: 180 });
    expect(shadow).toMatchObject({ kind: 'drop', x: 0, y: 100, color: '#000' });

    const [sideways] = effectsOf({ shadowColor: '#000', shadowDistance: 100, shadowAngle: 90 });
    expect(sideways.x).toBe(100);
    expect(sideways.y).toBe(0);
  });

  it('is no effect at all without a colour', () => {
    expect(effectsOf({ shadowBlur: 200 })).toEqual([]);
    expect(effectsOf({})).toEqual([]);
  });
});

describe('a stack of paints', () => {
  it('draws them in one background, topmost first', () => {
    const css = backgroundCss([
      { kind: 'solid', color: '#ff0000', opacity: 0.5 },
      { kind: 'solid', color: '#0000ff' }
    ]);

    // CSS paints its first layer on top, which is the order a design tool lists
    // them in — so the list goes through untouched.
    expect(css).toBe('linear-gradient(rgba(255, 0, 0, 0.5), rgba(255, 0, 0, 0.5)), linear-gradient(#0000ff, #0000ff)');
  });

  it('leaves out what is switched off, and keeps it in the list', () => {
    const paints = [
      { kind: 'solid' as const, color: '#ff0000', visible: false },
      { kind: 'solid' as const, color: '#0000ff' }
    ];
    expect(backgroundCss(paints)).toBe('#0000ff');
    // The paint is still there — an eye is not a delete.
    expect(paints).toHaveLength(2);
  });

  it('draws a gradient of as many stops as it has', () => {
    const css = backgroundCss([
      {
        kind: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fff' },
          { offset: 0.35, color: '#f00' },
          { offset: 1, color: '#000' }
        ]
      }
    ]);
    /**
     * Both the angle and every stop are written through this layer's tracks.
     *
     * They draw identically to the plain values and are the only way a gradient can
     * be animated at all — `background-image` is **discrete**, so a gradient that
     * turns or slides cannot be a keyframe. See `motion-tracks.ts`; the fallbacks
     * are what make this correct in a document where the `@property` registration
     * never happened.
     */
    expect(css).toBe(
      'linear-gradient(calc(90deg + var(--sl-f0-angle, 0deg)), ' +
        '#fff calc(0% + var(--sl-f0-stop, 0%)), ' +
        '#f00 calc(35% + var(--sl-f0-stop, 0%)), ' +
        '#000 calc(100% + var(--sl-f0-stop, 0%)))'
    );
  });

  it('reads a document’s stops in order, whatever order they were written in', () => {
    const [paint] = paintsOf({
      fills: [
        {
          kind: 'linear',
          stops: [
            { offset: 1, color: '#000' },
            { offset: 0, color: '#fff' }
          ]
        }
      ]
    } as never);
    expect(paint.stops?.map((stop) => stop.color)).toEqual(['#fff', '#000']);
  });

  /** A gradient of one stop is a colour somebody is halfway through choosing. */
  it('refuses a gradient with fewer than two stops', () => {
    expect(
      paintsOf({ fills: [{ kind: 'linear', stops: [{ offset: 0, color: '#fff' }] }] } as never)
    ).toEqual([]);
  });

  it('is nothing at all when every paint is off', () => {
    expect(backgroundCss([{ kind: 'solid', color: '#fff', visible: false }])).toBeUndefined();
    expect(backgroundCss([])).toBeUndefined();
  });
});

describe('a stack of effects', () => {
  it('puts every shadow in one property, in order', () => {
    const css = effectsCss([
      { kind: 'drop', x: 0, y: 60, blur: 120, spread: 0, color: '#000' },
      { kind: 'inner', x: 15, y: 15, blur: 0, spread: 0, color: '#fff' }
    ]);
    /**
     * Every length through **its own shadow's** track, so a motion can grow one
     * of them and leave the other alone. `box-shadow` is a list and neither
     * composite reaches an item in it — an additive animation concatenates and a
     * replacing one erases the shape's own (both measured) — so the multiplier is
     * a variable per shadow, and the shadows are numbered as the panel lists them.
     */
    const lift = (index: number) => (value: string) =>
      `calc(${value} * var(--sl-s${index}-lift, 1))`;
    const first = lift(0);
    const second = lift(1);
    expect(css.boxShadow).toBe(
      `${first('0px')} ${first('4px')} ${first('8px')} ${first('0px')} #000, ` +
        `inset ${second('1px')} ${second('1px')} ${second('0px')} ${second('0px')} #fff`
    );
  });

  /**
   * A shadow is drawn *around* the box and a blur is applied *to* it — two
   * different things to a browser, so a reader who asks for both gets both.
   */
  it('keeps a blur out of the shadows, where it does not belong', () => {
    const css = effectsCss([
      { kind: 'drop', y: 60, blur: 120, color: '#000' },
      { kind: 'blur', blur: 60 }
    ]);
    const lift = (value: string) => `calc(${value} * var(--sl-s0-lift, 1))`;
    expect(css.boxShadow).toBe(`${lift('0px')} ${lift('4px')} ${lift('8px')} ${lift('0px')} #000`);
    /**
     * And the blur is written plainly.
     *
     * `filter` is the one list that needs no track: `composite: 'add'`
     * concatenates it, so a motion's functions land beside this one instead of
     * replacing it. A `calc()` around every filter argument every shape carries
     * would buy nothing — see `motion-tracks.ts`.
     */
    expect(css.filter).toBe('blur(4px)');
  });

  it('leaves out what is switched off', () => {
    expect(effectsCss([{ kind: 'drop', y: 60, color: '#000', visible: false }])).toEqual({});
  });
});

describe('what a reader gets when they press add', () => {
  it('gives a paint that looks like something', () => {
    expect(newPaint('solid').color).toBeTruthy();
    // A gradient needs two ends to be one, so the new one has them.
    expect(newPaint('linear').stops).toHaveLength(2);
  });

  it('gives a soft shadow, which is what "add an effect" means', () => {
    expect(newEffect('drop')).toMatchObject({ kind: 'drop', visible: true });
    expect(newEffect('blur').blur).toBeGreaterThan(0);
  });
});

/**
 * The whole answer a renderer asks for, which is where the stroke and the
 * corners join in.
 */
describe('everything a box is drawn with', () => {
  it('keeps a stroked box the size the model says it is', () => {
    const css = deckPaintCss({ stroke: '#000', strokeWidth: 30 });
    expect(css.border).toBe('2px solid #000');
    expect(css.boxSizing).toBe('border-box');
  });

  it('draws the dash the document names, and a solid line for one it does not', () => {
    expect(deckPaintCss({ stroke: '#000', strokeDash: 'dash' }).border).toContain('dashed');
    expect(deckPaintCss({ stroke: '#000', strokeDash: 'honeycomb' }).border).toContain('solid');
  });

  it('paints a list and a legacy fill through the same one answer', () => {
    /**
     * One opaque solid is still the box's own background, and it goes through the
     * layer's colour track — the shape declaring the same colour beside it.
     *
     * Two declarations on the commonest shape on a slide, which is the cost of a
     * fill-colour motion working on it. Both forms answer the same way, which is
     * what this test is about: a legacy `fill` and a one-entry `fills` are one
     * answer.
     */
    const legacy = deckPaintCss({ fill: '#2563eb' });
    expect(legacy.background).toBe('var(--sl-f0-color, transparent)');
    expect(legacy['--sl-f0-color']).toBe('#2563eb');

    const listed = deckPaintCss({ fills: [{ kind: 'solid', color: '#ff0000' }] } as never);
    expect(listed.background).toBe('var(--sl-f0-color, transparent)');
    expect(listed['--sl-f0-color']).toBe('#ff0000');

    /**
     * A stack puts **nothing** on the box but the isolation its layers need — see
     * `fill-layers.ts`, where a `z-index: -1` child of a box that is not a
     * stacking context was measured drawing behind the slide itself.
     */
    const stacked = deckPaintCss({
      fills: [
        { kind: 'solid', color: '#ff0000', opacity: 0.5 },
        { kind: 'solid', color: '#0000ff' }
      ]
    } as never);
    expect(stacked.background).toBeUndefined();
    expect(stacked.isolation).toBe('isolate');
  });
});

/**
 * An image fill and a blend mode, which the list model takes without changing
 * shape — the reason it is a list.
 */
describe('a picture as a fill', () => {
  const photo = { kind: 'image' as const, src: 'https://example.test/a.png' };

  /**
   * A picture fill is an `<img>` in a clipping box now, not a `background-image`
   * — see `fill-layers.ts` for the three things a background could not do. So
   * the fit is `object-fit`, which spells one of the three differently.
   */
  it('draws the picture as an image, fitted the way it says', () => {
    const [layer] = fillLayers([{ ...photo, fit: 'contain' }]);
    expect(layer.image?.src).toBe('https://example.test/a.png');
    expect(layer.image?.style.objectFit).toBe('contain');
    expect(layer.style.overflow).toBe('hidden');
  });

  it('calls a stretch what CSS calls it', () => {
    expect(fillLayers([{ ...photo, fit: 'stretch' }])[0].image?.style.objectFit).toBe('fill');
  });

  /**
   * The one fit an `<img>` cannot express — `object-fit` has no repeat — so a
   * tile stays a background, and its pan lands in `background-position` where it
   * always did.
   */
  it('tiles as a background, because an image element cannot repeat', () => {
    const [layer] = fillLayers([{ ...photo, fit: 'tile' }]);
    expect(layer.image).toBeUndefined();
    expect(layer.style.backgroundRepeat).toBe('repeat');
    expect(layer.style.backgroundSize).toBe('auto');
    // Zero means "as drawn" in both forms, which is what the `50% +` is for.
    expect(layer.style.backgroundPosition).toContain('calc(50% + var(--sl-f0-panx, 0%))');
  });

  /**
   * The opacity a `background` could not have at all: it was drawn as a fully
   * transparent wash over the picture, which is a no-op — measured on a slide,
   * a photograph at 0.4 came out at full strength.
   */
  it('gives a picture a real opacity, which a background could not', () => {
    const [layer] = fillLayers([{ ...photo, opacity: 0.5 }]);
    expect(layer.style.opacity).toBe('calc(0.5 * var(--sl-f0-fade, 1))');
  });

  it('is nothing at all without a picture', () => {
    expect(paintsOf({ fills: [{ kind: 'image' }] } as never)).toEqual([]);
  });

  it('mixes with what is under it, in the names the industry already uses', () => {
    const layers = fillLayers([
      { kind: 'solid', color: '#ff0000', blend: 'multiply' },
      { ...photo }
    ]);
    // Bottom-most first among the elements, which is the reverse of the model's
    // order: a later sibling paints on top, where CSS's first layer does.
    expect(layers.map((layer) => layer.index)).toEqual([1, 0]);
    expect(layers[1].style.mixBlendMode).toBe('multiply');
    expect(layers[0].style.mixBlendMode).toBeUndefined();
  });

  it('ignores a blend mode it does not have', () => {
    const [paint] = paintsOf({
      fills: [{ kind: 'solid', color: '#fff', blend: 'honeycomb' }]
    } as never);
    expect(paint.blend).toBeUndefined();
  });

  /** One flat colour is the box's own background and no elements at all. */
  it('draws no layers for the shape almost every slide has', () => {
    expect(fillLayers([{ kind: 'solid', color: '#fff' }])).toEqual([]);
  });
});

/**
 * The dash, in the spelling SVG uses.
 *
 * `deckPaintCss` answers in `border-style`, which an SVG path has no notion of — so
 * vector ink read `strokeDash` not at all and was the one shape in a deck that could
 * not be dashed. Found by `every-attribute-is-read`, which reported nine of a path's
 * attributes as read by nothing; this is the one of them that is a line rather than a
 * piece of work.
 */
describe('a path dashes', () => {
  it('says nothing when the line is solid', () => {
    expect(svgDash({})).toBeUndefined();
    expect(svgDash({ strokeDash: 'solid' })).toBeUndefined();
    // A name the schema does not declare draws solid, like every other reader here.
    expect(svgDash({ strokeDash: 'wavy' })).toBeUndefined();
  });

  it('scales the pattern with the stroke, so a dash looks like a dash at any weight', () => {
    expect(svgDash({ strokeDash: 'dash', strokeWidth: 1 })).toBe('4 3');
    expect(svgDash({ strokeDash: 'dash', strokeWidth: 3 })).toBe('12 9');
    expect(svgDash({ strokeDash: 'dot', strokeWidth: 2 })).toBe('2 4');
  });

  it('draws dashDot as what it says, which CSS could not', () => {
    // `DASHES` maps it to `dashed` because CSS has no third answer. SVG does.
    expect(svgDash({ strokeDash: 'dashDot', strokeWidth: 1 })).toBe('4 2 1 2');
  });

  it('treats a missing or silly width as one', () => {
    expect(svgDash({ strokeDash: 'dash' })).toBe('4 3');
    expect(svgDash({ strokeDash: 'dash', strokeWidth: 0 })).toBe('4 3');
    expect(svgDash({ strokeDash: 'dash', strokeWidth: Number.NaN })).toBe('4 3');
  });
});

/**
 * A line that flows.
 *
 * An arrowhead says where a relationship points, standing still. A flow says it moving,
 * which is what a presenter wants when six lines are on a slide and they are talking
 * about one path.
 */
describe('a flowing line', () => {
  it('is dashed even when the document says solid, because a flow needs something to travel', () => {
    const flow = svgFlow({ strokeWidth: 15 })!;
    expect(flow.dash).toBe(svgDash({ strokeDash: 'dash', strokeWidth: 15 }));
    expect(svgFlow({ strokeDash: 'solid', strokeWidth: 15 })!.dash).toBe(flow.dash);
  });

  it('keeps a pattern the document chose', () => {
    expect(svgFlow({ strokeDash: 'dot', strokeWidth: 15 })!.dash).toBe(
      svgDash({ strokeDash: 'dot', strokeWidth: 15 })
    );
  });

  it('reports one period, so the loop has no seam', () => {
    /*
     * The sum of the pattern. Shifting the dash offset by exactly that lands on the
     * same picture; a fixed distance judders on every line whose weight is not the one
     * it was chosen for — and the pattern scales with the weight.
     */
    const thin = svgFlow({ strokeDash: 'dash', strokeWidth: 15 })!;
    const thick = svgFlow({ strokeDash: 'dash', strokeWidth: 60 })!;
    expect(thin.period).toBe(15 * 4 + 15 * 3);
    expect(thick.period).toBeGreaterThan(thin.period);
  });

  it('has nothing to flow for a pattern it does not know', () => {
    expect(svgFlow({ strokeDash: 'wavy', strokeWidth: 15 })).toBeUndefined();
  });
});
