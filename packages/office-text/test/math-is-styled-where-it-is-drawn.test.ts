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
   * **Every class is answered — and one is not.**
   *
   * `it.fails` rather than an exemption by name, which is this repository's form for a fault it has
   * found and not yet fixed: the assertion below is the one that should hold, it does not, and the
   * day somebody makes it hold **this line goes red** and is changed to `it`. An exemption list
   * would go quiet instead, and a tolerance explained in a comment is the bug written down.
   *
   * ## What is open
   *
   * `.w-math-presubsup` — Word's `m:sPreSubSup`, a subscript and a superscript **before** the base
   * (`{}_a^b X`, which is how an isotope and a tensor are written). `math-renderers.ts:167` draws it
   * as a bare `<span>` with no style of its own, and the rules that shrink and shift a script are
   * written for the other two carriers:
   *
   *     .w-math-sup-box > .w-math-sup, .w-math-subsup > .w-math-sup { font-size: .72em; … }
   *     .w-math-sub-box > .w-math-sub, .w-math-subsup > .w-math-sub { font-size: .72em; … }
   *
   * Neither compound matches inside `.w-math-presubsup`. So a pre-script draws at **full size on
   * the baseline, in front of the base** — not smaller, not raised, not lowered, and not stacked.
   * A pre-sub-superscript has never been drawn as one in this product, which is the same sentence
   * `text.css` already carries about the linear fraction and `data-type`.
   *
   * Not fixed in the round that found it because it is not a move: it is two new declarations plus
   * the stacking Word does, and it wants a browser to be sure of. `/tmp/css-backlog.md`.
   */
  it.fails('rules on every element the renderers draw and do not style themselves', () => {
    const unanswered = [...drawn()]
      .filter(([, { classes, inline }]) => !inline && !classes.some(styled))
      .map(([type, { classes }]) => `${type} — .${classes.join(' .')}`)
      .sort();

    expect(unanswered).toEqual([]);
  });
});
