import { describe, it, expect } from 'vitest';
import { backgroundCss, cornersCss, gradientCss, paintCss, shadowCss } from '../src/paint';
import { sitePanelRows } from '../src/panel-model';
import { createSchema } from '@barocss/schema';
import { getSiteSchemaDefinition } from '../src/site-schema';

/**
 * What a box on a page is painted with.
 *
 * Measured against what a designer needs before it was written: a stack could say a flat colour, a
 * line and one radius, and that is a diagram's vocabulary — the same gap the deck found in `fill`
 * and answered with a paint stack. A page cannot borrow that answer (the arithmetic is a canvas's,
 * and `office-site` must not import `office-slides`), so it borrows the **names** and does the CSS
 * itself. These hold that the names mean the same thing in both places.
 */
describe('painting a box on a page', () => {
  const colour = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

  describe('a gradient', () => {
    it('is two ends and an angle, measured the way CSS measures one', () => {
      expect(gradientCss({ gradientFrom: '#fff', gradientTo: '#000', gradientAngle: 90 }, colour)).toBe(
        'linear-gradient(90deg, #fff, #000)'
      );
      // The deck measures its angle from up, clockwise, and so does CSS — a reader moving between
      // the two products must not have to find that out.
      expect(gradientCss({ gradientFrom: '#fff', gradientTo: '#000' }, colour)).toContain('180deg');
      expect(gradientCss({ gradientFrom: '#fff', gradientTo: '#000', gradientKind: 'radial' }, colour)).toBe(
        'radial-gradient(circle at center, #fff, #000)'
      );
    });

    it('draws half of one, because a document that says half of it still draws', () => {
      expect(gradientCss({ gradientFrom: '#2563eb' }, colour)).toBe('linear-gradient(180deg, #2563eb, transparent)');
      expect(gradientCss({}, colour)).toBeUndefined();
    });
  });

  describe('a background', () => {
    it('layers the picture over the gradient over the colour', () => {
      const css = backgroundCss(
        { fill: '#0f172a', gradientFrom: '#2563eb', gradientTo: '#7c3aed', backgroundImage: '/hero.jpg' },
        colour
      );
      /*
       * CSS paints `background-image` front-first, so the picture is written first and the flat
       * colour is not in the list at all — it is the `background-color` underneath. A hero is
       * exactly this stack, and each layer is one attribute a reader set.
       */
      expect(css.backgroundImage).toBe('url("/hero.jpg"), linear-gradient(180deg, #2563eb, #7c3aed)');
      expect(css.backgroundColor).toBe('#0f172a');
      expect(css.backgroundSize).toBe('cover, auto');
      expect(css.backgroundRepeat).toBe('no-repeat, no-repeat');
    });

    it('fades the picture and not the words on it', () => {
      const css = backgroundCss({ backgroundImage: '/hero.jpg', backgroundOpacity: 0.4, fill: '#0f172a' }, colour);
      /*
       * A sheet of the section's own colour over the picture, at what is left of the opacity —
       * rather than `opacity`, which would fade the heading sitting on it too. That distinction is
       * the reason `backgroundOpacity` exists as its own attribute at all.
       */
      expect(css.backgroundImage).toBe(
        'linear-gradient(color-mix(in srgb, #0f172a 60%, transparent) 0 0), url("/hero.jpg")'
      );
      expect(css.backgroundColor).toBe('#0f172a');
    });

    it('tiles a texture, and says so in both places CSS needs it', () => {
      const css = backgroundCss({ backgroundImage: '/grain.png', backgroundFit: 'tile' }, colour);
      expect(css.backgroundSize).toBe('auto');
      expect(css.backgroundRepeat).toBe('repeat');
    });

    it('says nothing about a box that says nothing', () => {
      expect(backgroundCss({}, colour)).toEqual({});
      expect(backgroundCss(undefined, colour)).toEqual({});
    });
  });

  describe('a shadow', () => {
    it('is thrown the way the deck throws one, to the same number', () => {
      // 180° — the default — puts it below, which is the ordinary card. 1440 twips is 96px.
      expect(shadowCss({ shadowColor: '#0003', shadowDistance: 1440, shadowBlur: 720, shadowAngle: 180 }, colour)).toBe(
        '0px 96px 48px #0003'
      );
      // 0° throws it up, and 90° to the right — the same reading in both products, on purpose: a
      // `shadowAngle: 45` that meant two directions would be one document drawn two ways.
      expect(shadowCss({ shadowColor: '#0003', shadowDistance: 300, shadowAngle: 0 }, colour)).toBe(
        '0px -20px 0px #0003'
      );
      // And never `-0`, which `cos(90°)` produces and a stylesheet carries — the deck's own trap.
      expect(shadowCss({ shadowColor: '#0003', shadowDistance: 300, shadowAngle: 90 }, colour)).toBe(
        '20px 0px 0px #0003'
      );
    });

    it('is nothing without a colour, because a shadow of no colour is not one', () => {
      expect(shadowCss({ shadowBlur: 720, shadowDistance: 300 }, colour)).toBeUndefined();
    });
  });

  describe('the corners', () => {
    it('takes the one number where a corner says nothing', () => {
      expect(cornersCss({ cornerRadius: 300, cornerTopLeft: 0 })).toEqual({ borderRadius: '0px 20px 20px 20px' });
    });

    it('leaves the single radius alone when no corner differs', () => {
      // `frameCss` has already written `borderRadius` from `cornerRadius`; writing it again from
      // the same number would be two places deciding one thing.
      expect(cornersCss({ cornerRadius: 300 })).toEqual({});
    });
  });

  it('is one style object, and the longer answer wins over the shorter', () => {
    const css = paintCss(
      { fill: '#fff', gradientFrom: '#000', shadowColor: '#0002', shadowBlur: 300, cornerTopLeft: 600 },
      colour
    );
    expect(css.backgroundImage).toContain('linear-gradient');
    expect(css.boxShadow).toBe('0px 0px 20px #0002');
    expect(css.borderRadius).toBe('40px 0px 0px 0px');
  });

  it('offers every one of them to a reader, on a block and on the page', () => {
    /*
     * The check that would otherwise pass on a technicality. `every-property-can-be-edited` counts
     * rows and not *panes*, and a page is never in a selection — so a row about a page's background
     * declared under 모양 is in a pane a reader can never open, and the harness calls it settable.
     *
     * This asks the question the way a reader meets it: open the pane a page has, and see whether
     * the background is in it.
     */
    const schema = createSchema('site', getSiteSchemaDefinition()) as never as {
      getNodeType: (s: string) => { attrs?: Record<string, unknown> } | undefined;
    };
    const declares = (stype: string, attr: string) => schema.getNodeType(stype)?.attrs?.[attr] !== undefined;

    const paint = ['fill', 'gradientFrom', 'backgroundImage', 'shadowColor'];
    const onThePage = sitePanelRows('surface', 'page', declares).flatMap((row) => [
      row.attr,
      ...(row.with ?? []).map((one) => one.attr)
    ]);
    for (const attr of paint) expect(onThePage).toContain(attr);

    const onABlock = sitePanelRows('frame', 'style', declares).flatMap((row) => [
      row.attr,
      ...(row.with ?? []).map((one) => one.attr)
    ]);
    for (const attr of [...paint, 'cornerTopLeft', 'gradientAngle', 'backgroundOpacity', 'shadowAngle']) {
      expect(onABlock).toContain(attr);
    }
  });
});
