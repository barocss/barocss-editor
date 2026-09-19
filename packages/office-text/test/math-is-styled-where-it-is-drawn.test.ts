import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGlobalRegistry } from '@barocss/dsl';
import { registerMathRenderers, MATH_SLOT_CLASS } from '../src/math-renderers';

/**
 * **The rules that finish an equation ship with the renderer that draws it.**
 *
 * ## What this was written for
 *
 * `math-renderers.ts` has been in this package since it was written, and every product registers
 * it: `registerTextRenderers()` calls `registerMathRenderers()` unconditionally. The **rules** for
 * the thirty-one classes it draws were in `apps/word/src/style.css`.
 *
 * So `@barocss/office-text` could be mounted anywhere, would happily draw an equation, and the
 * equation would be a run of plain spans: a fraction is a numerator and a denominator side by side
 * with no rule between them, a radical is its contents with no hook and no bar, a matrix is a line
 * of text, a growing bracket is a zero-width box with a border nobody asked for. The renderer's
 * whole method is *boxes stacked and shifted* — the shifting is the stylesheet's half, and the
 * package shipped one half of a pair.
 *
 * Every existing check was green and stayed green:
 *
 * | | |
 * |---|---|
 * | `tsc` | green — a class name is a string |
 * | `math-drawn.test.ts` | green — it asks what the renderer *says*, on purpose |
 * | `dead-selectors` | green — it asks the **other** direction, a rule with nobody to match |
 * | `apps/word`'s browser round | green — that app had the stylesheet |
 *
 * `page-css-covers-what-a-page-draws.test.ts` is the one check in this repository that asks this
 * direction — *something drawn with nobody to style it* — and it asks it for the site only. This is
 * that question asked where the drawing lives.
 *
 * ## What counts as answered
 *
 * A class is answered if `src/text.css` names it, **or** if the renderer writes the element's
 * `style` itself. The second is not an allowance: a phantom's visibility and a display equation's
 * alignment come from the document, so they are inline by necessity and a stylesheet rule would be
 * a second opinion that an inline style beats anyway. It is read from the template rather than
 * listed here, so a class that stops writing its own style stops being answered the same minute.
 */
