import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **An alias to a themed token is a snapshot of it**, so this file does not read its own.
 *
 * ## The fault, which this repository has now been bitten by four times
 *
 * A custom property is substituted **where it is declared**. `--st-ink: var(--ou-ink)` on `:root` is
 * therefore not a reference to the ink — it is a photograph of the ink as it stood at the root, and
 * every element below inherits the photograph. Stamp `[data-theme='dark']` on a subtree and the
 * `--ou-*` flip while the `--st-*` do not, so a panel keeps a palette tuned for a page that is no
 * longer white.
 *
 * The four:
 *
 * - `apps/gallery` had three `--ga-*` of its own with a dark set beside them; with `data-theme` on
 *   the document the ink went white on a header that stayed white.
 * - the first repair for it was `--ga-ground: var(--ou-ground)`, which changed **nothing** — the
 *   alias is the fault, not the second palette.
 * - `--ou-lift-2`, written in terms of `--ou-shadow`, was not repeated in either dark block: every
 *   menu, select and dialog in a dark subtree drew a shadow tuned for a white page.
 * - and this file: **six aliases, read by 79 declarations**, which is the largest of the four and
 *   the only one that crossed a package boundary. `office-ui/test/tokens.test.ts` holds the rule
 *   inside `tokens.css` and could not see out of it.
 *
 * ## So there are two questions, and both are mechanical
 *
 * A name declared here as `var(--ou-…)` is an alias. Then: **nothing in this file may read one** —
 * the rules name the suite's token at the point of use — and **every alias that survives for a host
 * to read must be repeated wherever `office-ui` re-declares what it derives from**, which is the
 * rule `tokens.test.ts` states for a derived token, applied across the boundary it stops at.
 *
 * The six that survive are `apps/site/src/style.css`'s: it reads them in 27 declarations and this
 * package cannot edit that file. They are a door, not a palette, and this holds them to that.
 */
describe('office-site/ui.css names the suite’s token, not a copy of it', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  /** The declarations inside the first block matching a selector, as `[name, value]`. */
  const block = (selector: string): [string, string][] => {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, `${selector} is declared`).toBeGreaterThan(-1);
    const body = css.slice(at + selector.length + 3, css.indexOf('\n}', at));
    return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((one) => [one[1], one[2].trim()]);
  };

  /** A name this file declares as another package's token — an alias, and therefore a snapshot. */
  const aliases = block(':root')
    .filter(([, value]) => /^var\(--ou-[\w-]+/.test(value))
    .map(([name]) => name);

  it('declares aliases only for the host to read, and reads none of them', () => {
    // Six today. Named as a count rather than a list so the check is about the shape and not about
    // which colours the product happens to have.
    expect(aliases.length, `aliases: ${aliases.join(', ')}`).toBeGreaterThan(0);

    const read = aliases.filter((name) => new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(css));
    expect(read, 'a rule here reads a snapshot of the palette instead of the palette').toEqual([]);
  });

  it('repeats every surviving alias where office-ui re-declares what it derives from', () => {
    /*
     * No media query: under a dark **system** the `--ou-*` at `:root` are already dark, so the
     * `:root` aliases resolve dark on their own. What a snapshot cannot follow is a subtree being
     * told which theme it is in, and that is these two selectors.
     *
     * **Both, or neither.** This was the dark half alone, on a premise written into the file —
     * `tokens.css` had no light block — and the premise stopped being true without the file
     * noticing. For the half-hour in between, a subtree stamped light inside a dark document got
     * office-ui's light controls on this package's dark studio floor: the six went dark and had no
     * way back. So the two lists are asserted equal to each other as well as to the aliases, which
     * is the shape that cannot half-rot.
     */
    const dark = block("[data-theme='dark']").map(([name]) => name);
    const light = block("[data-theme='light']").map(([name]) => name);
    expect(dark.sort()).toEqual([...aliases].sort());
    expect(light.sort()).toEqual([...aliases].sort());
  });
});
