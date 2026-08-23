import { describe, it, expect } from 'vitest';
import { svgPaintOf } from '../src/svg-paint';
import { newPaint } from '../src/paints';

/**
 * Vector ink, painted.
 *
 * A path read `d`, `fill`, `stroke` and `strokeWidth` and nothing else, so the deck's
 * gradient and shadow — set from the same panel that sets them on a rectangle — drew
 * nothing at all on it. Found by `every-attribute-is-read`, which reported nine of a
 * path's attributes as changing no drawing.
 *
 * Answered here rather than in a browser because all of it is arithmetic and naming:
 * an axis out of an angle, a deviation out of a blur, an id out of a sid.
 */
describe('a path is painted', () => {
  const of = (attrs: Record<string, unknown>) => svgPaintOf('doc:12', attrs);

  it('is not filled with black when it is not filled', () => {
    // Silence means no fill, the same as everywhere else in this model. A default
    // colour here would make every unpainted path a black blob.
    expect(of({}).fill).toBe('none');
    expect(of({}).defs).toEqual([]);
    expect(of({}).filter).toBeUndefined();
  });

  it('takes a flat fill as the one-item stack it is', () => {
    const paint = of({ fill: '#ff0000' });
    expect(paint.fill).toBe('#ff0000');
    expect(paint.defs).toEqual([]);
  });

  it('runs a gradient down the shape at 180°, the way CSS does', () => {
    const paint = of({ gradientFrom: '#000000', gradientTo: '#ffffff', gradientAngle: 180 });
    expect(paint.fill).toBe('url(#sl-grad-doc-12)');

    const [gradient] = paint.defs;
    expect(gradient.tag).toBe('linearGradient');
    // Down: top-centre to bottom-centre. SVG's y runs the other way from CSS's angle,
    // which is the one thing this conversion is for.
    expect(gradient.attributes).toMatchObject({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
    expect(gradient.children).toHaveLength(2);
    expect(gradient.children![0].attributes).toMatchObject({
      offset: '0%',
      'stop-color': '#000000'
    });
  });

  it('runs it up at 0° and across at 90°', () => {
    const up = of({ gradientFrom: '#000', gradientTo: '#fff', gradientAngle: 0 }).defs[0];
    expect(up.attributes).toMatchObject({ x1: 0.5, y1: 1, x2: 0.5, y2: 0 });

    const across = of({ gradientFrom: '#000', gradientTo: '#fff', gradientAngle: 90 }).defs[0];
    expect(across.attributes).toMatchObject({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
  });

  it('fills the shape with a radial rather than a circle in it', () => {
    const paint = of({
      gradientFrom: '#000',
      gradientTo: '#fff',
      gradientKind: 'radial'
    });
    const [gradient] = paint.defs;
    expect(gradient.tag).toBe('radialGradient');
    // Proportions of the box, so a wide shape gets a wide gradient — which is what
    // `radialCss` does on the CSS side, and what a reader means by "radial".
    expect(gradient.attributes).toMatchObject({ cx: '50%', cy: '50%', r: '50%' });
  });

  it('draws nothing it cannot draw properly', () => {
    // A conic gradient has no SVG equivalent and an image fill needs a `<pattern>`.
    // Falling back to a flat colour would be a lie a reader has to discover.
    const conic = of({ fills: [newPaint('angular')] });
    expect(conic.fill).toBe('none');
    expect(conic.defs).toEqual([]);
  });

  it('shadows with the deviation a browser would use', () => {
    const paint = of({ shadowColor: 'rgba(0,0,0,0.4)', shadowBlur: 120, shadowDistance: 60 });
    expect(paint.filter).toBe('url(#sl-shadow-doc-12)');

    const [filter] = paint.defs;
    expect(filter.tag).toBe('filter');
    // Room for the shadow to fall into: the default region is the shape plus 10%,
    // which cuts a soft shadow off with a hard straight edge.
    expect(filter.attributes).toMatchObject({ x: '-50%', width: '200%' });

    const [drop] = filter.children!;
    // 180° is down, the same convention as the flat shadow's, and half the blur
    // because CSS's radius is the whole gradient and a Gaussian's deviation is half.
    expect(drop.attributes).toMatchObject({ dx: 0, dy: 60, stdDeviation: 60 });
  });

  it('keeps the twips, because a path measures in them', () => {
    // A path's `viewBox` is its own size in twips, so nothing here converts to px —
    // which is the opposite of the CSS side and worth a test of its own.
    const [filter] = of({ shadowColor: '#000', shadowDistance: 300, shadowAngle: 90 }).defs;
    expect(filter.children![0].attributes).toMatchObject({ dx: 300, dy: 0 });
  });

  it('makes an id a stylesheet could also select', () => {
    // A sid is `session:counter`, and a colon is legal in an id but not in a CSS
    // selector — so ink that works would break a `querySelector` written later.
    expect(svgPaintOf('abc:9', { fill: 'x', gradientFrom: '#000', gradientTo: '#fff' }).fill).toBe(
      'url(#sl-grad-abc-9)'
    );
  });

  it('skips a layer a reader has switched off', () => {
    const paint = svgPaintOf('doc:1', {
      fills: [{ ...newPaint('solid'), color: '#ff0000', visible: false }]
    });
    expect(paint.fill).toBe('none');
  });
});
