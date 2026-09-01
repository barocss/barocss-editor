import { describe, it, expect } from 'vitest';
import { resolveVarValue } from '@barocss/office-canvas';
import {
  backgroundCss,
  cornersCss,
  effectsCss,
  gradientCss,
  paintCss,
  shadowCss,
  typeRhythmCss
} from '../src/paint';
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

/**
 * **The vocabulary a page was missing to look designed rather than assembled.**
 *
 * Nine attributes, added together because a redesign asked for them together and each one is a
 * sentence a layout could not say: the rhythm the words are set at, one card at an angle, a second
 * ink multiplying, a sheet over a photograph, a card across two columns of a grid.
 *
 * Each is checked for the same two things: it draws when stated, and **nothing at all** when not —
 * which is not a nicety. `opacity`, `rotate` and `backdropBlur` each make a stacking context, so a
 * page that wrote a resting value everywhere would be a page whose sticky headers quietly stopped
 * escaping their sections.
 */
describe('the effects a page can now ask for', () => {
  const none = (css: Record<string, string>) => expect(Object.keys(css)).toEqual([]);

  describe('the rhythm the words in a box are set at', () => {
    it('is a ratio to the font, so it survives the type scale', () => {
      // -2.5% is -0.025em, and 140% is 1.4 — the two numbers every type tool states.
      expect(typeRhythmCss({ letterSpacing: -2.5 })).toEqual({ letterSpacing: '-0.025em' });
      expect(typeRhythmCss({ lineHeight: 140 })).toEqual({ lineHeight: '1.4' });
    });

    it('says nothing about a box that says nothing, and nothing about a zero', () => {
      none(typeRhythmCss({}));
      none(typeRhythmCss(undefined));
      // Tracking of exactly none is what a box already does; writing it would beat an outer band's.
      none(typeRhythmCss({ letterSpacing: 0 }));
      none(typeRhythmCss({ lineHeight: 0 }));
    });
  });

  describe('the three effects', () => {
    it('turns a box, in degrees, the way CSS turns one', () => {
      expect(effectsCss({ rotate: -3 })).toEqual({ transform: 'rotate(-3deg)' });
    });

    it('mixes with what is under it, from a list a reader can predict', () => {
      expect(effectsCss({ blend: 'multiply' })).toEqual({ mixBlendMode: 'multiply' });
      // Not one of the four is not a blend mode: a document saying so draws nothing rather than
      // writing a word a browser will ignore and a reader will not find.
      none(effectsCss({ blend: 'color-dodge' }));
    });

    it('frosts in twips, and says so twice because Safari wants the prefix', () => {
      // 240 twips is 16px — and a hero that frosts in one browser and not another is worse than one
      // that frosts in neither.
      expect(effectsCss({ backdropBlur: 240 })).toEqual({
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      });
    });

    it('writes none of them at a resting value, because each makes a stacking context', () => {
      none(effectsCss({}));
      none(effectsCss({ rotate: 0, blend: '', backdropBlur: 0 }));
    });
  });

  describe('a sheet over the picture', () => {
    const flat = (value: unknown) => (typeof value === 'string' ? value : undefined);

    it('goes over everything, which is the layer that did not exist', () => {
      const css = backgroundCss(
        { backgroundImage: '/hero.jpg', overlay: '#14110F', overlayOpacity: 0.55 },
        flat
      );
      // First in `background-image` is painted **in front** — the whole point of the attribute.
      expect(css.backgroundImage.startsWith('linear-gradient(color-mix(')).toBe(true);
      expect(css.backgroundImage).toContain('55%');
      expect(css.backgroundImage).toContain('url("/hero.jpg")');
    });

    it('is the colour itself when nothing is taken off it', () => {
      const css = backgroundCss({ backgroundImage: '/hero.jpg', overlay: '#14110F' }, flat);
      expect(css.backgroundImage.startsWith('linear-gradient(#14110F 0 0)')).toBe(true);
    });

    it('is nothing without a colour, because a sheet of no colour is not one', () => {
      const css = backgroundCss({ backgroundImage: '/hero.jpg', overlayOpacity: 0.5 }, flat);
      expect(css.backgroundImage).toBe('url("/hero.jpg")');
    });
  });
});

/**
 * **A colour a document holds at a weight**, which is the sentence a token could not say.
 *
 * A palette holds one value per name, and a design wants that value at a fraction constantly — a
 * frosted bar over a hero, a scrim, a hairline. Written as a literal `rgba(...)` beside the token it
 * is a fraction of, it stops following the palette: change the token and the literal keeps the old
 * colour, on every page, silently. This sample's own header bar was exactly that until the reference
 * learned to carry a weight.
 *
 * What is checked here is the only thing that matters about it: **it follows.**
 */
describe('a token at a weight', () => {
  const doc = () => {
    const nodes: Record<string, any> = {
      root: { sid: 'root', stype: 'document', content: ['vars', 'box'] },
      vars: { sid: 'vars', stype: 'variables', parentId: 'root', content: ['v'] },
      v: {
        sid: 'v',
        stype: 'variable',
        parentId: 'vars',
        attributes: { name: '종이', kind: 'color', value: '#FCFBF9' }
      },
      box: { sid: 'box', stype: 'frame', parentId: 'root', attributes: {}, content: [] }
    };
    return {
      rootId: 'root',
      getNode: (sid: string) => nodes[sid],
      /** So a test can repaint the palette the way a reader does — one value, one place. */
      repaint: (value: string) => {
        nodes.v.attributes.value = value;
      }
    };
  };

  const painted = (access: ReturnType<typeof doc>, said: string): string | undefined =>
    backgroundCss({ fill: said }, (value) => resolveVarValue(access as never, value, 'box')).backgroundColor;

  it('draws the colour with an alpha, wherever a colour may go', () => {
    expect(painted(doc(), 'var:종이/82')).toBe('color-mix(in srgb, #FCFBF9 82%, transparent)');
  });

  it('follows the palette, which a literal does not', () => {
    const access = doc();
    const before = painted(access, 'var:종이/82');
    access.repaint('#101014');
    const after = painted(access, 'var:종이/82');

    expect(before).not.toBe(after);
    expect(after).toBe('color-mix(in srgb, #101014 82%, transparent)');
    /*
     * And the literal it replaced, for contrast. This is the fault in one line: a colour written as
     * a weight of a token, by hand, is a colour that outlives the decision it was a weight of.
     */
    expect(painted(access, 'rgba(252, 251, 249, 0.82)')).toBe('rgba(252, 251, 249, 0.82)');
  });

  it('is the colour itself at no weight, so a page that says nothing is unchanged', () => {
    expect(painted(doc(), 'var:종이')).toBe('#FCFBF9');
  });
});
