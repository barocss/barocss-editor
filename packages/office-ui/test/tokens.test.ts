import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The design system, checked the way every other invariant in this repository is checked: by
 * measuring the source rather than by looking at it.
 *
 * ## Why a test and not a review
 *
 * Every fault this file guards against was found by *drawing every control on one page* — a gallery,
 * built because nobody could see the library whole. What it found, in a library nobody thought was
 * broken:
 *
 * | measured | before | after |
 * |---|---|---|
 * | `transition` | 0 | 7 |
 * | `focus-visible` | 3 | 8 |
 * | `dark:` variants a product's own theme switch could not reach | 15 | 0 |
 * | components naming Tailwind's palette instead of a token | 4 | 0 |
 * | hardcoded z-indexes | 6 | 0 |
 * | tooltips legible in the light theme | 0 | all |
 *
 * A gallery finds those once. This keeps them found — and it runs in milliseconds, which is the
 * whole reason it is here rather than in the browser suite.
 */

const SRC = join(__dirname, '..', 'src');
const css = readFileSync(join(SRC, 'tokens.css'), 'utf8');
const components = readdirSync(SRC)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => ({ name, text: readFileSync(join(SRC, name), 'utf8') }));

/** The properties one `{ … }` block declares, in source order. */
function declared(block: string): string[] {
  return [...block.matchAll(/(--ou-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

/** What each property is written as, in one block. */
function values(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--ou-[a-z0-9-]+)\s*:([^;]*);/g)) out.set(name, value);
  return out;
}

/** One block by the selector that opens it, brace-counted so a nested block cannot cut it short. */
function blockAfter(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `${selector} is in tokens.css`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(at, i);
    }
  }
  throw new Error(`${selector} is never closed`);
}

