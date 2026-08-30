// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { registerMathRenderers } from '../src/math-renderers';
import { getGlobalRegistry } from '@barocss/dsl';

/**
 * **What a maths construct says about itself**, and it said twenty things nothing listened to.
 *
 * The maths model this schema follows is Word's, and Word's constructs carry their settings as
 * attributes: a matrix says how its columns line up and how far apart they sit, an n-ary operator
 * says whether its limits are shown, a phantom says which of its dimensions it gives up, a run says
 * which *alphabet* its letters are in. Every one of those was declared when the math schema was
 * written and drawn nowhere — the largest single pile on Word's unread list, and the one that had
 * been described in this repository as wanting a decision before it wanted code.
 *
 * It wanted code. Reading the list turned twenty-five attributes into five decisions and twenty
 * lines, which is the same finding this whole sweep keeps producing: the number was hiding the work
 * rather than describing it.
 *
 * Asserted on the template rather than in a browser because these are what the renderer *says*; the
 * stylesheet's half — which face carries a fraktur letter, how a strike is painted — is a decision
 * about the fonts a product ships and belongs with the product.
 */
describe('a maths construct, drawn as it asks', () => {
  beforeAll(() => registerMathRenderers());

  const drawn = (stype: string, attributes: Record<string, unknown>) => {
    const node = { sid: 'm-1', stype, attributes, content: [] };
    const template = getGlobalRegistry().get(stype)?.template as never as {
      component?: (a: unknown, b: unknown, c: unknown) => { attributes?: Record<string, unknown> };
      attributes?: Record<string, unknown>;
    };
    const built = typeof template.component === 'function'
      ? template.component(node, node, {})
      : (template as never as { attributes?: Record<string, unknown> });
    const bag = (built.attributes ?? {}) as Record<string, unknown>;
    return (key: string) => {
      const value = bag[key];
      return typeof value === 'function' ? (value as (d: unknown) => unknown)(node) : value;
    };
  };

  /*
   * A matrix's gaps are twips, like every other measurement here, and become `em`: a matrix inside a
   * fraction inside a superscript is drawn at a fraction of the body size, and a gap in pixels would
   * be the same gap at every one of them.
   */
  it('sets a matrix the way the matrix asks', () => {
    const matrix = drawn('mathMatrix', {
      columnAlignment: 'left',
      columnGap: 480,
      rowGap: 240,
      plcHide: true
    });

    expect(matrix('data-align')).toBe('left');
    expect(matrix('data-placeholders')).toBe('hidden');
    expect(matrix('style')).toMatchObject({ gap: '1em 2em' });
  });

  it('leaves a matrix that asks for nothing to the stylesheet', () => {
    const matrix = drawn('mathMatrix', {});

    expect(matrix('data-align')).toBe('center');
    expect(matrix('data-placeholders')).toBe('shown');
    expect(matrix('style')).toEqual({});
  });

  /*
   * A sum with no lower limit is written `∑`, not `∑` with an empty box under it — and Word says so
   * with `m:subHide` rather than by leaving the slot out, so an author can put the limit back.
   */
  it('hides the limits an n-ary operator asks to hide', () => {
    const hidden = drawn('mathNary', { hideSub: true, grow: false });

    expect(hidden('data-hide-sub')).toBe('true');
    expect(hidden('data-hide-sup')).toBeUndefined();
    expect(hidden('data-grow')).toBe('false');
  });

  /**
   * A phantom takes room and shows nothing; `zeroWid`, `zeroAsc` and `zeroDesc` each take one of
   * those dimensions back. A zero-width phantom reserves height and no width, which is how a term is
   * aligned above another without pushing it sideways.
   */
  it('gives up the dimensions a phantom asks to give up', () => {
    const narrow = drawn('mathPhantom', { zeroWidth: true })('style') as Record<string, string>;

    expect(narrow.width).toBe('0');
    expect(narrow.overflow).toBe('hidden');
    expect(narrow.visibility).toBe('hidden');

    const flat = drawn('mathPhantom', { zeroAscent: true, zeroDescent: true })('style') as Record<string, string>;
    expect(flat.marginTop).toBe('-1em');
    expect(flat.marginBottom).toBe('-0.3em');

    // And one that gives up nothing takes all of its room, which is what a phantom is for.
    const whole = drawn('mathPhantom', {})('style') as Record<string, string>;
    expect(whole.width).toBeUndefined();
    expect(whole.marginTop).toBeUndefined();
  });

  /* A rule *through* a boxed term is how a cancelled factor is written — the half of a border box
   * that is not a border, and the half that was not read. */
  it('strikes a border box the way it asks', () => {
    expect(drawn('mathBorderBox', { strikeHorizontal: true })('data-strike')).toBe('horizontal');
    expect(drawn('mathBorderBox', { strikeVertical: true })('data-strike')).toBe('vertical');
    expect(
      drawn('mathBorderBox', { strikeHorizontal: true, strikeVertical: true })('data-strike')
    ).toBe('both');
    expect(drawn('mathBorderBox', {})('data-strike')).toBeUndefined();
  });

  it('separates the parts of a delimiter, and says how its fences are shaped', () => {
    const set = drawn('mathDelimiter', { separator: '|', shape: 'match' });

    expect(set('data-separator')).toBe('|');
    expect(set('data-shape')).toBe('match');
    // Nothing between the rows of a binomial, which is what an absent separator means.
    expect(drawn('mathDelimiter', {})('data-separator')).toBe('');
  });

  /**
   * **Which alphabet a letter is in.** In maths these are meanings and not fonts: ℝ is the real
   * numbers and R is a variable called R, and a reader must be able to tell them apart.
   */
  it('says which alphabet a run of letters is in', () => {
    expect(drawn('mathRun', { script: 'double-struck' })('data-script')).toBe('double-struck');
    expect(drawn('mathRun', { script: 'fraktur' })('data-script')).toBe('fraktur');
    // An ordinary run says nothing, so the stylesheet has nothing to answer.
    expect(drawn('mathRun', {})('data-script')).toBeUndefined();
    expect(drawn('mathRun', { script: '' })('data-script')).toBeUndefined();
  });

  it('keeps a box on one line when the box asks', () => {
    const box = drawn('mathBox', { noBreak: true, differential: true });

    expect(box('data-no-break')).toBe('true');
    expect(box('data-differential')).toBe('true');
    expect(box('data-operator')).toBeUndefined();
  });

  it('spaces a stack of equations the way the stack asks', () => {
    expect(drawn('mathArray', { maxDistance: true })('data-spacing')).toBe('max');
    expect(drawn('mathArray', { objectDistance: true })('data-spacing')).toBe('object');
    expect(drawn('mathArray', {})('data-spacing')).toBe('default');
  });
});
