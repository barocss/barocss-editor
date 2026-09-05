import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSchema, getOfficeSchemaDefinition } from '@barocss/schema';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSiteEditor, createSiteOwnExtensions } from '../src/site-kit';
import { SITE_TOOLBAR, siteSlashItems, siteToolbarCommands, siteToolbarIcons } from '../src/toolbar-model';
import { SITE_KEYS, siteKeyCommands } from '../src/keymap';
import { SITE_PANEL, sitePanelAttrs } from '../src/panel-model';
import { SITE_CONTEXT, SITE_MENUS, siteMenuCommands } from '../src/menu-model';
import { BREAKPOINTS } from '../src/breakpoints';

/**
 * The numbers in `docs/specs/site-builder.md`, checked against the product they describe.
 *
 * ## The one spec that was written **before** the product
 *
 * Which is what makes it the odd one to hold. `word.md` states what is there, `note.md` states what
 * a small product cost, and both were written after. This document opens *"measured before it is
 * built"*, and for a long time the only figures in it were the first slice's: **793 lines**, three
 * renderers, three insert commands. That table is still true and has been read as a statement about
 * the product ever since — a document does not say *when* it was true unless something makes it.
 *
 * So the 재는 절 was added and this file holds it. Everything in it is measured out of the running
 * product; nothing in it is a figure somebody wrote down once.
 *
 * ## What is worth holding
 *
 * **A number belongs in a spec when somebody has to be told it changed.** A vocabulary that grew, a
 * surface that lost a control, the product's own share of what it registers, a shell that moved out
 * of the app, a ratchet at zero. Not: how many files there are, how many bytes `PAGE_CSS` is — a
 * figure that moves for every edit rings for no reason, and a check nobody believes is worse than no
 * check.
 *
 * The two claims that are pinned rather than merely stated are the two that are *arguments*: the
 * fourteen node types this product declares, which is the whole of what a site says that a document
 * does not, and the two probe ratchets, which are the only zeros in the suite.
 */
