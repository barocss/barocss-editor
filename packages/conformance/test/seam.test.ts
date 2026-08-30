import { describe, it, expect } from 'vitest';
import { dataNamesSelected, dataNamesWritten, deadSelectors } from '../src/seam';

/**
 * **A `data-*` name written on one side of a seam and not the other.**
 *
 * Three faults of this exact shape were found by hand in one session, each of which had stood for
 * months: the deck's renderer wrote `data-list-type` from an attribute called `listType` where the
 * schema said `type`; the site's `insertBulletList` wrote `kind` where the schema said `type`; and
 * `style.css` had `.w-math-frac[data-type='lin']` rules that **no renderer ever emitted**, so a
 * linear fraction has never been drawn as one.
 *
 * The first assertion below is the one that matters: it is the third fault, written out, and if this
 * check cannot see it then it is not a check.
 */
describe('a stylesheet selecting on a name nothing writes', () => {
  const file = (path: string, text: string) => ({ path, text });

  /**
   * The fault this exists for, reduced to two files.
   *
   * A renderer that emits `class` and a stylesheet that selects on `[data-type]`, which is exactly
   * what `math-renderers.ts` and `style.css` were: two rules matching an attribute nothing wrote.
   */
  it('sees the fraction that was never linear', () => {
    const styles = [
      file(
        'style.css',
        `.w-math-frac[data-type='lin'] > .w-math-den { border-top: none; }
         .w-math-frac[data-type='lin'] > .w-math-num::after { content: '/'; }`
      )
    ];
    const sources = [
      file('math-renderers.ts', `element('span', { className: 'w-math-frac' }, [slot('content')])`)
    ];

    expect(deadSelectors(styles, sources)).toEqual([{ name: 'data-type', sheet: 'style.css' }]);
  });

  it('says nothing once the renderer writes it', () => {
    const styles = [file('style.css', `.w-math-frac[data-type='lin'] { }`)];
    const sources = [
      file('math-renderers.ts', `{ 'data-type': (d) => String(d.attributes?.type ?? 'bar') }`)
    ];

    expect(deadSelectors(styles, sources)).toEqual([]);
  });

  /**
   * **`office-ui`'s `data={{ … }}` prop**, which is the second of the two ways this repository
   * writes one — its shell, its controls and its stack all spread
   * `Object.entries(data).map(([key, value]) => ['data-' + key, value])`.
   *
   * Reading only the literals reported nine of the deck's names as dead when eight were written this
   * way. A check that cries about eight true things and one fault is a check nobody reads.
   */
  it('reads the shell’s data prop, keys and spreads alike', () => {
    const styles = [
      file('style.css', `.sl-shell[data-presenting='true'] { } .sl-shell[data-scrolled] { }`)
    ];
    const sources = [
      file(
        'app.tsx',
        `<AppShell
           className="sl-shell"
           data={{
             ...(presenting ? { presenting: 'true' } : {}),
             ...(scrolling ? { scrolled: String(at) } : {})
           }}
         />`
      )
    ];

    expect(deadSelectors(styles, sources)).toEqual([]);
  });

  /*
   * And it does **not** read every object key in the source, which is the net that was tried and
   * abandoned: `type:` appears in a thousand places, so `data-type` would have looked written and
   * the one fault this exists for would have been invisible.
   */
  it('does not count an object key that is not on a data prop', () => {
    const styles = [file('style.css', `.thing[data-type='lin'] { }`)];
    const sources = [file('schema.ts', `attrs: { type: { type: 'string', default: 'bar' } }`)];

    expect(deadSelectors(styles, sources)).toEqual([{ name: 'data-type', sheet: 'style.css' }]);
  });

  /* The other direction is deliberately not asked — see `seam.ts`. */
  it('says nothing about a name that is written and never styled', () => {
    const styles = [file('style.css', `.w-paragraph { margin: 0 }`)];
    const sources = [file('renderers.ts', `{ 'data-bc-sid': sid, 'data-toc-target': target }`)];

    expect(deadSelectors(styles, sources)).toEqual([]);
    expect(dataNamesWritten(sources)).toContain('data-toc-target');
    expect(dataNamesSelected(styles).size).toBe(0);
  });

  it('names the sheet a dead rule is in, once, however many rules there are', () => {
    const styles = [
      file('a.css', `[data-gone] { } [data-gone] > * { }`),
      file('b.css', `[data-gone] { }`)
    ];

    expect(deadSelectors(styles, [])).toEqual([{ name: 'data-gone', sheet: 'a.css' }]);
  });
});
