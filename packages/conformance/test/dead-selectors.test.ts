import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deadSelectors } from '../src/seam';

/**
 * **Every `data-*` a stylesheet in this repository selects on is written by something.**
 *
 * ## Three faults of this shape, each of which stood for months
 *
 * - The deck's renderer wrote `data-list-type` from an attribute it called `listType`, which the
 *   schema calls `type`. A reader pressing the numbered-list button got `type: 'ordered'` from the
 *   operation and a list drawn `data-list-type="bullet"` — **a numbered list with bullets.**
 * - The site's `insertBulletList` wrote `kind: 'bullet'`, an attribute nothing reads.
 * - `style.css` had `.w-math-frac[data-type='lin']` rules since it was written and **no renderer
 *   ever emitted `data-type`.** A linear fraction has never been drawn as one in this product.
 *
 * Nothing was wrong in any one file, which is the shape this whole harness is for. What is different
 * about this one is that it is mechanical: a name is spelled at both ends or it is not.
 *
 * ## One product at a time, with the shared layers in
 *
 * The first version scanned the **whole repository** on both sides and did not catch the fraction:
 * `data-type` is written by the site's list renderer, so Word's dead rule looked answered by a
 * product Word shares no stylesheet with. Measured by taking the fix back out and watching the check
 * pass.
 *
 * A stylesheet belongs to a product, so the question does too: *does anything **this product draws
 * with** write this name?* The shared packages are in every product's scan — a `data-*` is written by
 * a renderer three packages down and selected by a stylesheet in an app — and the other two products
 * are out, which is the whole of the fix.
 *
 * ## Which direction, and why only one
 *
 * A rule selecting on a name nothing writes can never match, and there is no innocent reading of it.
 * The other direction is noise: half of this repository's `data-*` are for a test to find an element
 * by or for an event handler to read, and a check reporting thirty of those beside one fault is a
 * check nobody would read. See `seam.ts`.
 */
const repo = join(__dirname, '..', '..', '..');

/*
 * `build` and `dist` are outputs. A docusaurus bundle in `apps/docs-site/build` carries the whole of
 * its own theme's CSS, and the two names it selects on that this repository does not write are its
 * own — reporting them would be this check describing somebody else's product.
 */
const SKIP = ['node_modules', 'dist', 'build', '.git', 'test-results', 'playwright-report'];

const read = (dirs: string[], keep: (name: string) => boolean) => {
  const files: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.includes(entry)) continue;
      const path = join(dir, entry);
      // `test` and `tests` hold fixtures, which are not what a product draws with.
      if (statSync(path).isDirectory()) {
        if (entry !== 'test' && entry !== 'tests') walk(path);
        continue;
      }
      else if (keep(entry)) {
        files.push({ path: path.replace(`${repo}/`, ''), text: readFileSync(path, 'utf8') });
      }
    }
  };
  for (const dir of dirs) walk(join(repo, dir));
  return files;
};

/**
 * Everything a product draws with, **read from its dependencies** rather than written down here.
 *
 * A list by hand was the first version and the check found it wrong the same minute: it put
 * `office-word` in Word's tree only, and `text.css` — the *shared* stylesheet — selects on
 * `data-cell-selected`, which `office-word`'s `table-selection-view.ts` writes. So the rule looked
 * dead to the deck and to a page.
 *
 * It is not dead: `apps/slide` depends on `@barocss/office-word` and calls `installCellSelection`
 * out of it, which is a thing only the dependency graph knows. A hand-kept list of what a product
 * draws with is the hand-kept list this whole harness replaced.
 */
const treeOf = (app: 'word' | 'slide' | 'site'): string[] => {
  const seen = new Set<string>();

  const follow = (dir: string) => {
    if (seen.has(dir)) return;
    seen.add(dir);

    let manifest: { dependencies?: Record<string, string> };
    try {
      manifest = JSON.parse(readFileSync(join(repo, dir, 'package.json'), 'utf8'));
    } catch {
      return;
    }

    for (const name of Object.keys(manifest.dependencies ?? {})) {
      // `workspace:*` is how this repository names its own packages; anything else is npm's.
      if (!name.startsWith('@barocss/')) continue;
      follow(`packages/${name.slice('@barocss/'.length)}`);
    }
  };

  follow(`apps/${app}`);
  return [...seen];
};

describe('a stylesheet rule that can never match', () => {
  for (const product of ['word', 'slide', 'site'] as const) {
    it(`is in none of the stylesheets ${product} draws with`, () => {
      const tree = treeOf(product);
      const styles = read(tree, (name) => name.endsWith('.css'));
      /*
       * The **product's** source, not its tests. A converter's fixture carries whole pages of HTML
       * with `data-type` in them, and counting a test's own string as a thing the product draws is
       * how a dead rule stays answered by a file no reader ever loads. Measured: the fix for the
       * fraction was taken back out, and two converter tests kept the check quiet.
       */
      const sources = read(tree, (name) => /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name));

      // And it looked at all of them — an empty result would pass for the wrong reason otherwise.
      expect(styles.length).toBeGreaterThan(1);
      expect(sources.length).toBeGreaterThan(100);

      /**
       * The two `tokens.css` offers and no product has taken up yet.
       *
       * `office-ui` is a **library**: it defines what a dark theme and a dense one look like, and
       * whether a product stamps `data-theme` or `data-density` on its shell is the product's to
       * decide. Its own comment says so — *"no product could offer a theme switch, and the library
       * had no idea"* — written when the `[data-theme='dark']` block was added because the media
       * query alone meant a switch could not win.
       *
       * So these are a rule with nobody to match **yet**, which is a different thing from a rule
       * with a misspelt name: the day a product grows a theme switch they answer, and the day the
       * library stops offering them they come off. Named rather than counted for exactly that.
       */
      const offered: Record<typeof product, string[]> = {
        word: ['data-theme', 'data-density'],
        // The deck's step inspector is drawn `data-density="dense"`, which is the offer taken up.
        slide: ['data-theme'],
        site: ['data-theme', 'data-density']
      };
      const open = new Set(offered[product]);

      const found = deadSelectors(styles, sources);
      expect(found.filter((one) => !open.has(one.name)).map((one) => `${one.name} in ${one.sheet}`)).toEqual([]);

      // And the offer is still open — a claim that goes stale the day this product takes it up.
      const taken = [...open].filter((name) => !found.some((one) => one.name === name));
      expect(taken, 'this product answers these now; take them off its list').toEqual([]);
    });
  }
});