describe('an equation is styled where it is drawn', () => {
  const textCss = readFileSync(join(__dirname, '..', 'src', 'text.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );

  beforeAll(() => registerMathRenderers());

  /**
   * What each maths renderer puts on its element: the classes it wears, and whether it writes a
   * `style` of its own.
   *
   * Read from the registry rather than from the source, for the reason the site's version gives:
   * a grep over the file is the hand-kept list with a regex in front of it. A `className` may be a
   * literal or a function of the node — `w-math-fence w-math-fence-${side}` is the latter — so a
   * function is called with the empty node the drawing probes use.
   *
   * **Per element and not per class**, which the first version of this got wrong and reported
   * `.w-math-lim` for. `slotTemplate` writes two classes — `w-math-slot` and the slot's own name —
   * and the rules are on the first, so six of the named slot classes carry no rule and every one of
   * those elements is drawn correctly. Asking *is this class styled* answers about a string; asking
   * *is this element styled* answers about the screen, and the screen is the question.
   */
  const drawn = (): Map<string, { classes: string[]; inline: boolean }> => {
    const found = new Map<string, { classes: string[]; inline: boolean }>();

    for (const definition of getGlobalRegistry().getAll()) {
      const type = definition.nodeType;
      const template = definition.template as unknown as {
        attributes?: Record<string, unknown>;
        props?: Record<string, unknown>;
        component?: (...args: unknown[]) => unknown;
      };
      if (!template) continue;

      const probe = { sid: `math:${type}`, stype: type, attributes: {}, content: [] };
      const built =
        typeof template.component === 'function'
          ? (template.component(probe, probe, { env: {} }) as typeof template)
          : template;

      const bag = (built.attributes ?? built.props ?? {}) as Record<string, unknown>;
      const raw = bag.className;
      const value =
        typeof raw === 'function' ? (raw as (d: unknown) => unknown)(probe) : raw;
      if (typeof value !== 'string') continue;

      const classes = value.split(/\s+/).filter((one) => one.startsWith('w-math'));
      if (classes.length === 0) continue;

      const style = bag.style;
      const inline =
        typeof style === 'function'
          ? Object.keys((style as (d: unknown) => object)(probe) ?? {}).length > 0
          : !!style && Object.keys(style as object).length > 0;

      found.set(type, { classes, inline });
    }

    return found;
  };

  /** Whether `text.css` selects on the class at all — in any selector, conditional or not. */
  const styled = (cls: string) =>
    new RegExp(`(^|[^-\\w])\\.${cls}(?![-\\w])`).test(textCss);

  it('draws the classes the backlog counted, and the stylesheet carries them', () => {
    const elements = drawn();
    const classes = new Set([...elements.values()].flatMap((one) => one.classes));

    // Both sides looked at — an empty answer on either would pass for the wrong reason.
    expect(elements.size, 'the registry answered').toBeGreaterThan(25);
    expect(classes.size, 'and it answered with classes').toBeGreaterThan(25);
    expect(
      [...classes].filter(styled).length,
      '`text.css` carries the equation rules'
    ).toBeGreaterThan(25);

    /*
     * `w-math-slot` is the class the rules for an empty slot are on, and `slotTemplate` puts it on
     * every slot — so it is worn by six renderers and named by none of them. It is the class the
     * per-element reading above exists for, so it is asserted by name.
     */
    expect([...classes].sort()).toContain(MATH_SLOT_CLASS);
    expect(styled(MATH_SLOT_CLASS), 'the slot rules moved with the rest').toBe(true);
  });

  /**
   * **And no app's stylesheet answers for the package**, which is the shape the fault took.
   *
   * `apps/word/src/style.css` had all thirty-one and every check was green, because that app is the
   * only host that had ever drawn an equation. A rule that comes back here is a rule the next host
   * does not get.
   */
  it('is not styled by the app that used to hold the rules', () => {
    const app = readFileSync(
      join(__dirname, '..', '..', '..', 'apps', 'word', 'src', 'style.css'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    const classes = new Set([...drawn().values()].flatMap((one) => one.classes));
    const back = [...classes].filter((cls) =>
      new RegExp(`(^|[^-\\w])\\.${cls}(?![-\\w])`).test(app)
    );

    expect(
      back,
      'these went back into the app, and only that app draws them correctly again'
    ).toEqual([]);
  });

  /**
   * **Every class is answered.**
   *
   * This was `it.fails` for one round — this repository's form for a fault it has found and not yet
   * fixed, so that the day somebody makes it hold the line goes red and has to be changed. An
   * exemption list would have gone quiet instead, and a tolerance explained in a comment is the bug
   * written down.
   *
   * The one it held open was `.w-math-presubsup` — Word's `m:sPreSubSup`, a subscript and a
   * superscript **before** the base (`{}_a^b X`, which is how an isotope and a tensor are written).
   * `math-renderers.ts:167` drew it as a bare `<span>` with no style of its own, and the rules that
   * shrink and shift a script are written for the other two carriers:
   *
   *     .w-math-sup-box > .w-math-sup, .w-math-subsup > .w-math-sup { font-size: .72em; … }
   *     .w-math-sub-box > .w-math-sub, .w-math-subsup > .w-math-sub { font-size: .72em; … }
   *
   * Neither compound matched inside `.w-math-presubsup`, so a pre-script drew at full size on the
   * baseline in front of the base. It is drawn now, and the check below says *how* — because this
   * one only asks whether the class is named, and a class named by an empty rule would satisfy it.
   */
  it('rules on every element the renderers draw and do not style themselves', () => {
    const unanswered = [...drawn()]
      .filter(([, { classes, inline }]) => !inline && !classes.some(styled))
      .map(([type, { classes }]) => `${type} — .${classes.join(' .')}`)
      .sort();

    expect(unanswered).toEqual([]);
  });

  /**
   * **And the pre-scripts are stacked, in Word's order and not the document's.**
   *
   * The check above is satisfied by the class appearing in *any* selector — which is the right
   * question for thirty-one classes at once, and much too weak for the one that was wrong. So this
   * one reads the declarations.
   *
   * What makes a pre-sub-superscript that drawing and not another: the two scripts share a column
   * so they are above one another rather than beside; the **superscript is the upper row** although
   * the schema stores it second (`mathSub mathSup mathElement`), so the drawing order is the
   * reverse of the document order and a rule has to say so; and the base is the other column,
   * spanning both. Take any one of the three away and it is still styled, and still not a
   * pre-script.
   *
   * The size is read from `.w-math-subsup > .w-math-sup` rather than written here, because a script
   * in front of a base and a script behind one are the same script — if somebody retunes one of the
   * three carriers this goes red rather than letting them drift.
   */
  it('stacks the pre-scripts, superscript above, base beside', () => {
    const decls = (selector: string): Map<string, string> => {
      const found = new Map<string, string>();
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(textCss))) {
        const listed = m[1].split(',').map((one) => one.trim().replace(/\s+/g, ' '));
        if (!listed.includes(selector)) continue;
        for (const decl of m[2].split(';')) {
          const colon = decl.indexOf(':');
          if (colon < 0) continue;
          found.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
        }
      }
      return found;
    };

    const box = decls('.w-math-presubsup');
    const sup = decls('.w-math-presubsup > .w-math-sup');
    const sub = decls('.w-math-presubsup > .w-math-sub');
    const base = decls('.w-math-presubsup > .w-math-e');

    // A stack needs a formatter that can make one: two inline boxes in a row are two columns.
    expect(box.get('display'), 'the construct lays its children out in two dimensions').toBe(
      'inline-grid'
    );

    // One column for the pair, and the superscript in the row above the subscript.
    expect(sup.get('grid-column'), 'superscript column').toBe('1');
    expect(sub.get('grid-column'), 'subscript column').toBe('1');
    expect(
      Number(sup.get('grid-row')),
      'the superscript is drawn above the subscript, though it is stored after it'
    ).toBeLessThan(Number(sub.get('grid-row')));

    // And the base is the other column, tall enough to stand beside both.
    expect(base.get('grid-column'), 'the base is beside the pair, not under it').toBe('2');
    expect(base.get('grid-row'), 'and as tall as the two rows').toBe('1 / span 2');

    // The same script size the other two carriers use — read, not restated.
    const carried = decls('.w-math-subsup > .w-math-sup').get('font-size');
    expect(carried, 'the carrier this is copying is still there').toBeTruthy();
    expect(sup.get('font-size'), 'a pre-script is a script').toBe(carried);
    expect(sub.get('font-size'), 'a pre-script is a script').toBe(carried);
  });
});