describe('the numbers in the site builder spec', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const spec = readFileSync(join(ROOT, 'docs', 'specs', 'site-builder.md'), 'utf8');

  /** Whether the document states this number, in any of the shapes it writes numbers in. */
  const states = (value: number) =>
    new RegExp(`\\b${value.toLocaleString('en-US')}\\b|\\b${value}\\b`).test(spec);

  /** Lines of `.ts`/`.tsx` under a directory, counted the way `wc -l` counts. */
  const linesIn = (...parts: string[]): number => {
    let total = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        total += (readFileSync(path, 'utf8').match(/\n/g) ?? []).length;
      }
    };
    walk(join(ROOT, ...parts));
    return total;
  };

  const definition = getSiteSchemaDefinition();
  const schema = createSchema('site', definition);

  it('says how much document there is, and what a site adds to it', () => {
    let attrs = 0;
    for (const [, node] of schema.nodes) attrs += Object.keys((node as { attrs?: object }).attrs ?? {}).length;

    /*
     * Measured as the difference from the office schema, the way the harness measures `own`. Fourteen
     * is the argument of the whole document: everything about **data, publishing and a visitor** is
     * this product's, and everything about text and arrangement is not — so a fifteenth is either a
     * new thing a site has to say or a thing that belonged in the shared vocabulary.
     */
    const office = Object.keys(getOfficeSchemaDefinition().nodes);
    const own = Object.keys(definition.nodes).filter((name) => !office.includes(name));

    expect(states(schema.nodes.size), `node types: ${schema.nodes.size}`).toBe(true);
    expect(states(attrs), `attribute slots: ${attrs}`).toBe(true);
    expect(states(schema.marks.size), `marks: ${schema.marks.size}`).toBe(true);
    expect(own.length, `the site declares: ${own.join(', ')}`).toBe(14);
    expect(states(own.length), `declared by the site: ${own.length}`).toBe(true);
    for (const name of own) {
      expect(spec.includes(`\`${name}\``), `the spec names ${name}`).toBe(true);
    }

    /*
     * Three, and pinned: *what it says differently on a phone* is one of the four things this
     * document calls genuinely new, and a fourth width is a change to what a page **is** rather than
     * a bigger number.
     */
    expect(BREAKPOINTS.length, 'the widths a page answers at').toBe(3);
    expect(states(BREAKPOINTS.length), `breakpoints: ${BREAKPOINTS.length}`).toBe(true);
  });

  it('says how many commands a site has, and how many are its own', () => {
    const bare = new Set(createSiteEditor({ kit: [] }).commandNames() as string[]);
    const all = createSiteEditor().commandNames() as string[];
    const mine = createSiteEditor({ kit: createSiteOwnExtensions() }).commandNames() as string[];
    const own = mine.filter((name) => !bare.has(name));

    expect(states(all.length), `commands: ${all.length}`).toBe(true);
    expect(states(own.length), `the site's own: ${own.length}`).toBe(true);
  });

  it('says what a reader can reach, and from which surface', () => {
    expect(states(SITE_TOOLBAR.length), `toolbar controls: ${SITE_TOOLBAR.length}`).toBe(true);
    expect(states(new Set(siteToolbarCommands()).size), 'toolbar commands').toBe(true);
    expect(states(new Set(siteToolbarIcons()).size), 'toolbar icons').toBe(true);
    expect(states(siteSlashItems().length), `slash rows: ${siteSlashItems().length}`).toBe(true);

    expect(states(SITE_KEYS.length), `keys: ${SITE_KEYS.length}`).toBe(true);
    expect(states(new Set(siteKeyCommands()).size), 'key commands').toBe(true);

    /*
     * The largest surface in the suite, and a **declaration** — which is what let this product answer
     * `every-property-can-be-edited` while Word had no panel and the deck's was still a React tree.
     * The row count and the attribute count are two different facts: a row can offer an attribute
     * another row already offers, and the gap between them is the thing worth seeing move.
     */
    const tabs = new Set(SITE_PANEL.map((row) => row.tab));
    expect(states(SITE_PANEL.length), `panel rows: ${SITE_PANEL.length}`).toBe(true);
    expect(states(tabs.size), `panel tabs: ${tabs.size}`).toBe(true);
    expect(states(sitePanelAttrs().length), `settable attributes: ${sitePanelAttrs().length}`).toBe(true);

    expect(states(SITE_MENUS.length), `menus: ${SITE_MENUS.length}`).toBe(true);
    expect(states(SITE_CONTEXT.length), `context blocks: ${SITE_CONTEXT.length}`).toBe(true);
    expect(states(new Set(siteMenuCommands()).size), 'menu commands').toBe(true);
  });

  it('says the two ratchets it is measured against, and that both are at zero', () => {
    /*
     * Read out of the conformance test rather than restated, for the reason `word.md`'s file gives:
     * two places holding one number is exactly what this file exists to stop. Both are at **0**, from
     * 25 and 38 — the only zeros in the suite — and a zero is the one value that says nothing is
     * being skipped quietly, so it is pinned as well as stated.
     */
    const conformance = readFileSync(join(__dirname, 'conformance.test.ts'), 'utf8');
    const ratchets = [...conformance.matchAll(/toBeLessThanOrEqual\((\d+)\)/g)].map((one) => Number(one[1]));

    expect(ratchets.length, 'the conformance test declares its ratchets').toBe(2);
    expect(ratchets, 'both probes answer for everything they are given').toEqual([0, 0]);
    for (const count of ratchets) expect(states(count), `ratchet: ${count}`).toBe(true);
  });

  it('says how much of the app is left, and how much of the shell this package hands it', () => {
    /*
     * **The app, not the package.** This held `linesIn('packages', 'office-site', 'src')` for one
     * round and failed within the hour, on a comment three files away: 35,553 became 35,570. A
     * number that rings for every commit is red for everybody every day and gets deleted, which
     * lands where having no check lands. The shell's location is what anybody needs told, and these
     * two say it without moving for anything else.
     */
    const app = linesIn('apps', 'site', 'src');
    expect(states(app), `apps/site: ${app}`).toBe(true);

    const ui = readFileSync(join(__dirname, '..', 'src', 'ui.ts'), 'utf8');
    const components = [...ui.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap((one) => one[1].split(','))
      .map((one) => one.trim())
      .filter((one) => one && !one.startsWith('type ') && /^[A-Z]/.test(one));
    expect(states(components.length), `components behind ./ui: ${components.length}`).toBe(true);
    for (const name of components) expect(spec.includes(`\`${name}\``), `the spec names ${name}`).toBe(true);

    let tests = 0;
    const dir = join(ROOT, 'apps', 'site', 'tests');
    for (const entry of readdirSync(dir)) {
      if (!/\.spec\.ts$/.test(entry)) continue;
      tests += (readFileSync(join(dir, entry), 'utf8').match(/^\s*(?:it|test)\(/gm) ?? []).length;
    }
    expect(states(tests), `browser tests: ${tests}`).toBe(true);

    /*
     * And `note.md` quotes this same figure — *"the site's 283 browser tests pass with it"* — as the
     * evidence that a 20px margin this package takes from its host broke nothing measurable. A number
     * two documents rest on is a number that has to be the same in both.
     */
    const note = readFileSync(join(ROOT, 'docs', 'specs', 'note.md'), 'utf8');
    expect(new RegExp(`\\b${tests}\\b`).test(note), `note.md still quotes ${tests}`).toBe(true);
  });

  it('quotes the other two products rather than copying them', () => {
    /*
     * A product may not import a product, so the comparison is held against the specs that own those
     * figures, each of which has a `spec-numbers` test. A number that moves in Word fails in Word's
     * file, is corrected in `word.md`, and then fails here for still being quoted.
     */
    const quoted: [string, number[]][] = [
      ['word.md', [108, 1033]],
      ['slides.md', [64, 515]]
    ];
    for (const [name, numbers] of quoted) {
      const other = readFileSync(join(ROOT, 'docs', 'specs', name), 'utf8');
      for (const value of numbers) {
        const written = new RegExp(`\\b${value.toLocaleString('en-US')}\\b|\\b${value}\\b`);
        expect(states(value), `site-builder.md quotes ${value} from ${name}`).toBe(true);
        expect(written.test(other), `${name} still says ${value}`).toBe(true);
      }
    }
  });
});
