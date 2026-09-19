import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSchema, getOfficeSchemaDefinition } from '@barocss/schema';
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  SLIDE_WIDTH_4_3,
  getSlidesSchemaDefinition
} from '../src/slides-schema';
import { createSlidesEditor, createSlidesOwnExtensions } from '../src/slides-kit';
import { SLIDES_TOOLBAR, slidesToolbarCommands, slidesToolbarIcons } from '../src/toolbar-model';
import { SLIDES_KEYS, slidesKeyCommands } from '../src/keymap';
import { SLIDES_PANEL, slidesPanelAttrs, slidesPanelCommands } from '../src/panel-model';
import { SLIDES_MENUS, slidesMenuCommands } from '../src/menu-model';
import { SCENE_TYPES } from '../src/selection';
import { MOTION_COMBOS, MOTION_PRESETS } from '../src/motion-presets';
import { MOTION_EFFECTS } from '../src/motion-effects';
import { TRANSITIONS } from '../src/motion';
import { DECK_TEMPLATES } from '../src/templates';
import { DECK_THEMES, THEME_COLOUR_SLOTS, THEME_FONT_SLOTS } from '../src/theme';

/**
 * The numbers in `docs/specs/slides.md`, checked against the product they describe.
 *
 * ## Why this one is late, and what that cost
 *
 * `office-word` and `office-note` have had a file like this for a while. The deck did not, and the
 * bill arrived in one commit: **`apps/slide` went from 18,971 lines to 2,520** — 87% of the shell
 * moved into the package — and *nothing in this repository noticed*. Not a check, not a document,
 * not a number. `note.md`'s numbers stopped five comparable moves in an afternoon, for the one
 * reason `agents.md` gives: the difference is never the quality of the prose, it is whether a test
 * reads it.
 *
 * ## What a number is doing here
 *
 * Not counting. **A number belongs in this file when somebody has to be told it changed** — a
 * vocabulary that grew, a surface that lost a control, a product's own share of what it registers,
 * a shell that moved. Things that are merely countable stay out: no file counts, no test counts of
 * this package's own suite, no line count of a single module. The rule shows in what is pinned:
 * where a small number is the *argument* — seven node types the deck declares, thirteen boxes a
 * reader can hold — it is asserted exactly as well as stated, because `\b7\b` matches any seven in
 * two hundred lines of prose and would let the claim rot behind a passing check.
 *
 * ## The comparison is quoted, not copied
 *
 * `slides.md` compares its vocabulary with Word's and the site builder's, and a product may not
 * import a product (`no-product-depends-on-a-product`). So the comparison is checked the other way:
 * the numbers it attributes to those two must appear **in their own specs**, each of which is held
 * by its own `spec-numbers` test. A figure that moves there fails there, and then fails here for
 * quoting it.
 */