/**
 * Source with its comments removed.
 *
 * Every rule below is about what the library *draws*, and the comments here explain at length what
 * it used to draw — `bg-sky-600`, `text-white`, `dark:`. A check that read those would fail on its
 * own documentation.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the token file', () => {
  const light = declared(blockAfter('\n:root {'));

  it('gives every token a light value', () => {
    // The base block is the palette. A token defined only in the dark is a token that is missing
    // in the theme every product ships in.
    expect(light.length).toBeGreaterThan(20);
    expect(new Set(light).size, 'no token is declared twice').toBe(light.length);
  });

  it('says the same thing in both of its dark blocks', () => {
    /*
     * There are two, and there has to be: a media query cannot be combined into a selector list, so
     * "the system is dark" and "this subtree was told to be dark" are written twice. Which means the
     * second is exactly one edit away from being wrong forever, and nothing would show it — a
     * product following the system would keep working while a product with a switch quietly kept one
     * light value. Both `--ou-accent-soft` and `--ou-shadow` were added to one block first.
     */
    const bySystem = declared(blockAfter("@media (prefers-color-scheme: dark)"));
    const byChoice = declared(blockAfter("\n[data-theme='dark'] {"));
    expect(byChoice).toEqual(bySystem);
  });

  it('repeats a derived token wherever what it derives from is redeclared', () => {
    /*
     * The fault this repository has now been bitten by three times, and the third was *introduced by
     * the fix for the second*: **a `var()` is substituted where it is declared**, so a token written
     * in terms of another is a snapshot of that other's value at the root, and every element below
     * inherits the snapshot. Measured with `data-theme="dark"` on a shell:
     *
     * ```
     *  --ou-shadow   rgb(0 0 0 / 0.5)              ← flipped
     *  --ou-lift-2   0 4px 12px rgb(15 23 42/.12)  ← did not
     * ```
     *
     * Every menu, select and dialog in that subtree drew a shadow tuned for a white page. The rule
     * is mechanical enough to check: if a block redeclares X, it must also redeclare everything
     * written in terms of X. What deriving buys is that the *recipe* stays in one place — the
     * repetition is a line, not a colour somebody has to pick twice.
     */
    const base = values(blockAfter('\n:root {'));
    const derived = new Map<string, string[]>();
    for (const [name, value] of base) {
      for (const [, from] of value.matchAll(/var\((--ou-[a-z0-9-]+)\)/g)) {
        derived.set(from, [...(derived.get(from) ?? []), name]);
      }
    }
    expect(derived.size, 'some token is written in terms of another').toBeGreaterThan(0);

    const missing: string[] = [];
    for (const selector of ["@media (prefers-color-scheme: dark)", "\n[data-theme='dark'] {", "[data-density='dense']"]) {
      const here = new Set(declared(blockAfter(selector)));
      for (const [from, dependents] of derived) {
        if (!here.has(from)) continue;
        for (const one of dependents) {
          if (!here.has(one)) missing.push(`${selector.trim()} redeclares ${from} but not ${one}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('overrides nothing in the dark that it did not define in the light', () => {
    const dark = declared(blockAfter("\n[data-theme='dark'] {"));
    expect(dark.filter((token) => !light.includes(token))).toEqual([]);
  });

  it('changes only sizes for a dense surface, never the palette', () => {
    // A dense control that was also a different grey is the thing the token file exists to stop.
    const dense = declared(blockAfter("[data-density='dense']"));
    const colour = /panel|ground|line|ink|muted|faint|accent|shadow|scrim/;
    expect(dense.filter((token) => colour.test(token))).toEqual([]);
  });
});

describe('every component', () => {
  const light = new Set(declared(blockAfter('\n:root {')));

  it('only reads tokens that exist', () => {
    // `var(--ou-lift-2)` with no `--ou-lift-2` behind it is not an error anywhere: the property
    // resolves to nothing and the shadow silently does not draw.
    const unknown: string[] = [];
    for (const { name, text } of components) {
      for (const [, token] of code(text).matchAll(/var\((--ou-[a-z0-9-]+)\)/g)) {
        if (!light.has(token)) unknown.push(`${name}: ${token}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('names no colour of its own', () => {
    /*
     * The contract at the top of `tokens.css`: a product maps its palette onto the tokens once, and
     * every shared control matches everything around it. A component that writes `sky-100` is
     * outside that — measured, four components carried a **second** accent (`sky`) while the token
     * was `blue-600`, so the blue a product remapped was not the blue it saw.
     */
    const palette =
      /\b(?:bg|text|border|outline|fill|ring|from|via|to|shadow|decoration|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/g;
    const named: string[] = [];
    for (const { name, text } of components) {
      for (const [hit] of code(text).matchAll(palette)) named.push(`${name}: ${hit}`);
    }
    expect(named).toEqual([]);
  });

  it('leaves the theme to the tokens', () => {
    /*
     * `dark:` answers `prefers-color-scheme` — the **system** — and the tokens answer both that and
     * `data-theme`. So a `dark:` variant is a rule a product's own theme switch cannot reach, and
     * every one of the fifteen this library had was either dead (`dark:border-[var(--ou-line)]`
     * beside the identical light rule) or wrong in exactly the case a switch exists for.
     */
    const withVariants = components
      .filter(({ text }) => /\bdark:/.test(code(text)))
      .map(({ name }) => name);
    expect(withVariants).toEqual([]);
  });

  it('takes its stacking order from the scale', () => {
    // Six hardcoded values ran 20/30/40/50 and one `z-[60]`, added the day a select opened
    // *underneath* a dialog's overlay and no option in it could be clicked.
    const hardcoded: string[] = [];
    for (const { name, text } of components) {
      for (const [hit] of code(text).matchAll(/\bz-(?:\[)?\d+\]?/g)) hardcoded.push(`${name}: ${hit}`);
    }
    expect(hardcoded).toEqual([]);
  });

  it('answers a pointer and a keyboard', () => {
    /*
     * Measured on the gallery the first time every control was on one page: `transition` appeared
     * **zero** times in the library and a focus ring in three of thirty-six components. Both are
     * invisible one component at a time — a control with no pressed state looks fine until it is
     * beside one that has it.
     *
     * Counted rather than located, because where the ring belongs is a judgement (a menu highlights
     * a row without focusing it) and *whether the library has any* is not.
     */
    const state = components.find(({ name }) => name === 'controls.tsx')!.text;
    const shared = /export const STATE = \[([\s\S]*?)\]\.join/.exec(state)?.[1] ?? '';
    expect(shared, 'controls.tsx exports STATE').not.toBe('');
    for (const rule of ['transition-colors', 'active:', 'focus-visible:ring']) {
      expect(shared, `STATE carries ${rule}`).toContain(rule);
    }

    /*
     * And enough of the library reaches for it. Counted as *components that reference it* rather
     * than as occurrences of the words, because the whole point of a shared constant is that the
     * words appear once — grepping for `active:` in a library that got this right returns 1.
     */
    const reaching = components.filter(({ text }) => /\b(STATE|CONTROL)\b/.test(code(text)));
    expect(reaching.length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * **The type scale is a scale**, and it took two goes to make it one.
 *
 * Reported once as *속성 패널 글자가 너무 작은 거 아니야?* and answered by raising the two tokens — and
 * reported again, on the same surface, because the panel's **headings** were `text-[10px]` and its
 * **tabs** `text-[11px]`, written straight into the components. The one surface being complained
 * about was the one the change could not reach, and the two most structural pieces of text on it —
 * *what this group is* and *which tab you are on* — were the smallest text in the product.
 *
 * A literal size is not a bug on its own; a literal size that is **smaller than the token** is, and
 * that is what this measures. It is the same shape as the palette check above: a component naming a
 * number instead of a token is a component the next change cannot reach.
 */
describe('the type scale', () => {
  const sizeOf = (name: string): number => {
    const said = /--ou-text(?:-small|-label)?:\s*(\d+)px/g;
    const found = new Map<string, number>();
    for (const one of css.slice(0, css.indexOf("[data-density='dense']")).matchAll(said)) {
      found.set(one[0].slice(0, one[0].indexOf(':')), Number(one[1]));
    }
    return found.get(name) ?? 0;
  };

  it('is three sizes, in order, none of them tiny', () => {
    const [body, small, label] = ['--ou-text', '--ou-text-small', '--ou-text-label'].map(sizeOf);
    expect(body).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(label);
    /*
     * **12 is the floor.** Below it a Korean label stops being read and starts being recognised by
     * shape, which is fine for a timeline's tick numbers and is not fine for the word that says what
     * a group of controls is. The dense surface may go smaller — that is the distinction it exists
     * for — and this is the default one.
     */
    expect(label).toBeGreaterThanOrEqual(12);
  });

  it('is what every component reaches for, rather than a number of its own', () => {
    /*
     * A literal *smaller* than the smallest token is a component that cannot be reached by any change
     * to the scale — which is exactly how the panel stayed unreadable through a change that raised
     * it. Tailwind's own words count too: `text-xs` is 12px written in a way no token can move.
     */
    const floor = sizeOf('--ou-text-label');
    const offenders: string[] = [];
    for (const { name, text } of components) {
      for (const one of text.matchAll(/text-\[(\d+)px\]/g)) {
        if (Number(one[1]) < floor) offenders.push(`${name}: ${one[0]}`);
      }
      for (const one of text.matchAll(/\btext-(xs|\[0\.\d+rem\])\b/g)) offenders.push(`${name}: ${one[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps a control tall enough for the words in it', () => {
    /*
     * The pair is a ratio, not two numbers: a 14px label in a 28px control leaves 7px above and below
     * and reads as text falling out of its box. Measured as *at least body size plus 14* — two lines
     * of breathing room — which is what every control library this one is compared against does.
     */
    const height = Number(/--ou-control-h:\s*(\d+)px/.exec(css.slice(0, css.indexOf("[data-density='dense']")))?.[1]);
    expect(height).toBeGreaterThanOrEqual(sizeOf('--ou-text') + 14);
  });

  it('gives the dense surface the same three, smaller', () => {
    /*
     * A surface that dropped one of them would be a surface where a heading is body text, which is
     * the fault this scale exists to stop — one place to say it, every surface saying the same three.
     */
    const dense = css.slice(css.indexOf("[data-density='dense']"));
    for (const one of ['--ou-text', '--ou-text-small', '--ou-text-label']) {
      expect(dense, one).toContain(`${one}:`);
    }
  });
});
