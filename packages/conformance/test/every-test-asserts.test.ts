import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every test in this repository asserts something.
 *
 * ## Why the harness's own package holds this
 *
 * The eight conformance checks hold the *products* to what they declare. This holds the **suite** to
 * the same standard, and it belongs here for the same reason: a test that asserts nothing is a check
 * that is quietly doing nothing, which is the exact failure `examined: 0` was invented to make
 * visible one layer up.
 *
 * Found by sweeping 6,851 test blocks: **19 asserted nothing at all**. What they were:
 *
 * - a *documentation script* — seven tests, fourteen `console.log`s, feeding a file
 *   (`docs/vnode-structure-examples.md`) that does not exist. Now seven real snapshots, which guard
 *   a VNode shape that every other test here is blind to: they all assert on the DOM, and two
 *   different trees produce the same DOM until the day they do not.
 * - *"should not throw"* said by not throwing. A bare call passes both when the function behaved and
 *   when it did nothing, and a reader of the report cannot tell which.
 * - three tests that **argued themselves out of their own names** in comments — *"may be called …
 *   it's normal if it is not"*, *"may not occur in practice"*, *"need to verify actual behavior"* —
 *   and printed instead of asking.
 * - two `describe.skip`s holding one empty `it`, kept as notes. A note that runs.
 *
 * **Three of the four hedged comments turned out to be wrong about the code.** `updateComponent` is
 * called; the mutation observer never reaches its handler for an unmarked node; a store with no
 * schema still hands back a proxy. A printed number nobody reads cannot correct a belief. An
 * assertion has to.
 *
 * ## What counts
 *
 * The word `expect`, `assert…` or `toThrow` anywhere in the body, or in a helper the body calls that
 * is defined in the same file. Deliberately generous: this is looking for tests that assert
 * **nothing**, and a wrong finding here would send somebody to rewrite a test that is fine. Getting
 * that generosity right took four passes — the first answer was 850, and every wrong one was the
 * tool rather than the suite.
 */
describe('the suite', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'build']);

  /** The braces of one block, counted with strings, template holes and comments skipped. */
  function bodyAt(text: string, from: number): string | null {
    const open = text.indexOf('{', from);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      const c = text[i];
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        i += 1;
        while (i < text.length && text[i] !== quote) {
          if (text[i] === '\\') i += 1;
          else if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
            let inner = 0;
            for (i += 1; i < text.length; i += 1) {
              if (text[i] === '{') inner += 1;
              else if (text[i] === '}' && --inner === 0) break;
            }
          }
          i += 1;
        }
      } else if (c === '/' && text[i + 1] === '/') {
        const nl = text.indexOf('\n', i);
        if (nl === -1) break;
        i = nl;
      } else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return text.slice(open, i);
    }
    return null;
  }

  const ASSERTS = /\b(?:expect|assert\w*|toThrow)\b/;

  function silentIn(path: string): string[] {
    const text = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const found: string[] = [];
    for (const m of text.matchAll(/\b(?:it|test)\s*\(\s*['"`]([^'"`]{0,80})['"`]\s*,/g)) {
      const arrow = text.indexOf('=>', m.index! + m[0].length);
      const fn = text.indexOf('function', m.index! + m[0].length);
      const start = arrow !== -1 && (fn === -1 || arrow < fn) ? arrow : fn;
      if (start === -1) continue;
      const body = bodyAt(text, start);
      if (body === null || ASSERTS.test(body)) continue;

      /*
       * Or a helper in the same file that asserts — `held()`, `expectHTML(…)`. A legitimate shape,
       * and the pass that missed it would have called `office-word`'s whole conformance test silent.
       */
      const viaHelper = [...new Set([...body.matchAll(/\b([a-z]\w*)\s*\(/g)].map((one) => one[1]))].some(
        (name) => {
          const at = text.search(new RegExp(`\\b(?:function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=)`));
          return at !== -1 && ASSERTS.test(text.slice(at, at + 4000));
        }
      );
      if (!viaHelper) found.push(`${path.slice(ROOT.length + 1)}: ${m[1]}`);
    }
    return found;
  }

  it('has no test that asserts nothing', () => {
    const silent: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue;
        const path = join(dir, entry);
        // Not itself: the prose above quotes what it is looking for.
        if (path === __filename) continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(test|spec)\.tsx?$/.test(entry)) silent.push(...silentIn(path));
      }
    };
    walk(join(ROOT, 'packages'));
    walk(join(ROOT, 'apps'));

    expect(silent).toEqual([]);
  });
});