describe('the numbers in the Slides spec', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const spec = readFileSync(join(ROOT, 'docs', 'specs', 'slides.md'), 'utf8');

  /** Whether the document states this number, in any of the shapes it writes numbers in. */
  const states = (value: number) =>
    new RegExp(`\\b${value.toLocaleString('en-US')}\\b|\\b${value}\\b`).test(spec);

  /**
   * Lines of `.ts`/`.tsx` under a directory — **counted the way `wc -l` counts**, which is newline
   * characters rather than the pieces a split leaves. `note.md` learned this the way documents
   * learn things: two counting methods reported 258 for a directory every other number called 257,
   * and a comparison between two methods is not a comparison.
   */
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

  const definition = getSlidesSchemaDefinition();
  const schema = createSchema('slides', definition);

  it('says how much document there is, and how little of it the deck declares', () => {
    let attrs = 0;
    for (const [, node] of schema.nodes) attrs += Object.keys((node as { attrs?: object }).attrs ?? {}).length;

    /*
     * **What the deck declares** is the difference from the schema it builds on, measured the way
     * the harness measures `own` rather than listed. Seven is the claim the section rests on: the
     * canvas is not the deck's, and `office-canvas` exists because two products wanted it.
     */
    const office = Object.keys(getOfficeSchemaDefinition().nodes);
    const own = Object.keys(definition.nodes).filter((name) => !office.includes(name));

    expect(states(schema.nodes.size), `node types: ${schema.nodes.size}`).toBe(true);
    expect(states(attrs), `attribute slots: ${attrs}`).toBe(true);
    expect(states(schema.marks.size), `marks: ${schema.marks.size}`).toBe(true);
    expect(own.length, `the deck declares: ${own.join(', ')}`).toBe(7);
    expect(states(own.length), `declared by the deck: ${own.length}`).toBe(true);
  });

  it('says what a reader can hold, and how big the thing they hold it on is', () => {
    /*
     * Thirteen, and the number is pinned because the sentence beside it is an argument: the schema's
     * `scene` group is twelve and `frame` left the group to be a block a document can use. A
     * fourteenth arriving silently is a box nobody can select, which is the fault
     * `every-insert-can-be-held` was written for after it was recorded six times in one list.
     */
    expect(SCENE_TYPES.length, 'the boxes a reader can hold').toBe(13);
    expect(states(SCENE_TYPES.length), `box types: ${SCENE_TYPES.length}`).toBe(true);

    const inGroup = [...schema.nodes.values()].filter((node) => (node as { group?: string }).group === 'scene');
    expect(states(inGroup.length), `the schema's scene group: ${inGroup.length}`).toBe(true);

    // The slide itself, in twips — the unit every length in this engine is in.
    expect(states(SLIDE_WIDTH), `slide width: ${SLIDE_WIDTH}`).toBe(true);
    expect(states(SLIDE_HEIGHT), `slide height: ${SLIDE_HEIGHT}`).toBe(true);
    expect(states(SLIDE_WIDTH_4_3), `4:3 width: ${SLIDE_WIDTH_4_3}`).toBe(true);
  });

  it('says how many commands a deck has, and how many are its own', () => {
    /*
     * Measured rather than listed, the way the harness measures `own`: an editor with no kit and one
     * with the product's, and the difference is what this product is answerable for. `ROADMAP.md`
     * said **139** here, from a measurement taken once and never again.
     */
    const bare = new Set(createSlidesEditor({ kit: [] }).commandNames() as string[]);
    const all = createSlidesEditor().commandNames() as string[];
    const mine = createSlidesEditor({ kit: createSlidesOwnExtensions() }).commandNames() as string[];
    const own = mine.filter((name) => !bare.has(name));

    expect(states(all.length), `commands: ${all.length}`).toBe(true);
    expect(states(own.length), `the deck's own: ${own.length}`).toBe(true);
  });

  it('says what the four surfaces are made of', () => {
    /*
     * All four are declarations rather than JSX, which is the only reason the harness can see them —
     * and the panel is the one that changed: it carried `notYet: ['every-property-can-be-edited']`
     * and thirteen exemptions describing rows until it became `panel-model.ts`, at which point all
     * fourteen came back stale in one run.
     */
    const controls = SLIDES_TOOLBAR.reduce((count, group) => count + group.controls.length, 0);

    expect(states(SLIDES_TOOLBAR.length), `toolbar groups: ${SLIDES_TOOLBAR.length}`).toBe(true);
    expect(states(controls), `toolbar controls: ${controls}`).toBe(true);
    expect(states(new Set(slidesToolbarCommands()).size), 'toolbar commands').toBe(true);
    expect(states(new Set(slidesToolbarIcons()).size), 'toolbar icons').toBe(true);

    expect(states(SLIDES_KEYS.length), `keys: ${SLIDES_KEYS.length}`).toBe(true);
    expect(states(new Set(slidesKeyCommands()).size), 'key commands').toBe(true);

    expect(states(SLIDES_PANEL.length), `panel rows: ${SLIDES_PANEL.length}`).toBe(true);
    expect(states(slidesPanelAttrs().length), `settable attributes: ${slidesPanelAttrs().length}`).toBe(true);
    expect(states(new Set(slidesPanelCommands()).size), 'panel commands').toBe(true);

    expect(states(SLIDES_MENUS.length), `menus: ${SLIDES_MENUS.length}`).toBe(true);
    expect(states(new Set(slidesMenuCommands()).size), 'menu commands').toBe(true);
  });

  it('says how much motion there is, which is the part nothing else has', () => {
    expect(states(MOTION_PRESETS.length), `presets: ${MOTION_PRESETS.length}`).toBe(true);
    expect(states(MOTION_EFFECTS.length), `effects: ${MOTION_EFFECTS.length}`).toBe(true);
    expect(states(MOTION_COMBOS.length), `combos: ${MOTION_COMBOS.length}`).toBe(true);
    expect(states(TRANSITIONS.length), `transitions: ${TRANSITIONS.length}`).toBe(true);
    expect(states(DECK_TEMPLATES.length), `templates: ${DECK_TEMPLATES.length}`).toBe(true);
    expect(states(DECK_THEMES.length), `themes: ${DECK_THEMES.length}`).toBe(true);
    expect(states(THEME_COLOUR_SLOTS.length), `theme colour slots: ${THEME_COLOUR_SLOTS.length}`).toBe(true);
    expect(states(THEME_FONT_SLOTS.length), `theme font slots: ${THEME_FONT_SLOTS.length}`).toBe(true);
  });

  it('says how small the app is, and how much of the shell the package hands it — the number this file exists for', () => {
    /*
     * **The app, not the package.** This held `linesIn('packages', 'office-slides', 'src')` for one
     * round and it failed on the next edit in this very session — a comment added to a source file
     * moved it by seventeen. A number that rings for every commit is red for everybody every day and
     * is deleted within a week, which lands in the same place as never having written it. `note.md`
     * can hold its package total because the whole product is 2,392 lines and any movement in it
     * means something; 43,724 does not have that property.
     *
     * What the 87% move actually changed is *where the shell lives*, and these two say it: the app's
     * own size, and the number of components the package's door hands a host. Both move only when a
     * component moves.
     */
    const app = linesIn('apps', 'slide', 'src');
    const shell = (readFileSync(join(ROOT, 'apps', 'slide', 'src', 'app.tsx'), 'utf8').match(/\n/g) ?? []).length;
    const main = (readFileSync(join(ROOT, 'apps', 'slide', 'src', 'main.tsx'), 'utf8').match(/\n/g) ?? []).length;

    expect(states(app), `apps/slide: ${app}`).toBe(true);
    expect(app, 'the app is those two files and nothing else').toBe(shell + main);
    expect(states(shell), `app.tsx: ${shell}`).toBe(true);
    expect(states(main), `main.tsx: ${main}`).toBe(true);

    /*
     * The door the shell went through, counted from the door. A component that moves into the
     * package without being exported is a component the host cannot mount, and a component exported
     * without moving is a name with nothing behind it — this number moves for either.
     */
    const ui = readFileSync(join(__dirname, '..', 'src', 'ui.ts'), 'utf8');
    const exported = [...ui.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap((one) => one[1].split(','))
      .map((one) => one.trim())
      .filter((one) => one && !one.startsWith('type '));
    const components = exported.filter((one) => /^[A-Z]/.test(one));
    const hooks = exported.filter((one) => /^use[A-Z]/.test(one));

    expect(states(components.length), `components behind ./ui: ${components.length}`).toBe(true);
    expect(states(hooks.length), `hooks behind ./ui: ${hooks.length}`).toBe(true);
  });

  it('says how many browser tests stand behind it', () => {
    let tests = 0;
    const dir = join(ROOT, 'apps', 'slide', 'tests');
    for (const entry of readdirSync(dir)) {
      if (!/\.spec\.ts$/.test(entry)) continue;
      tests += (readFileSync(join(dir, entry), 'utf8').match(/^\s*(?:it|test)\(/gm) ?? []).length;
    }
    expect(states(tests), `browser tests: ${tests}`).toBe(true);
  });

  it('quotes the other two products rather than copying them', () => {
    /*
     * A product may not import a product, so the comparison is checked against the documents that
     * hold those numbers — each of which has a `spec-numbers` test of its own. This is the whole
     * chain: a figure that moves in Word fails in Word's file, is corrected in `word.md`, and then
     * fails here for still being quoted.
     */
    const quoted: [string, number[]][] = [
      ['word.md', [108, 1043]],
      ['site-builder.md', [71, 862]]
    ];
    for (const [name, numbers] of quoted) {
      const other = readFileSync(join(ROOT, 'docs', 'specs', name), 'utf8');
      for (const value of numbers) {
        const written = new RegExp(`\\b${value.toLocaleString('en-US')}\\b|\\b${value}\\b`);
        expect(states(value), `slides.md quotes ${value} from ${name}`).toBe(true);
        expect(written.test(other), `${name} still says ${value}`).toBe(true);
      }
    }
  });
});
